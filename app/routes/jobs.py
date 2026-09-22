import os
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

    response = client.responses.create(
        model=os.getenv("OPENAI_MODEL", "gpt-5.6-luna"),
        input=prompt
    )

    result = response.output_text

    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return {
            "error": "AI returned invalid JSON",
            "raw_response": result
        }


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

    required_skills = job_data.get(
        "required_skills",
        []
    )

    optional_skills = job_data.get(
        "optional_skills",
        []
    )

    min_gpa = job_data.get("min_gpa")
    min_experience = job_data.get(
        "min_experience_years"
    )

    if not title:
        return {
            "error": "Could not determine job title"
        }

    # If company name is missing, use a generic name
    if not company_name:
        company_name = "External Company"

    # Check whether company already exists
    company = db.execute(
        text("""
            SELECT company_id
            FROM companies
            WHERE company_name = :company_name
        """),
        {
            "company_name": company_name
        }
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
            {
                "company_name": company_name
            }
        ).fetchone()

        company_id = company.company_id

    # Create position
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

    # Process required skills
    for skill_name in required_skills:

        skill = db.execute(
            text("""
                SELECT skill_id
                FROM skills
                WHERE LOWER(skill_name) = LOWER(:skill_name)
            """),
            {
                "skill_name": skill_name
            }
        ).fetchone()

        if skill:
            skill_id = skill.skill_id

        else:
            db.execute(
                text("""
                    INSERT INTO skills (skill_name)
                    VALUES (:skill_name)
                """),
                {
                    "skill_name": skill_name
                }
            )

            db.commit()

            skill = db.execute(
                text("""
                    SELECT skill_id
                    FROM skills
                    WHERE LOWER(skill_name) = LOWER(:skill_name)
                """),
                {
                    "skill_name": skill_name
                }
            ).fetchone()

            skill_id = skill.skill_id

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
                "skill_id": skill_id
            }
        )

    # Process optional skills
    for skill_name in optional_skills:

        skill = db.execute(
            text("""
                SELECT skill_id
                FROM skills
                WHERE LOWER(skill_name) = LOWER(:skill_name)
            """),
            {
                "skill_name": skill_name
            }
        ).fetchone()

        if skill:
            skill_id = skill.skill_id

        else:
            db.execute(
                text("""
                    INSERT INTO skills (skill_name)
                    VALUES (:skill_name)
                """),
                {
                    "skill_name": skill_name
                }
            )

            db.commit()

            skill = db.execute(
                text("""
                    SELECT skill_id
                    FROM skills
                    WHERE LOWER(skill_name) = LOWER(:skill_name)
                """),
                {
                    "skill_name": skill_name
                }
            ).fetchone()

            skill_id = skill.skill_id

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
                "skill_id": skill_id
            }
        )

    db.commit()

    return {
        "message": "Job analyzed and saved successfully",
        "position_id": position_id,
        "company_id": company_id,
        "job": job_data
    }
