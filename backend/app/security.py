import hashlib, hmac, os, time, jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .config import SECRET_KEY
from .db import get_db, User

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def hash_pw(pw):
    salt = os.urandom(16)
    return salt.hex() + ":" + hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000).hex()

def verify_pw(pw, stored):
    salt, h = stored.split(":")
    calc = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex()
    return hmac.compare_digest(calc, h)

def make_token(uid):
    return jwt.encode({"sub": str(uid), "exp": int(time.time()) + 86400}, SECRET_KEY, "HS256")

def user_from_token(token, db):
    try:
        uid = int(jwt.decode(token, SECRET_KEY, ["HS256"])["sub"])
    except Exception:
        raise HTTPException(401, "Invalid token")
    u = db.get(User, uid)
    if not u: raise HTTPException(401, "User not found")
    return u

def current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)):
    return user_from_token(token, db)
