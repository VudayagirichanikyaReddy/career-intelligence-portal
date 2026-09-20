# Career Intelligence & Recruitment Portal

## Stack
- MySQL
- FastAPI
- SQLAlchemy
- Simple HTML
- OpenAI API for resume parsing

## Setup

1. Create the database:
   mysql -u root -p < schema.sql

2. Create a virtual environment:
   python3 -m venv venv
   source venv/bin/activate

3. Install dependencies:
   pip install -r requirements.txt

4. Copy `.env.example` to `.env` and set:
   DATABASE_URL
   OPENAI_API_KEY
   OPENAI_MODEL

5. Start the backend:
   uvicorn app.main:app --reload

6. Open:
   http://127.0.0.1:8000
   http://127.0.0.1:8000/docs
