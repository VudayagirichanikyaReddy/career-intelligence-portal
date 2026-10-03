from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from ..db import get_db

router = APIRouter(
    prefix="/api/applications",
    tags=["Applications"]
)

class ApplyRequest(BaseModel):
    applicant_id: int
    position_id: int
    match_score: Optional[float] = None

@router.post("/apply")
def apply_to_position(req: ApplyRequest, db: Session = Depends(get_db)):
    existing = db.execute(
        text("SELECT application_id, status FROM applications WHERE applicant_id = :aid AND position_id = :pid"),
        {"aid": req.applicant_id, "pid": req.position_id}
    ).fetchone()

    if existing:
        return {
            "applied": True,
            "application_id": existing.application_id,
            "status": existing.status,
            "already_applied": True
        }

    db.execute(
        text("""
            INSERT INTO applications (applicant_id, position_id, match_score, status)
            VALUES (:aid, :pid, :score, 'APPLIED')
        """),
        {"aid": req.applicant_id, "pid": req.position_id, "score": req.match_score or 0.0}
    )
    db.commit()

    new_app = db.execute(
        text("SELECT application_id, status FROM applications WHERE applicant_id = :aid AND position_id = :pid"),
        {"aid": req.applicant_id, "pid": req.position_id}
    ).fetchone()

    return {
        "applied": True,
        "application_id": new_app.application_id,
        "status": new_app.status,
        "already_applied": False
    }

@router.get("/status/{applicant_id}/{position_id}")
def get_application_status(applicant_id: int, position_id: int, db: Session = Depends(get_db)):
    res = db.execute(
        text("SELECT application_id, status, applied_at FROM applications WHERE applicant_id = :aid AND position_id = :pid"),
        {"aid": applicant_id, "pid": position_id}
    ).fetchone()

    if not res:
        return {"has_applied": False, "status": None}

    return {
        "has_applied": True,
        "application_id": res.application_id,
        "status": res.status,
        "applied_at": str(res.applied_at)
    }

@router.get("/my-applications/{applicant_id}")
def get_my_applications(applicant_id: int, db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT 
                app.application_id,
                app.position_id,
                app.status,
                app.match_score,
                app.applied_at,
                p.title,
                p.min_gpa,
                p.min_experience_years,
                c.company_name,
                c.location
            FROM applications app
            JOIN positions p ON app.position_id = p.position_id
            LEFT JOIN companies c ON p.company_id = c.company_id
            WHERE app.applicant_id = :aid
            ORDER BY app.applied_at DESC
        """),
        {"aid": applicant_id}
    ).fetchall()

    results = []
    for r in rows:
        results.append({
            "application_id": r.application_id,
            "position_id": r.position_id,
            "title": r.title,
            "company": r.company_name or "Company",
            "location": r.location or "Not specified",
            "match_score": round(float(r.match_score or 0), 1),
            "status": r.status or "APPLIED",
            "applied_at": str(r.applied_at)[:10] if r.applied_at else "—"
        })

    return {
        "applicant_id": applicant_id,
        "total": len(results),
        "applications": results
    }
