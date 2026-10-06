"""Change requests on a signed contract: scope -> both agents price it -> both people approve ->
the contract (and therefore board, timeline and payments) is amended."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.agents import change as ch
from app.api.common import contract_side, developer_row, set_row
from app.auth import User, current_user
from app.db import db, now_iso, one
from app.llm import LLMError
from app.services.notify import notify_both, notify_other, notify_side

router = APIRouter(prefix="/api", tags=["changes"])
_tasks: set[asyncio.Task] = set()

OPEN = {"scoping", "awaiting_client", "negotiating", "proposed"}


def _spawn(coro) -> None:
    t = asyncio.create_task(coro)
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)


def _contract(cid: str, user: User) -> tuple[dict, str]:
    c = one("contracts", id=cid)
    if not c:
        raise HTTPException(404, "Project not found")
    return c, contract_side(user, c)


def _change(xid: str, user: User) -> tuple[dict, dict, str]:
    x = one("change_requests", id=xid)
    if not x:
        raise HTTPException(404, "Change request not found")
    c, side = _contract(x["contract_id"], user)
    return x, c, side


def view(x: dict, side: str) -> dict:
    """What each side may see: the developer never sees the founder's caps, the founder never
    sees guardrail notes that contain the developer's floor."""
    out = {**x, "transcript": [t for t in x.get("transcript") or [] if t.get("audience", "all") in ("all", side)]}
    if side == "developer":
        out.pop("max_extra_budget", None)
        out.pop("max_extra_weeks", None)
    return out


def headroom(c: dict) -> dict:
    """Suggested caps for a change: whatever budget and deadline the original brief left unused."""
    p = one("projects", id=c["project_id"]) or {}
    budget = float(p["budget_max"]) - float(c["total_price"]) if p.get("budget_max") else None
    weeks = int(p["deadline_weeks"]) - int(c["timeline_weeks"]) if p.get("deadline_weeks") else None
    return {"budget": round(budget) if budget and budget > 0 else None, "weeks": weeks if weeks and weeks > 0 else None}


def _say(x: dict, actor: str, kind: str, text: str, price: int | None = None, weeks: int | None = None, audience: str = "all") -> dict:
    entry = {"actor": actor, "kind": kind, "text": text, "price": price, "weeks": weeks, "audience": audience, "at": now_iso()}
    x["transcript"] = [*(x.get("transcript") or []), entry]
    return set_row("change_requests", x["id"], transcript=x["transcript"])


# ---------------- background work ----------------
async def _scope(xid: str) -> None:
    x = await asyncio.to_thread(one, "change_requests", id=xid)
    c = await asyncio.to_thread(one, "contracts", id=x["contract_id"])
    try:
        raw = await ch.scope_change(c, x["description"], x["requested_role"])
    except LLMError as e:
        await asyncio.to_thread(set_row, "change_requests", xid, status="failed", error=str(e)[:300])
        return
    if not raw.is_change:
        why = raw.not_a_change_reason or "It doesn't describe new or different work."
        await asyncio.to_thread(set_row, "change_requests", xid, status="withdrawn",
                                outcome=f"Not scoped: {why} Describe what should be built and raise it again.")
        return
    scope = ch.normalize_scope(raw, c)
    nxt = "negotiating" if x["requested_role"] == "client" else "awaiting_client"
    x = await asyncio.to_thread(set_row, "change_requests", xid, scope=scope, title=scope["title"][:140], status=nxt, error=None)
    where = f"extends {scope['target_milestone_id']}" if scope["kind"] == "extend_milestone" else "adds a new milestone"
    await asyncio.to_thread(_say, x, "system", "scoped", f"Change Scoping Agent: {where}, about {scope['est_hours']} hours.")
    if nxt == "awaiting_client":
        await asyncio.to_thread(notify_side, c, "client", "change_raised", f"The developer proposed a change: {scope['title']}",
                                f"Scoped at about {scope['est_hours']} hours. Set your limits to let the agents price it, or decline.", "changes")
    if nxt == "negotiating":
        await _negotiate(xid)


async def _negotiate(xid: str) -> None:
    x = await asyncio.to_thread(one, "change_requests", id=xid)
    c = await asyncio.to_thread(one, "contracts", id=x["contract_id"])
    dev = await asyncio.to_thread(developer_row, id=c["developer_id"])
    project = await asyncio.to_thread(one, "projects", id=c["project_id"]) or {}
    scope = x["scope"]
    dlim = ch.ChangeDevLimits(rate_floor=float(dev["rate_floor"]), weekly_hours=int(dev.get("weekly_hours") or 30))
    clim = ch.ChangeClientLimits(
        max_price=float(x["max_extra_budget"]) if x.get("max_extra_budget") is not None else None,
        max_weeks=x.get("max_extra_weeks"),
    )
    hours = {m["id"]: m["est_hours"] for m in (project.get("plan") or {}).get("milestones", [])}
    total_h = sum(hours.get(m["id"], 0) for m in c["milestones"]) or 1
    contract_rate = float(c["total_price"]) / total_h

    blockers = ch.zone_of_agreement(scope, dlim, clim)
    if blockers:
        x = await asyncio.to_thread(_say, x, "guardrail", "guardrail",
                                    f"Minimum for this change: ${ch.min_price(scope, dlim):,} and +{ch.min_weeks(scope, dlim)} weeks, outside the founder's caps.",
                                    audience="developer")
        msg = f"No price fits: {'; '.join(blockers)}. Raise the caps and let the agents try again."
        x = await asyncio.to_thread(_say, x, "guardrail", "guardrail", msg, audience="client")
        await asyncio.to_thread(set_row, "change_requests", xid, status="impasse", outcome="The founder's caps are below the developer's minimum for this change.")
        return

    x = await asyncio.to_thread(_say, x, "system", "status", f"Agents are pricing this change with {dev['full_name']}'s agent.")
    offers: dict[str, tuple[int, int] | None] = {"developer_agent": None, "client_agent": None}
    actor = "developer_agent"
    try:
        for turn_no in range(ch.MAX_TURNS):
            other = "client_agent" if actor == "developer_agent" else "developer_agent"
            side = "developer" if actor == "developer_agent" else "client"
            turns_left = (ch.MAX_TURNS - turn_no + 1) // 2
            feedback, moved = None, False
            for _ in range(3):
                fn = ch.developer_change_turn if actor == "developer_agent" else ch.client_change_turn
                lim = dlim if actor == "developer_agent" else clim
                t = await fn(dev, c, scope, lim, contract_rate, x["transcript"], offers[other], offers[actor], turns_left, feedback)
                if t.action == "walk_away":
                    x = await asyncio.to_thread(_say, x, actor, "walk_away", t.message)
                    await asyncio.to_thread(set_row, "change_requests", xid, status="impasse",
                                            outcome=f"{'Developer' if side == 'developer' else 'Founder'}'s agent walked away: {t.message}")
                    return
                if t.action == "accept":
                    theirs = offers[other]
                    if not theirs:
                        feedback = "There is nothing to accept yet. Make an offer."
                        continue
                    if not offers[actor]:
                        feedback = "Protocol: make at least one offer of your own before accepting."
                        continue
                    v = ch.developer_violations(*theirs, scope, dlim) if side == "developer" else ch.client_violations(*theirs, clim)
                    if v:
                        x = await asyncio.to_thread(_say, x, "guardrail", "guardrail", "Blocked an acceptance: " + " ".join(v), audience=side)
                        feedback = "You cannot accept that: " + " ".join(v)
                        continue
                    x = await asyncio.to_thread(_say, x, actor, "accept", t.message, *theirs)
                    await asyncio.to_thread(set_row, "change_requests", xid, status="proposed", price_delta=theirs[0], weeks_delta=theirs[1],
                                            outcome=f"Agreed: ${theirs[0]:,} and +{theirs[1]} weeks. Waiting for both of you to approve.")
                    await asyncio.to_thread(notify_both, c, "change_proposed", f"Agents priced \"{scope['title']}\": ${theirs[0]:,}, +{theirs[1]} weeks",
                                            "Approve it to amend the contract, or decline.", "changes")
                    return
                price, weeks = max(0, int(t.price)), max(0, int(t.extra_weeks))
                v = ch.developer_violations(price, weeks, scope, dlim) if side == "developer" else ch.client_violations(price, weeks, clim)
                if v:
                    x = await asyncio.to_thread(_say, x, "guardrail", "guardrail", f"Rejected an offer (${price:,}, +{weeks}w): " + " ".join(v), audience=side)
                    feedback = " ".join(v)
                    continue
                offers[actor] = (price, weeks)
                x = await asyncio.to_thread(_say, x, actor, "offer", t.message, price, weeks)
                moved = True
                break
            if not moved:
                await asyncio.to_thread(set_row, "change_requests", xid, status="impasse",
                                        outcome=f"The {side}'s agent could not make an offer within its limits.")
                return
            actor = other
        await asyncio.to_thread(set_row, "change_requests", xid, status="impasse", outcome=f"No agreement within {ch.MAX_TURNS} turns.")
    except LLMError as e:
        await asyncio.to_thread(set_row, "change_requests", xid, status="failed", error=str(e)[:300])


def _stale(x: dict) -> bool:
    """A run that stopped mid-way (e.g. the server restarted) can be restarted after 5 minutes."""
    if x["status"] not in ("scoping", "negotiating"):
        return False
    return datetime.now(timezone.utc) - datetime.fromisoformat(x["updated_at"].replace("Z", "+00:00")) > timedelta(minutes=5)


# ---------------- routes ----------------
@router.get("/contracts/{cid}/changes")
def list_changes(cid: str, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    rows = db().table("change_requests").select("*").eq("contract_id", cid).order("created_at", desc=True).execute().data or []
    return {"side": side, "changes": [view(x, side) for x in rows], "headroom": headroom(c) if side == "client" else None}


class NewChange(BaseModel):
    description: str = Field(min_length=5, max_length=4000)
    source_message_id: str | None = None
    max_extra_budget: float | None = Field(default=None, ge=0)
    max_extra_weeks: int | None = Field(default=None, ge=0, le=52)


@router.post("/contracts/{cid}/changes")
async def create_change(cid: str, body: NewChange, user: User = Depends(current_user)):
    c, side = await asyncio.to_thread(_contract, cid, user)
    if c["status"] not in ("active", "completed"):
        raise HTTPException(409, "Changes can be requested once both of you have signed")
    if body.source_message_id:
        m = await asyncio.to_thread(one, "project_comments", id=body.source_message_id)
        if not m or m["contract_id"] != cid:
            raise HTTPException(422, "That message is not part of this project")
    row = {
        "contract_id": cid, "requested_by": user.id, "requested_role": side,
        "title": body.description.strip().split("\n")[0][:120] or "Change request",
        "description": body.description.strip(), "source_message_id": body.source_message_id, "status": "scoping",
    }
    if side == "client":
        row.update(max_extra_budget=body.max_extra_budget, max_extra_weeks=body.max_extra_weeks)
    x = await asyncio.to_thread(lambda: db().table("change_requests").insert(row).execute().data[0])
    _spawn(_scope(x["id"]))
    return view(x, side)


class PriceBody(BaseModel):
    max_extra_budget: float | None = Field(default=None, ge=0)
    max_extra_weeks: int | None = Field(default=None, ge=0, le=52)


@router.post("/changes/{xid}/price")
async def price_change(xid: str, body: PriceBody, user: User = Depends(current_user)):
    """The founder agrees to price a change (the developer's, or a retry after an impasse) with caps."""
    x, c, side = await asyncio.to_thread(_change, xid, user)
    if side != "client":
        raise HTTPException(403, "Only the founder sets the caps and starts pricing")
    if not x.get("scope") or not (x["status"] in ("awaiting_client", "impasse", "failed") or _stale(x)):
        raise HTTPException(409, "This change can't be priced right now")
    x = await asyncio.to_thread(set_row, "change_requests", xid, status="negotiating", error=None, outcome=None,
                                max_extra_budget=body.max_extra_budget, max_extra_weeks=body.max_extra_weeks,
                                transcript=[t for t in x["transcript"] if t["kind"] == "scoped"])
    _spawn(_negotiate(xid))
    return view(x, side)


@router.post("/changes/{xid}/retry")
async def retry(xid: str, user: User = Depends(current_user)):
    x, _, side = await asyncio.to_thread(_change, xid, user)
    if x.get("scope") or not (x["status"] == "failed" or _stale(x)):
        raise HTTPException(409, "Only a change that failed while scoping can be retried here")
    x = await asyncio.to_thread(set_row, "change_requests", xid, status="scoping", error=None)
    _spawn(_scope(xid))
    return view(x, side)


@router.post("/changes/{xid}/approve")
def approve_change(xid: str, user: User = Depends(current_user)):
    x, c, side = _change(xid, user)
    if x["status"] != "proposed":
        raise HTTPException(409, "There is no agreed price to approve")
    x = set_row("change_requests", xid, **{f"{side}_approved_at": now_iso()})
    if not (x["client_approved_at"] and x["developer_approved_at"]):
        notify_other(c, side, "change_proposed", f"{'The founder' if side == 'client' else 'The developer'} approved \"{x['title']}\"",
                     "Your approval is the last step before the contract is amended.", "changes")
        return view(x, side)
    upd = ch.apply_change(c, x["scope"], int(x["price_delta"]), int(x["weeks_delta"]), xid, now_iso())
    mid = upd.pop("milestone_id")
    set_row("contracts", c["id"], **upd)
    notify_both(c, "change_applied", f"Contract amended: {x['scope']['title']}",
                f"+${int(x['price_delta']):,} and +{int(x['weeks_delta'])} weeks. The board and timeline are updated.", "changes")
    if c["status"] == "completed":
        db().table("projects").update({"status": "in_progress"}).eq("id", c["project_id"]).execute()
    x = set_row("change_requests", xid, status="approved", applied_at=now_iso(),
                outcome=f"Approved by both. Contract amended: {mid} {'updated' if x['scope']['kind'] == 'extend_milestone' else 'added'}, "
                        f"+${int(x['price_delta']):,}, +{int(x['weeks_delta'])} weeks.")
    return view(x, side)


@router.post("/changes/{xid}/reject")
def reject_change(xid: str, user: User = Depends(current_user)):
    x, c, side = _change(xid, user)
    if x["status"] not in ("awaiting_client", "proposed", "impasse"):
        raise HTTPException(409, "This change can't be declined right now")
    who = "The founder" if side == "client" else "The developer"
    notify_other(c, side, "change_declined", f"{who} declined \"{x['title']}\"", None, "changes")
    return view(set_row("change_requests", xid, status="rejected", outcome=f"{who} declined this change."), side)


@router.post("/changes/{xid}/withdraw")
def withdraw_change(xid: str, user: User = Depends(current_user)):
    x, _, side = _change(xid, user)
    if x["requested_by"] != user.id:
        raise HTTPException(403, "Only whoever raised the change can withdraw it")
    if x["status"] in ("approved", "rejected", "withdrawn"):
        raise HTTPException(409, "This change is already closed")
    return view(set_row("change_requests", xid, status="withdrawn", outcome="Withdrawn by the person who raised it."), side)


def waiting_on(x: dict, side: str) -> bool:
    """Does this change need an action from `side`?"""
    if x["status"] == "awaiting_client":
        return side == "client"
    if x["status"] == "proposed":
        return not x.get(f"{side}_approved_at")
    return False
