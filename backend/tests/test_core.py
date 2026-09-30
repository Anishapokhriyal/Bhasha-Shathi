import os
from importlib import reload

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
from fastapi.testclient import TestClient
from app import config as app_config
from app.main import app
c = TestClient(app)

def token(role="teacher", email="t@x.in"):
    r = c.post("/api/auth/register", json={"name": "T", "email": email, "password": "pw123456", "role": role})
    return {"Authorization": "Bearer " + (r.json().get("access_token") or c.post("/api/auth/login", data={"username": email, "password": "pw123456"}).json()["access_token"])}

def test_dotenv_defaults_are_loaded():
    os.environ.pop("SECRET_KEY", None)
    os.environ.pop("DATABASE_URL", None)
    reload(app_config)
    assert app_config.SECRET_KEY == "change-me"
    assert app_config.DATABASE_URL == "sqlite:///./bhasha.db"
    os.environ["DATABASE_URL"] = "sqlite:///./test.db"


def test_auth_and_protection():
    assert c.post("/api/translate", json={"text": "x"}).status_code == 401
    assert c.get("/api/auth/me", headers=token()).json()["role"] == "teacher"

def test_memory_beats_ai():
    h = token()
    c.post("/api/memory/verify", headers=h, json={"source": "पौधों को पानी चाहिए।", "target": "VERIFIED"})
    r = c.post("/api/translate", headers=h, json={"text": "पौधों को पानी चाहिए।", "mode": "offline"}).json()
    assert r["provider"] == "language_memory" and r["translation"] == "VERIFIED"
    assert r["mode"] == "offline"

def test_no_fake_offline():
    r = c.post("/api/translate", headers=token(), json={"text": "नया वाक्य", "mode": "offline"})
    assert r.status_code == 503   # models not installed -> honest failure, not a fake result

def test_students_cannot_verify():
    r = c.post("/api/memory/verify", headers=token("student", "s@x.in"), json={"source": "a", "target": "b"})
    assert r.status_code == 403


def test_advanced_learning_apis_work():
    headers = token("teacher", "ai@x.in")
    copilot = c.post("/api/ai/copilot", headers=headers, json={"topic": "plants", "grade": "3", "subject": "EVS", "language": "hi"})
    assert copilot.status_code == 200
    assert "lesson" in copilot.json()
    assert "quiz" in copilot.json()

    profile = c.post("/api/learning/profile", headers=headers, json={"skills": {"reading": 80, "vocabulary": 60, "listening": 70}})
    assert profile.status_code == 200
    assert "recommendations" in profile.json()

    offline = c.get("/api/offline/status")
    assert offline.status_code == 200
    assert "offline" in offline.json()
    status = offline.json()["offline"]
    assert status["services"]["verified_translation_memory"] is True
    assert status["services"]["learning_profile"] is True
    assert status["services"]["lesson_copilot"] is True
    assert status["local_features_ready"] is True
    assert set(status["model_services"]) == {"asr", "translation", "tts"}

def test_learning_data_api_schema_works():
    teacher = token("teacher", "schema-teacher@x.in")
    lesson = c.post("/api/lessons", headers=teacher, json={"topic": "water", "subject": "EVS"})
    assert lesson.status_code == 200
    lesson_id = lesson.json()["id"]
    quiz = c.post("/api/quizzes", headers=teacher, json={"title": "Water quiz", "lesson_id": lesson_id, "questions": []})
    assert quiz.status_code == 200
    student = token("student", "schema-student@x.in")
    progress = c.post("/api/progress", headers=student, json={"skill": "science", "score": 82, "lesson_id": lesson_id})
    assert progress.status_code == 200
    summary = c.get("/api/analytics/summary", headers=student)
    assert summary.status_code == 200
    assert summary.json()["average_score"] == 82.0
