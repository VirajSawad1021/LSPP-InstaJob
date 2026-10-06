"""Hard limits enforced in code, not in prompts.

An agent's offer is only accepted into the negotiation if it respects its own principal's
limits, and an agent can only accept an offer that respects its principal's limits. So any
agreement satisfies both sides by construction - regardless of what the LLM says, and
regardless of anything the other agent writes (prompt injection can't move a floor).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from app.domain import Offer, OfferLine


@dataclass(frozen=True)
class DeveloperLimits:
    rate_floor: float      # USD/hour
    weekly_hours: int


@dataclass(frozen=True)
class ClientLimits:
    budget_max: float | None
    deadline_weeks: int | None
    must_ids: frozenset[str]


def _hours(plan: dict, ids: set[str]) -> int:
    return sum(m["est_hours"] for m in plan["milestones"] if m["id"] in ids)


def repair(offer: Offer, plan: dict) -> Offer:
    """Make an offer structurally consistent with the plan (never changes a price that was set)."""
    by_id = {}
    for line in offer.lines:
        if line.milestone_id not in by_id:
            by_id[line.milestone_id] = line
    lines = []
    for m in plan["milestones"]:
        line = by_id.get(m["id"]) or OfferLine(milestone_id=m["id"], included=False, price=0, weeks=0)
        if not line.included:
            line = OfferLine(milestone_id=m["id"], included=False, price=0, weeks=0)
        else:
            line = OfferLine(milestone_id=m["id"], included=True, price=max(0, int(line.price)), weeks=max(1, int(line.weeks)))
        lines.append(line)
    return Offer(
        lines=lines,
        revisions_per_milestone=max(0, min(5, int(offer.revisions_per_milestone))),
        start_in_days=max(0, min(60, int(offer.start_in_days))),
        notes=offer.notes[:400],
    )


def structural_violations(offer: Offer) -> list[str]:
    v = []
    if not offer.included_ids():
        v.append("Offer includes no milestones.")
    for line in offer.lines:
        if line.included and line.price <= 0:
            v.append(f"{line.milestone_id} is included but priced at $0.")
    return v


def developer_min_price(plan: dict, ids: set[str], lim: DeveloperLimits) -> int:
    return math.ceil(_hours(plan, ids) * lim.rate_floor)


def developer_min_weeks(plan: dict, ids: set[str], lim: DeveloperLimits) -> int:
    return math.ceil(_hours(plan, ids) / max(1, lim.weekly_hours))


def developer_violations(offer: Offer, plan: dict, lim: DeveloperLimits) -> list[str]:
    v = structural_violations(offer)
    ids = offer.included_ids()
    min_price = developer_min_price(plan, ids, lim)
    if offer.total_price < min_price:
        v.append(
            f"Total ${offer.total_price:,} is below the developer's floor: {_hours(plan, ids)} h x "
            f"${lim.rate_floor:g}/h = ${min_price:,} for the included milestones."
        )
    min_weeks = developer_min_weeks(plan, ids, lim)
    if offer.timeline_weeks < min_weeks:
        v.append(
            f"Timeline {offer.timeline_weeks} weeks is unrealistic: {_hours(plan, ids)} h at "
            f"{lim.weekly_hours} h/week needs at least {min_weeks} weeks."
        )
    return v


def client_violations(offer: Offer, plan: dict, lim: ClientLimits) -> list[str]:
    v = structural_violations(offer)
    missing = sorted(lim.must_ids - offer.included_ids())
    if missing:
        v.append(f"Must-have milestones missing: {', '.join(missing)}.")
    if lim.budget_max and offer.total_price > lim.budget_max:
        v.append(f"Total ${offer.total_price:,} exceeds the client's budget of ${lim.budget_max:,.0f}.")
    if lim.deadline_weeks and offer.timeline_weeks > lim.deadline_weeks:
        v.append(f"Timeline {offer.timeline_weeks} weeks exceeds the client's deadline of {lim.deadline_weeks} weeks.")
    return v


def zone_of_agreement(plan: dict, dev: DeveloperLimits, client: ClientLimits) -> list[str]:
    """Before spending LLM calls: can ANY deal satisfy both sides? Returns blocking reasons."""
    must = set(client.must_ids)
    reasons = []
    min_price = developer_min_price(plan, must, dev)
    if client.budget_max and min_price > client.budget_max:
        reasons.append(
            f"Must-have scope costs at least ${min_price:,} at this developer's floor, "
            f"above the ${client.budget_max:,.0f} budget."
        )
    min_weeks = developer_min_weeks(plan, must, dev)
    if client.deadline_weeks and min_weeks > client.deadline_weeks:
        reasons.append(
            f"Must-have scope needs at least {min_weeks} weeks at {dev.weekly_hours} h/week, "
            f"beyond the {client.deadline_weeks}-week deadline."
        )
    return reasons
