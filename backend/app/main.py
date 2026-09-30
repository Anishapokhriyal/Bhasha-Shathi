import base64, time, socket
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import func
from .db import get_db, SessionLocal, User, Translation, LanguageMemory, Student, Lesson, Quiz, Progress, AnalyticsEvent
from .security import hash_pw, verify_pw, make_token, current_user, user_from_token
from .ai.engines import ASREngine, TranslationEngine, TTSEngine, Unavailable, memory_lookup

app = FastAPI(title="BHASHA-SATHI")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
asr, mt, tts = ASREngine(), TranslationEngine(), TTSEngine()

def unavail(e): return HTTPException(503, f"AI unavailable: {e}")

# ---- auth ----
class Reg(BaseModel):
    name: str; email: EmailStr; password: str
    role: str = "teacher"; school: str = ""; language: str = "sat"

@app.post("/api/auth/register")
def register(b: Reg, db: Session = Depends(get_db)):
    if b.role not in ("teacher", "student"): raise HTTPException(400, "Invalid role")
    if db.query(User).filter_by(email=b.email).first(): raise HTTPException(409, "Email exists")
    u = User(name=b.name, email=b.email, password_hash=hash_pw(b.password),
             role=b.role, school=b.school, language=b.language)
    db.add(u); db.flush()
    if b.role == "student":
        db.add(Student(user_id=u.id, school=b.school, preferred_language=b.language))
    db.commit()
    return {"access_token": make_token(u.id), "token_type": "bearer"}

@app.post("/api/auth/login")
def login(f: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    u = db.query(User).filter_by(email=f.username).first()
    if not u or not verify_pw(f.password, u.password_hash): raise HTTPException(401, "Bad credentials")
    return {"access_token": make_token(u.id), "token_type": "bearer"}

@app.get("/api/auth/me")
def me(u: User = Depends(current_user)):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "school": u.school, "language": u.language}

# ---- translate (Language Memory first) ----
class TReq(BaseModel):
    text: str; source_language: str = "hi"; target_language: str = "sat"
    script: str = "ol_chiki"; mode: str = "auto"

def do_translate(db, r: TReq):
    t0 = time.perf_counter()
    hit = memory_lookup(db, r.text, r.target_language)
    if hit:
        return {"translation": hit.target, "provider": "language_memory", "mode": "offline",
                "confidence": None, "verified": True, "script": hit.script,
                "latency_ms": int((time.perf_counter() - t0) * 1000)}
    try: res = mt.translate(r.text, r.source_language, r.target_language, r.mode)
    except Unavailable as e: raise unavail(e)
    db.add(Translation(source_text=r.text, translated_text=res["translation"],
                       source_language=r.source_language, target_language=r.target_language,
                       script=r.script, provider=res["provider"])); db.commit()
    return {**res, "verified": False, "script": r.script}

@app.post("/api/translate")
def translate(r: TReq, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return do_translate(db, r)

# ---- asr / tts ----
@app.post("/api/asr")
async def asr_ep(file: UploadFile = File(...), language: str = Form("hi"), mode: str = Form("auto"),
                 _: User = Depends(current_user)):
    try: return asr.transcribe(await file.read(), language, mode)   # send 16 kHz mono PCM WAV
    except Unavailable as e: raise unavail(e)

class TTSReq(BaseModel):
    text: str; language: str = "sat"; mode: str = "auto"

@app.post("/api/tts")
def tts_ep(r: TTSReq, _: User = Depends(current_user)):
    try: return tts.synthesize(r.text, r.language, r.mode)
    except Unavailable as e: raise unavail(e)

# ---- language memory ----
class MemReq(BaseModel):
    source: str; target: str; language: str = "sat"; script: str = "ol_chiki"
    context: str = ""; grade: str = ""; subject: str = ""

@app.post("/api/memory/verify")
def verify(b: MemReq, db: Session = Depends(get_db), u: User = Depends(current_user)):
    if u.role not in ("teacher", "admin"): raise HTTPException(403, "Teachers only")
    m = LanguageMemory(**b.model_dump(), verified=True, verified_by=u.id)
    db.add(m); db.commit()
    return {"id": m.id}

@app.get("/api/memory")
def memory_list(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [{"id": m.id, "source": m.source, "target": m.target, "language": m.language, "script": m.script}
            for m in db.query(LanguageMemory).order_by(LanguageMemory.id.desc()).limit(200)]

# ---- PostgreSQL-ready learning data ----
def record_event(db, user_id, event, metadata=None):
    db.add(AnalyticsEvent(user_id=user_id, event=event, event_metadata=metadata or {}))

class LessonReq(BaseModel):
    topic: str; title: str = ""; subject: str = "EVS"; grade: str = "3"; language: str = "hi"
    content: dict = {}

@app.post("/api/lessons")
def create_lesson(payload: LessonReq, db: Session = Depends(get_db), u: User = Depends(current_user)):
    if u.role not in ("teacher", "admin"): raise HTTPException(403, "Teachers only")
    title = payload.title.strip() or f"{payload.subject} Lesson: {payload.topic.strip()}"
    lesson = Lesson(teacher_id=u.id, title=title, topic=payload.topic.strip(), subject=payload.subject,
                    grade=payload.grade, language=payload.language, content=payload.content)
    db.add(lesson); record_event(db, u.id, "lesson_created", {"topic": lesson.topic}); db.commit(); db.refresh(lesson)
    return {"id": lesson.id, "title": lesson.title, "topic": lesson.topic, "subject": lesson.subject,
            "grade": lesson.grade, "language": lesson.language, "content": lesson.content}

@app.get("/api/lessons")
def list_lessons(db: Session = Depends(get_db), u: User = Depends(current_user)):
    query = db.query(Lesson).order_by(Lesson.id.desc())
    if u.role in ("teacher", "admin"): query = query.filter(Lesson.teacher_id == u.id)
    lessons = query.limit(100).all()
    return [{"id": x.id, "title": x.title, "topic": x.topic, "subject": x.subject, "grade": x.grade,
             "language": x.language, "content": x.content, "created_at": x.created_at.isoformat()} for x in lessons]

class QuizReq(BaseModel):
    title: str; questions: list[dict] = []; lesson_id: int | None = None

@app.post("/api/quizzes")
def create_quiz(payload: QuizReq, db: Session = Depends(get_db), u: User = Depends(current_user)):
    if u.role not in ("teacher", "admin"): raise HTTPException(403, "Teachers only")
    quiz = Quiz(creator_id=u.id, lesson_id=payload.lesson_id, title=payload.title, questions=payload.questions)
    db.add(quiz); record_event(db, u.id, "quiz_created", {"title": payload.title}); db.commit(); db.refresh(quiz)
    return {"id": quiz.id, "title": quiz.title, "lesson_id": quiz.lesson_id, "questions": quiz.questions}

@app.get("/api/quizzes")
def list_quizzes(db: Session = Depends(get_db), u: User = Depends(current_user)):
    quizzes = db.query(Quiz).filter(Quiz.creator_id == u.id).order_by(Quiz.id.desc()).limit(100).all()
    return [{"id": x.id, "title": x.title, "lesson_id": x.lesson_id, "questions": x.questions} for x in quizzes]

class ProgressReq(BaseModel):
    skill: str; score: float; status: str = "completed"; lesson_id: int | None = None

def student_for(db, u):
    student = db.query(Student).filter_by(user_id=u.id).first()
    if not student and u.role == "student":
        student = Student(user_id=u.id, school=u.school, preferred_language=u.language); db.add(student); db.flush()
    return student

@app.post("/api/progress")
def save_progress(payload: ProgressReq, db: Session = Depends(get_db), u: User = Depends(current_user)):
    student = student_for(db, u)
    if not student: raise HTTPException(400, "Progress belongs to a student account")
    item = Progress(student_id=student.id, lesson_id=payload.lesson_id, skill=payload.skill,
                    score=max(0, min(100, payload.score)), status=payload.status)
    db.add(item); record_event(db, u.id, "progress_saved", {"skill": payload.skill, "score": payload.score}); db.commit(); db.refresh(item)
    return {"id": item.id, "student_id": item.student_id, "skill": item.skill, "score": item.score, "status": item.status}

@app.get("/api/progress")
def list_progress(db: Session = Depends(get_db), u: User = Depends(current_user)):
    student = student_for(db, u)
    if not student: return []
    rows = db.query(Progress).filter_by(student_id=student.id).order_by(Progress.created_at.desc()).limit(200).all()
    return [{"id": x.id, "lesson_id": x.lesson_id, "skill": x.skill, "score": x.score, "status": x.status,
             "created_at": x.created_at.isoformat()} for x in rows]

@app.get("/api/analytics/summary")
def analytics_summary(db: Session = Depends(get_db), u: User = Depends(current_user)):
    progress_query = db.query(Progress)
    if u.role == "student":
        student = student_for(db, u)
        progress_query = progress_query.filter(Progress.student_id == student.id) if student else progress_query.filter(False)
    elif u.role in ("teacher", "admin"):
        progress_query = progress_query.join(Student, Student.id == Progress.student_id).join(User, User.id == Student.user_id)
        if u.role == "teacher": progress_query = progress_query.filter(User.school == u.school)
    rows = progress_query.all()
    average = round(sum(x.score for x in rows) / len(rows), 2) if rows else 0
    by_skill = {}
    for row in rows: by_skill.setdefault(row.skill, []).append(row.score)
    return {"user_id": u.id, "progress_entries": len(rows), "average_score": average,
            "skills": {key: round(sum(values) / len(values), 2) for key, values in by_skill.items()},
            "lessons_created": db.query(Lesson).filter(Lesson.teacher_id == u.id).count(),
            "quizzes_created": db.query(Quiz).filter(Quiz.creator_id == u.id).count(),
            "events": db.query(AnalyticsEvent).filter(AnalyticsEvent.user_id == u.id).count()}

# ---- advanced teacher and learning flows ----
@app.post("/api/ai/copilot")
def ai_copilot(payload: dict, _: User = Depends(current_user)):
    topic = str(payload.get("topic", "general learning")).strip() or "general learning"
    grade = str(payload.get("grade", "3")).strip() or "3"
    subject = str(payload.get("subject", "EVS")).strip() or "EVS"
    language = str(payload.get("language", "hi")).strip() or "hi"

    lesson = (
        f"Topic: {topic}. Grade {grade}. Subject: {subject}. "
        f"Teach this concept in simple {language} language with friendly examples, real-life context, and one classroom activity."
    )
    objectives = [
        f"Understand the main idea of {topic}",
        f"Use relevant vocabulary in {language}",
        "Practice speaking and listening in class"
    ]
    flashcards = [
        {"front": f"{topic}", "back": f"Key idea: {topic} in simple language"},
        {"front": "Example", "back": f"Use a real example from everyday life to explain {topic}."},
        {"front": "Classroom task", "back": "Ask students to explain the concept in their own words."}
    ]
    quiz = [
        {
            "question": f"What is the most important idea to remember about {topic}?",
            "options": ["It helps us understand the topic better", "It has no connection to daily life", "It is only for advanced students", "It is not useful"],
            "answer": "It helps us understand the topic better"
        },
        {
            "question": f"Which activity best helps students learn {topic}?",
            "options": ["Listening and repeating key ideas", "Skipping practice", "Reading only once", "Ignoring examples"],
            "answer": "Listening and repeating key ideas"
        },
        {
            "question": "Why is speaking practice useful?",
            "options": ["It improves confidence and understanding", "It creates confusion", "It is unnecessary", "It slows learning down"],
            "answer": "It improves confidence and understanding"
        }
    ]
    return {
        "topic": topic,
        "grade": grade,
        "subject": subject,
        "language": language,
        "lesson": {
            "title": f"{subject} Lesson: {topic}",
            "text": lesson,
            "objectives": objectives,
            "teacher_script": f"Start by asking: What do you already know about {topic}? Then explain the concept in simple words and connect it to a classroom example."
        },
        "quiz": quiz,
        "flashcards": flashcards,
        "resources": [
            "Short explanation in classroom language",
            "Teacher speech script",
            "Simple oral practice",
            "Revision worksheet"
        ]
    }

@app.post("/api/learning/profile")
def learning_profile(payload: dict, _: User = Depends(current_user)):
    skills = payload.get("skills", {})
    profile = {
        "reading": float(skills.get("reading", 50)),
        "vocabulary": float(skills.get("vocabulary", 50)),
        "listening": float(skills.get("listening", 50)),
        "speaking": float(skills.get("speaking", 50)),
        "evs": float(skills.get("evs", 50))
    }
    strengths = [name for name, value in profile.items() if value >= 75]
    weak_areas = [name for name, value in profile.items() if value < 70]

    recommendations = []
    if profile["vocabulary"] < 70:
        recommendations.append("Use more flashcards and repetition exercises")
    if profile["speaking"] < 70:
        recommendations.append("Add short speaking practice and pronunciation drills")
    if profile["listening"] < 70:
        recommendations.append("Repeat simple audio prompts and listening tasks")
    if not recommendations:
        recommendations.append("Keep the current pace and give advanced quiz challenges")

    return {
        "skills": profile,
        "strengths": strengths or ["reading"],
        "weak_areas": weak_areas or ["vocabulary"],
        "recommendations": recommendations,
        "next_lesson": {
            "topic": "Vocabulary practice",
            "activities": ["flashcards", "short oral drill", "quick check quiz"],
            "focus": weak_areas[0] if weak_areas else "reading"
        }
    }

@app.get("/api/offline/status")
def offline_status():
    from .ai import engines as e
    services = {
        "asr": e.IndicConformerASR().available(),
        "translation": e.IndicTrans2MT().available(),
        "tts": e.LocalTTS().available()
    }
    local_features = {
        "verified_translation_memory": True,
        "lesson_copilot": True,
        "learning_profile": True
    }
    offline = {
        "ready": any(services.values()),
        "local_features_ready": any(local_features.values()),
        "model_services": services,
        "services": {**services, **local_features},
        "message": "Local lesson planning, learning analysis, and verified phrase memory work offline. Speech recognition, model translation, and speech playback need local models."
    }
    return {"offline": offline}

# ---- health (real checks, not hardcoded) ----
@app.get("/api/health")
def health():
    from .ai import engines as e
    try: socket.create_connection(("1.1.1.1", 53), 1.5).close(); net = True
    except OSError: net = False
    return {"internet": net,
            "asr": {"online": e.SarvamASR().available(), "offline": e.IndicConformerASR().available()},
            "translation": {"online": e.SarvamMT().available(), "offline": e.IndicTrans2MT().available()},
            "tts": {"online": e.SarvamTTS().available(), "offline": e.LocalTTS().available()}}

# ---- live classroom (WebSocket) ----
rooms: dict[str, set] = {}

@app.websocket("/ws/classroom")
async def classroom(ws: WebSocket, token: str, room: str = "demo"):
    db = SessionLocal()
    try: user = user_from_token(token, db)
    except HTTPException:
        await ws.close(code=4401); return
    await ws.accept()
    rooms.setdefault(room, set()).add(ws)
    async def broadcast(msg):
        for c in list(rooms[room]):
            try: await c.send_json(msg)
            except Exception: rooms[room].discard(c)
    try:
        while True:
            m = await ws.receive_json()
            mode = m.get("mode", "auto")
            try:
                if m["type"] == "teacher_audio" and user.role in ("teacher", "admin"):
                    wav = base64.b64decode(m["data"]); lat = {}
                    a = asr.transcribe(wav, "hi", mode); lat["asr"] = a["latency_ms"]
                    t = do_translate(db, TReq(text=a["text"], mode=mode)); lat["translation"] = t["latency_ms"]
                    out = {"type": "translation", "source_text": a["text"], "text": t["translation"],
                           "script": "ol_chiki", "providers": {"asr": a["provider"], "mt": t["provider"]},
                           "modes": {"asr": a["mode"], "mt": t["mode"]}, "audio": None, "tts_error": None}
                    try:
                        s = tts.synthesize(t["translation"], "sat", mode)
                        out["audio"] = s["audio_b64"]; lat["tts"] = s["latency_ms"]
                        out["providers"]["tts"] = s["provider"]; out["modes"]["tts"] = s["mode"]
                    except Unavailable as e:
                        out["tts_error"] = str(e)      # text still delivered; no fake audio
                    lat["total"] = sum(lat.values()); out["latency_ms"] = lat
                    await broadcast(out)
                elif m["type"] == "student_audio":
                    a = asr.transcribe(base64.b64decode(m["data"]), "sat", mode)
                    hi = do_translate(db, TReq(text=a["text"], source_language="sat", target_language="hi", script="devanagari", mode=mode))
                    await broadcast({"type": "student_reply", "student": user.name, "text": a["text"],
                                     "translation_hi": hi["translation"], "provider": a["provider"], "mode": a["mode"]})
            except Unavailable as e:
                await ws.send_json({"type": "error", "message": str(e)})
    except WebSocketDisconnect:
        rooms[room].discard(ws)
    finally:
        db.close()
