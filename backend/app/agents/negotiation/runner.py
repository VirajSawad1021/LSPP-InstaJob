"""Negotiation orchestration as a LangGraph state machine.

    precheck --(no zone of agreement)--> END (impasse)
       |
       v
     turn <---(continue)---+
       |                   |
       +-------------------+--> END (agreed | impasse | paused | failed)

The graph state is rebuilt from the event log, so a paused negotiation resumes exactly where it stopped.
"""
from __future__ import annotations

import asyncio
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.negotiation import guardrails as g
from app.agents.negotiation.agents import client_turn, developer_turn, offer_from_dict, render_offer
from app.db import db, one, now_iso
from app.domain import AgentTurn
from app.llm import LLMError
from app.services import events as ev
from app.services.notify import notify

MAX_ATTEMPTS = 3  # per turn, when software rejects an offer


class NegState(TypedDict, total=False):
    negotiation_id: str
    turns_taken: int
    next_actor: str               # developer_agent | client_agent
    offers: dict                  # {developer_agent: offer|None, client_agent: offer|None}
    outcome: str                  # '' | agreed | impasse | paused | failed


def _set_status(nid: str, **fields) -> None:
    db().table("negotiations").update({**fields, "updated_at": now_iso()}).eq("id", nid).execute()


def _context(nid: str) -> tuple[dict, dict, dict, g.DeveloperLimits, g.ClientLimits]:
    neg = one("negotiations", id=nid)
    project = one("projects", id=neg["project_id"])
    dev = one("developers", id=neg["developer_id"])
    plan = project["plan"]
    dlim = g.DeveloperLimits(rate_floor=float(dev["rate_floor"]), weekly_hours=int(dev["weekly_hours"] or 30))
    clim = g.ClientLimits(
        budget_max=float(project["budget_max"]) if project.get("budget_max") else None,
        deadline_weeks=project.get("deadline_weeks"),
        must_ids=frozenset(m["id"] for m in plan["milestones"] if m["priority"] == "must"),
    )
    return neg, project, dev, dlim, clim


def rebuild_state(nid: str) -> NegState:
    offers: dict = {"developer_agent": None, "client_agent": None}
    turns, last_actor = 0, None
    for e in ev.list_events(nid):
        if e["actor"] in offers:
            turns += 1
            last_actor = e["actor"]
            if e["kind"] == "offer":
                offers[e["actor"]] = e["offer"]
    return {
        "negotiation_id": nid,
        "turns_taken": turns,
        "next_actor": "client_agent" if last_actor == "developer_agent" else "developer_agent",
        "offers": offers,
        "outcome": "",
    }


async def precheck(state: NegState) -> NegState:
    nid = state["negotiation_id"]
    if state["turns_taken"] > 0:
        return state  # resuming
    _, project, dev, dlim, clim = await asyncio.to_thread(_context, nid)
    blockers = g.zone_of_agreement(project["plan"], dlim, clim)
    if blockers:
        text = " ".join(blockers) + " No deal is possible without changing the budget or deadline."
        # Exact numbers reveal the developer's private floor: developer side only.
        await ev.append(nid, "guardrail", "guardrail", text, audience="developer")
        public = (
            f"{dev['full_name']}'s minimum terms for the must-have scope don't fit this budget/deadline, "
            "so their agent declined without negotiating."
        )
        await ev.append(nid, "guardrail", "guardrail", public, audience="client")
        await ev.append(nid, "system", "status", "Declined before negotiating: no zone of agreement.")
        await asyncio.to_thread(_set_status, nid, status="impasse", outcome_summary=public)
        return {**state, "outcome": "impasse"}
    return state


async def take_turn(state: NegState) -> NegState:
    nid = state["negotiation_id"]
    neg, project, dev, dlim, clim = await asyncio.to_thread(_context, nid)
    if neg["status"] != "running":  # paused by a human, or closed because another deal was chosen
        return {**state, "outcome": neg["status"]}

    actor = state["next_actor"]
    other = "client_agent" if actor == "developer_agent" else "developer_agent"
    plan = project["plan"]
    max_turns = int(neg["max_rounds"])
    # Turns alternate, so this side's remaining turns (including this one) is half of what's left, rounded up.
    turns_left = max(1, (max_turns - state["turns_taken"] + 1) // 2)
    side = "developer" if actor == "developer_agent" else "client"
    steering = (neg.get("steering") or {}).get(side)
    their_offer = state["offers"].get(other)
    my_offer = state["offers"].get(actor)

    feedback = None
    for attempt in range(MAX_ATTEMPTS):
        history = await asyncio.to_thread(ev.list_events, nid)
        if actor == "developer_agent":
            turn: AgentTurn = await developer_turn(dev, plan, project, dlim, history, their_offer, my_offer, turns_left, steering, feedback)
        else:
            turn = await client_turn(dev, plan, project, clim, history, their_offer, my_offer, turns_left, steering, feedback)

        if turn.action == "walk_away":
            await ev.append(nid, actor, "walk_away", turn.message)
            summary = f"{'Developer' if actor == 'developer_agent' else 'Client'} agent walked away: {turn.message}"
            await asyncio.to_thread(_set_status, nid, status="impasse", round=state["turns_taken"] + 1, outcome_summary=summary)
            await ev.append(nid, "system", "status", "Negotiation ended without a deal.")
            return {**state, "outcome": "impasse", "turns_taken": state["turns_taken"] + 1}

        if turn.action == "accept":
            if not their_offer:
                feedback = "There is no offer from the other side to accept yet. Make an offer."
                continue
            if not my_offer:
                # Protocol rule: each side counters at least once before it may accept.
                feedback = "Protocol: you must make at least one counter-offer of your own before you can accept."
                continue
            accepted = offer_from_dict(their_offer)
            violations = (
                g.developer_violations(accepted, plan, dlim) if actor == "developer_agent"
                else g.client_violations(accepted, plan, clim)
            )
            if violations:
                await ev.append(nid, "guardrail", "guardrail",
                                f"Blocked {actor.replace('_', ' ')} from accepting: " + " ".join(violations), audience=side)
                feedback = "You cannot accept that offer: " + " ".join(violations)
                continue
            await ev.append(nid, actor, "accept", turn.message, their_offer)
            summary = (
                f"Agreed: ${their_offer['total_price']:,} for {', '.join(sorted(accepted.included_ids()))} "
                f"in {their_offer['timeline_weeks']} weeks."
            )
            await asyncio.to_thread(_set_status, nid, status="agreed", agreed_offer=their_offer, latest_offer=their_offer,
                        round=state["turns_taken"] + 1, outcome_summary=summary)
            await ev.append(nid, "system", "status", summary + " Awaiting the founder's choice.")
            return {**state, "outcome": "agreed", "turns_taken": state["turns_taken"] + 1}

        # propose
        if not turn.offer:
            feedback = "action=propose requires an offer."
            continue
        offer = g.repair(turn.offer, plan)
        violations = (
            g.developer_violations(offer, plan, dlim) if actor == "developer_agent"
            else g.client_violations(offer, plan, clim)
        )
        if violations:
            await ev.append(nid, "guardrail", "guardrail",
                            f"Rejected a {actor.replace('_', ' ')} offer ({render_offer(offer.to_json())}): " + " ".join(violations),
                            audience=side)
            feedback = " ".join(violations)
            continue
        od = offer.to_json()
        await ev.append(nid, actor, "offer", turn.message, od)
        taken = state["turns_taken"] + 1
        await asyncio.to_thread(_set_status, nid, round=taken, latest_offer=od)
        offers = {**state["offers"], actor: od}
        if taken >= max_turns:
            summary = f"No agreement within {max_turns} turns."
            await asyncio.to_thread(_set_status, nid, status="impasse", outcome_summary=summary)
            await ev.append(nid, "system", "status", summary)
            return {**state, "offers": offers, "turns_taken": taken, "outcome": "impasse"}
        return {**state, "offers": offers, "turns_taken": taken, "next_actor": other}

    # Agent could not produce a valid move: it effectively walks away, and we say why.
    summary = f"{actor.replace('_', ' ').capitalize()} could not produce an offer within its limits."
    await ev.append(nid, "system", "status", summary)
    await asyncio.to_thread(_set_status, nid, status="impasse", outcome_summary=summary, round=state["turns_taken"])
    return {**state, "outcome": "impasse"}


def _route(state: NegState) -> str:
    return END if state.get("outcome") else "turn"


def build_graph():
    graph = StateGraph(NegState)
    graph.add_node("precheck", precheck)
    graph.add_node("turn", take_turn)
    graph.add_edge(START, "precheck")
    graph.add_conditional_edges("precheck", _route, {"turn": "turn", END: END})
    graph.add_conditional_edges("turn", _route, {"turn": "turn", END: END})
    return graph.compile()


_GRAPH = build_graph()
_running: dict[str, asyncio.Task] = {}


async def run(nid: str) -> None:
    neg = await asyncio.to_thread(one, "negotiations", id=nid)
    if not neg or neg["status"] not in ("pending", "running", "paused", "failed"):
        return
    await asyncio.to_thread(_set_status, nid, status="running", error=None)
    if neg["status"] == "pending":
        dev = await asyncio.to_thread(one, "developers", id=neg["developer_id"])
        await ev.append(nid, "system", "status", f"Negotiation opened between the founder's agent and {dev['full_name']}'s agent.")
    elif neg["status"] in ("paused", "failed"):
        await ev.append(nid, "system", "status", "Resumed.")
    try:
        state = await asyncio.to_thread(rebuild_state, nid)
        await _GRAPH.ainvoke(state, config={"recursion_limit": 60})
        await asyncio.to_thread(_notify_outcome, nid)
    except LLMError as e:
        await asyncio.to_thread(_set_status, nid, status="failed", error=str(e)[:500])
        await ev.append(nid, "system", "status", "The AI model is unavailable right now. You can retry this negotiation.")
    except Exception as e:  # never leave a negotiation stuck in 'running'
        await asyncio.to_thread(_set_status, nid, status="failed", error=f"{type(e).__name__}: {e}"[:500])
        await ev.append(nid, "system", "status", "Negotiation stopped because of an internal error. You can retry.")
        raise


def _notify_outcome(nid: str) -> None:
    neg = one("negotiations", id=nid)
    if neg["status"] not in ("agreed", "impasse"):
        return
    project = one("projects", id=neg["project_id"])
    dev = one("developers", id=neg["developer_id"])
    agreed = neg["status"] == "agreed"
    notify(
        project["client_id"], "offers_ready" if agreed else "negotiation",
        f"{'Deal agreed' if agreed else 'No deal'} with {dev['full_name']} on {project['title']}",
        neg.get("outcome_summary"), link=f"/client/projects/{project['id']}",
    )
    notify(
        dev.get("user_id"), "negotiation",
        f"Your agent {'agreed a deal' if agreed else 'ended without a deal'} on {project['title']}",
        neg.get("outcome_summary"), link=f"/negotiations/{nid}",
    )


def is_running(nid: str) -> bool:
    return nid in _running and not _running[nid].done()


def start(nid: str) -> None:
    """Run in the background; keeps a reference so the task isn't garbage-collected."""
    if nid in _running and not _running[nid].done():
        return
    task = asyncio.create_task(run(nid))
    _running[nid] = task
    task.add_done_callback(lambda _t: _running.pop(nid, None))
