"""Contract builder: turns the agreed offer + Build Plan into milestone contract terms.

Deliberately deterministic: every number in the contract comes from the guarded, agreed offer,
never from free LLM text.
"""
from __future__ import annotations


def build_contract(project: dict, dev: dict, offer: dict) -> dict:
    plan = project["plan"]
    lines = {l["milestone_id"]: l for l in offer["lines"]}
    milestones = []
    for m in plan["milestones"]:
        line = lines.get(m["id"])
        if not line or not line["included"]:
            continue
        milestones.append({
            "id": m["id"],
            "title": m["title"],
            "goal": m["goal"],
            "deliverables": m["deliverables"],
            "acceptance_criteria": m["acceptance_criteria"],
            "price": line["price"],
            "weeks": line["weeks"],
            "status": "pending",
        })
    excluded = [m["title"] for m in plan["milestones"] if not lines.get(m["id"], {}).get("included")]
    return {
        "title": plan["title"],
        "summary": (
            f"{dev['full_name']} will build {plan['title']} in {len(milestones)} milestones over "
            f"{offer['timeline_weeks']} weeks for a fixed ${offer['total_price']:,}. Each milestone is paid "
            f"when the founder approves it against its acceptance criteria."
        ),
        "total_price": offer["total_price"],
        "timeline_weeks": offer["timeline_weeks"],
        "milestones": milestones,
        "terms": {
            "payment": "Per milestone, released on client approval of the milestone's acceptance criteria.",
            "revisions_per_milestone": offer["revisions_per_milestone"],
            "start_in_days": offer["start_in_days"],
            "change_requests": "Scope changes are re-negotiated by both agents and require both parties' approval.",
            "ip": "All code and assets transfer to the client once each milestone is paid.",
            "verification": "Deliverables are submitted as a live URL and/or public repository and checked by the Verification Agent before client review.",
            "excluded_scope": excluded + plan.get("out_of_scope", []),
        },
    }
