from app.agents.change import (
    ChangeClientLimits, ChangeDevLimits, ChangeScope, apply_change, client_violations,
    developer_violations, min_weeks, normalize_scope, zone_of_agreement,
)

CONTRACT = {
    "title": "Tutor booking", "total_price": 4000, "timeline_weeks": 6, "status": "active", "terms": {"start_in_days": 0},
    "milestones": [
        {"id": "m1", "title": "Auth", "deliverables": ["Login"], "acceptance_criteria": ["Can log in"], "price": 1500, "weeks": 2, "status": "approved"},
        {"id": "m2", "title": "Booking", "deliverables": ["Calendar"], "acceptance_criteria": ["Can book"], "price": 2500, "weeks": 4, "status": "in_progress"},
    ],
}
DEV = ChangeDevLimits(rate_floor=40, weekly_hours=20)


def scope(kind="new_milestone", target="", hours=30):
    return {"title": "Khalti refunds", "kind": kind, "target_milestone_id": target, "goal": "Refund bookings",
            "deliverables": ["Refund button"], "acceptance_criteria": ["Refund reaches Khalti sandbox"], "est_hours": hours, "impact": ""}


def test_scope_cannot_extend_a_finished_milestone():
    s = normalize_scope(ChangeScope(is_change=True, not_a_change_reason="", **scope("extend_milestone", "m1")), CONTRACT)
    assert s["kind"] == "new_milestone" and s["target_milestone_id"] == ""
    s = normalize_scope(ChangeScope(is_change=True, not_a_change_reason="", **scope("extend_milestone", "m2")), CONTRACT)
    assert s["kind"] == "extend_milestone"


def test_developer_floor_and_capacity_enforced():
    s = scope(hours=30)
    assert developer_violations(1100, 2, s, DEV)          # 30h x $40 = $1200
    assert developer_violations(1200, 1, s, DEV)          # 30h at 20h/week needs 2 weeks
    assert not developer_violations(1200, 2, s, DEV)
    assert min_weeks(scope("extend_milestone", "m2", hours=10), DEV) == 0


def test_founder_caps_enforced_and_zone_precheck():
    lim = ChangeClientLimits(max_price=1000, max_weeks=1)
    assert client_violations(1200, 1, lim) and client_violations(900, 2, lim)
    assert not client_violations(900, 1, lim)
    assert zone_of_agreement(scope(hours=30), DEV, lim)   # $1200 floor > $1000 cap
    assert not zone_of_agreement(scope(hours=20), DEV, ChangeClientLimits(None, None))


def test_apply_new_milestone_and_extension():
    upd = apply_change(CONTRACT, scope(), 1300, 2, "cr1", "2026-09-25T00:00:00Z")
    assert upd["milestone_id"] == "m3" and upd["milestones"][-1]["status"] == "pending"
    assert upd["total_price"] == 5300 and upd["timeline_weeks"] == 8
    assert upd["terms"]["amendments"][0]["change_request_id"] == "cr1"
    assert CONTRACT["milestones"][1]["price"] == 2500  # input untouched

    ext = apply_change(CONTRACT, scope("extend_milestone", "m2", 10), 450, 0, "cr2", "x")
    m2 = next(m for m in ext["milestones"] if m["id"] == "m2")
    assert m2["price"] == 2950 and m2["weeks"] == 4 and "Refund button" in m2["deliverables"]
    assert ext["timeline_weeks"] == 6 and len(ext["milestones"]) == 2


def test_new_milestone_after_completion_starts_immediately():
    done = {**CONTRACT, "status": "completed", "milestones": [{**m, "status": "approved"} for m in CONTRACT["milestones"]]}
    upd = apply_change(done, scope(), 1300, 2, "cr3", "x")
    assert upd["milestones"][-1]["status"] == "in_progress" and upd["status"] == "active"
