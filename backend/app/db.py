from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from supabase import Client, create_client

from app.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

_local = threading.local()

# Long-lived workers for parallel reads: each keeps its own warm client/connection.
pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="db")


def db() -> Client:
    """Service-role client. Bypasses RLS, so every route must check ownership itself.

    One client per thread: supabase-py multiplexes requests over a single HTTP/2 connection,
    which gets reset when several worker threads (parallel negotiations) share it.
    """
    client = getattr(_local, "client", None)
    if client is None:
        client = _local.client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return client


def one(table: str, **eq) -> dict | None:
    q = db().table(table).select("*")
    for k, v in eq.items():
        q = q.eq(k, v)
    rows = q.limit(1).execute().data
    return rows[0] if rows else None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
