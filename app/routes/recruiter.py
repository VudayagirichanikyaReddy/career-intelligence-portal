from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional

from ..db import get_db

router = APIRouter(
    prefix="/api/recruiter",
    tags=["Recruiter Hub"]
)

class CreateJobRequest(BaseModel):
    company_name: str
    title: str
    location: str
    min_gpa: Optional[float] = None
    min_experience_years: Optional[int] = 0
    description: str
    required_skills: List[str]
    optional_skills: List[str] = []

class UpdateStatusRequest(BaseModel):
    status: str  # APPLIED, SHORTLISTED, INTERVIEW, OFFERED, REJECTED

@router.get("/positions/{position_id}/leaderboard")
def get_position_leaderboard(position_id: int, db: Session = Depends(get_db)):
    # 1. Verify position exists
    pos = db.execute(
        text("""
            SELECT p.position_id, p.title, p.min_gpa, p.min_experience_years, c.company_name
            FROM positions p
            LEFT JOIN companies c ON p.company_id = c.company_id
            WHERE p.position_id = :pid
        """),
        {"pid": position_id}
    ).fetchone()

    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    # 2. Fetch all applied applicants with their details
    rows = db.execute(
        text("""
            SELECT 
                app.application_id,
                app.applicant_id,
                app.status,
                app.match_score,
                app.applied_at,
                a.full_name,
                a.gpa,
                a.experience_years,
                u.email
            FROM applications app
            JOIN applicants a ON app.applicant_id = a.applicant_id
            JOIN users u ON a.user_id = u.user_id
            WHERE app.position_id = :pid
            ORDER BY app.match_score DESC, app.applied_at ASC
        """),
        {"pid": position_id}
    ).fetchall()

    leaderboard = []
    for r in rows:
        # Get candidate's skills
        skills_rows = db.execute(
            text("""
                SELECT s.skill_name
                FROM applicant_skills ask
                JOIN skills s ON ask.skill_id = s.skill_id
                WHERE ask.applicant_id = :aid
            """),
            {"aid": r.applicant_id}
        ).fetchall()

        is_gpa_ok = (r.gpa is not None and pos.min_gpa is not None and float(r.gpa) >= float(pos.min_gpa)) if pos.min_gpa else True
        is_exp_ok = (r.experience_years or 0) >= (pos.min_experience_years or 0)

        leaderboard.append({
            "application_id": r.application_id,
            "applicant_id": r.applicant_id,
            "full_name": r.full_name,
            "email": r.email,
            "match_score": round(float(r.match_score or 0), 1),
            "status": r.status,
            "gpa": float(r.gpa) if r.gpa else None,
            "experience_years": r.experience_years or 0,
            "eligible": bool(is_gpa_ok and is_exp_ok),
            "skills": [s.skill_name for s in skills_rows],
            "applied_at": str(r.applied_at)[:10] if r.applied_at else "—"
        })

    return {
        "position": {
            "position_id": pos.position_id,
            "title": pos.title,
            "company": pos.company_name,
            "min_gpa": float(pos.min_gpa) if pos.min_gpa else None,
            "min_experience_years": pos.min_experience_years or 0
        },
        "total_applicants": len(leaderboard),
        "leaderboard": leaderboard
    }

@router.patch("/applications/{application_id}/status")
def update_application_status(application_id: int, req: UpdateStatusRequest, db: Session = Depends(get_db)):
    valid_statuses = ["APPLIED", "SHORTLISTED", "INTERVIEW", "OFFERED", "REJECTED"]
    new_status = req.status.upper()
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Choose from: {valid_statuses}")

    db.execute(
        text("UPDATE applications SET status = :status WHERE application_id = :aid"),
        {"status": new_status, "aid": application_id}
    )
    db.commit()

    return {"message": "Status updated successfully", "status": new_status}

@router.post("/positions/create")
def create_job_position(req: CreateJobRequest, db: Session = Depends(get_db)):
    if not req.title.strip():
        raise HTTPException(status_code=400, detail="Job title is required.")

    # 1. Find or create company
    company_name = req.company_name.strip() or "Tech Corp"
    company = db.execute(
        text("SELECT company_id FROM companies WHERE LOWER(company_name) = LOWER(:name)"),
        {"name": company_name}
    ).fetchone()

    if company:
        company_id = company.company_id
    else:
        db.execute(
            text("INSERT INTO companies (company_name, industry, location) VALUES (:name, 'Technology', :loc)"),
            {"name": company_name, "loc": req.location or "Remote"}
        )
        db.commit()
        company = db.execute(
            text("SELECT company_id FROM companies WHERE LOWER(company_name) = LOWER(:name)"),
            {"name": company_name}
        ).fetchone()
        company_id = company.company_id

    # 2. Insert position
    db.execute(
        text("""
            INSERT INTO positions (company_id, title, description, min_gpa, min_experience_years, status)
            VALUES (:cid, :title, :desc, :gpa, :exp, 'OPEN')
        """),
        {
            "cid": company_id,
            "title": req.title.strip(),
            "desc": req.description.strip(),
            "gpa": req.min_gpa,
            "exp": req.min_experience_years or 0
        }
    )
    db.commit()

    pos = db.execute(
        text("SELECT position_id FROM positions WHERE company_id = :cid AND title = :title ORDER BY position_id DESC LIMIT 1"),
        {"cid": company_id, "title": req.title.strip()}
    ).fetchone()
    position_id = pos.position_id

    # 3. Associate skills
    for is_mand, skills_list in [(1, req.required_skills), (0, req.optional_skills)]:
        for s_name in skills_list:
            s_name = s_name.strip()
            if not s_name:
                continue
            s_row = db.execute(text("SELECT skill_id FROM skills WHERE LOWER(skill_name) = LOWER(:s)"), {"s": s_name}).fetchone()
            if not s_row:
                db.execute(text("INSERT INTO skills (skill_name) VALUES (:s)"), {"s": s_name})
                db.commit()
                s_row = db.execute(text("SELECT skill_id FROM skills WHERE LOWER(skill_name) = LOWER(:s)"), {"s": s_name}).fetchone()

            db.execute(
                text("INSERT INTO position_requirements (position_id, skill_id, is_mandatory, weight) VALUES (:p, :s, :m, :w)"),
                {"p": position_id, "s": s_row.skill_id, "m": is_mand, "w": 1.0 if is_mand else 0.5}
            )
            db.commit()

    return {
        "message": "Job position created successfully",
        "position_id": position_id,
        "title": req.title
    }
