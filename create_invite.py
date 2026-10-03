import sys
import secrets
from datetime import datetime, timezone, timedelta
from app.db import get_db
from app.services.mailer import send_recruiter_invite_email
from sqlalchemy import text

if len(sys.argv) < 3:
    print("Usage: ./venv/bin/python create_invite.py <recruiter_email> <company_name>")
    sys.exit(1)

email = sys.argv[1].strip().lower()
company = sys.argv[2].strip()

invite_code = "REC-" + secrets.token_hex(4).upper()
expires = datetime.now(timezone.utc) + timedelta(days=2)

db = next(get_db())
db.execute(
    text("""
        INSERT INTO recruiter_invites (email, company_name, invite_code, expires_at)
        VALUES (:email, :company, :code, :expires)
    """),
    {"email": email, "company": company, "code": invite_code, "expires": expires}
)
db.commit()

# Trigger mailer dispatch
send_recruiter_invite_email(email, company, invite_code)

print(f"✓ Invite stored in database for {email} ({company})")
