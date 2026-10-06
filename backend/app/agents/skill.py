"""Skill Agent: interviews a developer and builds an evidence-based profile."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.llm import generate


class ShippedProject(BaseModel):
    name: str
    what: str = Field(description="One sentence: what it does and who used it.")
    stack: list[str]
    role: str = Field(description="What this developer personally built.")
    outcome: str = Field(description="Measurable result if stated, else empty string.")
    url: str = Field(description="Link if given, else empty string.")


class WorkStyle(BaseModel):
    communication: str = Field(description="e.g. 'async-first, daily Loom updates'")
    process: str = Field(description="e.g. 'ships to staging twice a week'")
    ideal_client: str
    red_flags: str = Field(description="Client behaviours they avoid.")


class ExtractedProfile(BaseModel):
    headline: str = Field(description="e.g. 'Full-stack Next.js developer for SaaS MVPs'. Empty if unknown.")
    skills: list[str] = Field(description="Specific technologies only.")
    years_experience: int | None
    shipped_projects: list[ShippedProject]
    work_style: WorkStyle
    rate_floor: int | None = Field(description="USD/hour minimum they will accept. Only if stated.")
    rate_target: int | None = Field(description="USD/hour they usually charge. Only if stated.")
    weekly_hours: int | None
    availability: str = Field(description="e.g. 'immediate', 'in 2 weeks'. Empty if unknown.")
    timezone: str = Field(description="e.g. 'Asia/Kathmandu (UTC+5:45)'. Empty if unknown.")
    dealbreakers: list[str]
    negotiation_style: Literal["firm", "collaborative", "flexible"]
    bio: str = Field(description="2-3 sentence third-person bio grounded ONLY in what they said. Empty until enough is known.")


class InterviewTurn(BaseModel):
    reply: str = Field(description="Your next message to the developer. Max 70 words, ONE question.")
    profile: ExtractedProfile = Field(description="Cumulative profile from the whole conversation so far.")
    progress: int = Field(description="0-100: how complete the profile is.")
    complete: bool = Field(
        description="True only when skills, at least one shipped project, work style, rate_floor, rate_target and weekly_hours are known."
    )


SYSTEM = """You are the Skill Agent on InstaJob. You interview freelance software developers so their AI
agent can represent them in project negotiations. A static portfolio says "React, Node"; you capture
proof and working style.

Cover, one focused question at a time, roughly in this order:
1. What they build and their core stack.
2. One or two real projects they shipped: what it did, what THEY built, outcome, link.
3. How they work: communication rhythm, process, what an ideal client looks like, red flags.
4. Money and capacity: usual hourly rate, the absolute minimum they'd accept (their agent will never
   go below it), weekly hours available, when they can start, timezone.
5. Dealbreakers and how hard their agent should negotiate (firm / collaborative / flexible).

Rules: warm and sharp, never more than one question per message, ask for specifics
("what happened after launch?"). Never invent facts or numbers. If they already answered something,
don't ask again. When complete, thank them and tell them to review their profile."""

OPENING = (
    "Hi! I'm your Skill Agent. I'll ask a few quick questions so your agent can pitch and negotiate "
    "for you, based on what you've actually built. To start: what kind of products do you build, "
    "and what's your go-to stack?"
)


async def interview_turn(transcript: list[dict]) -> InterviewTurn:
    msgs = [("model" if m["role"] == "agent" else "user", m["content"]) for m in transcript]
    turn = await generate(InterviewTurn, SYSTEM, msgs, temperature=0.5)
    turn.progress = max(0, min(100, turn.progress))
    return turn
