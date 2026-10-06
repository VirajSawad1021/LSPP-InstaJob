"""End-to-end run of the full product through the real HTTP API (backend must be running).

    python -m scripts.e2e

Signs in as the demo founder and the demo developer, then walks the whole flow:
idea -> questions -> Build Plan -> publish/match -> parallel negotiations -> select ->
contract -> developer signs -> Proof of Done submission -> verification -> approval.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import httpx
from supabase import create_client

from app.config import SUPABASE_URL
from scripts.seed import DEMO_PASSWORD

API = os.environ.get("API_URL", "http://localhost:8000")
IDEA = (
    "A booking app for home tutors in Kathmandu. Parents search tutors by subject and area, "
    "book weekly sessions and pay online. Tutors manage their schedule and see upcoming sessions."
)


def publishable_key() -> str:
    for line in (Path(__file__).resolve().parents[2] / ".env.local").read_text().splitlines():
        if line.startswith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("publishable key not found in .env.local")


def login(email: str) -> httpx.Client:
    sb = create_client(SUPABASE_URL, publishable_key())
    s = sb.auth.sign_in_with_password({"email": email, "password": DEMO_PASSWORD}).session
    return httpx.Client(base_url=API, headers={"Authorization": f"Bearer {s.access_token}"}, timeout=180)


def call(c: httpx.Client, method: str, path: str, **kw):
    for attempt in range(3):  # tolerate a dropped keep-alive connection on idempotent polls
        try:
            r = c.request(method, path, **kw)
            break
        except httpx.RemoteProtocolError:
            if method != "GET" or attempt == 2:
                raise
            time.sleep(1)
    if r.status_code >= 400:
        raise SystemExit(f"{method} {path} -> {r.status_code}: {r.text[:500]}")
    return r.json()


def step(msg: str) -> float:
    print(f"\n=== {msg}")
    return time.time()


def main() -> None:
    founder = login("founder@instajob.demo")
    ayam = login("ayam@instajob.demo")

    t = step("1. Requirements Agent: clarifying questions")
    p = call(founder, "POST", "/api/projects", json={"idea": IDEA})
    for q in p["questions"]:
        print(f"  Q: {q['question']}  options={q['options']}")
    print(f"  ({time.time() - t:.1f}s)")

    t = step("2. Requirements Agent: Build Plan")
    answers = [q["options"][0] for q in p["questions"]]
    p = call(founder, "POST", f"/api/projects/{p['id']}/plan", json={"answers": answers, "budget_max": 2800, "deadline_weeks": 6})
    for m in p["plan"]["milestones"]:
        print(f"  {m['id']} [{m['priority']}] {m['title']} ~{m['est_hours']}h  criteria={len(m['acceptance_criteria'])}")
    print(f"  skills={p['plan']['required_skills']}")
    print(f"  estimate={p['estimate']}  ({time.time() - t:.1f}s)")
    pid = p["id"]

    t = step("3. Publish + matching")
    d = call(founder, "POST", f"/api/projects/{pid}/publish")
    for m in d["matches"]:
        print(f"  {m['score']:>3}  {m['developer']['full_name']:<16} reasons={m['reasons'][:2]} concerns={m['concerns'][:1]}")
    print(f"  ({time.time() - t:.1f}s)")
    names = {m["developer_id"]: m["developer"]["full_name"] for m in d["matches"]}
    picks = [m["developer_id"] for m in d["matches"][:3]]
    ayam_id = next((i for i, n in names.items() if n.startswith("Ayam")), None)
    if ayam_id and ayam_id not in picks:
        picks[-1] = ayam_id

    t = step(f"4. Negotiating in parallel with: {', '.join(names[i] for i in picks)}")
    call(founder, "POST", f"/api/projects/{pid}/negotiate", json={"developer_ids": picks})
    deadline = time.time() + 600
    while time.time() < deadline:
        d = call(founder, "GET", f"/api/projects/{pid}")
        states = {n["developer"]["full_name"]: (n["status"], n["round"]) for n in d["negotiations"]}
        print(f"  {int(time.time() - t):>4}s {states}")
        if all(s not in ("pending", "running") for s, _ in states.values()):
            break
        time.sleep(8)

    agreed = []
    for n in d["negotiations"]:
        detail = call(founder, "GET", f"/api/negotiations/{n['id']}")
        print(f"\n  --- {n['developer']['full_name']}: {n['status']} | {n['outcome_summary']}")
        print(f"      audit={detail['audit']}  events={len(detail['events'])}")
        for e in detail["events"]:
            offer = f"  [{e['offer']['total_price']} / {e['offer']['timeline_weeks']}w]" if e.get("offer") else ""
            print(f"      {e['seq']:>2} {e['actor']:<15} {e['kind']:<9} {e['content'][:110]}{offer}")
        if n["status"] == "agreed":
            agreed.append(n)
    if not agreed:
        raise SystemExit("\nNo agreements reached")

    step("5. Founder selects a deal")
    chosen = next((n for n in agreed if n["developer_id"] == ayam_id), agreed[0])
    c = call(founder, "POST", f"/api/projects/{pid}/select", json={"negotiation_id": chosen["id"]})
    print(f"  contract {c['id']} status={c['status']} total={c['total_price']} weeks={c['timeline_weeks']}")

    if chosen["developer_id"] != ayam_id:
        print("  (deal went to a demo persona: auto-signed; skipping developer-side steps)")
        return

    step("6. Ayam signs")
    c = call(ayam, "POST", f"/api/contracts/{c['id']}/approve")
    print(f"  status={c['status']} milestones={[m['status'] for m in c['milestones']]}")

    step("7. Escrow: submitting is blocked until the founder funds m1")
    m1 = c["milestones"][0]["id"]
    r = ayam.post(f"/api/contracts/{c['id']}/milestones/{m1}/submit", json={"live_url": "https://nextjs.org"})
    print(f"  unfunded submit -> {r.status_code}: {r.json().get('detail')}")
    assert r.status_code == 409
    esc = call(founder, "POST", f"/api/contracts/{c['id']}/milestones/{m1}/fund")
    print(f"  founder funded m1 -> held ${esc['balances']['held']:,.0f}, still to fund ${esc['balances']['to_fund']:,.0f}")

    t = step("8. Proof of Done: submit m1, Verification Agent checks it")
    call(ayam, "POST", f"/api/contracts/{c['id']}/milestones/{m1}/submit",
         json={"live_url": "https://nextjs.org", "repo_url": "https://github.com/vercel/next-learn", "notes": "Demo submission"})
    for _ in range(40):
        det = call(ayam, "GET", f"/api/contracts/{c['id']}")
        sub = det["submissions"][0]
        if sub["status"] != "verifying":
            break
        time.sleep(3)
    print(f"  status={sub['status']} counts={(sub.get('report') or {}).get('counts')} ({time.time() - t:.1f}s)")
    for chk in (sub.get("report") or {}).get("checks", []):
        print(f"   - {chk['verdict']:<13} {chk['criterion'][:70]}")

    step("9. Founder requests changes")
    det = call(founder, "POST", f"/api/submissions/{sub['id']}/review",
               json={"decision": "changes", "feedback": "Please also add Google login and a dark mode before I approve."})
    print(f"  milestones={[m['status'] for m in det['contract']['milestones']]}")

    t = step("10. Developer disputes; founder answers; Mediator Agent rules")
    x = call(ayam, "POST", f"/api/contracts/{c['id']}/milestones/{m1}/disputes", json={
        "statement": "The submission covers every acceptance criterion for m1. Google login and dark mode were never in the contract; they would be a change request."})
    call(founder, "POST", f"/api/disputes/{x['id']}/respond", json={"statement": "I assumed login and a dark mode were obviously part of a modern app."})
    for _ in range(40):
        x = next(d for d in call(founder, "GET", f"/api/contracts/{c['id']}/disputes")["disputes"] if d["id"] == x["id"])
        if x["status"] not in ("mediating", "awaiting_response"):
            break
        time.sleep(3)
    r = x["ruling"] or {}
    print(f"  status={x['status']} ({time.time() - t:.1f}s) -> {r.get('recommendation')} {r.get('release_percent')}% scope_creep={r.get('scope_creep')}")
    print(f"  summary: {r.get('summary')}")
    for f in r.get("findings", []):
        print(f"   - {f['finding']:<8} {f['criterion'][:70]}")
    for rw in r.get("rework_items", []):
        print(f"   rework: {rw}")

    step("11. Both accept the ruling; escrow settles")
    call(founder, "POST", f"/api/disputes/{x['id']}/accept")
    x = call(ayam, "POST", f"/api/disputes/{x['id']}/accept")
    print(f"  {x['status']}: {x['outcome']}")
    esc = call(founder, "GET", f"/api/contracts/{c['id']}/escrow")
    b = esc["balances"]
    print(f"  escrow: held ${b['held']:,.0f} | released ${b['released']:,.0f} | refunded ${b['refunded']:,.0f}")
    for e in esc["ledger"]:
        print(f"   {e['kind']:<8} {e['milestone_id']} ${float(e['amount']):,.0f}  {e['note'] or ''}")

    step("12. Notifications")
    for who, cl in (("founder", founder), ("developer", ayam)):
        n = call(cl, "GET", "/api/notifications")
        print(f"  {who}: {n['unread']} unread; latest: " + " | ".join(x["title"] for x in n["notifications"][:4]))
    print("\nE2E OK")


if __name__ == "__main__":
    sys.exit(main())
