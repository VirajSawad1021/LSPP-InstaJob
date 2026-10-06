from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import a2a, changes, contracts, demo, disputes, notifications, developers, marketplace, me, messages, negotiations, projects, workspace
from app.auth import _jwks
from app.config import FRONTEND_ORIGIN_REGEX, FRONTEND_ORIGINS, GEMINI_MODEL
from app.db import db, pool
from app.llm import LLMError


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Warm the slow first-request paths (TLS to Supabase, JWKS fetch) before traffic arrives.
    def warm():
        try:
            _jwks.get_jwk_set()
            db().table("profiles").select("id").limit(1).execute()
        except Exception:
            pass  # warming is best-effort; real requests surface real errors
    await asyncio.gather(*(asyncio.get_running_loop().run_in_executor(pool, warm) for _ in range(4)), asyncio.to_thread(warm))

    async def reminders():
        # Missed weekly check-ins, while the server is awake (users also trigger it when they open the bell).
        while True:
            await asyncio.sleep(1800)
            try:
                await asyncio.to_thread(notifications.scan_all)
            except Exception:  # noqa: BLE001
                pass
    task = asyncio.create_task(reminders())
    yield
    task.cancel()


app = FastAPI(title="InstaJob API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_origin_regex=FRONTEND_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(LLMError)
async def llm_error(_: Request, exc: LLMError):
    return JSONResponse(status_code=503, content={"detail": "The AI model is temporarily unavailable. Please try again.", "error": str(exc)[:300]})


@app.get("/api/health")
def health():
    return {"ok": True, "model": GEMINI_MODEL}


for r in (me.router, developers.router, projects.router, negotiations.router, contracts.router, workspace.router, messages.router, changes.router, disputes.router, notifications.router, demo.router, marketplace.router, a2a.router):
    app.include_router(r)
