"""A2A (Agent2Agent) surface: discoverable Agent Cards and an A2A-message export of each negotiation.

Every developer agent publishes an Agent Card, so an external client agent could discover it.
The negotiation transcript is exportable as A2A `Message` objects (one `contextId` per negotiation),
with the typed offer carried in a `data` part.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.common import negotiation_side
from app.auth import User, current_user
from app.db import db, one
from app.services import events as ev

router = APIRouter(tags=["a2a"])
PROTOCOL_VERSION = "0.3.0"


def _base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


@router.get("/.well-known/agent-card.json")
def platform_card(request: Request):
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "name": "InstaJob Client Agent",
        "description": "Represents a startup founder: negotiates milestone-based MVP builds within the founder's budget, deadline and must-have scope.",
        "url": f"{_base(request)}/a2a/client",
        "version": "2.0.0",
        "capabilities": {"streaming": True, "pushNotifications": False},
        "defaultInputModes": ["application/json", "text/plain"],
        "defaultOutputModes": ["application/json", "text/plain"],
        "skills": [
            {"id": "negotiate-build-plan", "name": "Negotiate a Build Plan",
             "description": "Exchanges typed milestone offers (scope, price, weeks) until both sides' hard limits are satisfied.",
             "tags": ["negotiation", "freelance", "milestones"]},
        ],
    }


@router.get("/a2a/developers/{developer_id}/agent-card.json")
def developer_card(developer_id: str, request: Request):
    d = one("developers", id=developer_id)
    if not d or not d.get("profile_complete"):
        raise HTTPException(404, "Agent not found")
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "name": f"{d['full_name']}'s Developer Agent",
        "description": f"{d.get('headline') or ''}. Negotiates on {d['full_name']}'s behalf; never below their private rate floor.",
        "url": f"{_base(request)}/a2a/developers/{developer_id}",
        "version": "2.0.0",
        "capabilities": {"streaming": True, "pushNotifications": False},
        "defaultInputModes": ["application/json", "text/plain"],
        "defaultOutputModes": ["application/json", "text/plain"],
        "skills": [
            {"id": "pitch", "name": "Pitch for a project", "description": "Explains fit using verified shipped work.",
             "tags": d.get("skills", [])[:8]},
            {"id": "negotiate-build-plan", "name": "Negotiate a Build Plan",
             "description": "Proposes and counters typed milestone offers.", "tags": ["negotiation"]},
        ],
    }


@router.get("/api/negotiations/{nid}/a2a")
def export_a2a(nid: str, user: User = Depends(current_user)):
    neg = one("negotiations", id=nid)
    if not neg:
        raise HTTPException(404, "Negotiation not found")
    side = negotiation_side(user, neg)
    messages = []
    for e in ev.list_events(nid, side):
        if e["actor"] not in ("developer_agent", "client_agent"):
            continue
        parts = [{"kind": "text", "text": e["content"]}]
        if e.get("offer"):
            parts.append({"kind": "data", "data": {"type": f"instajob.{e['kind']}", "offer": e["offer"]}})
        messages.append({
            "kind": "message",
            "messageId": e["hash"][:32],
            "contextId": nid,
            "role": "agent",
            "parts": parts,
            "metadata": {"from": e["actor"], "seq": e["seq"], "sha256": e["hash"], "prevSha256": e["prev_hash"]},
        })
    return {"contextId": nid, "messages": messages}
