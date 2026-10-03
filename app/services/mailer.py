import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import urllib.request
import json

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "onboarding@careeriq.io")
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://127.0.0.1:8000")

def send_recruiter_invite_email(to_email: str, company_name: str, invite_code: str):
    activation_url = f"{APP_BASE_URL}/?invite={invite_code}"
    
    subject = f"You're invited to join {company_name} on CareerIQ"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }}
        .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; }}
        .badge {{ display: inline-block; padding: 4px 10px; background: #e0f2fe; color: #0369a1; border-radius: 999px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }}
        h2 {{ margin: 0 0 12px; font-size: 20px; color: #0f172a; }}
        p {{ margin: 0 0 16px; line-height: 1.5; color: #475569; font-size: 14.5px; }}
        .code-box {{ background: #f1f5f9; padding: 14px 20px; border-radius: 8px; font-family: monospace; font-size: 22px; font-weight: 700; letter-spacing: 2px; text-align: center; color: #2563eb; margin: 20px 0; border: 1px dashed #cbd5e1; }}
        .btn {{ display: block; width: 100%; text-align: center; background: #2563eb; color: #ffffff !important; padding: 12px 0; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 15px; margin: 24px 0 16px; }}
        .footer {{ font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px; }}
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">Official Invitation</span>
        <h2>Access the {company_name} Talent Pipeline</h2>
        <p>You have been authorized as a verified recruiter for <strong>{company_name}</strong> on CareerIQ. Use your unique single-use code below to complete your setup:</p>
        
        <div class="code-box">{invite_code}</div>
        
        <a href="{activation_url}" class="btn">Activate Recruiter Account &rarr;</a>
        
        <p style="font-size: 12.5px; color: #64748b;">This code expires in 48 hours and can only be redeemed by {to_email}.</p>
        
        <div class="footer">
          CareerIQ Recruitment Platform &bull; Automated Security Dispatch
        </div>
      </div>
    </body>
    </html>
    """

    # 1. Resend API mode
    if RESEND_API_KEY:
        try:
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=json.dumps({
                    "from": FROM_EMAIL,
                    "to": [to_email],
                    "subject": subject,
                    "html": html_content
                }).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json"
                }
            )
            with urllib.request.urlopen(req) as resp:
                print(f"✓ Resend API dispatched email to {to_email} (HTTP {resp.status})")
                return True
        except Exception as e:
            print(f"Resend dispatch error: {e}")

    # 2. Standard SMTP mode
    if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = FROM_EMAIL
            msg["To"] = to_email
            msg.attach(MIMEText(html_content, "html"))

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(FROM_EMAIL, [to_email], msg.as_string())
            print(f"✓ SMTP dispatched email to {to_email}")
            return True
        except Exception as e:
            print(f"SMTP dispatch error: {e}")

    # 3. Development / Local Fallback
    print(f"\n[EMAIL DISPATCH - DEV CONSOLE FALLBACK]")
    print(f"To:          {to_email}")
    print(f"Company:     {company_name}")
    print(f"Invite Code: {invite_code}")
    print(f"Direct Link: {activation_url}")
    print(f"--------------------------------------------------\n")
    return True
