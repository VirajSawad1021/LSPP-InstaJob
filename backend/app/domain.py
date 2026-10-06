"""Shared domain types. These are also the JSON schemas the LLM must fill,
so every field is explicit (no free-form dicts)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Priority = Literal["must", "should", "nice"]


# ---------------- Build Plan (Requirements Agent output) ----------------
class Milestone(BaseModel):
    id: str = Field(description="Stable id: m1, m2, m3 ...")
    title: str
    goal: str = Field(description="One sentence: what the founder can do after this milestone.")
    deliverables: list[str] = Field(description="Concrete artifacts, e.g. 'Deployed signup + login pages'.")
    acceptance_criteria: list[str] = Field(
        description="2-5 objectively checkable statements, verifiable from a live URL or repo."
    )
    est_hours: int = Field(description="Realistic senior-developer hours for this milestone.")
    priority: Priority


class Risk(BaseModel):
    risk: str
    mitigation: str


class BuildPlan(BaseModel):
    title: str
    summary: str = Field(description="2-3 sentences, plain English, for a non-technical founder.")
    target_users: str
    tech_stack: list[str]
    required_skills: list[str] = Field(
        description="4-8 single technology names a developer must know, one per item, e.g. 'Next.js', 'Postgres', 'Stripe'. No combined entries like 'React / Next.js'."
    )
    milestones: list[Milestone]
    risks: list[Risk]
    assumptions: list[str]
    out_of_scope: list[str]


# ---------------- Offers (typed negotiation terms) ----------------
class OfferLine(BaseModel):
    milestone_id: str
    included: bool
    price: int = Field(description="USD for this milestone; 0 if not included.")
    weeks: int = Field(description="Calendar weeks for this milestone; 0 if not included.")


class Offer(BaseModel):
    lines: list[OfferLine] = Field(description="Exactly one line per Build Plan milestone. Milestones run sequentially.")
    revisions_per_milestone: int
    start_in_days: int
    notes: str = Field(description="Short note on what changed vs the previous offer and why.")

    @property
    def total_price(self) -> int:
        return sum(l.price for l in self.lines if l.included)

    @property
    def timeline_weeks(self) -> int:
        return sum(l.weeks for l in self.lines if l.included)

    def included_ids(self) -> set[str]:
        return {l.milestone_id for l in self.lines if l.included}

    def to_json(self) -> dict:
        d = self.model_dump()
        d["total_price"] = self.total_price
        d["timeline_weeks"] = self.timeline_weeks
        return d


class AgentTurn(BaseModel):
    message: str = Field(description="What you say to the other agent. Max 70 words, concrete, no pleasantries.")
    action: Literal["propose", "accept", "walk_away"] = Field(
        description="propose = send offer; accept = accept the OTHER side's latest offer exactly; walk_away = end."
    )
    offer: Offer | None = Field(default=None, description="Required when action is propose.")
