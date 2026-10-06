from app.agents.mediator import CriterionFinding, Ruling, normalize
from app.services.escrow import balances

MS = [
    {"id": "m1", "price": 1000, "status": "approved"},
    {"id": "m2", "price": 1500, "status": "in_progress"},
    {"id": "m3", "price": 500, "status": "pending"},
]


def e(mid, kind, amount):
    return {"milestone_id": mid, "kind": kind, "amount": amount}


def test_balances_track_funding_release_and_refund():
    b = balances(MS, [e("m1", "fund", 1000), e("m1", "release", 800), e("m1", "refund", 200), e("m2", "fund", 1500)])
    assert b["milestones"]["m1"] == {"price": 1000, "funded": 1000, "released": 800, "refunded": 200, "held": 0,
                                     "to_fund": 0, "fully_funded": True}
    assert b["milestones"]["m2"]["held"] == 1500 and b["milestones"]["m2"]["fully_funded"]
    assert b["milestones"]["m3"]["to_fund"] == 500 and not b["milestones"]["m3"]["fully_funded"]
    assert (b["held"], b["released"], b["refunded"], b["to_fund"]) == (1500, 800, 200, 500)


def test_price_increase_from_a_change_request_needs_a_top_up():
    ms = [{**MS[1], "price": 1800}]
    b = balances(ms, [e("m2", "fund", 1500)])["milestones"]["m2"]
    assert b["to_fund"] == 300 and not b["fully_funded"]


def ruling(rec, pct, items=()):
    return Ruling(
        summary="s", scope_creep=False, recommendation=rec, release_percent=pct, rework_items=list(items), rationale="r",
        note_to_founder="f", note_to_developer="d",
        findings=[CriterionFinding(criterion="Can book a slot", finding="met", reasoning="x"),
                  CriterionFinding(criterion="Sends a reminder", finding="not_met", reasoning="y"),
                  CriterionFinding(criterion="Invented criterion", finding="met", reasoning="z")],
    )


CRIT = ["Can book a slot", "Sends a reminder"]


def test_ruling_is_made_consistent_in_code():
    assert normalize(ruling("approve", 40, ["x"]), CRIT)["release_percent"] == 100
    r = normalize(ruling("rework", 70), CRIT)
    assert r["release_percent"] == 0 and r["rework_items"] == ["Meet: Sends a reminder"]
    assert normalize(ruling("partial", 100), CRIT)["release_percent"] == 90
    assert normalize(ruling("partial", 0), CRIT)["release_percent"] == 10
    assert [f["criterion"] for f in normalize(ruling("partial", 60), CRIT)["findings"]] == CRIT
