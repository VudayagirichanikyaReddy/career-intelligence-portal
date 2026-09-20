import os

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from googleapiclient.discovery import build

from ..db import get_db

router = APIRouter(
    prefix="/api/career",
    tags=["Career Intelligence"]
)


@router.get("/{applicant_id}/recommendations/{position_id}")
def get_recommendations(
    applicant_id: int,
    position_id: int,
    db: Session = Depends(get_db)
):

    applicant = db.execute(
        text("""
            SELECT applicant_id, full_name
            FROM applicants
            WHERE applicant_id = :applicant_id
        """),
        {"applicant_id": applicant_id}
    ).fetchone()

    if not applicant:
        return {"error": "Applicant not found"}

    position = db.execute(
        text("""
            SELECT position_id, title
            FROM positions
            WHERE position_id = :position_id
        """),
        {"position_id": position_id}
    ).fetchone()

    if not position:
        return {"error": "Position not found"}

    missing_skills = db.execute(
        text("""
            SELECT s.skill_name
            FROM position_requirements pr
            JOIN skills s
                ON pr.skill_id = s.skill_id
            WHERE pr.position_id = :position_id
            AND pr.skill_id NOT IN (
                SELECT skill_id
                FROM applicant_skills
                WHERE applicant_id = :applicant_id
            )
        """),
        {
            "position_id": position_id,
            "applicant_id": applicant_id
        }
    ).fetchall()

    skills = [row.skill_name for row in missing_skills]

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

    if not api_key:
        return {"error": "YouTube API key not configured"}

    youtube = build(
        "youtube",
        "v3",
        developerKey=api_key
    )

    recommendations = []

    for skill in skills:

        response = youtube.search().list(
            part="snippet",
            q=f"{skill} tutorial course",
            type="video",
            maxResults=3
        ).execute()

        for item in response.get("items", []):

            recommendations.append({
                "skill": skill,
                "title": item["snippet"]["title"],
                "channel": item["snippet"]["channelTitle"],
                "url": (
                    "https://www.youtube.com/watch?v="
                    + item["id"]["videoId"]
                )
            })

    return {
        "applicant_id": applicant_id,
        "applicant_name": applicant.full_name,
        "position": position.title,
        "missing_skills": skills,
        "recommendations": recommendations
    }
