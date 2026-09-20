import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def extract_resume_information(resume_text: str) -> str:
    prompt = f"""
Extract structured recruitment information from this resume.

Return JSON with these keys:
full_name, university, degree, branch, gpa, experience_years, skills, 
certifications.

Use null when information is not available.

Resume:
{resume_text}
"""

    response = client.responses.create(
        model=os.getenv("OPENAI_MODEL", "gpt-5.6-luna"),
        input=prompt
    )

    return response.output_text
