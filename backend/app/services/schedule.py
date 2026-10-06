"""Milestone schedule and progress, derived from the contract (no manual planning needed).

Milestones run sequentially: work starts `start_in_days` after the contract is signed, and each
milestone lasts the number of weeks both agents agreed to.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def build_schedule(contract: dict, tasks: list[dict] | None = None, today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    started = _parse(contract.get("started_at"))
    start_in = int((contract.get("terms") or {}).get("start_in_days") or 0)
    cursor = (started.date() + timedelta(days=start_in)) if started else None

    by_ms: dict[str, list[dict]] = {}
    for t in tasks or []:
        by_ms.setdefault(t["milestone_id"], []).append(t)

    items = []
    for m in contract["milestones"]:
        start = cursor
        due = (cursor + timedelta(weeks=int(m["weeks"]))) if cursor else None
        if cursor:
            cursor = due
        ts = by_ms.get(m["id"], [])
        done_tasks = sum(1 for t in ts if t["done"])
        approved = m["status"] == "approved"
        late = bool(due and not approved and due < today)
        items.append({
            "id": m["id"], "title": m["title"], "status": m["status"], "price": m["price"], "weeks": m["weeks"],
            "start_date": start.isoformat() if start else None,
            "due_date": due.isoformat() if due else None,
            "late": late,
            "days_left": (due - today).days if due and not approved else None,
            "tasks_total": len(ts), "tasks_done": done_tasks,
        })

    total = float(contract["total_price"])
    paid = sum(float(m["price"]) for m in contract["milestones"] if m["status"] == "approved")
    approved_n = sum(1 for m in contract["milestones"] if m["status"] == "approved")
    # Progress: approved milestones count fully; the milestone in flight counts by its checklist.
    weight = 0.0
    for it in items:
        if it["status"] == "approved":
            weight += 1
        elif it["status"] == "submitted":
            weight += 0.8
        elif it["status"] == "changes_requested":
            weight += 0.5
        elif it["tasks_total"]:
            weight += 0.7 * it["tasks_done"] / it["tasks_total"]
    progress = round(100 * weight / max(1, len(items)))
    end = items[-1]["due_date"] if items else None
    health = "done" if contract["status"] == "completed" else "late" if any(i["late"] for i in items) else "on_track" if started else "not_started"
    return {
        "milestones": items,
        "progress": progress,
        "paid": paid,
        "total": total,
        "approved": approved_n,
        "count": len(items),
        "end_date": end,
        "health": health,
    }


CHECK_IN_EVERY_DAYS = 7


def check_in_due(contract: dict, last_check_in_at: str | None, now: datetime | None = None) -> bool:
    """A weekly check-in is due once an active contract goes 7 days without one."""
    if contract.get("status") != "active" or not contract.get("started_at"):
        return False
    since = _parse(last_check_in_at or contract["started_at"])
    return (now or datetime.now(timezone.utc)) - since > timedelta(days=CHECK_IN_EVERY_DAYS)
