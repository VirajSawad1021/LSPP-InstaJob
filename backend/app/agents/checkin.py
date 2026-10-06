"""Check-in Agent: drafts the developer's weekly update from what actually happened."""
from __future__ import annotations

import json

from pydantic import BaseModel, Field

from app.llm import generate


class CheckInDraft(BaseModel):
    done: str = Field(description="What was completed this week, as short '- ' bullet lines. Empty if nothing.")
    next: str = Field(description="What is planned next week, as short '- ' bullet lines.")
    blockers: str = Field(description="Anything slowing work down, as '- ' bullets. Empty string if none are evident.")
    needs: str = Field(description="Specific things the developer needs from the founder, as '- ' bullets. Empty if none.")


SYSTEM = """You are the Check-in Agent on InstaJob. Draft a developer's weekly update to their client,
a non-technical founder, using ONLY the activity data provided (completed tasks, submissions,
milestone statuses and messages). Never invent work that isn't in the data.
Be concrete and brief: 1-4 bullets per section, plain English, no jargon. 'Next' should follow
from the milestone that is in progress. The developer will edit this before sending."""


async def draft_check_in(contract: dict, tasks: list[dict], submissions: list[dict], messages: list[dict], since: str) -> CheckInDraft:
    milestones = [{"id": m["id"], "title": m["title"], "status": m["status"], "acceptance_criteria": m["acceptance_criteria"]} for m in contract["milestones"]]
    recent_done = [t for t in tasks if t["done"] and (t.get("done_at") or "") >= since]
    open_tasks = [t for t in tasks if not t["done"]]
    data = {
        "project": contract["title"],
        "milestones": milestones,
        "tasks_completed_this_week": recent_done,
        "open_tasks": open_tasks,
        "submissions_this_week": submissions,
        "messages_this_week": [{"from": m["author_role"], "text": m["body"][:300]} for m in messages][-25:],
    }
    return await generate(CheckInDraft, SYSTEM, json.dumps(data, indent=1)[:12000], temperature=0.3)
