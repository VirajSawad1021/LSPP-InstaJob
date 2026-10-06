"""Founder <-> developer communication after the deal: project chat with attachments, read
receipts, pinned decisions, a cross-project inbox and weekly check-ins."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.agents.checkin import draft_check_in
from app.api.common import contract_side, developer_row
from app.auth import User, current_user
from app.db import db, now_iso, one, pool
from app.services.notify import notify_message, notify_side
from app.services.schedule import CHECK_IN_EVERY_DAYS, check_in_due

router = APIRouter(prefix="/api", tags=["messages"])

BUCKET = "project-files"
MAX_FILE_BYTES = 10 * 1024 * 1024


def _contract(cid: str, user: User) -> tuple[dict, str]:
    c = one("contracts", id=cid)
    if not c:
        raise HTTPException(404, "Project not found")
    return c, contract_side(user, c)


def _signed(messages: list[dict]) -> list[dict]:
    """Attachments live in a private bucket; hand out short-lived links."""
    paths = [a["path"] for m in messages for a in (m.get("attachments") or [])]
    if not paths:
        return messages
    signed = db().storage.from_(BUCKET).create_signed_urls(paths, 3600)
    urls = {s.get("path"): s.get("signedURL") or s.get("signedUrl") for s in signed}
    for m in messages:
        m["attachments"] = [{**a, "url": urls.get(a["path"])} for a in (m.get("attachments") or [])]
    return messages


# ---------------- chat ----------------
@router.get("/contracts/{cid}/messages")
def list_messages(cid: str, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    other_id = c["client_id"] if side == "developer" else (developer_row(id=c["developer_id"]) or {}).get("user_id")
    f_msgs = pool.submit(lambda: db().table("project_comments").select("*").eq("contract_id", cid).order("created_at").execute().data or [])
    f_reads = pool.submit(lambda: db().table("message_reads").select("*").eq("contract_id", cid).execute().data or [])
    msgs, reads = f_msgs.result(), f_reads.result()
    by_user = {r["user_id"]: r["last_read_at"] for r in reads}
    return {
        "side": side,
        "messages": _signed(msgs),
        "my_last_read_at": by_user.get(user.id),
        "other_last_read_at": by_user.get(other_id) if other_id else None,
        "milestones": [{"id": m["id"], "title": m["title"]} for m in c["milestones"]],
    }


class Attachment(BaseModel):
    path: str
    name: str
    type: str = ""
    size: int = 0


class MessageBody(BaseModel):
    body: str = Field(default="", max_length=4000)
    milestone_id: str | None = None
    attachments: list[Attachment] = Field(default_factory=list, max_length=5)


@router.post("/contracts/{cid}/messages")
def send_message(cid: str, body: MessageBody, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    text = body.body.strip()
    if not text and not body.attachments:
        raise HTTPException(422, "Write a message or attach a file")
    if body.milestone_id and body.milestone_id not in {m["id"] for m in c["milestones"]}:
        raise HTTPException(422, "Unknown milestone")
    for a in body.attachments:
        if not a.path.startswith(f"{cid}/"):
            raise HTTPException(422, "Attachment does not belong to this project")
    row = db().table("project_comments").insert({
        "contract_id": cid, "milestone_id": body.milestone_id, "author_id": user.id, "author_role": side,
        "author_name": user.full_name, "body": text or "(attachment)", "attachments": [a.model_dump() for a in body.attachments],
    }).execute().data[0]
    _mark_read(cid, user.id)
    notify_message(c, side, user.full_name or ("The founder" if side == "client" else "The developer"), row["body"])
    return _signed([row])[0]


def _safe_name(name: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-.")[:80]
    return base or "file"


@router.post("/contracts/{cid}/files")
async def upload_file(cid: str, file: UploadFile = File(...), user: User = Depends(current_user)):
    _contract(cid, user)
    data = await file.read()
    if not data:
        raise HTTPException(422, "Empty file")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, "Files can be up to 10 MB")
    path = f"{cid}/{uuid.uuid4().hex[:12]}-{_safe_name(file.filename or 'file')}"
    content_type = file.content_type or "application/octet-stream"
    db().storage.from_(BUCKET).upload(path, data, {"content-type": content_type})
    return {"path": path, "name": file.filename or "file", "type": content_type, "size": len(data)}


class PinBody(BaseModel):
    pinned: bool


@router.post("/messages/{mid}/pin")
def pin_message(mid: str, body: PinBody, user: User = Depends(current_user)):
    m = one("project_comments", id=mid)
    if not m:
        raise HTTPException(404, "Message not found")
    _contract(m["contract_id"], user)
    updates = {"pinned": body.pinned, "pinned_by": user.id if body.pinned else None, "pinned_at": now_iso() if body.pinned else None}
    return db().table("project_comments").update(updates).eq("id", mid).execute().data[0]


def _mark_read(cid: str, user_id: str) -> None:
    db().table("message_reads").upsert({"contract_id": cid, "user_id": user_id, "last_read_at": now_iso()}, on_conflict="contract_id,user_id").execute()
    db().table("notifications").update({"read_at": now_iso()}).eq("user_id", user_id).eq("contract_id", cid).eq("kind", "message").is_("read_at", "null").execute()


@router.post("/contracts/{cid}/read")
def mark_read(cid: str, user: User = Depends(current_user)):
    _contract(cid, user)
    _mark_read(cid, user.id)
    return {"ok": True}


@router.get("/contracts/{cid}/decisions")
def decisions(cid: str, user: User = Depends(current_user)):
    _contract(cid, user)
    return (
        db().table("project_comments").select("id,body,author_role,author_name,milestone_id,pinned_at,created_at")
        .eq("contract_id", cid).eq("pinned", True).order("pinned_at").execute().data or []
    )


# ---------------- inbox ----------------
@router.get("/inbox")
def inbox(user: User = Depends(current_user)):
    """Every project conversation with its last message and unread count."""
    dev = developer_row(user_id=user.id)
    q = db().table("contracts").select("id,title,status,started_at,client_id,developer_id").order("created_at", desc=True)
    contracts = (q.eq("developer_id", dev["id"]) if dev else q.eq("client_id", user.id)).execute().data or []
    if not contracts:
        return {"conversations": [], "unread_total": 0}
    ids = [c["id"] for c in contracts]
    f_msgs = pool.submit(lambda: db().table("project_comments").select("contract_id,author_id,author_role,author_name,body,created_at").in_("contract_id", ids).order("created_at", desc=True).limit(500).execute().data or [])
    f_reads = pool.submit(lambda: db().table("message_reads").select("contract_id,last_read_at").eq("user_id", user.id).in_("contract_id", ids).execute().data or [])
    f_checks = pool.submit(lambda: db().table("check_ins").select("contract_id,created_at,acknowledged_at").in_("contract_id", ids).order("created_at", desc=True).execute().data or [])
    f_devs = pool.submit(lambda: db().table("developers").select("id,full_name").in_("id", list({c["developer_id"] for c in contracts})).execute().data or [])
    f_clients = pool.submit(lambda: db().table("profiles").select("id,full_name").in_("id", list({c["client_id"] for c in contracts})).execute().data or [])
    msgs, reads, checks = f_msgs.result(), f_reads.result(), f_checks.result()
    devs = {d["id"]: d["full_name"] for d in f_devs.result()}
    clients = {p["id"]: p["full_name"] for p in f_clients.result()}
    last_read = {r["contract_id"]: r["last_read_at"] for r in reads}

    out, total = [], 0
    for c in contracts:
        mine = [m for m in msgs if m["contract_id"] == c["id"]]
        lr = last_read.get(c["id"])
        unread = sum(1 for m in mine if m["author_id"] != user.id and (lr is None or m["created_at"] > lr))
        total += unread
        latest_check = next((k for k in checks if k["contract_id"] == c["id"]), None)
        out.append({
            "contract_id": c["id"], "title": c["title"], "status": c["status"],
            "with": clients.get(c["client_id"]) if dev else devs.get(c["developer_id"]),
            "last_message": mine[0] if mine else None,
            "unread": unread,
            "check_in_due": check_in_due(c, latest_check["created_at"] if latest_check else None),
            "check_in_unacknowledged": bool(latest_check and not latest_check["acknowledged_at"]) if not dev else False,
        })
    out.sort(key=lambda x: (x["last_message"] or {}).get("created_at") or "", reverse=True)
    return {"conversations": out, "unread_total": total}


# ---------------- weekly check-ins ----------------
@router.get("/contracts/{cid}/checkins")
def list_check_ins(cid: str, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    rows = db().table("check_ins").select("*").eq("contract_id", cid).order("created_at", desc=True).execute().data or []
    return {"side": side, "check_ins": rows, "due": check_in_due(c, rows[0]["created_at"] if rows else None), "every_days": CHECK_IN_EVERY_DAYS}


class CheckInBody(BaseModel):
    done: str = Field(default="", max_length=2000)
    next: str = Field(default="", max_length=2000)
    blockers: str = Field(default="", max_length=2000)
    needs: str = Field(default="", max_length=2000)
    ai_drafted: bool = False


@router.post("/contracts/{cid}/checkins/draft")
async def draft(cid: str, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    if side != "developer":
        raise HTTPException(403, "Only the developer writes check-ins")
    since = (datetime.now(timezone.utc) - timedelta(days=CHECK_IN_EVERY_DAYS)).isoformat()
    tasks = db().table("milestone_tasks").select("milestone_id,title,done,done_at").eq("contract_id", cid).execute().data or []
    subs = db().table("milestone_submissions").select("milestone_id,status,created_at").eq("contract_id", cid).gte("created_at", since).execute().data or []
    msgs = db().table("project_comments").select("author_role,body,created_at").eq("contract_id", cid).gte("created_at", since).order("created_at").execute().data or []
    d = await draft_check_in(c, tasks, subs, msgs, since)
    return d.model_dump()


@router.post("/contracts/{cid}/checkins")
def create_check_in(cid: str, body: CheckInBody, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    if side != "developer":
        raise HTTPException(403, "Only the developer writes check-ins")
    if not any(v.strip() for v in (body.done, body.next, body.blockers, body.needs)):
        raise HTTPException(422, "Fill in at least one section")
    row = db().table("check_ins").insert({"contract_id": cid, "author_id": user.id, **body.model_dump()}).execute().data[0]
    first = next((line.strip("-• ").strip() for line in body.done.splitlines() if line.strip()), "") or "See what was done, what is next and any blockers."
    notify_side(c, "client", "checkin", f"New weekly check-in on {c['title']}", first, tab="checkins")
    return row


@router.post("/checkins/{kid}/ack")
def acknowledge(kid: str, user: User = Depends(current_user)):
    k = one("check_ins", id=kid)
    if not k:
        raise HTTPException(404, "Check-in not found")
    c, side = _contract(k["contract_id"], user)
    if side != "client":
        raise HTTPException(403, "Only the founder acknowledges check-ins")
    row = db().table("check_ins").update({"acknowledged_at": now_iso()}).eq("id", kid).execute().data[0]
    notify_side(c, "developer", "checkin_ack", f"The founder acknowledged your check-in on {c['title']}", None, tab="checkins")
    return row
