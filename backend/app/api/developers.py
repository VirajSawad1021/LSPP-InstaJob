from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.agents import skill
from app.api.common import my_developer, set_row
from app.auth import User, current_user, forget_profile, require_role
from app.db import db, one
from app.llm import embed
from app.services.fetch import FetchError, github_signals
from app.services.matching import developer_embedding_text, score_pair

router = APIRouter(prefix="/api", tags=["developers"])


# ---------------- Skill Agent interview ----------------
@router.post("/interview")
def start_interview(user: User = Depends(current_user)):
    require_role(user, "developer")
    existing = (
        db().table("skill_interviews").select("*").eq("user_id", user.id).eq("complete", False)
        .order("created_at", desc=True).limit(1).execute().data
    )
    if existing:
        return existing[0]
    row = {"user_id": user.id, "transcript": [{"role": "agent", "content": skill.OPENING}]}
    return db().table("skill_interviews").insert(row).execute().data[0]


@router.get("/interview/latest")
def latest_interview(user: User = Depends(current_user)):
    rows = (
        db().table("skill_interviews").select("*").eq("user_id", user.id)
        .order("created_at", desc=True).limit(1).execute().data
    )
    return rows[0] if rows else None


class MessageBody(BaseModel):
    content: str = Field(min_length=1, max_length=3000)


@router.post("/interview/{interview_id}/message")
async def interview_message(interview_id: str, body: MessageBody, user: User = Depends(current_user)):
    iv = one("skill_interviews", id=interview_id)
    if not iv or iv["user_id"] != user.id:
        raise HTTPException(404, "Interview not found")
    transcript = iv["transcript"] + [{"role": "user", "content": body.content}]
    turn = await skill.interview_turn(transcript)
    transcript.append({"role": "agent", "content": turn.reply})
    return set_row(
        "skill_interviews", interview_id,
        transcript=transcript, extracted=turn.profile.model_dump(), progress=turn.progress, complete=turn.complete,
    )


# ---------------- Developer profile ----------------
class ProfileBody(BaseModel):
    full_name: str = Field(min_length=1)
    headline: str
    bio: str
    location: str = ""
    timezone: str = ""
    skills: list[str]
    years_experience: int | None = None
    rate_floor: float = Field(gt=0)
    rate_target: float = Field(gt=0)
    weekly_hours: int = Field(ge=5, le=60)
    availability: str = "immediate"
    work_style: dict = {}
    shipped_projects: list[dict] = []
    github_username: str | None = None
    negotiation_style: Literal["firm", "collaborative", "flexible"] = "collaborative"
    dealbreakers: list[str] = []
    auto_negotiate: bool = True


@router.get("/developers/me")
def get_my_developer(user: User = Depends(current_user)):
    dev = my_developer(user)
    if dev:
        dev.pop("embedding", None)
    return dev


@router.put("/developers/me")
async def save_my_developer(body: ProfileBody, user: User = Depends(current_user)):
    require_role(user, "developer")
    if body.rate_target < body.rate_floor:
        raise HTTPException(422, "Usual rate must be at least your minimum rate")
    data = body.model_dump()
    data["github_signals"] = None
    if body.github_username:
        try:
            data["github_signals"] = await github_signals(body.github_username)
        except FetchError as e:
            raise HTTPException(422, str(e))
    data["embedding"] = await embed(developer_embedding_text(data))
    data["profile_complete"] = True
    data["user_id"] = user.id
    existing = my_developer(user)
    if existing:
        row = set_row("developers", existing["id"], **data)
    else:
        row = db().table("developers").insert(data).execute().data[0]
    db().table("profiles").update({"full_name": body.full_name}).eq("id", user.id).execute()
    forget_profile(user.id)
    row.pop("embedding", None)
    return row


# ---------------- Project discovery for developers ----------------
@router.get("/developers/me/projects")
async def discover_projects(user: User = Depends(current_user)):
    dev = my_developer(user)
    if not dev or not dev.get("profile_complete"):
        raise HTTPException(409, "Finish your profile first")
    rows = db().rpc("match_projects", {"query_embedding": dev["embedding"], "match_count": 20}).execute().data or []
    sims = {r["id"]: r["similarity"] for r in rows}
    if not sims:
        return []
    projects = db().table("projects").select("*").in_("id", list(sims)).execute().data or []
    mine = {
        n["project_id"]: n for n in
        (db().table("negotiations").select("id,project_id,status").eq("developer_id", dev["id"]).execute().data or [])
    }
    out = []
    for p in projects:
        fit = score_pair(dev, p["plan"], p.get("budget_max"), p.get("deadline_weeks"), sims[p["id"]])
        p.pop("embedding", None)
        out.append({"project": p, **fit, "negotiation": mine.get(p["id"])})
    return sorted(out, key=lambda x: -x["score"])
