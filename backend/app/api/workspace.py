"""Shared project workspace (board, timeline, activity, comments) and the global work views."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.changes import waiting_on
from app.api.common import contract_side, developer_row, public_developer
from app.auth import User, current_user
from app.db import db, now_iso, one, pool
from app.services import escrow
from app.services.schedule import build_schedule, check_in_due

router = APIRouter(prefix="/api", tags=["workspace"])


def _contract(cid: str, user: User) -> tuple[dict, str]:
    c = one("contracts", id=cid)
    if not c:
        raise HTTPException(404, "Project workspace not found")
    return c, contract_side(user, c)


def _activity(c: dict, subs: list[dict], comments: list[dict], tasks: list[dict], dev_name: str, client_name: str,
              check_ins: list[dict] | None = None, changes: list[dict] | None = None,
              ledger: list[dict] | None = None, disputes: list[dict] | None = None) -> list[dict]:
    titles = {m["id"]: m["title"] for m in c["milestones"]}
    feed: list[dict] = []

    def add(at: str | None, kind: str, text: str, who: str | None = None, milestone: str | None = None):
        if at:
            feed.append({"at": at, "kind": kind, "text": text, "who": who, "milestone_id": milestone})

    add(c.get("client_approved_at"), "signed", f"{client_name} signed the contract", "client")
    add(c.get("developer_approved_at"), "signed", f"{dev_name} signed the contract", "developer")
    add(c.get("started_at"), "started", "Work started", None)
    for s in subs:
        ms = titles.get(s["milestone_id"], s["milestone_id"])
        add(s["created_at"], "submitted", f"{dev_name} submitted {ms} for verification", "developer", s["milestone_id"])
        counts = (s.get("report") or {}).get("counts")
        if counts and s["status"] != "verifying":
            add(s["updated_at"], "verified",
                f"Verification Agent: {counts['met']} met, {counts['not_met']} not met, {counts['unverifiable']} to check by hand",
                None, s["milestone_id"])
        if s["status"] == "approved":
            add(s["updated_at"], "approved", f"{client_name} approved {ms} and released payment", "client", s["milestone_id"])
        if s["status"] == "changes_requested":
            add(s["updated_at"], "changes", f"{client_name} requested changes on {ms}", "client", s["milestone_id"])
    for t in tasks:
        if t["done"] and t.get("done_at"):
            add(t["done_at"], "task", f"Completed task: {t['title']}", None, t["milestone_id"])
    for cm in comments:
        add(cm["created_at"], "comment", cm["body"], cm["author_role"], cm.get("milestone_id"))
        if cm.get("pinned") and cm.get("pinned_at"):
            add(cm["pinned_at"], "decision", f"Pinned as a decision: {cm['body'][:140]}", None, cm.get("milestone_id"))
    for k in check_ins or []:
        add(k["created_at"], "checkin", f"{dev_name} posted a weekly check-in", "developer")
        if k.get("acknowledged_at"):
            add(k["acknowledged_at"], "ack", f"{client_name} acknowledged the check-in", "client")
    for x in changes or []:
        who = client_name if x["requested_role"] == "client" else dev_name
        add(x["created_at"], "change", f"{who} requested a change: {x['title']}", x["requested_role"])
        if x["status"] == "approved":
            add(x.get("applied_at"), "amended", f"Contract amended: {x['title']} (+${int(x['price_delta']):,}, +{int(x['weeks_delta'])} weeks)", None)
    for e in ledger or []:
        amt = f"${float(e['amount']):,.0f}"
        text = {
            "fund": f"{client_name} funded {e['milestone_id']}: {amt} held in escrow",
            "release": f"{amt} released to {dev_name} for {e['milestone_id']}",
            "refund": f"{amt} returned to {client_name} from {e['milestone_id']}",
        }[e["kind"]]
        add(e["created_at"], e["kind"], text, "client" if e["kind"] == "fund" else None, e["milestone_id"])
    for x in disputes or []:
        add(x["created_at"], "dispute", f"{client_name if x['opened_role'] == 'client' else dev_name} asked the Mediator Agent about {x['milestone_id']}",
            x["opened_role"], x["milestone_id"])
        if x["status"] == "resolved":
            add(x["updated_at"], "resolved", x.get("outcome") or "Dispute resolved", None, x["milestone_id"])
    feed.sort(key=lambda e: e["at"], reverse=True)
    return feed[:80]


@router.get("/contracts/{cid}/workspace")
def workspace(cid: str, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    f_tasks = pool.submit(lambda: db().table("milestone_tasks").select("*").eq("contract_id", cid).order("position").order("created_at").execute().data or [])
    f_comments = pool.submit(lambda: db().table("project_comments").select("*").eq("contract_id", cid).order("created_at").execute().data or [])
    f_subs = pool.submit(lambda: db().table("milestone_submissions").select("*").eq("contract_id", cid).order("created_at", desc=True).execute().data or [])
    f_dev = pool.submit(developer_row, id=c["developer_id"])
    f_client = pool.submit(one, "profiles", id=c["client_id"])
    f_checks = pool.submit(lambda: db().table("check_ins").select("created_at,acknowledged_at").eq("contract_id", cid).order("created_at", desc=True).execute().data or [])
    f_changes = pool.submit(lambda: db().table("change_requests").select("id,title,status,requested_role,price_delta,weeks_delta,client_approved_at,developer_approved_at,created_at,applied_at").eq("contract_id", cid).execute().data or [])
    f_ledger = pool.submit(escrow.entries, cid)
    f_disputes = pool.submit(lambda: db().table("disputes").select("id,milestone_id,status,opened_role,outcome,client_accepted_at,developer_accepted_at,created_at,updated_at").eq("contract_id", cid).execute().data or [])
    f_read = pool.submit(lambda: db().table("message_reads").select("last_read_at").eq("contract_id", cid).eq("user_id", user.id).execute().data or [])
    tasks, comments, subs = f_tasks.result(), f_comments.result(), f_subs.result()
    dev, client = f_dev.result(), (f_client.result() or {})
    checks, read, changes = f_checks.result(), f_read.result(), f_changes.result()
    ledger, disputes = f_ledger.result(), f_disputes.result()
    money = escrow.balances(c["milestones"], ledger)
    schedule = build_schedule(c, tasks)
    schedule["paid"] = money["released"]
    last_read = read[0]["last_read_at"] if read else None
    unread = sum(1 for m in comments if m["author_role"] != side and (last_read is None or m["created_at"] > last_read))
    return {
        "contract": c,
        "side": side,
        "developer": public_developer(dev),
        "client_name": client.get("full_name"),
        "schedule": schedule,
        "escrow": money,
        "tasks": tasks,
        "comments": comments,
        "submissions": subs,
        "activity": _activity(c, subs, comments, tasks, dev["full_name"], client.get("full_name") or "The founder", checks, changes, ledger, disputes),
        "unread_messages": unread,
        "check_in_due": check_in_due(c, checks[0]["created_at"] if checks else None),
        "changes_waiting": sum(1 for x in changes if waiting_on(x, side)),
        "disputes": [{k: x[k] for k in ("id", "milestone_id", "status", "opened_role")} for x in disputes
                     if x["status"] in ("awaiting_response", "mediating", "proposed")],
        "disputes_waiting": sum(1 for x in disputes if (x["status"] == "awaiting_response" and x["opened_role"] != side)
                                or (x["status"] == "proposed" and not x.get(f"{side}_accepted_at"))),
    }


# ---------------- tasks ----------------
class TaskBody(BaseModel):
    milestone_id: str
    title: str = Field(min_length=1, max_length=200)


@router.post("/contracts/{cid}/tasks")
def add_task(cid: str, body: TaskBody, user: User = Depends(current_user)):
    c, _ = _contract(cid, user)
    if body.milestone_id not in {m["id"] for m in c["milestones"]}:
        raise HTTPException(422, "Unknown milestone")
    n = len(db().table("milestone_tasks").select("id").eq("contract_id", cid).eq("milestone_id", body.milestone_id).execute().data or [])
    return db().table("milestone_tasks").insert({
        "contract_id": cid, "milestone_id": body.milestone_id, "title": body.title.strip(), "position": n, "created_by": user.id,
    }).execute().data[0]


class TaskPatch(BaseModel):
    done: bool | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)


def _task(tid: str, user: User) -> dict:
    t = one("milestone_tasks", id=tid)
    if not t:
        raise HTTPException(404, "Task not found")
    _contract(t["contract_id"], user)
    return t


@router.patch("/tasks/{tid}")
def update_task(tid: str, body: TaskPatch, user: User = Depends(current_user)):
    _task(tid, user)
    updates: dict = {}
    if body.title is not None:
        updates["title"] = body.title.strip()
    if body.done is not None:
        updates.update(done=body.done, done_by=user.id if body.done else None, done_at=now_iso() if body.done else None)
    if not updates:
        raise HTTPException(422, "Nothing to update")
    return db().table("milestone_tasks").update(updates).eq("id", tid).execute().data[0]


@router.delete("/tasks/{tid}")
def delete_task(tid: str, user: User = Depends(current_user)):
    _task(tid, user)
    db().table("milestone_tasks").delete().eq("id", tid).execute()
    return {"ok": True}


# ---------------- comments ----------------
class CommentBody(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    milestone_id: str | None = None


@router.post("/contracts/{cid}/comments")
def add_comment(cid: str, body: CommentBody, user: User = Depends(current_user)):
    c, side = _contract(cid, user)
    if body.milestone_id and body.milestone_id not in {m["id"] for m in c["milestones"]}:
        raise HTTPException(422, "Unknown milestone")
    return db().table("project_comments").insert({
        "contract_id": cid, "milestone_id": body.milestone_id, "author_id": user.id,
        "author_role": side, "author_name": user.full_name, "body": body.body.strip(),
    }).execute().data[0]


# ---------------- global views ----------------
@router.get("/work")
def my_work(user: User = Depends(current_user)):
    """Every contract the user is party to, with its schedule: powers 'My work' and 'Portfolio'."""
    dev = developer_row(user_id=user.id)
    q = db().table("contracts").select("*").order("created_at", desc=True)
    contracts = (q.eq("developer_id", dev["id"]) if dev else q.eq("client_id", user.id)).execute().data or []
    if not contracts:
        return []
    ids = [c["id"] for c in contracts]
    tasks = db().table("milestone_tasks").select("contract_id,milestone_id,done").in_("contract_id", ids).execute().data or []
    ledger = db().table("escrow_entries").select("contract_id,milestone_id,kind,amount").in_("contract_id", ids).execute().data or []
    dev_ids = list({c["developer_id"] for c in contracts})
    devs = {d["id"]: d["full_name"] for d in db().table("developers").select("id,full_name").in_("id", dev_ids).execute().data or []}
    client_ids = list({c["client_id"] for c in contracts})
    clients = {p["id"]: p["full_name"] for p in db().table("profiles").select("id,full_name").in_("id", client_ids).execute().data or []}
    out = []
    for c in contracts:
        money = escrow.balances(c["milestones"], [e for e in ledger if e["contract_id"] == c["id"]])
        out.append({
            "contract_id": c["id"], "project_id": c["project_id"], "title": c["title"], "status": c["status"],
            "developer_name": devs.get(c["developer_id"]), "client_name": clients.get(c["client_id"]),
            "schedule": {**build_schedule(c, [t for t in tasks if t["contract_id"] == c["id"]]), "paid": money["released"]},
            "escrow": {k: money[k] for k in ("held", "released", "to_fund")},
        })
    return out
