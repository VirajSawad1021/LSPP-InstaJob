from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.agents.verification import verify
from app.api.common import contract_side, developer_row, public_developer, set_row
from app.auth import User, current_user
from app.db import db, now_iso, one
from app.llm import LLMError
from app.services import escrow
from app.services.notify import notify_both, notify_other, notify_side

router = APIRouter(prefix="/api", tags=["contracts"])
_verifications: set[asyncio.Task] = set()


def _contract(cid: str, user: User) -> tuple[dict, str]:
    c = one("contracts", id=cid)
    if not c:
        raise HTTPException(404, "Contract not found")
    return c, contract_side(user, c)


@router.get("/contracts")
def my_contracts(user: User = Depends(current_user)):
    dev = developer_row(user_id=user.id)
    q = db().table("contracts").select("*")
    q = q.eq("developer_id", dev["id"]) if dev else q.eq("client_id", user.id)
    return q.order("created_at", desc=True).execute().data or []


@router.get("/contracts/{cid}")
def get_contract(cid: str, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    subs = db().table("milestone_submissions").select("*").eq("contract_id", cid).order("created_at", desc=True).execute().data or []
    dev = developer_row(id=c["developer_id"])
    client = one("profiles", id=c["client_id"]) or {}
    return {
        "contract": c, "side": side, "submissions": subs,
        "developer": public_developer(dev), "client_name": client.get("full_name"),
    }


@router.post("/contracts/{cid}/approve")
def approve(cid: str, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    if c["status"] != "pending_approval":
        raise HTTPException(409, "Contract is not awaiting approval")
    field = f"{side}_approved_at"
    updates: dict = {field: now_iso()}
    other = c["developer_approved_at"] if side == "client" else c["client_approved_at"]
    if other:
        ms = c["milestones"]
        ms[0]["status"] = "in_progress"
        updates.update(status="active", milestones=ms, started_at=now_iso())
        db().table("projects").update({"status": "in_progress"}).eq("id", c["project_id"]).execute()
    row = set_row("contracts", cid, **updates)
    if other:
        first = c["milestones"][0]
        notify_side(c, "client", "contract_active", f"{c['title']} is signed. Fund {first['id']} to start",
                    f"Both of you signed. Fund {first['id']} ({first['title']}, ${first['price']:,}) into escrow so the developer can deliver it.", tab="payments")
        notify_side(c, "developer", "contract_active", f"{c['title']} is signed and active",
                    f"Work starts now with {first['id']}: {first['title']}.", tab="board")
    else:
        notify_other(c, side, "contract_ready", f"Your signature is needed on {c['title']}",
                     "The other party signed the contract. Review the terms and sign to start.", tab="contract")
    return row


# ---------------- escrow ----------------
@router.get("/contracts/{cid}/escrow")
def get_escrow(cid: str, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    ledger = escrow.entries(cid)
    return {"side": side, "status": c["status"], "balances": escrow.balances(c["milestones"], ledger), "ledger": ledger,
            "milestones": [{k: m[k] for k in ("id", "title", "price", "status")} for m in c["milestones"]]}


@router.post("/contracts/{cid}/milestones/{mid}/fund")
def fund(cid: str, mid: str, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    if side != "client":
        raise HTTPException(403, "Only the founder funds milestones")
    if c["status"] != "active":
        raise HTTPException(409, "Milestones can be funded once both of you have signed")
    m = next((x for x in c["milestones"] if x["id"] == mid), None)
    if not m:
        raise HTTPException(404, "Milestone not found")
    b = escrow.balances(c["milestones"], escrow.entries(cid))["milestones"][mid]
    if b["to_fund"] <= 0:
        raise HTTPException(409, "This milestone is already fully funded")
    top_up = b["funded"] > 0
    escrow.record(cid, mid, "fund", b["to_fund"], user.id, "Top-up after a change request" if top_up else "Milestone funded")
    set_row("contracts", cid)  # bump updated_at so the other side's workspace refreshes live
    notify_side(c, "developer", "funded", f"{mid} is funded: ${b['to_fund']:,.0f} held in escrow",
                f"{m['title']} is secured. The money is released to you when the founder approves the delivery.", tab="payments")
    return get_escrow(cid, user)


# ---------------- Proof of Done ----------------
class SubmitBody(BaseModel):
    live_url: str | None = Field(default=None, max_length=500)
    repo_url: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def need_evidence(self):
        if not (self.live_url or self.repo_url):
            raise ValueError("Provide a live URL or a GitHub repository")
        return self


def _dispute_open(cid: str, mid: str) -> bool:
    return bool(
        db().table("disputes").select("id").eq("contract_id", cid).eq("milestone_id", mid)
        .in_("status", ["awaiting_response", "mediating", "proposed"]).limit(1).execute().data
    )


def _set_milestone(c: dict, mid: str, status: str) -> list[dict]:
    ms = c["milestones"]
    for m in ms:
        if m["id"] == mid:
            m["status"] = status
    return ms


async def _run_verification(c: dict, sub_id: str, milestone: dict, body: SubmitBody) -> None:
    try:
        report = await verify(milestone, body.live_url, body.repo_url, body.notes)
        status = "verified" if report["counts"]["not_met"] == 0 else "needs_work"
        set_row("milestone_submissions", sub_id, report=report, status=status)
        n = report["counts"]
        text = f"Verification Agent: {n['met']} met, {n['not_met']} not met, {n['unverifiable']} to check by hand."
        notify_side(c, "client", "submitted", f"{milestone['id']} is ready for your review", text, tab="contract")
        notify_side(c, "developer", "verified", f"{milestone['id']} verification finished", text, tab="contract")
    except LLMError as e:
        set_row("milestone_submissions", sub_id, status="error", report={"error": str(e)[:300]})
        notify_side(c, "developer", "verified", f"{milestone['id']} verification failed", "The AI model was unavailable. Please resubmit.", tab="contract")


RESUBMITTABLE = ("needs_work", "error")


@router.post("/contracts/{cid}/milestones/{mid}/submit")
async def submit(cid: str, mid: str, body: SubmitBody, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    if side != "developer":
        raise HTTPException(403, "Only the developer submits milestones")
    if c["status"] != "active":
        raise HTTPException(409, "Contract is not active")
    milestone = next((m for m in c["milestones"] if m["id"] == mid), None)
    if not milestone:
        raise HTTPException(404, "Milestone not found")
    latest = (
        db().table("milestone_submissions").select("id,status").eq("contract_id", cid).eq("milestone_id", mid)
        .order("created_at", desc=True).limit(1).execute().data
    )
    # Before the founder reviews, the developer may replace a delivery the Verification Agent flagged
    # (wrong link, missing work) instead of waiting for "request changes".
    replacing = milestone["status"] == "submitted" and bool(latest) and latest[0]["status"] in RESUBMITTABLE
    if milestone["status"] not in ("in_progress", "changes_requested") and not replacing:
        if milestone["status"] == "submitted" and latest and latest[0]["status"] == "verifying":
            raise HTTPException(409, "The Verification Agent is still checking your last submission")
        raise HTTPException(409, f"Milestone is {milestone['status'].replace('_', ' ')}")
    if _dispute_open(cid, mid):
        raise HTTPException(409, "A dispute is open on this milestone. Resolve it first.")
    b = escrow.balances(c["milestones"], escrow.entries(cid))["milestones"][mid]
    if not b["fully_funded"]:
        raise HTTPException(409, f"The founder hasn't funded {mid} yet (${b['to_fund']:,.0f} to go). Ask them in Messages.")
    if replacing:
        set_row("milestone_submissions", latest[0]["id"], status="superseded")
    sub = db().table("milestone_submissions").insert({
        "contract_id": cid, "milestone_id": mid, **body.model_dump(), "status": "verifying",
    }).execute().data[0]
    set_row("contracts", cid, milestones=_set_milestone(c, mid, "submitted"))
    task = asyncio.create_task(_run_verification(c, sub["id"], milestone, body))
    _verifications.add(task)
    task.add_done_callback(_verifications.discard)
    return sub


class ReviewBody(BaseModel):
    decision: Literal["approve", "changes"]
    feedback: str | None = Field(default=None, max_length=2000)


@router.post("/submissions/{sid}/review")
def review(sid: str, body: ReviewBody, user: User = Depends(current_user)):
    sub = one("milestone_submissions", id=sid)
    if not sub:
        raise HTTPException(404, "Submission not found")
    c, side = _contract(sub["contract_id"], user)
    if side != "client":
        raise HTTPException(403, "Only the founder approves milestones")
    if sub["status"] in ("verifying", "approved", "changes_requested"):
        raise HTTPException(409, "This submission can't be reviewed right now")
    if _dispute_open(c["id"], sub["milestone_id"]):
        raise HTTPException(409, "A dispute is open on this milestone. Resolve it first.")
    if body.decision == "changes" and not body.feedback:
        raise HTTPException(422, "Tell the developer what to change")

    mid = sub["milestone_id"]
    if body.decision == "approve":
        set_row("milestone_submissions", sid, status="approved", client_feedback=body.feedback)
        price = next(m["price"] for m in c["milestones"] if m["id"] == mid)
        close_milestone(c, mid, price, user.id, "Released on approval")
    else:
        set_row("milestone_submissions", sid, status="changes_requested", client_feedback=body.feedback)
        set_row("contracts", c["id"], milestones=_set_milestone(c, mid, "changes_requested"))
        notify_side(c, "developer", "changes_requested", f"Changes requested on {mid}", body.feedback, tab="contract")
    return get_contract(c["id"], user)


def close_milestone(c: dict, mid: str, release_amount: float, actor_id: str | None, note: str) -> dict:
    """Approve a milestone: settle its escrow, start the next one, complete the contract when all are done."""
    money = escrow.settle(c, mid, release_amount, actor_id, note)
    ms = _set_milestone(c, mid, "approved")
    nxt = next((m for m in ms if m["status"] == "pending"), None)
    if nxt:
        nxt["status"] = "in_progress"
    done = all(m["status"] == "approved" for m in ms)
    row = set_row("contracts", c["id"], milestones=ms, status="completed" if done else "active")
    if done:
        db().table("projects").update({"status": "completed"}).eq("id", c["project_id"]).execute()
    paid = f"${money['released']:,.0f} released to you" + (f", ${money['refunded']:,.0f} returned to the founder" if money["refunded"] else "")
    notify_side(c, "developer", "approved", f"{mid} approved: {paid}", note, tab="payments")
    if nxt:
        notify_side(c, "client", "approved", f"{mid} is closed. Fund {nxt['id']} to keep going",
                    f"Next up: {nxt['title']} (${nxt['price']:,}).", tab="payments")
    if done:
        notify_both(c, "completed", f"{c['title']} is complete", "Every milestone is approved and paid.", tab="payments")
    return {**row, "money": money}
