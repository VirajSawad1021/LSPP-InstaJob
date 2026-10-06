"""Capture a real negotiation run into scripts/demo_fixture.json for the guided demo.

    python -m scripts.demo_capture <project_id>

Keeps the project, its Build Plan, matches and every agent negotiation up to the moment the
offers were ready (before the founder chose), so `scripts.demo` can replay it instantly.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from app.db import db, one

OUT = Path(__file__).resolve().parents[1] / "app" / "services" / "demo_fixture.json"
STOP = ("The founder selected", "The founder chose another")


def main(pid: str) -> None:
    p = one("projects", id=pid)
    devs = {d["id"]: d["full_name"] for d in db().table("developers").select("id,full_name").execute().data}
    matches = db().table("matches").select("*").eq("project_id", pid).execute().data or []
    negs = db().table("negotiations").select("*").eq("project_id", pid).execute().data or []
    out = {
        "project": {k: p[k] for k in ("raw_idea", "title", "questions", "budget_max", "deadline_weeks", "plan")},
        "embedding": p["embedding"],
        "matches": [{"developer": devs[m["developer_id"]], **{k: m[k] for k in ("score", "breakdown", "reasons", "concerns", "initiated_by")}} for m in matches],
        "negotiations": [],
    }
    for n in negs:
        if not n.get("agreed_offer") and n["status"] not in ("impasse",):
            continue
        evs = db().table("negotiation_events").select("actor,kind,content,offer,audience").eq("negotiation_id", n["id"]).order("seq").execute().data
        evs = [e for e in evs if not e["content"].startswith(STOP)]
        out["negotiations"].append({
            "developer": devs[n["developer_id"]],
            "status": "agreed" if n.get("agreed_offer") else n["status"],
            **{k: n[k] for k in ("round", "max_rounds", "latest_offer", "agreed_offer", "outcome_summary", "steering")},
            "events": evs,
        })
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"captured {p['title']}: {len(out['matches'])} matches, {len(out['negotiations'])} negotiations -> {OUT.name}")
    for n in out["negotiations"]:
        print(f"  {n['developer']}: {n['status']} | {n['outcome_summary']} | {len(n['events'])} events")


if __name__ == "__main__":
    main(sys.argv[1])
