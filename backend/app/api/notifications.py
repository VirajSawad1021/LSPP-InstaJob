"""The bell: in-app notifications, read state, email preference, and the missed check-in scan."""
from __future__ import annotations

import time
from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.common import developer_row
from app.auth import User, current_user
from app.config import RESEND_API_KEY
from app.db import db, now_iso
from app.services.notify import notify_side, party_ids, recently_notified
from app.services.schedule import CHECK_IN_EVERY_DAYS, check_in_due

router = APIRouter(prefix="/api", tags=["notifications"])
_last_scan: dict[str, float] = {}


def scan_check_ins(contracts: list[dict], only_user: str | None = None) -> int:
    """Flag missed weekly check-ins, at most once a week per person and project."""
    if not contracts:
        return 0
    ids = [c["id"] for c in contracts]
    rows = db().table("check_ins").select("contract_id,created_at").in_("contract_id", ids).order("created_at", desc=True).execute().data or []
    latest: dict[str, str] = {}
    for r in rows:
        latest.setdefault(r["contract_id"], r["created_at"])
    sent = 0
    for c in contracts:
        if not check_in_due(c, latest.get(c["id"])):
            continue
        parties = party_ids(c)
        for side in ("developer", "client"):
            uid = parties.get(side)
            if not uid or (only_user and uid != only_user):
                continue
            if recently_notified(uid, c["id"], "checkin_due", timedelta(days=CHECK_IN_EVERY_DAYS - 1)):
                continue
            if side == "developer":
                notify_side(c, side, "checkin_due", f"Your weekly check-in on {c['title']} is due",
                            "Post what is done, what is next and any blockers. The AI can draft it from your activity.", tab="checkins")
            else:
                notify_side(c, side, "checkin_due", f"No check-in on {c['title']} for {CHECK_IN_EVERY_DAYS} days",
                            "You can nudge the developer in Messages.", tab="checkins")
            sent += 1
    return sent


def scan_all() -> int:
    contracts = db().table("contracts").select("id,title,status,started_at,client_id,developer_id").eq("status", "active").execute().data or []
    return scan_check_ins(contracts)


def _my_contracts(user: User) -> list[dict]:
    dev = developer_row(user_id=user.id)
    q = db().table("contracts").select("id,title,status,started_at,client_id,developer_id").eq("status", "active")
    return (q.eq("developer_id", dev["id"]) if dev else q.eq("client_id", user.id)).execute().data or []


@router.get("/notifications")
def list_notifications(user: User = Depends(current_user)):
    if time.monotonic() - _last_scan.get(user.id, -1e9) > 600:
        _last_scan[user.id] = time.monotonic()
        try:
            scan_check_ins(_my_contracts(user), only_user=user.id)
        except Exception:  # noqa: BLE001  (the scan is a nicety; the list must still load)
            pass
    rows = db().table("notifications").select("*").eq("user_id", user.id).order("created_at", desc=True).limit(40).execute().data or []
    unread = db().table("notifications").select("id", count="exact").eq("user_id", user.id).is_("read_at", "null").limit(1).execute().count or 0
    prof = db().table("profiles").select("email_notifications").eq("id", user.id).limit(1).execute().data
    return {
        "notifications": rows, "unread": unread,
        "email": {"available": bool(RESEND_API_KEY), "enabled": bool(prof[0]["email_notifications"]) if prof else True},
    }


class ReadBody(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=100)
    all: bool = False
    contract_id: str | None = None


@router.post("/notifications/read")
def mark_read(body: ReadBody, user: User = Depends(current_user)):
    q = db().table("notifications").update({"read_at": now_iso()}).eq("user_id", user.id).is_("read_at", "null")
    if body.contract_id:
        q = q.eq("contract_id", body.contract_id)
    elif not body.all:
        if not body.ids:
            return {"ok": True}
        q = q.in_("id", body.ids)
    q.execute()
    return {"ok": True}


class EmailPref(BaseModel):
    enabled: bool


@router.post("/notifications/email")
def set_email(body: EmailPref, user: User = Depends(current_user)):
    db().table("profiles").update({"email_notifications": body.enabled}).eq("id", user.id).execute()
    return {"enabled": body.enabled}
