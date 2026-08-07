import os
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

def send_workspace_invite_email(to_email: str, workspace_id: str, inviter_email: str) -> bool:
    """
    Send an invitation email to join a workspace.
    Supports SMTP (Gmail, Google Workspace, AWS SES) or Resend API.
    """
    app_url = os.environ.get("FRONTEND_URL", "https://law-delegation.vercel.app")
    invite_url = f"{app_url}/login?workspace={workspace_id}&email={to_email}"
    
    subject = f"Invitation to join workspace {workspace_id} on Law Delegation Portal"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; padding: 24px; }}
        .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }}
        .badge {{ display: inline-block; background: #e0e7ff; color: #4338ca; font-weight: 700; font-size: 11px; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; }}
        .btn {{ display: inline-block; background: #4f46e5; color: #ffffff !important; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 12px; margin-top: 20px; text-align: center; }}
        .footer {{ font-size: 12px; color: #64748b; margin-top: 24px; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">Workspace Invite</span>
        <h2 style="margin-top: 12px; font-size: 20px; font-weight: 800; color: #0f172a;">Join {workspace_id} Workspace</h2>
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">
          <strong>{inviter_email}</strong> has invited you to collaborate in the <strong>{workspace_id}</strong> workspace on Law Delegation Portal.
        </p>
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">
          Click the button below to log in or accept your invitation:
        </p>
        <div style="text-align: center;">
          <a href="{invite_url}" class="btn">Accept Invitation & Sign In</a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">
          If button doesn't work, copy & paste this URL into your browser:<br>
          <a href="{invite_url}" style="color: #4f46e5;">{invite_url}</a>
        </p>
      </div>
      <div class="footer">
        Law Delegation Portal &bull; Enterprise RAG Platform
      </div>
    </body>
    </html>
    """

    # 1. Try Resend API if API Key is configured
    resend_api_key = os.environ.get("RESEND_API_KEY")
    if resend_api_key:
        try:
            import urllib.request
            import json
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=json.dumps({
                    "from": os.environ.get("EMAIL_FROM", "invites@law-delegation.com"),
                    "to": [to_email],
                    "subject": subject,
                    "html": html_content
                }).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json"
                },
                method="POST"
            )
            with urllib.request.urlopen(req) as resp:
                if resp.status in (200, 201):
                    logger.info(f"Invite email sent to {to_email} via Resend")
                    return True
        except Exception as e:
            logger.error(f"Failed to send email via Resend: {e}")

    # 2. Try SMTP if SMTP_HOST is configured
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASSWORD")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_from = os.environ.get("SMTP_FROM", smtp_user or "no-reply@lawdelegation.com")

    if smtp_host and smtp_user and smtp_pass:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = smtp_from
            msg["To"] = to_email
            msg.attach(MIMEText(html_content, "html"))

            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_from, [to_email], msg.as_string())
            logger.info(f"Invite email sent to {to_email} via SMTP")
            return True
        except Exception as e:
            logger.error(f"Failed to send email via SMTP: {e}")

    logger.info(f"Email credentials not configured. Invitation URL generated: {invite_url}")
    return False
