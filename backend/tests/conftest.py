import os

# Unit tests never call Supabase or Gemini; config just needs non-empty values to import.
for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"):
    os.environ.setdefault(k, "test")
os.environ["SUPABASE_URL"] = os.environ["SUPABASE_URL"] if os.environ["SUPABASE_URL"].startswith("http") else "https://test.supabase.co"
