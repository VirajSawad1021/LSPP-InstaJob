"""Guided demo: rebuild two ready-to-present scenarios for the demo accounts in a few seconds.

  1. Offers ready  - "Kathmandu Tutor Booking Platform": a real run of three agent negotiations
                     (captured in demo_fixture.json), waiting for the founder to choose.
  2. Mid-project   - "Gym Membership CRM" with Ayam: m1 approved and paid, m2 delivered and
                     verified, the founder asked for extras, and the developer has just asked the
                     Mediator Agent. Chat, pinned decision, check-ins, tasks and escrow are in place.

No AI calls: everything is deterministic, so the presenter never waits and the story is the same
every time. The live moments (Mediator ruling, change request pricing, a new idea) run for real.

Only the demo accounts are touched: the demo founder's projects are replaced, and notifications
for the demo founder and demo developer are cleared.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.agents.contract import build_contract
from app.db import db
from app.services.events import _digest

FOUNDER_EMAIL = "founder@instajob.demo"
DEVELOPER_EMAIL = "ayam@instajob.demo"
DEMO_EMAILS = {FOUNDER_EMAIL, DEVELOPER_EMAIL}
FIXTURE = Path(__file__).with_name("demo_fixture.json")

_ids: dict[str, str] = {}
_last_reset = 0.0
MIN_INTERVAL = 20  # seconds between resets


def _now() -> datetime:
    return datetime.now(timezone.utc)


def ago(days: float = 0, hours: float = 0) -> str:
    return (_now() - timedelta(days=days, hours=hours)).isoformat()


def demo_ids() -> dict[str, str]:
    """User ids of the demo founder and demo developer (cached)."""
    if not _ids:
        for u in db().auth.admin.list_users(per_page=1000):
            if u.email == FOUNDER_EMAIL:
                _ids["founder"] = u.id
            elif u.email == DEVELOPER_EMAIL:
                _ids["developer_user"] = u.id
        if len(_ids) < 2:
            raise RuntimeError("Demo accounts are missing. Run: python -m scripts.seed")
        _ids["developer"] = db().table("developers").select("id").eq("user_id", _ids["developer_user"]).limit(1).execute().data[0]["id"]
    return _ids


def is_demo_user(user_id: str) -> bool:
    try:
        ids = demo_ids()
    except Exception:  # noqa: BLE001
        return False
    return user_id in (ids["founder"], ids["developer_user"])


def _events(nid: str, evs: list[dict], start: datetime, step_minutes: float = 1.5) -> None:
    """Write a negotiation log with a valid hash chain."""
    prev, rows = None, []
    for i, e in enumerate(evs, start=1):
        audience = e.get("audience", "all")
        h = _digest(prev, i, e["actor"], e["kind"], e["content"], e.get("offer"), audience)
        rows.append({
            "negotiation_id": nid, "seq": i, "actor": e["actor"], "kind": e["kind"], "content": e["content"],
            "offer": e.get("offer"), "audience": audience, "prev_hash": prev, "hash": h,
            "created_at": (start + timedelta(minutes=step_minutes * i)).isoformat(),
        })
        prev = h
    if rows:
        db().table("negotiation_events").insert(rows).execute()


def _offer(lines: list[tuple[str, bool, int, int]], revisions: int, start: int, notes: str) -> dict:
    ls = [{"milestone_id": m, "included": inc, "price": p if inc else 0, "weeks": w if inc else 0} for m, inc, p, w in lines]
    return {
        "lines": ls, "revisions_per_milestone": revisions, "start_in_days": start, "notes": notes,
        "total_price": sum(x["price"] for x in ls if x["included"]),
        "timeline_weeks": sum(x["weeks"] for x in ls if x["included"]),
    }


# ---------------- scenario 1: offers ready ----------------
def _offers_ready(founder: str) -> str:
    fx = json.loads(FIXTURE.read_text(encoding="utf-8"))
    devs = {d["full_name"]: d["id"] for d in db().table("developers").select("id,full_name").execute().data}
    p = db().table("projects").insert({
        **fx["project"], "client_id": founder, "status": "negotiating", "embedding": fx["embedding"],
        "created_at": ago(hours=3), "updated_at": ago(hours=1),
    }).execute().data[0]
    match_ids = {}
    for m in fx["matches"]:
        if m["developer"] in devs:
            row = db().table("matches").insert({
                "project_id": p["id"], "developer_id": devs[m["developer"]],
                **{k: m[k] for k in ("score", "breakdown", "reasons", "concerns", "initiated_by")},
            }).execute().data[0]
            match_ids[m["developer"]] = row["id"]
    for i, n in enumerate(fx["negotiations"]):
        if n["developer"] not in devs:
            continue
        start = _now() - timedelta(minutes=70 - i * 4)
        row = db().table("negotiations").insert({
            "project_id": p["id"], "developer_id": devs[n["developer"]], "match_id": match_ids.get(n["developer"]),
            **{k: n[k] for k in ("status", "round", "max_rounds", "latest_offer", "agreed_offer", "outcome_summary", "steering")},
            "created_at": start.isoformat(), "updated_at": (start + timedelta(minutes=12)).isoformat(),
        }).execute().data[0]
        _events(row["id"], n["events"], start)
    return p["id"]


# ---------------- scenario 2: mid-project, dispute waiting for the founder ----------------
GYM_PLAN = {
    "title": "Gym Membership CRM",
    "target_users": "Owners and front-desk staff of small gyms",
    "summary": "A web dashboard where gym owners manage members, log payments and see who is due for renewal. "
               "Members get automatic WhatsApp reminders a few days before their membership expires.",
    "tech_stack": ["Next.js", "Supabase", "Tailwind", "WhatsApp Cloud API"],
    "required_skills": ["Next.js", "Supabase", "Postgres", "Tailwind", "WhatsApp Cloud API"],
    "milestones": [
        {"id": "m1", "title": "Member directory & plans", "goal": "Staff can add members and assign membership plans.",
         "deliverables": ["Deployed member list with search", "Plan management"],
         "acceptance_criteria": ["Visiting /members lists members with a search box", "Creating a member with a plan shows their expiry date"],
         "est_hours": 24, "priority": "must"},
        {"id": "m2", "title": "Payments & renewals", "goal": "Staff can log payments and see renewals due this week.",
         "deliverables": ["Payment log", "Renewals-due view"],
         "acceptance_criteria": ["Logging a payment extends the member's expiry date", "/renewals lists members expiring in the next 7 days"],
         "est_hours": 20, "priority": "must"},
        {"id": "m3", "title": "WhatsApp reminders", "goal": "Members automatically get a reminder before expiry.",
         "deliverables": ["Scheduled reminder job", "Message template"],
         "acceptance_criteria": ["A member expiring in 3 days receives a WhatsApp message in the sandbox", "Reminder history is visible per member"],
         "est_hours": 22, "priority": "should"},
        {"id": "m4", "title": "Revenue dashboard", "goal": "Owners see monthly revenue and churn.",
         "deliverables": ["Dashboard with two charts"],
         "acceptance_criteria": ["/dashboard shows monthly revenue for the last 6 months"], "est_hours": 12, "priority": "nice"},
    ],
    "risks": [{"risk": "WhatsApp business verification can take days", "mitigation": "Build against the sandbox number; start verification in week 1"}],
    "assumptions": ["Payments are logged manually, not processed online"],
    "out_of_scope": ["Mobile app for members", "Online card payments"],
}

LIVE = "https://gym-crm-demo.vercel.app"
REPO = "https://github.com/ayam-shrestha/gym-crm"


def _report(checks: list[tuple[str, str, str]], summary: str, nxt: str) -> dict:
    counts = {k: sum(1 for c in checks if c[1] == k) for k in ("met", "not_met", "unverifiable")}
    return {
        "checks": [{"criterion": c, "verdict": v, "evidence": e} for c, v, e in checks],
        "summary": summary, "suggested_next_step": nxt, "counts": counts,
        "evidence_summary": {
            "live_site": {"url": LIVE, "status": 200, "ms": 412, "title": "GymDesk", "is_https": True, "error": None},
            "repository": {"repo": "ayam-shrestha/gym-crm", "language": "TypeScript", "recent_commits": 23, "pushed_at": ago(hours=21), "error": None},
        },
    }


def _mid_project(founder: str, dev_id: str, dev_user: str) -> str:
    dev = db().table("developers").select("id,full_name,headline").eq("id", dev_id).limit(1).execute().data[0]
    project = db().table("projects").insert({
        "client_id": founder, "raw_idea": "A CRM for my gym in Kathmandu to track members, renewals and payments, with WhatsApp reminders before memberships expire.",
        "title": GYM_PLAN["title"], "status": "in_progress", "questions": [], "budget_max": 2200, "deadline_weeks": 7,
        "plan": GYM_PLAN, "created_at": ago(days=19), "updated_at": ago(days=17),
    }).execute().data[0]

    opening = _offer([("m1", True, 760, 2), ("m2", True, 640, 2), ("m3", True, 700, 2), ("m4", True, 360, 1)], 2, 2,
                     "Full plan at my usual rate.")
    counter = _offer([("m1", True, 650, 2), ("m2", True, 560, 2), ("m3", True, 620, 2), ("m4", False, 0, 0)], 2, 2,
                     "Defer the nice-to-have dashboard; tighten m1-m3.")
    final = _offer([("m1", True, 700, 2), ("m2", True, 600, 2), ("m3", True, 650, 2), ("m4", False, 0, 0)], 2, 2,
                   "Middle ground on m1-m3, dashboard deferred.")
    neg = db().table("negotiations").insert({
        "project_id": project["id"], "developer_id": dev_id, "status": "selected", "round": 4, "max_rounds": 8,
        "latest_offer": final, "agreed_offer": final,
        "outcome_summary": "Agreed: $1,950 for m1, m2, m3 in 6 weeks.", "created_at": ago(days=18), "updated_at": ago(days=17),
    }).execute().data[0]
    _events(neg["id"], [
        {"actor": "system", "kind": "status", "content": f"Negotiation opened between the founder's agent and {dev['full_name']}'s agent."},
        {"actor": "developer_agent", "kind": "offer", "offer": opening,
         "content": "I shipped membership and payment flows for a Kathmandu tutoring startup, so this maps closely. Full plan: $2,460 over 7 weeks."},
        {"actor": "client_agent", "kind": "offer", "offer": counter,
         "content": "Budget is $2,200 and m4 is a nice-to-have. Proposing we defer it; 24 h for a searchable member list looks generous. $1,830 for m1-m3."},
        {"actor": "developer_agent", "kind": "offer", "offer": final,
         "content": "Fine to defer m4. Meeting you in the middle on m1-m3: $1,950 in 6 weeks, 2 revisions each."},
        {"actor": "client_agent", "kind": "accept", "offer": final,
         "content": "$1,950 for all must and should scope in 6 weeks leaves room in the budget. Accepted."},
        {"actor": "system", "kind": "status", "content": "Agreed: $1,950 for m1, m2, m3 in 6 weeks. Awaiting the founder's choice."},
        {"actor": "system", "kind": "status", "content": "The founder selected this deal. Contract drafted and signed by the founder."},
    ], _now() - timedelta(days=18), step_minutes=2)

    c = build_contract(project, dev, final)
    ms = c["milestones"]
    ms[0]["status"], ms[1]["status"], ms[2]["status"] = "approved", "changes_requested", "pending"
    contract = db().table("contracts").insert({
        **c, "milestones": ms, "project_id": project["id"], "negotiation_id": neg["id"], "developer_id": dev_id, "client_id": founder,
        "status": "active", "client_approved_at": ago(days=17), "developer_approved_at": ago(days=16.9), "started_at": ago(days=16.9),
        "created_at": ago(days=17), "updated_at": ago(hours=3),
    }).execute().data[0]
    cid = contract["id"]

    # Proof of Done: m1 approved, m2 verified but sent back with extra requests
    db().table("milestone_submissions").insert({
        "contract_id": cid, "milestone_id": "m1", "live_url": LIVE, "repo_url": REPO, "notes": "Search works on name and phone number.",
        "status": "approved", "client_feedback": "Great, the staff love the phone search.",
        "report": _report([
            (ms[0]["acceptance_criteria"][0], "met", "The /members page renders a table of 42 members with a search input that filters by name and phone."),
            (ms[0]["acceptance_criteria"][1], "met", "Creating 'Test Member' on the 3-month plan shows an expiry date 90 days after today on the profile."),
        ], "Both acceptance criteria are met on the live site. The member directory and plans work as described.", "Approve and release payment."),
        "created_at": ago(days=3), "updated_at": ago(days=2),
    }).execute()
    sub2 = db().table("milestone_submissions").insert({
        "contract_id": cid, "milestone_id": "m2", "live_url": f"{LIVE}/renewals", "repo_url": REPO,
        "notes": "Payments extend expiry by 30 days x months paid (per our pinned decision).",
        "status": "changes_requested",
        "client_feedback": "The renewals page works. Before I approve, please add Google sign-in for my staff and an Excel export of all payments.",
        "report": _report([
            (ms[1]["acceptance_criteria"][0], "met", "Logging a 1-month payment for 'Sita Gurung' moved her expiry from Oct 2 to Nov 1 on the member page."),
            (ms[1]["acceptance_criteria"][1], "met", "/renewals lists 6 members, all with expiry dates within the next 7 days, sorted by date."),
        ], "Both acceptance criteria for payments and renewals are met on the live site.", "The founder can approve and release payment."),
        "created_at": ago(hours=22), "updated_at": ago(hours=18),
    }).execute().data[0]

    # Escrow: m1 funded then released, m2 funded and held, m3 not yet funded
    db().table("escrow_entries").insert([
        {"contract_id": cid, "milestone_id": "m1", "kind": "fund", "amount": 700, "actor_id": founder, "note": "Milestone funded", "created_at": ago(days=16.8)},
        {"contract_id": cid, "milestone_id": "m1", "kind": "release", "amount": 700, "actor_id": founder, "note": "Released on approval", "created_at": ago(days=2)},
        {"contract_id": cid, "milestone_id": "m2", "kind": "fund", "amount": 600, "actor_id": founder, "note": "Milestone funded", "created_at": ago(days=2, hours=-0.1)},
    ]).execute()

    # Shared checklist
    tasks = [("m1", "Member table with search", True, 12), ("m1", "Plans and expiry calculation", True, 10), ("m1", "Deploy preview", True, 9),
             ("m2", "Payment log form", True, 2.5), ("m2", "Extend expiry on payment", True, 2.2), ("m2", "Renewals-due view", True, 1.5),
             ("m3", "Apply for WhatsApp sandbox number", False, 0), ("m3", "Reminder message template in Nepali and English", False, 0)]
    db().table("milestone_tasks").insert([
        {"contract_id": cid, "milestone_id": m, "title": t, "done": d, "position": i, "created_by": dev_user,
         "done_by": dev_user if d else None, "done_at": ago(days=dd) if d else None, "created_at": ago(days=16)}
        for i, (m, t, d, dd) in enumerate(tasks)
    ]).execute()

    # Conversation, with one pinned decision
    fn, dn = "Aakriti Joshi", dev["full_name"]
    msgs = [
        ("client", fn, "Welcome aboard! Our front desk runs on Excel today, so simple beats clever.", None, 16.8, False),
        ("developer", dn, "Thanks Aakriti! Starting on the member directory (#m1). Do memberships renew on a fixed date each month, or 30 days from payment?", None, 16.7, False),
        ("client", fn, "Decision: expiry is 30 days × months paid, counted from the payment date. Some members prepay 3 months.", None, 16.5, True),
        ("developer", dn, "#m1 is live on the preview link. Search works on name and phone number.", "m1", 10, False),
        ("client", fn, "Approved #m1, the staff love the phone search.", "m1", 2, False),
        ("developer", dn, "#m2 is up: payments extend expiry and /renewals shows who is due in the next 7 days. Submitted for verification.", "m2", 0.92, False),
        ("client", fn, "Thanks! Before approving I'd like Google sign-in for staff and an Excel export of payments.", "m2", 0.76, False),
        ("developer", dn, "Those weren't part of #m2. I've asked the Mediator Agent to look at it, and I'm happy to price them as a change request.", "m2", 0.13, False),
    ]
    rows = []
    for role, name, body, mid, d, pinned in msgs:
        rows.append({
            "contract_id": cid, "milestone_id": mid, "author_id": founder if role == "client" else dev_user, "author_role": role,
            "author_name": name, "body": body, "attachments": [], "pinned": pinned,
            "pinned_by": founder if pinned else None, "pinned_at": ago(days=d - 0.01) if pinned else None, "created_at": ago(days=d),
        })
    db().table("project_comments").insert(rows).execute()
    db().table("message_reads").upsert([
        {"contract_id": cid, "user_id": founder, "last_read_at": ago(hours=18)},
        {"contract_id": cid, "user_id": dev_user, "last_read_at": ago(hours=3)},
    ], on_conflict="contract_id,user_id").execute()

    # Weekly check-ins
    db().table("check_ins").insert([
        {"contract_id": cid, "author_id": dev_user, "ai_drafted": True, "created_at": ago(days=9), "acknowledged_at": ago(days=8.5),
         "done": "- Member table with search on name and phone\n- Plans with expiry calculation", "next": "- Deploy m1 preview\n- Start payment log (m2)",
         "blockers": "", "needs": "- Sample member list (anonymised) to test search"},
        {"contract_id": cid, "author_id": dev_user, "ai_drafted": True, "created_at": ago(days=2), "acknowledged_at": None,
         "done": "- m1 approved and paid\n- Payment log and expiry extension\n- Renewals-due view", "next": "- Submit m2\n- Apply for the WhatsApp sandbox number (m3)",
         "blockers": "- WhatsApp business verification can take a few days", "needs": "- Fund m3 when m2 is approved"},
    ]).execute()

    # The dispute the presenter answers live
    db().table("disputes").insert({
        "contract_id": cid, "milestone_id": "m2", "submission_id": sub2["id"], "opened_by": dev_user, "opened_role": "developer",
        "developer_statement": "Both m2 criteria are verified as met on the live site. Google sign-in and an Excel export were never part of m2 "
                               "or any milestone. I'm happy to build them, priced as a change request.",
        "status": "awaiting_response", "created_at": ago(hours=3), "updated_at": ago(hours=3),
    }).execute()

    note = lambda uid, kind, title, body, tab, h, read=False: {  # noqa: E731
        "user_id": uid, "contract_id": cid, "kind": kind, "title": title, "body": body,
        "link": f"/contracts/{cid}?tab={tab}", "created_at": ago(hours=h), "read_at": ago(hours=h - 0.5) if read else None,
    }
    db().table("notifications").insert([
        note(founder, "checkin", "New weekly check-in on Gym Membership CRM", "m1 approved and paid", "checkins", 48),
        note(founder, "message", f"{dn} sent a message", msgs[-1][2], "messages", 3),
        note(founder, "dispute_opened", "The developer asked the Mediator Agent about m2",
             "Give your side of the story, then the Mediator proposes a fair outcome.", "contract", 3),
        note(dev_user, "approved", "m1 approved: $700 released to you", "Released on approval", "payments", 48, read=True),
        note(dev_user, "funded", "m2 is funded: $600 held in escrow", "Payments & renewals is secured.", "payments", 47.9, read=True),
        note(dev_user, "changes_requested", "Changes requested on m2", "Please add Google sign-in for my staff and an Excel export of all payments.", "contract", 18),
    ]).execute()
    return cid


def reset() -> dict:
    """Rebuild both scenarios. Rate-limited, and only ever touches the demo accounts."""
    global _last_reset
    wait = MIN_INTERVAL - (time.monotonic() - _last_reset)
    if wait > 0:
        raise RuntimeError(f"The demo was just reset. Try again in {int(wait) + 1} s.")
    _last_reset = time.monotonic()
    ids = demo_ids()
    db().table("projects").delete().eq("client_id", ids["founder"]).execute()  # cascades to negotiations, contracts, ...
    db().table("notifications").delete().in_("user_id", [ids["founder"], ids["developer_user"]]).execute()
    project = _offers_ready(ids["founder"])
    contract = _mid_project(ids["founder"], ids["developer"], ids["developer_user"])
    db().table("notifications").insert({
        "user_id": ids["founder"], "kind": "offers_ready", "title": "Offers ready: 3 agent deals on Kathmandu Tutor Booking Platform",
        "body": "Every offer already satisfies your budget, deadline and must-haves.", "link": f"/client/projects/{project}",
        "created_at": ago(hours=1),
    }).execute()
    return {"project_id": project, "contract_id": contract}


def scenario_links() -> dict:
    """Where each act of the demo starts (after a reset)."""
    ids = demo_ids()
    projects = db().table("projects").select("id,title,status").eq("client_id", ids["founder"]).execute().data or []
    offers = next((p for p in projects if p["title"] == "Kathmandu Tutor Booking Platform"), None)
    gym = next((p for p in projects if p["title"] == GYM_PLAN["title"]), None)
    contracts = db().table("contracts").select("id,project_id,status").eq("client_id", ids["founder"]).execute().data or []
    by_project = {c["project_id"]: c for c in contracts}
    return {
        "ready": bool(offers and gym),
        "offers_project_id": offers["id"] if offers else None,
        "offers_contract_id": (by_project.get(offers["id"]) or {}).get("id") if offers else None,
        "offers_status": offers["status"] if offers else None,
        "gym_contract_id": (by_project.get(gym["id"]) or {}).get("id") if gym else None,
    }
