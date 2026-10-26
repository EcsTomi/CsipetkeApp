import re
from datetime import datetime, timedelta, timezone
import secrets
from typing import Optional
from fastapi import HTTPException, status
import jwt
from sqlalchemy.ext.asyncio import AsyncSession
from audit_log.service import log_audit
from auth.deps import EngineContext
from models import User
from seed import ROLES
from dotenv import load_dotenv
import os

load_dotenv()

# --- KONFIGURÁCIÓ ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 10))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 14))

# Lovassy-s email minta ellenőrzése és parse-olása
EMAIL_student_REGEX = re.compile(r"^([a-z0-9\.-]+)\.(\d{2})\.([a-d])@lovassy\.edu\.hu$")
EMAIL_teacher_REGEX = re.compile(r"^([a-z0-9\.-]+)@lovassy\.edu\.hu$")

async def parse_lovassy_data(id_info: dict, db_session: AsyncSession) -> dict:
    """Kinyeri az emailből a diák adatait és meghatározza a szerepkört."""
    email = id_info.get("email", "")
    family_name = id_info.get("family_name", "")
    given_name = id_info.get("given_name", "")
    picture = id_info.get("picture", "")
    match_student = EMAIL_student_REGEX.match(email.lower())
    match_teacher = EMAIL_teacher_REGEX.match(email.lower())
    if not match_student and not match_teacher:
        await log_audit(EngineContext(User(id=0), db_session), "user.login_fail", return_code=status.HTTP_403_FORBIDDEN, meta={"message": "Csak a @lovassy.edu.hu című Google fiókok engedélyezettek.", "email": email})
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Csak a @lovassy.edu.hu című Google fiókok engedélyezettek."
        )
    if(not match_student and match_teacher):
        name_part = match_teacher.groups()[0]
        return {
            "email": email,
            "name": family_name + " " + given_name,
            "picture": picture,
            "class_year": 0,
            "class_letter": "",
            "role_code": "teacher",
            "role": ROLES[3]
        }
    
    assert match_student is not None
    email_name_part, class_year, class_letter = match_student.groups()
    class_year = int(class_year)

    # Jogosultsági logika (Szervezők: *.25.a)
    # 2026-ban a '25' osztályok 9, a '26' a 9NY évfolyam stb.
    role_code = "student"
    if class_year == 25 and class_letter == "a":
        role_code = "organizer"  # Kiemelt szervezői jogkör
    if class_year == 26:
        role_code = "contestant"  # 9NY
    role = list(filter(lambda x: x.code == role_code, ROLES))[0]

    return {
        "email": email,
        "name": family_name + " " + given_name,
        "picture": picture,
        "class_year": class_year,
        "class_letter": class_letter,
        "role_code": role_code,
        "role": role
    }

def create_access_token(user: User, expires_delta: Optional[timedelta] = None) -> str:
    """JWT token generálása lejárati idővel."""

    jwt_claims = {
        "id": user.id,
        "sub": user.email,
        "name": user.name,
        "role_code": user.role_code,
        "year": user.class_year,
        "class": user.class_letter
    }

    to_encode = jwt_claims.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def create_refresh_token() -> str:
    """Generál egy átlátható, nehezen kitalálható kriptográfiai véletlen tokent."""
    return secrets.token_urlsafe(64)