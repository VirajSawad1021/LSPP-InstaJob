from app.agents.negotiation import guardrails as g
from app.domain import Offer, OfferLine
from app.services.events import _digest, verify_chain
from app.services.matching import score_pair, skill_overlap

PLAN = {
    "milestones": [
        {"id": "m1", "est_hours": 40, "priority": "must"},
        {"id": "m2", "est_hours": 30, "priority": "must"},
        {"id": "m3", "est_hours": 20, "priority": "nice"},
    ],
    "required_skills": ["Next.js", "PostgreSQL", "Stripe"],
}
DEV = g.DeveloperLimits(rate_floor=30, weekly_hours=20)
CLIENT = g.ClientLimits(budget_max=3000, deadline_weeks=5, must_ids=frozenset({"m1", "m2"}))


def offer(prices: dict[str, int], weeks: dict[str, int]) -> Offer:
    return Offer(
        lines=[
            OfferLine(milestone_id=m, included=m in prices, price=prices.get(m, 0), weeks=weeks.get(m, 0))
            for m in ("m1", "m2", "m3")
        ],
        revisions_per_milestone=2, start_in_days=3, notes="",
    )


def test_developer_floor_is_enforced():
    low = offer({"m1": 1000, "m2": 800}, {"m1": 2, "m2": 2})  # 70h * $30 = $2100 floor
    v = g.developer_violations(low, PLAN, DEV)
    assert any("below the developer's floor" in x for x in v)
    ok = offer({"m1": 1200, "m2": 900}, {"m1": 2, "m2": 2})
    assert g.developer_violations(ok, PLAN, DEV) == []


def test_developer_capacity_is_enforced():
    rushed = offer({"m1": 1200, "m2": 900}, {"m1": 1, "m2": 1})  # 70h at 20h/week needs 4 weeks
    assert any("unrealistic" in x for x in g.developer_violations(rushed, PLAN, DEV))


def test_client_budget_deadline_and_must_haves():
    missing_must = offer({"m1": 1200, "m3": 600}, {"m1": 2, "m3": 1})
    assert any("Must-have milestones missing: m2" in x for x in g.client_violations(missing_must, PLAN, CLIENT))
    over = offer({"m1": 1500, "m2": 1200, "m3": 600}, {"m1": 2, "m2": 2, "m3": 2})
    v = g.client_violations(over, PLAN, CLIENT)
    assert any("exceeds the client's budget" in x for x in v)
    assert any("exceeds the client's deadline" in x for x in v)


def test_an_offer_both_sides_accept_satisfies_both_limits():
    deal = offer({"m1": 1300, "m2": 1000}, {"m1": 2, "m2": 2})
    assert g.developer_violations(deal, PLAN, DEV) == []
    assert g.client_violations(deal, PLAN, CLIENT) == []


def test_zone_of_agreement_precheck():
    assert g.zone_of_agreement(PLAN, DEV, CLIENT) == []
    expensive = g.DeveloperLimits(rate_floor=60, weekly_hours=20)  # 70h * 60 = 4200 > 3000
    assert g.zone_of_agreement(PLAN, expensive, CLIENT)


def test_repair_fills_missing_lines_and_zeroes_excluded():
    messy = Offer(
        lines=[OfferLine(milestone_id="m1", included=True, price=1200, weeks=2),
               OfferLine(milestone_id="m3", included=False, price=500, weeks=3),
               OfferLine(milestone_id="zz", included=True, price=9999, weeks=9)],
        revisions_per_milestone=99, start_in_days=-5, notes="x",
    )
    fixed = g.repair(messy, PLAN)
    assert [l.milestone_id for l in fixed.lines] == ["m1", "m2", "m3"]
    assert fixed.total_price == 1200 and fixed.timeline_weeks == 2
    assert fixed.revisions_per_milestone == 5 and fixed.start_in_days == 0


def test_skill_matching_uses_aliases_not_substrings():
    score, matched, missing = skill_overlap(["JavaScript", "nextjs", "postgresql"], ["Java", "Next.js", "PostgreSQL"])
    assert matched == ["next.js", "postgres"] and missing == ["java"]
    assert round(score, 2) == 0.67


def test_score_flags_budget_below_floor():
    dev = {"skills": ["Next.js"], "rate_floor": 80, "rate_target": 90, "weekly_hours": 30}
    s = score_pair(dev, PLAN, 3000, 8, similarity=0.8)
    assert s["breakdown"]["budget"] == 0.0
    assert any("above your budget" in c for c in s["concerns"])
    # The founder sees concerns and breakdowns: nothing may reveal the developer's floor.
    assert not any("$" in c for c in s["concerns"])
    assert "cost_must_at_floor" not in s["breakdown"]


def test_hash_chain_detects_tampering():
    events, prev = [], None
    for seq, content in enumerate(["open", "offer 1", "accept"], start=1):
        h = _digest(prev, seq, "client_agent", "message", content, None, "all")
        events.append({"seq": seq, "actor": "client_agent", "kind": "message", "content": content,
                       "offer": None, "audience": "all", "prev_hash": prev, "hash": h})
        prev = h
    assert verify_chain(events)["valid"]
    events[1]["content"] = "offer 1 (edited)"
    assert verify_chain(events) == {"valid": False, "broken_at_seq": 2, "count": 3}
