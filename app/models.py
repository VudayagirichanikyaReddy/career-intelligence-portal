from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey
from .db import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)


class Applicant(Base):
    __tablename__ = "applicants"

    applicant_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    full_name = Column(String(255), nullable=False)
    university = Column(String(255))
    degree = Column(String(100))
    branch = Column(String(100))
    gpa = Column(Float)
    experience_years = Column(Float)
    resume_text = Column(Text)


class Position(Base):
    __tablename__ = "positions"

    position_id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.company_id"))
    title = Column(String(255), nullable=False)
    description = Column(Text)
    min_gpa = Column(Float)
    min_experience_years = Column(Float)


class Skill(Base):
    __tablename__ = "skills"

    skill_id = Column(Integer, primary_key=True)
    skill_name = Column(String(100), unique=True, nullable=False)

class ApplicantSkill(Base):
    __tablename__ = "applicant_skills"

    applicant_id = Column(Integer, ForeignKey("applicants.applicant_id"), 
primary_key=True)
    skill_id = Column(Integer, ForeignKey("skills.skill_id"), primary_key=True)
