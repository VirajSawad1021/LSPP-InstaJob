from datetime import date

from app.services.schedule import build_schedule

CONTRACT = {
    "status": "active",
    "started_at": "2026-09-01T10:00:00+00:00",
    "total_price": 3000,
    "terms": {"start_in_days": 3},
    "milestones": [
        {"id": "m1", "title": "A", "status": "approved", "price": 1000, "weeks": 1},
        {"id": "m2", "title": "B", "status": "in_progress", "price": 1200, "weeks": 2},
        {"id": "m3", "title": "C", "status": "pending", "price": 800, "weeks": 1},
    ],
}


def test_due_dates_are_sequential_from_start():
    s = build_schedule(CONTRACT, today=date(2026, 9, 10))
    ms = s["milestones"]
    assert (ms[0]["start_date"], ms[0]["due_date"]) == ("2026-09-04", "2026-09-11")
    assert (ms[1]["start_date"], ms[1]["due_date"]) == ("2026-09-11", "2026-09-25")
    assert ms[2]["due_date"] == "2026-10-02" == s["end_date"]
    assert s["paid"] == 1000 and s["approved"] == 1 and s["health"] == "on_track"


def test_late_and_task_progress():
    tasks = [{"milestone_id": "m2", "done": True}, {"milestone_id": "m2", "done": False}]
    s = build_schedule(CONTRACT, tasks, today=date(2026, 9, 30))
    m2 = s["milestones"][1]
    assert m2["late"] and s["health"] == "late"
    assert (m2["tasks_done"], m2["tasks_total"]) == (1, 2)
    # 1 approved + 0.7 * 1/2 for the in-flight milestone, over 3 milestones
    assert s["progress"] == round(100 * 1.35 / 3)


def test_unsigned_contract_has_no_dates():
    s = build_schedule({**CONTRACT, "started_at": None, "status": "pending_approval"})
    assert s["milestones"][0]["due_date"] is None and s["health"] == "not_started"
