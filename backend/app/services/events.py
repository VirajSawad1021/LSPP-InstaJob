"""Append-only negotiation log with a SHA-256 hash chain.

Each event's hash covers its content plus the previous event's hash, so editing or deleting
any past event breaks every hash after it. `verify_chain` recomputes it.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
from collections import defaultdict

from app.db import db

_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


def _digest(prev_hash: str | None, seq: int, actor: str, kind: str, content: str, offer: dict | None, audience: str) -> str:
    body = json.dumps(
        {"prev": prev_hash, "seq": seq, "actor": actor, "kind": kind, "content": content, "offer": offer, "audience": audience},
        sort_keys=True, separators=(",", ":"),
    )
    return hashlib.sha256(body.encode()).hexdigest()


async def append(
    negotiation_id: str, actor: str, kind: str, content: str, offer: dict | None = None, audience: str = "all"
) -> dict:
    """audience: who may read it (RLS-enforced): all | client | developer."""
    def write() -> dict:
        last = (
            db().table("negotiation_events").select("seq,hash").eq("negotiation_id", negotiation_id)
            .order("seq", desc=True).limit(1).execute().data
        )
        seq = last[0]["seq"] + 1 if last else 1
        prev = last[0]["hash"] if last else None
        row = {
            "negotiation_id": negotiation_id, "seq": seq, "actor": actor, "kind": kind,
            "content": content, "offer": offer, "prev_hash": prev, "audience": audience,
            "hash": _digest(prev, seq, actor, kind, content, offer, audience),
        }
        return db().table("negotiation_events").insert(row).execute().data[0]

    async with _locks[negotiation_id]:  # the lock keeps seq/prev_hash consistent per negotiation
        return await asyncio.to_thread(write)


def list_events(negotiation_id: str, side: str | None = None) -> list[dict]:
    """side=None returns everything (agents, audit); otherwise only what that side may see."""
    rows = (
        db().table("negotiation_events").select("*").eq("negotiation_id", negotiation_id)
        .order("seq").execute().data or []
    )
    return rows if side is None else [r for r in rows if r["audience"] in ("all", side)]


def verify_chain(events: list[dict]) -> dict:
    prev = None
    for e in events:
        expected = _digest(prev, e["seq"], e["actor"], e["kind"], e["content"], e.get("offer"), e.get("audience", "all"))
        if e.get("prev_hash") != prev or e["hash"] != expected:
            return {"valid": False, "broken_at_seq": e["seq"], "count": len(events)}
        prev = e["hash"]
    return {"valid": True, "count": len(events), "head": prev}
