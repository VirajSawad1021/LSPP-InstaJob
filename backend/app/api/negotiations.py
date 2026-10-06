from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.agents.negotiation import runner
from app.api.common import developer_row, negotiation_side, public_developer, set_row
from app.auth import User, current_user
from app.db import db, one
from app.services import events as ev

router = APIRouter(prefix="/api/negotiations", tags=["negotiations"])


def _load(nid: str, user: User) -> tuple[dict, str]:
    neg = one("negotiations", id=nid)
    if not neg:
        raise HTTPException(404, "Negotiation not found")
    return neg, negotiation_side(user, neg)


@router.get("")
def my_negotiations(user: User = Depends(current_user)):
    """Developer inbox: every negotiation their agent is part of."""
    dev = developer_row(user_id=user.id)
    if not dev:
        return []
    negs = db().table("negotiations").select("*").eq("developer_id", dev["id"]).order("updated_at", desc=True).execute().data or []
    pids = list({n["project_id"] for n in negs})
    projects = {p["id"]: p for p in (db().table("projects").select("id,title,status,budget_max,deadline_weeks").in_("id", pids).execute().data if pids else [])}
    return [{**n, "project": projects.get(n["project_id"])} for n in negs]


@router.get("/{nid}")
def get_negotiation(nid: str, user: User = Depends(current_user)):
    neg, side = _load(nid, user)
    project = one("projects", id=neg["project_id"])
    project.pop("embedding", None)
    dev = developer_row(id=neg["developer_id"])
    all_events = ev.list_events(nid)
    steering = neg.get("steering") or {}
    return {
        "negotiation": {**neg, "steering": {side: steering.get(side)}},  # never show the other side's instructions
        "side": side,
        "project": {k: project[k] for k in ("id", "title", "plan", "budget_max", "deadline_weeks", "status", "client_id")},
        "developer": public_developer(dev) if side == "client" else dev,
        "events": [e for e in all_events if e["audience"] in ("all", side)],
        "audit": ev.verify_chain(all_events),
        "running": runner.is_running(nid),
    }


class SteerBody(BaseModel):
    instruction: str = Field(min_length=1, max_length=500)


@router.post("/{nid}/steer")
async def steer(nid: str, body: SteerBody, user: User = Depends(current_user)):
    neg, side = _load(nid, user)
    if neg["status"] not in ("pending", "running", "paused"):
        raise HTTPException(409, "This negotiation has ended")
    steering = {**(neg.get("steering") or {}), side: body.instruction}
    set_row("negotiations", nid, steering=steering)
    who = "The founder" if side == "client" else "The developer"
    # Content stays private to the steering side; the other side only sees that it happened.
    await ev.append(nid, side, "steering", f"You told your agent: {body.instruction}", audience=side)
    await ev.append(nid, "system", "status", f"{who} gave their agent new instructions.",
                    audience="developer" if side == "client" else "client")
    return {"ok": True}


@router.post("/{nid}/{action}")
async def control(nid: str, action: Literal["pause", "resume", "retry"], user: User = Depends(current_user)):
    neg, side = _load(nid, user)
    who = "Founder" if side == "client" else "Developer"
    if action == "pause":
        if neg["status"] != "running":
            raise HTTPException(409, "Only a running negotiation can be paused")
        set_row("negotiations", nid, status="paused")
        await ev.append(nid, "system", "status", f"{who} paused the agents. The current turn will finish first.")
    elif action == "resume":
        if neg["status"] != "paused":
            raise HTTPException(409, "Only a paused negotiation can be resumed")
        if runner.is_running(nid):  # paused mid-turn: the loop is still alive, just let it continue
            set_row("negotiations", nid, status="running")
        else:
            runner.start(nid)
    else:  # retry after a model outage
        if neg["status"] != "failed":
            raise HTTPException(409, "Only a failed negotiation can be retried")
        runner.start(nid)
    return {"ok": True}
