from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, DateTime, Float, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="teacher")  # teacher|student|admin
    school = Column(String, default="")
    language = Column(String, default="sat")
    created_at = Column(DateTime, default=datetime.utcnow)

class Translation(Base):
    __tablename__ = "translations"
    id = Column(Integer, primary_key=True)
    source_text = Column(Text); translated_text = Column(Text)
    source_language = Column(String); target_language = Column(String)
    script = Column(String); provider = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class LanguageMemory(Base):
    __tablename__ = "language_memory"
    id = Column(Integer, primary_key=True)
    source = Column(Text, index=True); target = Column(Text)
    language = Column(String); script = Column(String)
    context = Column(String, default=""); grade = Column(String, default="")
    subject = Column(String, default="")
    verified = Column(Boolean, default=True); verified_by = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

class Student(Base):
    __tablename__ = "students"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    grade = Column(String, default="")
    school = Column(String, default="")
    preferred_language = Column(String, default="sat")
    created_at = Column(DateTime, default=datetime.utcnow)

class Lesson(Base):
    __tablename__ = "lessons"
    id = Column(Integer, primary_key=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    topic = Column(String, nullable=False)
    subject = Column(String, default="EVS")
    grade = Column(String, default="3")
    language = Column(String, default="hi")
    content = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

class Quiz(Base):
    __tablename__ = "quizzes"
    id = Column(Integer, primary_key=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=True, index=True)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    questions = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

class Progress(Base):
    __tablename__ = "progress"
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=True)
    skill = Column(String, nullable=False)
    score = Column(Float, default=0)
    status = Column(String, default="in_progress")
    created_at = Column(DateTime, default=datetime.utcnow)

class AnalyticsEvent(Base):
    __tablename__ = "analytics"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    event = Column(String, nullable=False)
    event_metadata = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(engine)

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()
