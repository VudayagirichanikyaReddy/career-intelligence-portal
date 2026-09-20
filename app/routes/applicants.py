from fastapi import APIRouter, Depends

from sqlalchemy.orm import Session

from sqlalchemy import text

from pydantic import BaseModel

import json

from ..db import get_db

from ..models import Applicant, Skill, ApplicantSkill

from ..services.ai_service import extract_resume_information

router = APIRouter(prefix="/api/applicants", tags=["Applicants"])


class ApplicantCreate(BaseModel):

    user_id: int
    full_name: str
    university: str | None = None
    degree: str | None = None
    branch: str | None = None
    gpa: float | None = None
    experience_years: float = 0
    resume_text: str | None = None


@router.post("")
def create_applicant(data: ApplicantCreate, db: Session = Depends(get_db)):

    applicant = Applicant(**data.model_dump())

    db.add(applicant)

    db.commit()

    db.refresh(applicant)

    return applicant


@router.post("/{applicant_id}/parse-resume")
def parse_resume(applicant_id: int, db: Session = Depends(get_db)):

    applicant = db.get(Applicant, applicant_id)

    if not applicant or not applicant.resume_text:

        return {"error": "Applicant or resume text not found"}

    ai_result = extract_resume_information(applicant.resume_text)

    data = json.loads(ai_result)

    for skill_name in data.get("skills") or []:

        skill = db.query(Skill).filter(
            Skill.skill_name == skill_name
        ).first()

        if not skill:

            skill = Skill(skill_name=skill_name)

            db.add(skill)

            db.flush()

        existing_link = db.query(ApplicantSkill).filter(
            ApplicantSkill.applicant_id == applicant_id,
            ApplicantSkill.skill_id == skill.skill_id
        ).first()

        if not existing_link:

            db.add(
                ApplicantSkill(
                    applicant_id=applicant_id,
                    skill_id=skill.skill_id
                )
            )

    db.commit()

    return {
        "applicant_id": applicant_id,
        "ai_result": data,
        "message": "Resume parsed and skills stored successfully"
    }


@router.get("/{applicant_id}/match/{position_id}")
def match_applicant(
    applicant_id: int,
    position_id: int,
    db: Session = Depends(get_db)
):

    applicant = db.get(Applicant, applicant_id)

    if not applicant:

        return {"error": "Applicant not found"}

    position_requirements = db.execute(
        text("""
            SELECT
                pr.skill_id,
                s.skill_name,
                pr.weight
            FROM position_requirements pr
            JOIN skills s
                ON pr.skill_id = s.skill_id
            WHERE pr.position_id = :position_id
        """),
        {"position_id": position_id}
    ).fetchall()

    applicant_skills = db.execute(
        text("""
            SELECT skill_id
            FROM applicant_skills
            WHERE applicant_id = :applicant_id
        """),
        {"applicant_id": applicant_id}
    ).fetchall()

    applicant_skill_ids = {row.skill_id for row in applicant_skills}

    matched_skills = []

    missing_skills = []

    matched_weight = 0

    total_weight = 0

    for requirement in position_requirements:

        total_weight += float(requirement.weight)

        if requirement.skill_id in applicant_skill_ids:

            matched_skills.append(requirement.skill_name)

            matched_weight += float(requirement.weight)

        else:

            missing_skills.append(requirement.skill_name)

    match_percentage = (
        round((matched_weight / total_weight) * 100, 2)
        if total_weight > 0
        else 0
    )

    return {
        "applicant_id": applicant_id,
        "position_id": position_id,
        "match_percentage": match_percentage,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills
    }


@router.get("/{applicant_id}/eligibility/{position_id}")
def check_eligibility(
    applicant_id: int,
    position_id: int,
    db: Session = Depends(get_db)
):

    result = db.execute(
        text("""
            SELECT
                a.applicant_id,
                a.full_name,
                a.gpa,
                a.experience_years,
                p.position_id,
                p.title,
                p.min_gpa,
                p.min_experience_years
            FROM applicants a
            JOIN positions p
                ON p.position_id = :position_id
            WHERE a.applicant_id = :applicant_id
        """),
        {
            "applicant_id": applicant_id,
            "position_id": position_id
        }
    ).fetchone()

    if not result:

        return {"error": "Applicant or position not found"}

    gpa_eligible = (
        result.gpa is not None
        and result.gpa >= result.min_gpa
    )

    experience_eligible = (
        result.experience_years >= result.min_experience_years
    )

    eligible = gpa_eligible and experience_eligible

    return {
        "applicant_id": result.applicant_id,
        "applicant_name": result.full_name,
        "position_id": result.position_id,
        "position": result.title,
        "gpa": result.gpa,
        "required_gpa": result.min_gpa,
        "gpa_eligible": gpa_eligible,
        "experience_years": result.experience_years,
        "required_experience_years": result.min_experience_years,
        "experience_eligible": experience_eligible,
        "eligible": eligible
    }


@router.get("/{applicant_id}/evaluate/{position_id}")
def evaluate_applicant(
    applicant_id: int,
    position_id: int,
    db: Session = Depends(get_db)
):

    applicant = db.get(Applicant, applicant_id)

    if not applicant:

        return {"error": "Applicant not found"}

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
        {"position_id": position_id}
    ).fetchone()

    if not position:

        return {"error": "Position not found"}

    requirements = db.execute(
        text("""
            SELECT
                pr.skill_id,
                s.skill_name,
                pr.weight
            FROM position_requirements pr
            JOIN skills s
                ON pr.skill_id = s.skill_id
            WHERE pr.position_id = :position_id
        """),
        {"position_id": position_id}
    ).fetchall()

    applicant_skills = db.execute(
        text("""
            SELECT skill_id
            FROM applicant_skills
            WHERE applicant_id = :applicant_id
        """),
        {"applicant_id": applicant_id}
    ).fetchall()

    applicant_skill_ids = {row.skill_id for row in applicant_skills}

    matched_skills = []

    missing_skills = []

    matched_weight = 0

    total_weight = 0

    for requirement in requirements:

        total_weight += float(requirement.weight)

        if requirement.skill_id in applicant_skill_ids:

            matched_skills.append(requirement.skill_name)

            matched_weight += float(requirement.weight)

        else:

            missing_skills.append(requirement.skill_name)

    match_percentage = (
        round((matched_weight / total_weight) * 100, 2)
        if total_weight > 0
        else 0
    )

    gpa_eligible = (
        applicant.gpa is not None
        and applicant.gpa >= float(position.min_gpa)
    )

    experience_eligible = (
        applicant.experience_years >= float(position.min_experience_years)
    )

    eligible = gpa_eligible and experience_eligible

    skill_gap = (
        ", ".join(missing_skills)
        if missing_skills
        else "No skill gap"
    )

    ai_summary = (
        f"{applicant.full_name} has a {match_percentage}% skill match "
        f"for the {position.title} position and is "
        f"{'eligible' if eligible else 'not eligible'} "
        f"based on GPA and experience."
    )

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
            "applicant_id": applicant.applicant_id,
            "position_id": position.position_id,
            "match_score": match_percentage,
            "eligible": eligible,
            "skill_gap": skill_gap,
            "ai_summary": ai_summary
        }
    )

    db.commit()

    return {
        "applicant_id": applicant.applicant_id,
        "applicant_name": applicant.full_name,
        "position_id": position.position_id,
        "position": position.title,
        "eligible": eligible,
        "gpa": applicant.gpa,
        "required_gpa": float(position.min_gpa),
        "gpa_eligible": gpa_eligible,
        "experience_years": applicant.experience_years,
        "required_experience_years": float(position.min_experience_years),
        "experience_eligible": experience_eligible,
        "match_percentage": match_percentage,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills
    }
