from __future__ import annotations

from fastapi import HTTPException

from app.auth import User
from app.db import db, one, now_iso

PRIVATE_DEV_FIELDS = {"rate_floor", "dealbreakers", "negotiation_style", "embedding", "auto_negotiate"}

# Every developer column except the 768-d embedding, which is only needed for vector search.
DEV_COLUMNS = (
    "id,user_id,full_name,headline,bio,location,timezone,skills,years_experience,rate_floor,rate_target,"
    "weekly_hours,availability,work_style,shipped_projects,github_username,github_signals,negotiation_style,"
    "dealbreakers,auto_negotiate,is_demo_persona,profile_complete,created_at,updated_at"
)


def developer_row(**eq) -> dict | None:
    q = db().table("developers").select(DEV_COLUMNS)
    for k, v in eq.items():
        q = q.eq(k, v)
    rows = q.limit(1).execute().data
    return rows[0] if rows else None


def public_developer(d: dict) -> dict:
    """What the other side is allowed to see about a developer (never the floor)."""
    return {k: v for k, v in d.items() if k not in PRIVATE_DEV_FIELDS}


_PRIVATE_BREAKDOWN = {"cost_must_at_floor", "cost_all_at_target"}


def public_match(m: dict) -> dict:
    """Match rows as a founder may see them (older rows stored floor-derived costs)."""
    return {**m, "breakdown": {k: v for k, v in (m.get("breakdown") or {}).items() if k not in _PRIVATE_BREAKDOWN}}


def my_developer(user: User) -> dict | None:
    return one("developers", user_id=user.id)


def own_project(user: User, project_id: str) -> dict:
    p = one("projects", id=project_id)
    if not p or p["client_id"] != user.id:
        raise HTTPException(404, "Project not found")
    return p


def negotiation_side(user: User, neg: dict) -> str:
    project = one("projects", id=neg["project_id"])
    if project and project["client_id"] == user.id:
        return "client"
    dev = developer_row(id=neg["developer_id"])
    if dev and dev.get("user_id") == user.id:
        return "developer"
    raise HTTPException(404, "Negotiation not found")


def contract_side(user: User, c: dict) -> str:
    if c["client_id"] == user.id:
        return "client"
    dev = developer_row(id=c["developer_id"])
    if dev and dev.get("user_id") == user.id:
        return "developer"
    raise HTTPException(404, "Contract not found")


def set_row(table: str, row_id: str, **fields) -> dict:
    return db().table(table).update({**fields, "updated_at": now_iso()}).eq("id", row_id).execute().data[0]
