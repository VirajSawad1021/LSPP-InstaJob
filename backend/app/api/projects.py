from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.agents import requirements
from app.agents.contract import build_contract
from app.agents.negotiation import runner
from app.api.common import DEV_COLUMNS, developer_row, my_developer, own_project, public_developer, public_match, set_row
from app.auth import User, current_user, require_role
from app.config import MAX_NEGOTIATION_ROUNDS
from app.db import db, now_iso, one, pool
from app.llm import embed
from app.services import events as ev
from app.services.matching import plan_embedding_text, score_pair
from app.services.notify import notify_side

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _strip(p: dict) -> dict:
    p.pop("embedding", None)
    return p


_rates_cache: tuple[float, list[float]] = (0.0, [])


def _market_rates() -> list[float]:
    """Usual rates of active developers, cached for a minute (used only for the market check)."""
    global _rates_cache
    if _rates_cache[0] > time.monotonic():
        return _rates_cache[1]
    rows = db().table("developers").select("rate_target").eq("profile_complete", True).execute().data or []
    rates = [float(r["rate_target"]) for r in rows if r.get("rate_target")]
    _rates_cache = (time.monotonic() + 60, rates)
    return rates


# ---------------- 1. idea -> clarifying questions ----------------
class IdeaBody(BaseModel):
    idea: str = Field(min_length=20, max_length=4000)


@router.post("")
async def create_project(body: IdeaBody, user: User = Depends(current_user)):
    require_role(user, "client")
    c = await requirements.clarify(body.idea)
    row = {
        "client_id": user.id,
        "raw_idea": body.idea,
        "title": c.title,
        "questions": [{**q.model_dump(), "answer": None} for q in c.questions],
        "status": "clarifying",
    }
    return _strip(db().table("projects").insert(row).execute().data[0])


# ---------------- 2. answers + budget -> Build Plan ----------------
class PlanBody(BaseModel):
    answers: list[str | None]
    budget_max: float | None = Field(default=None, gt=0)
    deadline_weeks: int | None = Field(default=None, ge=1, le=52)


@router.post("/{project_id}/plan")
async def make_plan(project_id: str, body: PlanBody, user: User = Depends(current_user)):
    p = own_project(user, project_id)
    if p["status"] not in ("clarifying", "planned"):
        raise HTTPException(409, "The plan is locked once the project is published")
    qa = [{**q, "answer": (body.answers[i] if i < len(body.answers) else None)} for i, q in enumerate(p["questions"])]
    plan = await requirements.build_plan(p["raw_idea"], qa, body.budget_max, body.deadline_weeks)
    row = set_row(
        "projects", project_id,
        questions=qa, plan=plan.model_dump(), title=plan.title,
        budget_max=body.budget_max, deadline_weeks=body.deadline_weeks, status="planned",
    )
    return {**_strip(row), "estimate": requirements.plan_cost_estimate(row["plan"], _market_rates())}


class PlanEdit(BaseModel):
    priorities: dict[str, Literal["must", "should", "nice"]] = {}
    budget_max: float | None = Field(default=None, gt=0)
    deadline_weeks: int | None = Field(default=None, ge=1, le=52)


@router.patch("/{project_id}/plan")
def edit_plan(project_id: str, body: PlanEdit, user: User = Depends(current_user)):
    p = own_project(user, project_id)
    if p["status"] != "planned":
        raise HTTPException(409, "The plan is locked once the project is published")
    plan = p["plan"]
    for m in plan["milestones"]:
        if m["id"] in body.priorities:
            m["priority"] = body.priorities[m["id"]]
    if not any(m["priority"] == "must" for m in plan["milestones"]):
        raise HTTPException(422, "At least one milestone must be a must-have")
    row = set_row(
        "projects", project_id, plan=plan,
        budget_max=body.budget_max if body.budget_max is not None else p["budget_max"],
        deadline_weeks=body.deadline_weeks if body.deadline_weeks is not None else p["deadline_weeks"],
    )
    return {**_strip(row), "estimate": requirements.plan_cost_estimate(plan, _market_rates())}


# ---------------- 3. publish + match ----------------
async def _run_matching(p: dict) -> list[dict]:
    rows = db().rpc("match_developers", {"query_embedding": p["embedding"], "match_count": 25}).execute().data or []
    sims = {r["id"]: r["similarity"] for r in rows}
    if not sims:
        return []
    devs = db().table("developers").select("*").in_("id", list(sims)).execute().data or []
    results = []
    for d in devs:
        fit = score_pair(d, p["plan"], p.get("budget_max"), p.get("deadline_weeks"), sims[d["id"]])
        results.append({"project_id": p["id"], "developer_id": d["id"], **fit})
    results.sort(key=lambda r: -r["score"])
    top = results[:8]
    db().table("matches").delete().eq("project_id", p["id"]).eq("initiated_by", "client").execute()
    if top:
        db().table("matches").upsert(top, on_conflict="project_id,developer_id").execute()
    return top


@router.post("/{project_id}/publish")
async def publish(project_id: str, user: User = Depends(current_user)):
    p = own_project(user, project_id)
    if p["status"] not in ("planned", "open"):
        raise HTTPException(409, "Only a planned project can be published")
    emb = await embed(plan_embedding_text(p["plan"]))
    p = set_row("projects", project_id, embedding=emb, status="open")
    await _run_matching(p)
    return get_project(project_id, user)


# ---------------- read ----------------
@router.get("")
def list_projects(user: User = Depends(current_user)):
    rows = (
        db().table("projects").select("id,title,status,budget_max,deadline_weeks,created_at")
        .eq("client_id", user.id).order("created_at", desc=True).execute().data or []
    )
    return rows


@router.get("/{project_id}")
def get_project(project_id: str, user: User = Depends(current_user)):
    p = own_project(user, project_id)
    # Independent reads run in parallel: the database is a network hop away.
    f_matches = pool.submit(lambda: db().table("matches").select("*").eq("project_id", project_id).order("score", desc=True).execute().data or [])
    f_negs = pool.submit(lambda: db().table("negotiations").select("*").eq("project_id", project_id).execute().data or [])
    f_contract = pool.submit(one, "contracts", project_id=project_id)
    f_rates = pool.submit(_market_rates)
    matches, negs, contract = f_matches.result(), f_negs.result(), f_contract.result()
    dev_ids = list({m["developer_id"] for m in matches} | {n["developer_id"] for n in negs})
    devs = {
        d["id"]: public_developer(d)
        for d in (db().table("developers").select(DEV_COLUMNS).in_("id", dev_ids).execute().data if dev_ids else [])
    }
    estimate = requirements.plan_cost_estimate(p["plan"], f_rates.result()) if p.get("plan") else None
    return {
        "project": _strip(p),
        "estimate": estimate,
        "matches": [{**public_match(m), "developer": devs.get(m["developer_id"])} for m in matches],
        "negotiations": [{**n, "developer": devs.get(n["developer_id"])} for n in negs],
        "contract": contract,
    }


# ---------------- 4. negotiate ----------------
def _open_negotiation(project_id: str, developer_id: str, match_id: str | None) -> dict:
    existing = one("negotiations", project_id=project_id, developer_id=developer_id)
    if existing:
        return existing
    return db().table("negotiations").insert({
        "project_id": project_id, "developer_id": developer_id, "match_id": match_id,
        "max_rounds": MAX_NEGOTIATION_ROUNDS,
    }).execute().data[0]


class NegotiateBody(BaseModel):
    developer_ids: list[str] = Field(min_length=1, max_length=5)


@router.post("/{project_id}/negotiate")
async def negotiate(project_id: str, body: NegotiateBody, user: User = Depends(current_user)):
    # async so runner.start() has the running event loop
    p = own_project(user, project_id)
    if p["status"] not in ("open", "negotiating"):
        raise HTTPException(409, "Publish the project before negotiating")
    matches = {m["developer_id"]: m for m in (db().table("matches").select("*").eq("project_id", project_id).execute().data or [])}
    started = []
    for did in body.developer_ids:
        if did not in matches:
            raise HTTPException(422, "You can only negotiate with matched developers")
        dev = developer_row(id=did)
        if not dev.get("auto_negotiate", True):
            raise HTTPException(409, f"{dev['full_name']} has turned off agent negotiation")
        n = _open_negotiation(project_id, did, matches[did]["id"])
        runner.start(n["id"])
        started.append(n["id"])
    set_row("projects", project_id, status="negotiating")
    return {"negotiation_ids": started}


class InviteBody(BaseModel):
    developer_id: str


@router.post("/{project_id}/invite")
async def invite(project_id: str, body: InviteBody, user: User = Depends(current_user)):
    """Founder-initiated from the marketplace: negotiate with a developer who wasn't auto-matched."""
    p = own_project(user, project_id)
    if p["status"] not in ("open", "negotiating"):
        raise HTTPException(409, "Publish the project before inviting developers")
    dev = developer_row(id=body.developer_id)
    if not dev or not dev.get("profile_complete"):
        raise HTTPException(404, "Developer not found")
    if not dev.get("auto_negotiate", True):
        raise HTTPException(409, f"{dev['full_name']} has turned off agent negotiation")
    sims = db().rpc("match_developers", {"query_embedding": p["embedding"], "match_count": 200}).execute().data or []
    similarity = next((r["similarity"] for r in sims if r["id"] == dev["id"]), 0.6)
    fit = score_pair(dev, p["plan"], p.get("budget_max"), p.get("deadline_weeks"), similarity)
    match = db().table("matches").upsert(
        {"project_id": project_id, "developer_id": dev["id"], "initiated_by": "client", **fit},
        on_conflict="project_id,developer_id",
    ).execute().data[0]
    n = _open_negotiation(project_id, dev["id"], match["id"])
    runner.start(n["id"])
    set_row("projects", project_id, status="negotiating")
    return {"negotiation_id": n["id"]}


@router.post("/{project_id}/pitch")
async def developer_pitch(project_id: str, user: User = Depends(current_user)):
    """Developer-initiated: 'send my agent' to an open project."""
    require_role(user, "developer")
    dev = my_developer(user)
    if not dev or not dev.get("profile_complete"):
        raise HTTPException(409, "Finish your profile first")
    p = one("projects", id=project_id)
    if not p or p["status"] not in ("open", "negotiating"):
        raise HTTPException(404, "Project is not open")
    sim = db().rpc("match_developers", {"query_embedding": p["embedding"], "match_count": 50}).execute().data or []
    similarity = next((r["similarity"] for r in sim if r["id"] == dev["id"]), 0.6)
    fit = score_pair(dev, p["plan"], p.get("budget_max"), p.get("deadline_weeks"), similarity)
    match = db().table("matches").upsert(
        {"project_id": project_id, "developer_id": dev["id"], "initiated_by": "developer", **fit},
        on_conflict="project_id,developer_id",
    ).execute().data[0]
    n = _open_negotiation(project_id, dev["id"], match["id"])
    runner.start(n["id"])
    set_row("projects", project_id, status="negotiating")
    return {"negotiation_id": n["id"]}


# ---------------- 5. founder picks a deal -> contract ----------------
class SelectBody(BaseModel):
    negotiation_id: str


@router.post("/{project_id}/select")
async def select_deal(project_id: str, body: SelectBody, user: User = Depends(current_user)):
    p = own_project(user, project_id)
    if one("contracts", project_id=project_id):
        raise HTTPException(409, "A deal was already selected for this project")
    neg = one("negotiations", id=body.negotiation_id)
    if not neg or neg["project_id"] != project_id or neg["status"] != "agreed":
        raise HTTPException(422, "Only an agreed negotiation can be selected")
    dev = developer_row(id=neg["developer_id"])
    terms = build_contract(p, dev, neg["agreed_offer"])
    contract = {
        **terms,
        "project_id": project_id, "negotiation_id": neg["id"], "developer_id": dev["id"], "client_id": user.id,
        "client_approved_at": now_iso(),
        # Demo personas have no human behind them; their agent signs per their standing auto-approve setting.
        "developer_approved_at": now_iso() if dev.get("is_demo_persona") else None,
    }
    if dev.get("is_demo_persona"):
        contract["status"] = "active"
        contract["started_at"] = now_iso()
        contract["milestones"][0]["status"] = "in_progress"
    row = db().table("contracts").insert(contract).execute().data[0]

    set_row("negotiations", neg["id"], status="selected")
    for other in db().table("negotiations").select("id,status").eq("project_id", project_id).execute().data or []:
        if other["id"] != neg["id"]:
            if other["status"] in ("running", "pending", "paused"):
                set_row("negotiations", other["id"], status="not_selected")
            elif other["status"] == "agreed":
                set_row("negotiations", other["id"], status="not_selected")
            await ev.append(other["id"], "system", "status", "The founder chose another developer for this project.")
    set_row("projects", project_id, status="in_progress" if row["status"] == "active" else "contracted")
    if row["status"] != "active":
        notify_side(row, "developer", "contract_ready", f"You were chosen for {row['title']}. Sign to start",
                    f"The founder selected your agent's deal: ${float(row['total_price']):,.0f} over {row['timeline_weeks']} weeks.", tab="contract")
    await ev.append(neg["id"], "system", "status", "The founder selected this deal. Contract drafted and signed by the founder.")
    return row
