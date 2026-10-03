import os
import json
import re
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

TECH_SKILLS = [
    "Python", "Java", "C++", "C#", "JavaScript", "TypeScript", "Go", "Rust",
    "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis",
    "FastAPI", "Flask", "Django", "Node.js", "Express", "Spring Boot",
    "React", "Vue", "Angular", "HTML", "CSS", "Tailwind CSS",
    "Docker", "Kubernetes", "AWS", "Azure", "GCP", "Linux", "Git", "CI/CD",
    "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Pandas", "NumPy"
]

class JobDescriptionRequest(BaseModel):
    job_description: str

def fallback_extract_job(job_description: str):
    text_lower = job_description.lower()

    # Extract detected skills
    found_skills = []
    for skill in TECH_SKILLS:
        pattern = r"\b" + re.escape(skill.lower()) + r"\b"
        if re.search(pattern, text_lower):
            found_skills.append(skill)
    if not found_skills:
        found_skills = ["Python", "SQL", "Docker"]

    # Title heuristics
    title = "Software Engineer"
    for candidate_title in ["Backend Developer", "Frontend Developer", "Full Stack Developer", "Data Scientist", "DevOps Engineer", "Machine Learning Engineer"]:
        if candidate_title.lower() in text_lower:
            title = candidate_title
            break

    # Experience heuristic
    exp = 1
    exp_match = re.search(r"([0-9]+)\+?\s*(?:years?|yrs?)", text_lower)
    if exp_match:
        try:
            exp = int(exp_match.group(1))
        except Exception:
            pass

    return {
        "title": title,
        "company": "Tech Innovations",
        "location": "Hyderabad",
        "required_skills": found_skills[:5],
        "optional_skills": found_skills[5:8] if len(found_skills) > 5 else ["Git", "Linux"],
        "min_gpa": 7.0,
        "min_experience_years": exp
    }

def extract_job_information(job_description: str):
    prompt = f"""
Analyze the following job description and extract structured recruitment information as valid JSON:
{{
  "title": string,
  "company": string,
  "location": string,
  "required_skills": ["Skill1", "Skill2"],
  "optional_skills": ["Skill3"],
  "min_gpa": float or null,
  "min_experience_years": float or null
}}

Job Description:
{job_description}
"""
    try:
        if not os.getenv("OPENAI_API_KEY"):
            raise ValueError("No OpenAI API key configured.")

        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"[Jobs Service] OpenAI error ({e}). Using deterministic fallback parser.")
        return fallback_extract_job(job_description)

@router.get("")
@router.get("/")
def list_positions(db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT p.position_id, p.title, p.min_gpa, p.min_experience_years,
                   c.company_name, c.location
            FROM positions p
            LEFT JOIN companies c ON p.company_id = c.company_id
            WHERE p.status = 'OPEN'
            ORDER BY p.position_id ASC
        """)
    ).fetchall()

    results = []
    for pos in rows:
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
            "company": pos.company_name or "Tech Solutions",
            "location": pos.location or "Hyderabad",
            "min_gpa": float(pos.min_gpa) if pos.min_gpa is not None else None,
            "min_experience_years": int(pos.min_experience_years) if pos.min_experience_years is not None else 0,
            "skills": [s.skill_name for s in skills]
        })

    return results

@router.post("/analyze")
def analyze_job(request: JobDescriptionRequest):
    return extract_job_information(request.job_description)

@router.post("/analyze-and-save")
def analyze_and_save_job(request: JobDescriptionRequest, db: Session = Depends(get_db)):
    job_data = extract_job_information(request.job_description)
    if "error" in job_data:
        return job_data

    title = job_data.get("title") or "Software Developer"
    company_name = job_data.get("company") or "External Company"
    location = job_data.get("location") or "Hyderabad"
    required_skills = job_data.get("required_skills", [])
    optional_skills = job_data.get("optional_skills", [])
    min_gpa = job_data.get("min_gpa")
    min_experience = job_data.get("min_experience_years")

    # Company
    company = db.execute(
        text("SELECT company_id FROM companies WHERE company_name = :company_name"),
        {"company_name": company_name}
    ).fetchone()

    if company:
        company_id = company.company_id
    else:
        db.execute(
            text("INSERT INTO companies (company_name, industry, location) VALUES (:name, 'Tech', :loc)"),
            {"name": company_name, "loc": location}
        )
        db.commit()
        company = db.execute(
            text("SELECT company_id FROM companies WHERE company_name = :name"),
            {"name": company_name}
        ).fetchone()
        company_id = company.company_id

    # Position
    db.execute(
        text("""
            INSERT INTO positions (company_id, title, description, min_gpa, min_experience_years, status)
            VALUES (:company_id, :title, :description, :min_gpa, :min_experience, 'OPEN')
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
        text("SELECT position_id FROM positions WHERE company_id = :cid AND title = :title ORDER BY position_id DESC LIMIT 1"),
        {"cid": company_id, "title": title}
    ).fetchone()
    position_id = position.position_id

    # Save skills
    for is_mand, skills_list in [(1, required_skills), (0, optional_skills)]:
        for s_name in skills_list:
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
        "message": "Job analyzed and saved successfully",
        "position_id": position_id,
        "company_id": company_id,
        "job": job_data
    }
