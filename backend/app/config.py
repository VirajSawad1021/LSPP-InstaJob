from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _req(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        raise RuntimeError(f"Missing required environment variable {name} (see backend/.env.example)")
    return val


SUPABASE_URL = _req("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = _req("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = _req("GEMINI_API_KEY")

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
GEMINI_EMBEDDING_MODEL = os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIM = 768  # must match vector(768) in the schema

FRONTEND_ORIGINS = [
    o.strip() for o in os.environ.get("FRONTEND_ORIGINS", "http://localhost:3000").split(",") if o.strip()
]
# Optional regex for extra allowed origins, e.g. Vercel preview deployments: https://.*\.vercel\.app
FRONTEND_ORIGIN_REGEX = os.environ.get("FRONTEND_ORIGIN_REGEX", "").strip() or None
MAX_NEGOTIATION_ROUNDS = int(os.environ.get("MAX_NEGOTIATION_ROUNDS", "8"))

# Optional email for notifications (https://resend.com). Without a key, notifications stay in-app only.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip() or None
EMAIL_FROM = os.environ.get("EMAIL_FROM", "InstaJob <onboarding@resend.dev>")
APP_URL = os.environ.get("APP_URL", "https://instajob.vercel.app").rstrip("/")
