import io
import json

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from pypdf import PdfReader
from docx import Document

from ..db import get_db
from ..models import Applicant
from ..services.ai_service import extract_resume_information


router = APIRouter(
    prefix="/api/applicants",
    tags=["Applicants"]
)


# -----------------------------
# Request model
# -----------------------------

class ApplicantCreate(BaseModel):
    user_id: int
    full_name: str
    university: str | None = None
    degree: str | None = None
    branch: str | None = None
    gpa: float | None = None
    experience_years: float | None = 0
    resume_text: str | None = None


# -----------------------------
# Helper: Extract text from file
# -----------------------------

def extract_resume_text(filename: str, file_bytes: bytes) -> str:
    extension = filename.lower().split(".")[-1]

    if extension == "txt":
        return file_bytes.decode("utf-8", errors="ignore")

    if extension == "pdf":
        try:
            reader = PdfReader(io.BytesIO(file_bytes))

            pages = []

            for page in reader.pages:
                page_text = page.extract_text()

                if page_text:
                    pages.append(page_text)

            resume_text = "\n".join(pages).strip()

            if not resume_text:
                raise HTTPException(
                    status_code=400,
                    detail="Could not extract text from the PDF."
                )

            return resume_text

        except HTTPException:
            raise

        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to read PDF: {str(e)}"
            )

    if extension == "docx":
        try:
            document = Document(io.BytesIO(file_bytes))

            paragraphs = [
                paragraph.text
                for paragraph in document.paragraphs
                if paragraph.text.strip()
            ]

            resume_text = "\n".join(paragraphs).strip()

            if not resume_text:
                raise HTTPException(
                    status_code=400,
                    detail="Could not extract text from the DOCX file."
                )

            return resume_text

        except HTTPException:
            raise

        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to read DOCX: {str(e)}"
            )

    raise HTTPException(
        status_code=400,
        detail="Unsupported file format. Please upload PDF, DOCX, or TXT."
    )


# -----------------------------
# Create applicant manually
# -----------------------------

@router.post("")
def create_applicant(
    applicant_data: ApplicantCreate,
    db: Session = Depends(get_db)
):
    existing_applicant = db.query(Applicant).filter(
        Applicant.user_id == applicant_data.user_id
    ).first()

    if existing_applicant:
        raise HTTPException(
            status_code=400,
            detail="An applicant profile already exists for this user."
        )

    applicant = Applicant(
        user_id=applicant_data.user_id,
        full_name=applicant_data.full_name,
        university=applicant_data.university,
        degree=applicant_data.degree,
        branch=applicant_data.branch,
        gpa=applicant_data.gpa,
        experience_years=applicant_data.experience_years,
        resume_text=applicant_data.resume_text
    )

    db.add(applicant)
    db.commit()
    db.refresh(applicant)

    return {
        "applicant_id": applicant.applicant_id,
        "message": "Applicant created successfully"
    }


# -----------------------------
# Upload resume
# -----------------------------

@router.post("/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    user_id: int = Form(1),
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No file selected."
        )

    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty."
        )

    # Extract readable text from the uploaded resume
    resume_text = extract_resume_text(
        file.filename,
        file_bytes
    )

    # Check whether this user already has an applicant profile
    applicant = db.query(Applicant).filter(
        Applicant.user_id == user_id
    ).first()

    # If applicant exists, update the resume
    if applicant:
        applicant.resume_text = resume_text

        db.commit()
        db.refresh(applicant)

        return {
            "applicant_id": applicant.applicant_id,
            "filename": file.filename,
            "message": "Resume uploaded and existing applicant profile updated."
        }

    # If applicant does not exist, create one
    applicant = Applicant(
        user_id=user_id,
        full_name="New Applicant",
        experience_years=0,
        resume_text=resume_text
    )

    db.add(applicant)
    db.commit()
    db.refresh(applicant)

    return {
        "applicant_id": applicant.applicant_id,
        "filename": file.filename,
        "message": "Resume uploaded and applicant created successfully."
    }


# -----------------------------
# Parse resume using AI
# -----------------------------

@router.post("/{applicant_id}/parse-resume")
def parse_resume(
    applicant_id: int,
    db: Session = Depends(get_db)
):
    applicant = db.query(Applicant).filter(
        Applicant.applicant_id == applicant_id
    ).first()

    if not applicant:
        raise HTTPException(
            status_code=404,
            detail="Applicant not found."
        )

    if not applicant.resume_text:
        raise HTTPException(
            status_code=400,
            detail="No resume text found for this applicant."
        )

    # Send resume text to OpenAI
    ai_result = extract_resume_information(
        applicant.resume_text
    )

    # Convert AI response into JSON
    try:
        parsed_data = json.loads(ai_result)

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="AI returned an invalid JSON response."
        )

    # -----------------------------
    # Update applicant information
    # -----------------------------

    applicant.full_name = parsed_data.get(
        "full_name"
    ) or applicant.full_name

    applicant.university = parsed_data.get(
        "university"
    )

    applicant.degree = parsed_data.get(
        "degree"
    )

    applicant.branch = parsed_data.get(
        "branch"
    )

    gpa_value = parsed_data.get("gpa")

    if isinstance(gpa_value, str):
        gpa_value = gpa_value.replace("/10", "").strip()

    try:
        gpa_value = float(gpa_value) if gpa_value else None
    except (ValueError, TypeError):
        gpa_value = None

    applicant.gpa = gpa_value

    applicant.experience_years = parsed_data.get(
        "experience_years"
    )

    # -----------------------------
    # Store extracted skills
    # -----------------------------

    skills = parsed_data.get(
        "skills",
        []
    )

    # Remove existing skills for this applicant
    db.execute(
        text("""
            DELETE FROM applicant_skills
            WHERE applicant_id = :applicant_id
        """),
        {
            "applicant_id": applicant_id
        }
    )

    # Add extracted skills
    for skill_name in skills:

        if not skill_name:
            continue

        skill_name = str(skill_name).strip()

        if not skill_name:
            continue

        # Check whether skill already exists
        skill = db.execute(
            text("""
                SELECT skill_id
                FROM skills
                WHERE LOWER(skill_name) = LOWER(:skill_name)
                LIMIT 1
            """),
            {
                "skill_name": skill_name
            }
        ).fetchone()

        # Create skill if it does not exist
        if not skill:
            db.execute(
                text("""
                    INSERT INTO skills (skill_name)
                    VALUES (:skill_name)
                """),
                {
                    "skill_name": skill_name
                }
            )

            skill = db.execute(
                text("""
                    SELECT skill_id
                    FROM skills
                    WHERE LOWER(skill_name) = LOWER(:skill_name)
                    LIMIT 1
                """),
                {
                    "skill_name": skill_name
                }
            ).fetchone()

        # Connect applicant with skill
        if skill:
            db.execute(
                text("""
                    INSERT INTO applicant_skills
                    (applicant_id, skill_id)
                    VALUES (:applicant_id, :skill_id)
                """),
                {
                    "applicant_id": applicant_id,
                    "skill_id": skill.skill_id
                }
            )

    db.commit()
    db.refresh(applicant)

    return {
        "applicant_id": applicant.applicant_id,
        "full_name": applicant.full_name,
        "university": applicant.university,
        "degree": applicant.degree,
        "branch": applicant.branch,
        "gpa": applicant.gpa,
        "experience_years": applicant.experience_years,
        "skills": skills,
        "certifications": parsed_data.get(
            "certifications",
            []
        ),
        "message": "Resume parsed successfully using AI."
    }


# -----------------------------
# Skill matching
# -----------------------------

@router.get("/{applicant_id}/match/{position_id}")
def match_applicant(
    applicant_id: int,
    position_id: int,
    db: Session = Depends(get_db)
):
    result = db.execute(
        text("""
            SELECT
                s.skill_name,
                pr.weight,
                CASE
                    WHEN aps.skill_id IS NOT NULL THEN 1
                    ELSE 0
                END AS matched
            FROM position_requirements pr
            JOIN skills s
                ON pr.skill_id = s.skill_id
            LEFT JOIN applicant_skills aps
                ON aps.skill_id = pr.skill_id
                AND aps.applicant_id = :applicant_id
            WHERE pr.position_id = :position_id
        """),
        {
            "applicant_id": applicant_id,
            "position_id": position_id
        }
    ).fetchall()

    if not result:
        return {
            "applicant_id": applicant_id,
            "position_id": position_id,
            "match_score": 0,
            "matched_skills": [],
            "missing_skills": []
        }

    total_weight = sum(
        float(row.weight)
        for row in result
    )

    matched_weight = sum(
        float(row.weight)
        for row in result
        if row.matched == 1
    )

    match_score = (
        matched_weight / total_weight * 100
        if total_weight > 0
        else 0
    )

    matched_skills = [
        row.skill_name
        for row in result
        if row.matched == 1
    ]

    missing_skills = [
        row.skill_name
        for row in result
        if row.matched == 0
    ]

    return {
        "applicant_id": applicant_id,
        "position_id": position_id,
        "match_score": round(match_score, 2),
        "matched_skills": matched_skills,
        "missing_skills": missing_skills
    }


# -----------------------------
# Eligibility
# -----------------------------

@router.get("/{applicant_id}/eligibility/{position_id}")
def check_eligibility(
    applicant_id: int,
    position_id: int,
    db: Session = Depends(get_db)
):
    applicant = db.execute(
        text("""
            SELECT
                applicant_id,
                full_name,
                gpa,
                experience_years
            FROM applicants
            WHERE applicant_id = :applicant_id
        """),
        {
            "applicant_id": applicant_id
        }
    ).fetchone()

    if not applicant:
        raise HTTPException(
            status_code=404,
            detail="Applicant not found."
        )

    position = db.execute(
        text("""
            SELECT
                position_id,
                title,
                min_gpa,
                min_experience_years
            FROM positions
            WHERE position_id = :position_id
        """),
        {
            "position_id": position_id
        }
    ).fetchone()

    if not position:
        raise HTTPException(
            status_code=404,
            detail="Position not found."
        )

    gpa_ok = (
        applicant.gpa is not None
        and (
            position.min_gpa is None
            or applicant.gpa >= position.min_gpa
        )
    )

    experience_ok = (
        applicant.experience_years is not None
        and (
            position.min_experience_years is None
            or applicant.experience_years >= position.min_experience_years
        )
    )

    eligible = gpa_ok and experience_ok

    return {
        "applicant_id": applicant_id,
        "applicant_name": applicant.full_name,
        "position_id": position_id,
        "position": position.title,
        "gpa": applicant.gpa,
        "required_gpa": position.min_gpa,
        "experience_years": applicant.experience_years,
        "required_experience_years": position.min_experience_years,
        "gpa_eligible": gpa_ok,
        "experience_eligible": experience_ok,
        "eligible": eligible
    }


# -----------------------------
# Combined evaluation
# -----------------------------

@router.get("/{applicant_id}/evaluate/{position_id}")
def evaluate_applicant(
    applicant_id: int,
    position_id: int,
    db: Session = Depends(get_db)
):
    applicant = db.execute(
        text("""
            SELECT
                applicant_id,
                full_name,
                gpa,
                experience_years
            FROM applicants
            WHERE applicant_id = :applicant_id
        """),
        {
            "applicant_id": applicant_id
        }
    ).fetchone()

    if not applicant:
        raise HTTPException(
            status_code=404,
            detail="Applicant not found."
        )

    position = db.execute(
        text("""
            SELECT
                position_id,
                title,
                min_gpa,
                min_experience_years
            FROM positions
            WHERE position_id = :position_id
        """),
        {
            "position_id": position_id
        }
    ).fetchone()

    if not position:
        raise HTTPException(
            status_code=404,
            detail="Position not found."
        )

    skill_result = db.execute(
        text("""
            SELECT
                s.skill_name,
                pr.weight,
                CASE
                    WHEN aps.skill_id IS NOT NULL THEN 1
                    ELSE 0
                END AS matched
            FROM position_requirements pr
            JOIN skills s
                ON pr.skill_id = s.skill_id
            LEFT JOIN applicant_skills aps
                ON aps.skill_id = pr.skill_id
                AND aps.applicant_id = :applicant_id
            WHERE pr.position_id = :position_id
        """),
        {
            "applicant_id": applicant_id,
            "position_id": position_id
        }
    ).fetchall()

    total_weight = sum(
        float(row.weight)
        for row in skill_result
    )

    matched_weight = sum(
        float(row.weight)
        for row in skill_result
        if row.matched == 1
    )

    match_score = (
        matched_weight / total_weight * 100
        if total_weight > 0
        else 0
    )

    matched_skills = [
        row.skill_name
        for row in skill_result
        if row.matched == 1
    ]

    missing_skills = [
        row.skill_name
        for row in skill_result
        if row.matched == 0
    ]

    gpa_ok = (
        applicant.gpa is not None
        and (
            position.min_gpa is None
            or applicant.gpa >= position.min_gpa
        )
    )

    experience_ok = (
        applicant.experience_years is not None
        and (
            position.min_experience_years is None
            or applicant.experience_years >= position.min_experience_years
        )
    )

    eligible = gpa_ok and experience_ok

    skill_gap = ", ".join(
        missing_skills
    ) if missing_skills else "None"

    ai_summary = (
        f"{applicant.full_name} has a "
        f"{round(match_score, 2)}% skill match for "
        f"{position.title}. "
        f"Eligibility based on GPA and experience: "
        f"{'Eligible' if eligible else 'Not Eligible'}. "
        f"Missing skills: {skill_gap}."
    )

    # Store evaluation result in match_results
    db.execute(
        text("""
            INSERT INTO match_results
            (
                applicant_id,
                position_id,
                match_score,
                eligible,
                skill_gap,
                ai_summary
            )
            VALUES
            (
                :applicant_id,
                :position_id,
                :match_score,
                :eligible,
                :skill_gap,
                :ai_summary
            )
        """),
        {
            "applicant_id": applicant_id,
            "position_id": position_id,
            "match_score": round(match_score, 2),
            "eligible": eligible,
            "skill_gap": skill_gap,
            "ai_summary": ai_summary
        }
    )

    db.commit()

    return {
        "applicant_id": applicant_id,
        "applicant_name": applicant.full_name,
        "position_id": position_id,
        "position": position.title,
        "match_score": round(match_score, 2),
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "gpa": applicant.gpa,
        "required_gpa": position.min_gpa,
        "experience_years": applicant.experience_years,
        "required_experience_years": position.min_experience_years,
        "gpa_eligible": gpa_ok,
        "experience_eligible": experience_ok,
        "eligible": eligible,
        "skill_gap": skill_gap,
        "summary": ai_summary
    }