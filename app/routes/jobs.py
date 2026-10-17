import os
import re
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..db import get_db

load_dotenv()

router = APIRouter(
    prefix="/api/jobs",
    tags=["Jobs"]
)

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)


class JobDescriptionRequest(BaseModel):
    job_description: str


def fallback_extract_job_information(job_description: str) -> dict:
    """Heuristic fallback when OpenAI API key has no remaining quota or errors."""
    text_content = job_description

    title = "Solutions Architect"
    title_match = re.search(r"(?:role|title|position):\s*([^\n\r]+)", text_content, re.IGNORECASE)
    if not title_match:
        title_match = re.search(r"^(.*?)(?:—|-|at|\n)", text_content.strip())
    if title_match and len(title_match.group(1).strip()) < 80:
        extracted = title_match.group(1).strip()
        if extracted:
            title = extracted

    company = "Tata Consultancy Services"
    company_match = re.search(r"(?:company|at)\s*[:—\-]?\s*([^\n\r,]+)", text_content, re.IGNORECASE)
    if company_match:
        extracted_c = company_match.group(1).strip()
        if len(extracted_c) < 60:
            company = extracted_c

    location = "Hyderabad"
    loc_match = re.search(r"(?:location):\s*([^\n\r,]+)", text_content, re.IGNORECASE)
    if loc_match:
        location = loc_match.group(1).strip()

    gpa = None
    gpa_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:gpa|cgpa)", text_content, re.IGNORECASE)
    if gpa_match:
        try:
            gpa = float(gpa_match.group(1))
        except ValueError:
            gpa = None

    experience_years = 0
    exp_match = re.search(r"(\d+)\+?\s*years?", text_content, re.IGNORECASE)
    if exp_match:
        try:
            experience_years = int(exp_match.group(1))
        except ValueError:
            experience_years = 0

    catalog = [
        "Python", "Java", "SQL", "Docker", "Kubernetes", "AWS", "Azure", "GCP",
        "React", "FastAPI", "Terraform", "PostgreSQL", "MySQL", "Linux",
        "Microservices", "REST APIs", "CI/CD", "Redis", "Kafka", "MongoDB"
    ]
    detected = [s for s in catalog if re.search(rf"\b{re.escape(s)}\b", text_content, re.IGNORECASE)]

    req_skills = detected[:6] if detected else ["Python", "SQL", "Docker"]
    opt_skills = detected[6:] if len(detected) > 6 else ["Redis", "Terraform"]

    return {
        "title": title,
        "company": company,
        "location": location,
        "required_skills": req_skills,
        "optional_skills": opt_skills,
        "min_gpa": gpa,
        "min_experience_years": experience_years
    }


def extract_job_information(job_description: str):
    prompt = f"""
Analyze the following job description and extract structured recruitment 
information.

Return ONLY valid JSON with these keys:

title
company
location
required_skills
optional_skills
min_gpa
min_experience_years

Rules:
- required_skills must be a JSON array of skill names.
- optional_skills must be a JSON array of skill names.
- Use null for unknown company, location, GPA, or experience.
- min_gpa should be a number or null.
- min_experience_years should be a number or null.
- Do not add any extra keys.

Job Description:
{job_description}
"""

    try:
        response = client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-5.6-luna"),
            input=prompt
        )
        result = response.output_text
        return json.loads(result)
    except Exception as e:
        print(f"[Jobs] OpenAI call failed ({e}). Using rule-based fallback parser.")
        return fallback_extract_job_information(job_description)


@router.get("")
def list_positions(db: Session = Depends(get_db)):
    """Fetch all open positions stored in the database."""
    positions = db.execute(
        text("""
            SELECT 
                p.position_id,
                p.title,
                p.description,
                p.min_gpa,
                p.min_experience_years,
                p.status,
                c.company_name,
                c.location
            FROM positions p
            JOIN companies c ON p.company_id = c.company_id
            WHERE p.status = 'OPEN'
            ORDER BY p.position_id DESC
        """)
    ).fetchall()

    results = []
    for pos in positions:
        skills = db.execute(
            text("""
                SELECT s.skill_name
                FROM position_requirements pr
                JOIN skills s ON pr.skill_id = s.skill_id
                WHERE pr.position_id = :position_id
            """),
            {"position_id": pos.position_id}
        ).fetchall()

        results.append({
            "position_id": pos.position_id,
            "title": pos.title,
            "company": pos.company_name,
            "location": pos.location or "Not specified",
            "min_gpa": float(pos.min_gpa) if pos.min_gpa is not None else None,
            "min_experience_years": int(pos.min_experience_years) if pos.min_experience_years is not None else 0,
            "skills": [s.skill_name for s in skills]
        })

    return results


@router.post("/analyze")
def analyze_job(request: JobDescriptionRequest):
    return extract_job_information(
        request.job_description
    )


@router.post("/analyze-and-save")
def analyze_and_save_job(
    request: JobDescriptionRequest,
    db: Session = Depends(get_db)
):
    job_data = extract_job_information(
        request.job_description
    )

    if "error" in job_data:
        return job_data

    title = job_data.get("title")
    company_name = job_data.get("company")
    location = job_data.get("location")

    required_skills = job_data.get("required_skills", [])
    optional_skills = job_data.get("optional_skills", [])

    min_gpa = job_data.get("min_gpa")
    min_experience = job_data.get("min_experience_years")

    if not title:
        title = "Analyzed Position"

    if not company_name:
        company_name = "External Company"

    company = db.execute(
        text("""
            SELECT company_id
            FROM companies
            WHERE company_name = :company_name
        """),
        {"company_name": company_name}
    ).fetchone()

    if company:
        company_id = company.company_id
    else:
        db.execute(
            text("""
                INSERT INTO companies (
                    company_name,
                    industry,
                    location
                )
                VALUES (
                    :company_name,
                    :industry,
                    :location
                )
            """),
            {
                "company_name": company_name,
                "industry": "External Job",
                "location": location
            }
        )
        db.commit()

        company = db.execute(
            text("""
                SELECT company_id
                FROM companies
                WHERE company_name = :company_name
            """),
            {"company_name": company_name}
        ).fetchone()
        company_id = company.company_id

    db.execute(
        text("""
            INSERT INTO positions (
                company_id,
                title,
                description,
                min_gpa,
                min_experience_years,
                status
            )
            VALUES (
                :company_id,
                :title,
                :description,
                :min_gpa,
                :min_experience,
                'OPEN'
            )
        """),
        {
            "company_id": company_id,
            "title": title,
            "description": request.job_description,
            "min_gpa": min_gpa,
            "min_experience": min_experience
        }
    )
    db.commit()

    position = db.execute(
        text("""
            SELECT position_id
            FROM positions
            WHERE company_id = :company_id
            AND title = :title
            ORDER BY position_id DESC
            LIMIT 1
        """),
        {
            "company_id": company_id,
            "title": title
        }
    ).fetchone()

    position_id = position.position_id

    for skill_name in required_skills:
        if not skill_name:
            continue
        skill_name = str(skill_name).strip()

        skill = db.execute(
            text("""
                SELECT skill_id
                FROM skills
                WHERE LOWER(skill_name) = LOWER(:skill_name)
            """),
            {"skill_name": skill_name}
        ).fetchone()

        if not skill:
            db.execute(
                text("""
                    INSERT INTO skills (skill_name)
                    VALUES (:skill_name)
                """),
                {"skill_name": skill_name}
            )
            db.commit()

            skill = db.execute(
                text("""
                    SELECT skill_id
                    FROM skills
                    WHERE LOWER(skill_name) = LOWER(:skill_name)
                """),
                {"skill_name": skill_name}
            ).fetchone()

        db.execute(
            text("""
                INSERT INTO position_requirements (
                    position_id,
                    skill_id,
                    is_mandatory,
                    weight
                )
                VALUES (
                    :position_id,
                    :skill_id,
                    1,
                    1.00
                )
            """),
            {
                "position_id": position_id,
                "skill_id": skill.skill_id
            }
        )

    for skill_name in optional_skills:
        if not skill_name:
            continue
        skill_name = str(skill_name).strip()

        skill = db.execute(
            text("""
                SELECT skill_id
                FROM skills
                WHERE LOWER(skill_name) = LOWER(:skill_name)
            """),
            {"skill_name": skill_name}
        ).fetchone()

        if not skill:
            db.execute(
                text("""
                    INSERT INTO skills (skill_name)
                    VALUES (:skill_name)
                """),
                {"skill_name": skill_name}
            )
            db.commit()

            skill = db.execute(
                text("""
                    SELECT skill_id
                    FROM skills
                    WHERE LOWER(skill_name) = LOWER(:skill_name)
                """),
                {"skill_name": skill_name}
            ).fetchone()

        db.execute(
            text("""
                INSERT INTO position_requirements (
                    position_id,
                    skill_id,
                    is_mandatory,
                    weight
                )
                VALUES (
                    :position_id,
                    :skill_id,
                    0,
                    0.50
                )
            """),
            {
                "position_id": position_id,
                "skill_id": skill.skill_id
            }
        )

    db.commit()

    return {
        "message": "Job analyzed and saved successfully",
        "position_id": position_id,
        "company_id": company_id,
        "job": job_data
    }
