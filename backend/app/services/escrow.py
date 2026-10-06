"""Simulated escrow: the founder funds each milestone before work is submitted, the money is held,
and it is released to the developer on approval (or split by an accepted Mediator ruling).

No real money moves. The ledger is append-only, and balances are derived from it.
"""
from __future__ import annotations

from app.db import db

CLOSED = {"approved"}


def entries(cid: str) -> list[dict]:
    return db().table("escrow_entries").select("*").eq("contract_id", cid).order("created_at").execute().data or []


def balances(milestones: list[dict], ledger: list[dict]) -> dict:
    """Per-milestone and total balances. Pure; tested."""
    per: dict[str, dict] = {}
    for m in milestones:
        rows = [e for e in ledger if e["milestone_id"] == m["id"]]
        funded = sum(float(e["amount"]) for e in rows if e["kind"] == "fund")
        released = sum(float(e["amount"]) for e in rows if e["kind"] == "release")
        refunded = sum(float(e["amount"]) for e in rows if e["kind"] == "refund")
        held = funded - released - refunded
        price = float(m["price"])
        to_fund = 0.0 if m["status"] in CLOSED else max(0.0, price - funded)
        per[m["id"]] = {
            "price": price, "funded": funded, "released": released, "refunded": refunded, "held": held,
            "to_fund": to_fund, "fully_funded": m["status"] in CLOSED or to_fund == 0,
        }
    tot = lambda k: sum(v[k] for v in per.values())  # noqa: E731
    return {
        "milestones": per,
        "held": tot("held"), "released": tot("released"), "refunded": tot("refunded"), "funded": tot("funded"),
        "to_fund": tot("to_fund"),
    }


def record(cid: str, mid: str, kind: str, amount: float, actor_id: str | None, note: str | None = None) -> dict | None:
    amount = round(float(amount), 2)
    if amount <= 0:
        return None
    return db().table("escrow_entries").insert({
        "contract_id": cid, "milestone_id": mid, "kind": kind, "amount": amount, "actor_id": actor_id, "note": note,
    }).execute().data[0]


def settle(c: dict, mid: str, release_amount: float, actor_id: str | None, note: str) -> dict:
    """Close a milestone's escrow: release `release_amount` to the developer, refund the rest to the founder.
    If the founder approves before funding, the missing amount is funded at that moment."""
    m = next(x for x in c["milestones"] if x["id"] == mid)
    b = balances(c["milestones"], entries(c["id"]))["milestones"][mid]
    release_amount = max(0.0, min(float(m["price"]) - b["released"], float(release_amount)))
    if b["held"] < release_amount:
        record(c["id"], mid, "fund", release_amount - b["held"], actor_id, "Funded at approval")
        b["held"] = release_amount
    record(c["id"], mid, "release", release_amount, actor_id, note)
    record(c["id"], mid, "refund", b["held"] - release_amount, actor_id, "Unreleased balance returned to the founder")
    return {"released": release_amount, "refunded": max(0.0, b["held"] - release_amount)}
