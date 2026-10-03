import os
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from ..db import get_db

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)

def hash_password(password: str) -> str:
    salt = "careeriq_salt_"
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()

def verify_password(plain: str, hashed: str) -> bool:
    if hashed == "magic_link_auth":
        return True
    return hash_password(plain) == hashed

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "APPLICANT"
    invite_code: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str
    role: str = "APPLICANT"

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordConfirmRequest(BaseModel):
    email: str
    reset_code: str
    new_password: str

@router.post("/register")
def register_user(req: RegisterRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    role = req.role.strip().upper()

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    if role == "RECRUITER":
        if not req.invite_code:
            raise HTTPException(status_code=403, detail="Recruiter registration requires a valid one-time invite code.")
        
        invite = db.execute(
            text("SELECT invite_id, email, is_used, expires_at FROM recruiter_invites WHERE invite_code = :code"),
            {"code": req.invite_code.strip()}
        ).fetchone()

        if not invite:
            raise HTTPException(status_code=403, detail="Invalid invite code.")
        if invite.is_used:
            raise HTTPException(status_code=403, detail="This invite code has already been used.")
        if invite.expires_at and invite.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
            raise HTTPException(status_code=403, detail="This invite code has expired.")
        if invite.email.lower() != email:
            raise HTTPException(
                status_code=403, 
                detail=f"This invite code was issued specifically to {invite.email}."
            )

    existing = db.execute(
        text("SELECT user_id FROM users WHERE email = :email"),
        {"email": email}
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    hashed_pw = hash_password(req.password)

    db.execute(
        text("INSERT INTO users (email, password_hash, role) VALUES (:email, :pw, :role)"),
        {"email": email, "pw": hashed_pw, "role": role}
    )
    db.commit()

    user = db.execute(
        text("SELECT user_id, email, role FROM users WHERE email = :email"),
        {"email": email}
    ).fetchone()

    if role == "RECRUITER":
        db.execute(
            text("UPDATE recruiter_invites SET is_used = TRUE WHERE invite_code = :code"),
            {"code": req.invite_code.strip()}
        )
        db.commit()

    applicant_id = None
    if role == "APPLICANT":
        db.execute(
            text("INSERT INTO applicants (user_id, full_name, experience_years) VALUES (:uid, :name, 0)"),
            {"uid": user.user_id, "name": req.full_name.strip()}
        )
        db.commit()
        app_row = db.execute(
            text("SELECT applicant_id FROM applicants WHERE user_id = :uid"),
            {"uid": user.user_id}
        ).fetchone()
        applicant_id = app_row.applicant_id if app_row else None

    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "full_name": req.full_name.strip(),
        "applicant_id": applicant_id
    }

@router.post("/login")
def login_user(req: LoginRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    role = req.role.strip().upper()

    user = db.execute(
        text("SELECT user_id, email, password_hash, role FROM users WHERE email = :email"),
        {"email": email}
    ).fetchone()

    if not user or not verify_password(req.password, user.password_hash or ""):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if user.role != role:
        raise HTTPException(status_code=403, detail=f"This account is registered as {user.role}, not {role}.")

    applicant = db.execute(
        text("SELECT applicant_id, full_name FROM applicants WHERE user_id = :uid"),
        {"uid": user.user_id}
    ).fetchone()

    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "applicant_id": applicant.applicant_id if applicant else None,
        "full_name": applicant.full_name if applicant else user.email.split("@")[0].title()
    }

@router.post("/forgot-password")
def request_password_reset(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    user = db.execute(text("SELECT user_id FROM users WHERE LOWER(email) = :email"), {"email": email}).fetchone()
    
    if not user:
        return {"status": "ok", "message": "If this email exists, a reset code was dispatched."}

    code = f"{secrets.randbelow(900000) + 100000}"

    # Use MySQL DATE_ADD(NOW(), INTERVAL 15 MINUTE) to prevent timezone drift
    db.execute(
        text("""
            INSERT INTO password_resets (email, reset_code, expires_at) 
            VALUES (:email, :code, DATE_ADD(NOW(), INTERVAL 15 MINUTE))
        """),
        {"email": email, "code": code}
    )
    db.commit()

    print(f"\n==========================================")
    print(f"[SECURITY] Password Reset Code for {email}: {code}")
    print(f"Expires in: 15 minutes (MySQL server time)")
    print(f"==========================================\n")

    return {"status": "ok", "message": "Reset code dispatched."}

@router.post("/confirm-reset")
def confirm_password_reset(req: ResetPasswordConfirmRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    code = req.reset_code.strip()
    new_pw = req.new_password.strip()

    if len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    # Match code and verify expiration directly via MySQL NOW()
    reset_entry = db.execute(
        text("""
            SELECT reset_id 
            FROM password_resets 
            WHERE LOWER(email) = :email 
              AND reset_code = :code 
              AND is_used = FALSE 
              AND expires_at >= NOW()
            ORDER BY reset_id DESC LIMIT 1
        """),
        {"email": email, "code": code}
    ).fetchone()

    if not reset_entry:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code. Please request a new one.")

    new_hash = hash_password(new_pw)
    db.execute(text("UPDATE users SET password_hash = :hash WHERE LOWER(email) = :email"), {"hash": new_hash, "email": email})
    db.execute(text("UPDATE password_resets SET is_used = TRUE WHERE reset_id = :id"), {"id": reset_entry.reset_id})
    db.commit()

    return {"status": "ok", "message": "Password updated successfully!"}
