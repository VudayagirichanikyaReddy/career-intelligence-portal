import os
import json
import re
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

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

def fallback_extract_resume(resume_text: str):
    text_lower = resume_text.lower()

    # Extract detected skills
    found_skills = []
    for skill in TECH_SKILLS:
        pattern = r"\b" + re.escape(skill.lower()) + r"\b"
        if re.search(pattern, text_lower):
            found_skills.append(skill)
    if not found_skills:
        found_skills = ["Python", "SQL", "Git"]

    # Extract GPA
    gpa = 7.5
    gpa_match = re.search(r"\b(gpa|cgpa)[:\s]*([0-9]+(?:\.[0-9]+)?)\b", text_lower)
    if gpa_match:
        try:
            val = float(gpa_match.group(2))
            gpa = val if val <= 10.0 else round(val / 10.0, 2)
        except Exception:
            pass

    # Extract Experience
    exp_years = 1
    exp_match = re.search(r"([0-9]+(?:\.[0-9]+)?)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience", text_lower)
    if exp_match:
        try:
            exp_years = int(float(exp_match.group(1)))
        except Exception:
            pass

    # Extract Name (first non-empty line or fallback)
    lines = [line.strip() for line in resume_text.split("\n") if line.strip()]
    full_name = lines[0][:50] if lines else "Candidate"
    # Basic sanity check so headers aren't treated as names
    if any(keyword in full_name.lower() for keyword in ["resume", "curriculum", "cv", "profile", "contact"]):
        full_name = "Candidate"

    return {
        "full_name": full_name,
        "university": "University",
        "degree": "B.Tech",
        "branch": "Computer Science",
        "gpa": gpa,
        "experience_years": exp_years,
        "skills": found_skills
    }

def extract_resume_information(resume_text: str):
    prompt = f"""
Analyze the following resume text and extract candidate details as valid JSON:
{{
  "full_name": string or null,
  "university": string or null,
  "degree": string or null,
  "branch": string or null,
  "gpa": float or null,
  "experience_years": float or null,
  "skills": ["Skill1", "Skill2"]
}}

Resume:
{resume_text}
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
        print(f"[AI Service] OpenAI error ({e}). Using deterministic fallback parser.")
        return fallback_extract_resume(resume_text)
