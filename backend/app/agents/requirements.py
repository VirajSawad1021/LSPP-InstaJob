"""Requirements Agent: acts as an AI product manager for a non-technical founder.

Pass 1 (clarify): asks the few questions that would most change the plan.
Pass 2 (plan):    produces a milestone Build Plan with checkable acceptance criteria.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain import BuildPlan
from app.llm import generate


class Question(BaseModel):
    question: str
    why: str = Field(description="One short line: how the answer changes the plan.")
    options: list[str] = Field(description="2-4 short suggested answers the founder can tap.")


class Clarification(BaseModel):
    title: str = Field(description="Working title for the product, max 6 words.")
    questions: list[Question] = Field(description="2-4 questions, highest impact first.")


CLARIFY_SYSTEM = """You are the Requirements Agent on InstaJob, a platform where non-technical founders get
software MVPs built by vetted freelance developers.

A founder described their idea. Ask ONLY the questions whose answers would materially change scope,
cost or architecture (e.g. platforms, payments, user roles, integrations, existing assets like designs).
Do NOT ask about budget or deadline - those are collected separately.
Write for a non-technical person: no jargon, short questions, tappable options."""


async def clarify(idea: str) -> Clarification:
    result = await generate(Clarification, CLARIFY_SYSTEM, f"Founder's idea:\n{idea}", temperature=0.3)
    result.questions = result.questions[:4]
    return result


PLAN_SYSTEM = """You are the Requirements Agent on InstaJob. Turn a founder's idea and answers into a
Build Plan that a freelance developer can price and a machine can later verify.

Rules:
- 3 to 5 milestones, each independently demoable and deployed (not "backend done").
- Milestone m1 must deliver a working, deployed slice of the core user journey.
- Acceptance criteria must be objectively checkable from a live URL or a public repo
  (e.g. "Visiting /signup shows an email + password form that creates an account").
  Never write vague criteria like "good UX" or "clean code".
- est_hours: realistic for one senior developer. Be honest; do not shrink estimates to fit the budget.
- priority: 'must' = the MVP is pointless without it; 'should' = important; 'nice' = can be dropped.
  Keep at least one milestone that is not 'must' so there is room to negotiate scope.
- risks: things that commonly blow up freelance MVPs (third-party approvals, missing designs, data migration).
- Use a mainstream, hireable tech stack unless the founder asked otherwise."""


async def build_plan(idea: str, qa: list[dict], budget_max: float | None, deadline_weeks: int | None) -> BuildPlan:
    answers = "\n".join(f"- Q: {x['question']}\n  A: {x.get('answer') or '(skipped)'}" for x in qa)
    prompt = (
        f"Idea:\n{idea}\n\nClarifying answers:\n{answers or '(none)'}\n\n"
        f"Founder budget: {f'${budget_max:,.0f} USD total' if budget_max else 'not stated'}\n"
        f"Founder deadline: {f'{deadline_weeks} weeks' if deadline_weeks else 'not stated'}\n"
        "Note: estimate honestly; if the budget looks too small, say so in risks rather than under-estimating."
    )
    plan = await generate(BuildPlan, PLAN_SYSTEM, prompt, temperature=0.3)
    return normalize_plan(plan)


def normalize_plan(plan: BuildPlan) -> BuildPlan:
    """Deterministic clean-up so downstream code can trust ids and numbers."""
    for i, m in enumerate(plan.milestones, start=1):
        m.id = f"m{i}"
        m.est_hours = max(4, int(m.est_hours))
    if plan.milestones and plan.milestones[0].priority != "must":
        plan.milestones[0].priority = "must"
    return plan


def plan_cost_estimate(plan: dict, rates: list[float]) -> dict:
    """Market check: what the plan costs at real developer rates on the platform."""
    hours_all = sum(m["est_hours"] for m in plan["milestones"])
    hours_must = sum(m["est_hours"] for m in plan["milestones"] if m["priority"] == "must")
    rates = sorted(r for r in rates if r) or [40.0]
    low, mid = rates[len(rates) // 4], rates[len(rates) // 2]
    return {
        "hours_total": hours_all,
        "hours_must": hours_must,
        "rate_p25": low,
        "rate_median": mid,
        "cost_must_low": round(hours_must * low),
        "cost_all_median": round(hours_all * mid),
    }
