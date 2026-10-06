"""Disputes over a milestone: one side opens it, the other answers, the Mediator Agent proposes a
ruling, and it only takes effect once both people accept it."""
from __future__ import annotations

import asyncio
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.agents.mediator import mediate
from app.api.common import contract_side, set_row
from app.api.contracts import _set_milestone, close_milestone
from app.auth import User, current_user
from app.db import db, now_iso, one
from app.llm import LLMError
from app.services.notify import notify_both, notify_other, notify_side

router = APIRouter(prefix="/api", tags=["disputes"])
_tasks: set[asyncio.Task] = set()
OPEN = ("awaiting_response", "mediating", "proposed")
WHO = {"client": "The founder", "developer": "The developer"}


def _contract(cid: str, user: User) -> tuple[dict, str]:
    c = one("contracts", id=cid)
    if not c:
        raise HTTPException(404, "Project not found")
    return c, contract_side(user, c)


def _dispute(did: str, user: User) -> tuple[dict, dict, str]:
    x = one("disputes", id=did)
    if not x:
        raise HTTPException(404, "Dispute not found")
    c, side = _contract(x["contract_id"], user)
    return x, c, side


def _spawn(coro) -> None:
    t = asyncio.create_task(coro)
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)


async def _run_mediator(did: str) -> None:
    def gather():
        x = one("disputes", id=did)
        c = one("contracts", id=x["contract_id"])
        m = next(mm for mm in c["milestones"] if mm["id"] == x["milestone_id"])
        subs = db().table("milestone_submissions").select("*").eq("contract_id", c["id"]).eq("milestone_id", m["id"]).order("created_at", desc=True).execute().data or []
        pins = db().table("project_comments").select("body").eq("contract_id", c["id"]).eq("pinned", True).order("pinned_at").execute().data or []
        msgs = db().table("project_comments").select("author_role,body,milestone_id,created_at").eq("contract_id", c["id"]).order("created_at").execute().data or []
        ref = re.compile(rf"#{re.escape(m['id'])}\b")
        about = [mm for mm in msgs if mm.get("milestone_id") == m["id"] or ref.search(mm["body"] or "")]
        return x, c, m, subs, [p["body"] for p in pins], about

    x, c, m, subs, pins, about = await asyncio.to_thread(gather)
    latest = next((s for s in subs if s["status"] not in ("verifying", "superseded")), subs[0] if subs else None)
    feedback = next((s["client_feedback"] for s in subs if s.get("client_feedback")), None)
    try:
        ruling = await mediate(m, latest, int((c.get("terms") or {}).get("revisions_per_milestone") or 0), len(subs),
                               x.get("client_statement"), x.get("developer_statement"), feedback, pins, about)
    except LLMError as e:
        await asyncio.to_thread(set_row, "disputes", did, status="failed", error=str(e)[:300])
        return
    await asyncio.to_thread(set_row, "disputes", did, status="proposed", ruling=ruling, error=None)
    label = {"approve": "release the full milestone", "partial": f"release {ruling['release_percent']}% and close it", "rework": "specific rework"}[ruling["recommendation"]]
    await asyncio.to_thread(notify_both, c, "dispute_ruling", f"Mediator's proposal on {m['id']}: {label}",
                            ruling["summary"], "contract")


@router.get("/contracts/{cid}/disputes")
def list_disputes(cid: str, user: User = Depends(current_user)):
    _, side = _contract(cid, user)
    rows = db().table("disputes").select("*").eq("contract_id", cid).order("created_at", desc=True).execute().data or []
    return {"side": side, "disputes": rows}


class OpenBody(BaseModel):
    statement: str = Field(min_length=10, max_length=3000)


@router.post("/contracts/{cid}/milestones/{mid}/disputes")
def open_dispute(cid: str, mid: str, body: OpenBody, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    m = next((x for x in c["milestones"] if x["id"] == mid), None)
    if not m:
        raise HTTPException(404, "Milestone not found")
    if c["status"] != "active" or m["status"] not in ("submitted", "changes_requested"):
        raise HTTPException(409, "A dispute can be opened once a delivery was submitted and reviewed")
    subs = db().table("milestone_submissions").select("id,status").eq("contract_id", cid).eq("milestone_id", mid).order("created_at", desc=True).limit(1).execute().data
    if not subs or subs[0]["status"] == "verifying":
        raise HTTPException(409, "Wait for the Verification Agent to finish first")
    if db().table("disputes").select("id").eq("contract_id", cid).eq("milestone_id", mid).in_("status", list(OPEN)).limit(1).execute().data:
        raise HTTPException(409, "There is already an open dispute on this milestone")
    x = db().table("disputes").insert({
        "contract_id": cid, "milestone_id": mid, "submission_id": subs[0]["id"], "opened_by": user.id, "opened_role": side,
        f"{side}_statement": body.statement.strip(),
    }).execute().data[0]
    notify_other(c, side, "dispute_opened", f"{WHO[side]} asked the Mediator Agent about {mid}",
                 "Give your side of the story, then the Mediator proposes a fair outcome.", "contract")
    return x


class RespondBody(BaseModel):
    statement: str = Field(default="", max_length=3000)


@router.post("/disputes/{did}/respond")
async def respond(did: str, body: RespondBody, user: User = Depends(current_user)):
    x, _, side = await asyncio.to_thread(_dispute, did, user)
    if x["status"] != "awaiting_response" or side == x["opened_role"]:
        raise HTTPException(409, "Only the other party can respond, once")
    x = await asyncio.to_thread(set_row, "disputes", did, status="mediating", **{f"{side}_statement": body.statement.strip() or None})
    _spawn(_run_mediator(did))
    return x


@router.post("/disputes/{did}/retry")
async def retry(did: str, user: User = Depends(current_user)):
    x, _, _ = await asyncio.to_thread(_dispute, did, user)
    if x["status"] != "failed":
        raise HTTPException(409, "Only a failed mediation can be retried")
    x = await asyncio.to_thread(set_row, "disputes", did, status="mediating", error=None)
    _spawn(_run_mediator(did))
    return x


@router.post("/disputes/{did}/accept")
def accept(did: str, user: User = Depends(current_user)):
    x, c, side = _dispute(did, user)
    if x["status"] != "proposed":
        raise HTTPException(409, "There is no proposal to accept")
    x = set_row("disputes", did, **{f"{side}_accepted_at": now_iso()})
    if not (x["client_accepted_at"] and x["developer_accepted_at"]):
        notify_other(c, side, "dispute_ruling", f"{WHO[side]} accepted the Mediator's proposal on {x['milestone_id']}",
                     "It takes effect once you accept too.", "contract")
        return x
    r, mid = x["ruling"], x["milestone_id"]
    m = next(mm for mm in c["milestones"] if mm["id"] == mid)
    if r["recommendation"] == "rework":
        items = "\n".join(f"- {i}" for i in r["rework_items"])
        if x.get("submission_id"):
            set_row("milestone_submissions", x["submission_id"], status="changes_requested",
                    client_feedback=f"Agreed through mediation:\n{items}")
        set_row("contracts", c["id"], milestones=_set_milestone(c, mid, "changes_requested"))
        outcome = f"Both accepted: rework on {mid}. The money stays in escrow until it is approved."
    else:
        amount = round(float(m["price"]) * r["release_percent"] / 100, 2)
        if x.get("submission_id"):
            set_row("milestone_submissions", x["submission_id"], status="approved", client_feedback="Settled through mediation.")
        close_milestone(c, mid, amount, user.id, f"Released per the Mediator's ruling ({r['release_percent']}%), accepted by both")
        outcome = f"Both accepted: ${amount:,.0f} ({r['release_percent']}%) released and {mid} closed."
    x = set_row("disputes", did, status="resolved", outcome=outcome)
    notify_both(c, "dispute_resolved", f"Dispute on {mid} resolved", outcome, "contract")
    return x


@router.post("/disputes/{did}/reject")
def reject(did: str, user: User = Depends(current_user)):
    x, c, side = _dispute(did, user)
    if x["status"] != "proposed":
        raise HTTPException(409, "There is no proposal to reject")
    outcome = f"{WHO[side]} did not accept the proposal. Nothing changed; keep talking in Messages, or raise a change request if the scope is the issue."
    x = set_row("disputes", did, status="rejected", outcome=outcome)
    notify_other(c, side, "dispute_resolved", f"{WHO[side]} did not accept the Mediator's proposal on {x['milestone_id']}", outcome, "contract")
    return x


@router.post("/disputes/{did}/withdraw")
def withdraw(did: str, user: User = Depends(current_user)):
    x, c, side = _dispute(did, user)
    if x["opened_by"] != user.id or x["status"] not in ("awaiting_response", "failed"):
        raise HTTPException(409, "Only whoever opened it can withdraw it, before the Mediator rules")
    x = set_row("disputes", did, status="withdrawn", outcome=f"{WHO[side]} withdrew the dispute.")
    notify_other(c, side, "dispute_resolved", f"{WHO[side]} withdrew the dispute on {x['milestone_id']}", None, "contract")
    return x
