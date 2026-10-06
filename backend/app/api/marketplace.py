"""Marketplace: browse every open Build Plan and every developer, with filters.

AI ranking stays the default sort ("recommended for you"), but people can look around freely.
Only public fields are returned: never a developer's floor or a founder's private instructions.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.common import DEV_COLUMNS, developer_row, public_developer
from app.auth import User, current_user
from app.db import db, one, pool
from app.services.matching import norm_skill, score_pair

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


def _has_skill(skills: list[str], wanted: str) -> bool:
    w = norm_skill(wanted)
    return any(norm_skill(s) == w or w in norm_skill(s) for s in skills)


@router.get("/projects")
def browse_projects(
    user: User = Depends(current_user),
    q: str = "", skill: str = "", max_weeks: int | None = None, min_budget: float | None = None,
    sort: str = Query("recommended", pattern="^(recommended|newest|budget)$"),
):
    rows = (
        db().table("projects").select("id,client_id,title,raw_idea,status,budget_max,deadline_weeks,plan,created_at")
        .in_("status", ["open", "negotiating"]).order("created_at", desc=True).limit(100).execute().data or []
    )
    rows = [r for r in rows if r["client_id"] != user.id and r.get("plan")]

    dev = developer_row(user_id=user.id) if user.role == "developer" else None
    sims: dict[str, float] = {}
    mine: dict[str, dict] = {}
    if dev and dev.get("profile_complete"):
        full = one("developers", id=dev["id"])  # includes the embedding for vector search
        f_sims = pool.submit(lambda: db().rpc("match_projects", {"query_embedding": full["embedding"], "match_count": 100}).execute().data or [])
        f_negs = pool.submit(lambda: db().table("negotiations").select("id,project_id,status").eq("developer_id", dev["id"]).execute().data or [])
        sims = {r["id"]: r["similarity"] for r in f_sims.result()}
        mine = {n["project_id"]: n for n in f_negs.result()}

    out = []
    for r in rows:
        plan = r["plan"]
        text = f"{r['title']} {plan.get('summary', '')} {' '.join(plan.get('required_skills') or [])}".lower()
        if q and q.lower() not in text:
            continue
        if skill and not _has_skill(plan.get("required_skills") or [], skill):
            continue
        if max_weeks and (r.get("deadline_weeks") or 99) > max_weeks:
            continue
        if min_budget and (r.get("budget_max") or 0) < min_budget:
            continue
        fit = score_pair(dev, plan, r.get("budget_max"), r.get("deadline_weeks"), sims.get(r["id"], 0.6)) if dev else None
        out.append({
            "id": r["id"], "title": r["title"], "status": r["status"], "created_at": r["created_at"],
            "budget_max": r.get("budget_max"), "deadline_weeks": r.get("deadline_weeks"),
            "summary": plan.get("summary"), "required_skills": plan.get("required_skills") or [],
            "milestones": len(plan.get("milestones") or []),
            "hours": sum(m["est_hours"] for m in plan.get("milestones") or []),
            "fit": {"score": fit["score"], "reasons": fit["reasons"][:2], "concerns": fit["concerns"][:1]} if fit else None,
            "negotiation": mine.get(r["id"]),
        })
    if sort == "recommended" and dev:
        out.sort(key=lambda x: -(x["fit"] or {}).get("score", 0))
    elif sort == "budget":
        out.sort(key=lambda x: -(x["budget_max"] or 0))
    return out


@router.get("/developers")
def browse_developers(
    user: User = Depends(current_user),
    q: str = "", skill: str = "", max_rate: float | None = None, project_id: str | None = None,
    sort: str = Query("recommended", pattern="^(recommended|rate|experience)$"),
):
    rows = db().table("developers").select(DEV_COLUMNS).eq("profile_complete", True).limit(200).execute().data or []

    project = None
    sims: dict[str, float] = {}
    if project_id:
        project = one("projects", id=project_id)
        if not project or project["client_id"] != user.id:
            raise HTTPException(404, "Project not found")
        if project.get("embedding"):
            sims = {r["id"]: r["similarity"] for r in (db().rpc("match_developers", {"query_embedding": project["embedding"], "match_count": 200}).execute().data or [])}

    out = []
    for d in rows:
        text = f"{d['full_name']} {d.get('headline') or ''} {d.get('bio') or ''} {' '.join(d.get('skills') or [])}".lower()
        if q and q.lower() not in text:
            continue
        if skill and not _has_skill(d.get("skills") or [], skill):
            continue
        if max_rate and (d.get("rate_target") or 0) > max_rate:
            continue
        fit = None
        if project and project.get("plan"):
            f = score_pair(d, project["plan"], project.get("budget_max"), project.get("deadline_weeks"), sims.get(d["id"], 0.6))
            fit = {"score": f["score"], "reasons": f["reasons"][:2], "concerns": [c for c in f["concerns"]][:1]}
        out.append({**public_developer(d), "fit": fit})
    if sort == "recommended" and project:
        out.sort(key=lambda x: -(x["fit"] or {}).get("score", 0))
    elif sort == "rate":
        out.sort(key=lambda x: x.get("rate_target") or 0)
    else:
        out.sort(key=lambda x: -(x.get("years_experience") or 0))
    return out
