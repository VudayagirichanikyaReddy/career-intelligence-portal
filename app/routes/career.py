import os
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from googleapiclient.discovery import build

from ..db import get_db
from ..services.pdf_service import generate_match_report_pdf

router = APIRouter(
    prefix="/api/career",
    tags=["Career Intelligence"]
)

def get_fallback_recommendations(skills):
    curated = {
        "Python": {"title": "Python Full Course for Beginners", "channel": "freeCodeCamp.org", "url": "https://www.youtube.com/watch?v=eWRfhZUzrAc"},
        "Docker": {"title": "Docker Tutorial for Beginners", "channel": "TechWorld with Nana", "url": "https://www.youtube.com/watch?v=3c-iBn73dDE"},
        "Kubernetes": {"title": "Kubernetes Course - Hands-on", "channel": "freeCodeCamp.org", "url": "https://www.youtube.com/watch?v=X48VuDVv0do"},
        "FastAPI": {"title": "FastAPI Tutorial - Modern Python Web APIs", "channel": "Amigoscode", "url": "https://www.youtube.com/watch?v=7t2alSnE2-I"},
        "SQL": {"title": "SQL Tutorial - Full Database Course", "channel": "freeCodeCamp.org", "url": "https://www.youtube.com/watch?v=HXV3zeQKqGY"},
        "React": {"title": "React JS Full Course 2024", "channel": "Traversy Media", "url": "https://www.youtube.com/watch?v=LDB4uaJ87e0"},
        "Kafka": {"title": "Apache Kafka Full Course", "channel": "freeCodeCamp.org", "url": "https://www.youtube.com/watch?v=R873BlNVUB4"},
        "AWS": {"title": "AWS Certified Cloud Practitioner Training", "channel": "freeCodeCamp.org", "url": "https://www.youtube.com/watch?v=SOTamWNgDKc"},
        "Git": {"title": "Git and GitHub for Beginners", "channel": "freeCodeCamp.org", "url": "https://www.youtube.com/watch?v=RGOj5yH7evk"},
        "Linux": {"title": "Linux for Beginners Course", "channel": "freeCodeCamp.org", "url": "https://www.youtube.com/watch?v=wBp0Rb-ZJak"},
    }
    recs = []
    for skill in skills:
        item = curated.get(skill)
        if item:
            recs.append({"skill": skill, "title": item["title"], "channel": item["channel"], "url": item["url"]})
        else:
            recs.append({
                "skill": skill,
                "title": f"{skill} Crash Course & Tutorial",
                "channel": "Tech Academy",
                "url": f"https://www.youtube.com/results?search_query={skill}+tutorial+course"
            })
    return recs

@router.get("/{applicant_id}/recommendations/{position_id}")
def get_recommendations(
    applicant_id: int,
    position_id: int,
    db: Session = Depends(get_db)
):
    applicant = db.execute(
        text("SELECT applicant_id, full_name FROM applicants WHERE applicant_id = :aid"),
        {"aid": applicant_id}
    ).fetchone()

    if not applicant:
        return {"error": "Applicant not found"}

    position = db.execute(
        text("SELECT position_id, title FROM positions WHERE position_id = :pid"),
        {"pid": position_id}
    ).fetchone()

    if not position:
        return {"error": "Position not found"}

    missing_skills_rows = db.execute(
        text("""
            SELECT s.skill_name
            FROM position_requirements pr
            JOIN skills s ON pr.skill_id = s.skill_id
            WHERE pr.position_id = :pid
            AND pr.skill_id NOT IN (
                SELECT skill_id
                FROM applicant_skills
                WHERE applicant_id = :aid
            )
        """),
        {"pid": position_id, "aid": applicant_id}
    ).fetchall()

    skills = [row.skill_name for row in missing_skills_rows]

    if not skills:
        return {
            "applicant_id": applicant_id,
            "applicant_name": applicant.full_name,
            "position": position.title,
            "missing_skills": [],
            "recommendations": [],
            "message": "No skill gaps found."
        }

    api_key = os.getenv("YOUTUBE_API_KEY")
    recommendations = []

    if api_key:
        try:
            youtube = build("youtube", "v3", developerKey=api_key)
            for skill in skills[:3]:
                response = youtube.search().list(
                    part="snippet",
                    q=f"{skill} tutorial course",
                    type="video",
                    maxResults=2
                ).execute()
                for item in response.get("items", []):
                    recommendations.append({
                        "skill": skill,
                        "title": item["snippet"]["title"],
                        "channel": item["snippet"]["channelTitle"],
                        "url": "https://www.youtube.com/watch?v=" + item["id"]["videoId"]
                    })
        except Exception as e:
            print(f"[Career] YouTube API error: {e}. Falling back to curated links.")
            recommendations = []

    if not recommendations:
        recommendations = get_fallback_recommendations(skills)

    return {
        "applicant_id": applicant_id,
        "applicant_name": applicant.full_name,
        "position": position.title,
        "missing_skills": skills,
        "recommendations": recommendations
    }

@router.get("/{applicant_id}/report/{position_id}")
def download_match_report(
    applicant_id: int,
    position_id: int,
    db: Session = Depends(get_db)
):
    applicant = db.execute(
        text("SELECT applicant_id, full_name, gpa, experience_years FROM applicants WHERE applicant_id = :aid"),
        {"aid": applicant_id}
    ).fetchone()
    if not applicant:
        return {"error": "Applicant not found"}

    position = db.execute(
        text("""
            SELECT p.position_id, p.title, p.min_gpa, p.min_experience_years, c.company_name, c.location
            FROM positions p
            LEFT JOIN companies c ON p.company_id = c.company_id
            WHERE p.position_id = :pid
        """),
        {"pid": position_id}
    ).fetchone()
    if not position:
        return {"error": "Position not found"}

    all_reqs = db.execute(
        text("""
            SELECT s.skill_name, pr.is_mandatory
            FROM position_requirements pr
            JOIN skills s ON pr.skill_id = s.skill_id
            WHERE pr.position_id = :pid
        """),
        {"pid": position_id}
    ).fetchall()

    cand_skills = db.execute(
        text("""
            SELECT s.skill_name
            FROM applicant_skills ask
            JOIN skills s ON ask.skill_id = s.skill_id
            WHERE ask.applicant_id = :aid
        """),
        {"aid": applicant_id}
    ).fetchall()

    cand_set = {s.skill_name.lower() for s in cand_skills}
    matched = [r.skill_name for r in all_reqs if r.skill_name.lower() in cand_set]
    missing = [r.skill_name for r in all_reqs if r.skill_name.lower() not in cand_set]

    total_req = len(all_reqs) or 1
    match_pct = round((len(matched) / total_req) * 100)

    gpa_ok = (applicant.gpa is not None and position.min_gpa is not None and float(applicant.gpa) >= float(position.min_gpa)) if position.min_gpa else True
    exp_ok = (applicant.experience_years or 0) >= (position.min_experience_years or 0)

    eval_data = {
        "match_score": match_pct,
        "eligible": bool(gpa_ok and exp_ok),
        "matched_skills": matched,
        "missing_skills": missing
    }
    app_info = {
        "applicant_id": applicant.applicant_id,
        "full_name": applicant.full_name,
        "gpa": float(applicant.gpa) if applicant.gpa else None,
        "experience_years": applicant.experience_years or 0
    }
    pos_info = {
        "position_id": position.position_id,
        "title": position.title,
        "company": position.company_name or "Company",
        "location": position.location or "Not specified",
        "min_gpa": float(position.min_gpa) if position.min_gpa else None,
        "min_experience_years": position.min_experience_years or 0
    }

    recs_data = get_recommendations(applicant_id, position_id, db)
    recs = recs_data.get("recommendations", []) if isinstance(recs_data, dict) else []

    pdf_bytes = generate_match_report_pdf(eval_data, app_info, pos_info, recs)
    clean_name = (applicant.full_name or "Candidate").replace(" ", "_")
    clean_title = (position.title or "Role").replace(" ", "_")
    filename = f"Career_Sensei_Report_{clean_name}_{clean_title}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
