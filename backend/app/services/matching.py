"""Matching: pgvector similarity + deterministic, explainable scoring."""
from __future__ import annotations

import math
import re

WEIGHTS = {"skills": 0.35, "semantic": 0.25, "budget": 0.25, "capacity": 0.15}

_ALIASES = {
    "nextjs": "next.js", "next": "next.js", "reactjs": "react", "react.js": "react",
    "node": "node.js", "nodejs": "node.js", "postgresql": "postgres", "psql": "postgres",
    "ts": "typescript", "js": "javascript", "tailwindcss": "tailwind", "tailwind css": "tailwind",
    "react native": "react-native", "expo": "react-native", "supabase auth": "supabase",
    "stripe payments": "stripe", "stripe api": "stripe", "fast api": "fastapi", "vuejs": "vue", "vue.js": "vue",
    "google maps api": "google maps", "firebase auth": "firebase", "aws s3": "aws",
}


def norm_skill(s: str) -> str:
    s = re.sub(r"\s+", " ", s.strip().lower())
    s = re.sub(r"\s*\(.*?\)", "", s)
    s = _ALIASES.get(s, s)
    # "Khalti API", "Stripe SDK", "eSewa integration" -> the technology itself
    s = re.sub(r"\s+(api|apis|sdk|integration|payments?|gateway)$", "", s)
    return _ALIASES.get(s, s)


def _split(skill: str) -> list[str]:
    """'React / Next.js' -> ['react', 'next.js']; 'PostgreSQL & RLS' -> ['postgres', 'rls']."""
    return [norm_skill(p) for p in re.split(r"\s*(?:/|&|,|\+|\band\b)\s*", skill) if p.strip()]


def skill_overlap(dev_skills: list[str], required: list[str]) -> tuple[float, list[str], list[str]]:
    have = {p for s in dev_skills for p in _split(s)}
    need: list[str] = []
    for s in required:
        parts = _split(s)
        # A compound requirement counts once, satisfied by any of its parts.
        label = next((p for p in parts if p in have), parts[0] if parts else norm_skill(s))
        if label not in need:
            need.append(label)
    if not need:
        return 1.0, [], []
    matched = [s for s in need if s in have]
    missing = [s for s in need if s not in have]
    return len(matched) / len(need), matched, missing


def score_pair(dev: dict, plan: dict, budget_max: float | None, deadline_weeks: int | None, similarity: float) -> dict:
    ms = plan["milestones"]
    hours_all = sum(m["est_hours"] for m in ms)
    hours_must = sum(m["est_hours"] for m in ms if m["priority"] == "must")
    floor = float(dev.get("rate_floor") or 0)
    target = float(dev.get("rate_target") or floor)
    weekly = max(1, int(dev.get("weekly_hours") or 30))

    reasons: list[str] = []
    concerns: list[str] = []

    skills, matched, missing = skill_overlap(dev.get("skills") or [], plan.get("required_skills") or [])
    if matched:
        reasons.append(f"Knows {len(matched)}/{len(matched) + len(missing)} required skills: {', '.join(matched[:5])}")
    if missing:
        concerns.append(f"Missing: {', '.join(missing[:4])}")

    # Gemini cosine similarities cluster around 0.55-0.9; spread them over 0..1.
    semantic = max(0.0, min(1.0, (similarity - 0.55) / 0.3))
    if semantic >= 0.6:
        reasons.append("Past work closely resembles this product")

    cost_must_floor = hours_must * floor
    cost_all_target = hours_all * target
    if not budget_max:
        budget = 0.7
    elif cost_all_target <= budget_max:
        budget = 1.0
        reasons.append(f"Full plan fits budget at their usual rate (~${cost_all_target:,.0f})")
    elif cost_must_floor <= budget_max:
        # Some room to deal: must-haves fit at floor, extras need trading.
        budget = 0.5 + 0.5 * (budget_max - cost_must_floor) / max(1.0, cost_all_target - cost_must_floor)
        reasons.append("Must-have scope fits budget; extras will be negotiated")
    else:
        budget = 0.0
        # Never print the number: it would reveal the developer's private floor (cost / hours).
        concerns.append("Their minimum price for the must-have scope is above your budget")

    weeks_needed = math.ceil(hours_must / weekly)
    if not deadline_weeks or weeks_needed <= deadline_weeks:
        capacity = 1.0
        if deadline_weeks:
            reasons.append(f"Capacity for must-haves in ~{weeks_needed} weeks ({weekly} h/week)")
    else:
        capacity = max(0.0, deadline_weeks / weeks_needed)
        concerns.append(f"Needs ~{weeks_needed} weeks for must-haves at {weekly} h/week")

    raw = (
        WEIGHTS["skills"] * skills
        + WEIGHTS["semantic"] * semantic
        + WEIGHTS["budget"] * budget
        + WEIGHTS["capacity"] * capacity
    )
    return {
        "score": round(raw * 100),
        "breakdown": {
            "skills": round(skills, 3),
            "semantic": round(semantic, 3),
            "similarity_raw": round(similarity, 4),
            "budget": round(budget, 3),
            "capacity": round(capacity, 3),
            "matched_skills": matched,
            "missing_skills": missing,
            "weeks_needed_must": weeks_needed,
            "weights": WEIGHTS,
        },
        "reasons": reasons,
        "concerns": concerns,
    }


def developer_embedding_text(d: dict) -> str:
    projects = "; ".join(
        f"{p.get('name')}: {p.get('what')} ({', '.join(p.get('stack') or [])})" for p in (d.get("shipped_projects") or [])
    )
    ws = d.get("work_style") or {}
    return (
        f"{d.get('headline') or ''}. {d.get('bio') or ''} Skills: {', '.join(d.get('skills') or [])}. "
        f"Shipped: {projects}. Ideal client: {ws.get('ideal_client', '')}."
    )


def plan_embedding_text(plan: dict) -> str:
    ms = "; ".join(f"{m['title']}: {', '.join(m['deliverables'])}" for m in plan["milestones"])
    return (
        f"{plan['title']}. {plan['summary']} Users: {plan.get('target_users', '')}. "
        f"Stack: {', '.join(plan.get('tech_stack') or [])}. Milestones: {ms}"
    )
