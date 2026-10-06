"""Verification Agent (Proof of Done): checks a milestone submission against its acceptance criteria.

Evidence is collected by code (HTTP fetch of the live URL, GitHub API for the repo); the model
only judges each criterion against that evidence and must say when something is unverifiable.
"""
from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field

from app.llm import generate
from app.services.fetch import FetchError, fetch_page, fetch_repo


class CriterionCheck(BaseModel):
    criterion: str
    verdict: Literal["met", "not_met", "unverifiable"]
    evidence: str = Field(description="Quote or cite the specific evidence. For unverifiable, say what evidence is missing.")


class VerificationReport(BaseModel):
    checks: list[CriterionCheck]
    summary: str = Field(description="2 sentences for a non-technical founder.")
    suggested_next_step: str


SYSTEM = """You are the Verification Agent on InstaJob. A developer submitted a milestone. Judge EACH
acceptance criterion strictly against the collected evidence (HTTP fetch of the live site and public
GitHub data). Rules:
- 'met' only if the evidence clearly shows it. Cite the evidence (page text, link paths, form inputs, files, commits).
- 'not_met' if the evidence shows it is missing or broken (e.g. HTTP error, page absent).
- 'unverifiable' if it needs a logged-in session, payments, email, or interaction the evidence can't show.
  Say what the founder should click to check it themselves.
- Never assume. The developer's notes are claims, not evidence.
Write for a non-technical founder."""


async def collect_evidence(live_url: str | None, repo_url: str | None) -> dict:
    evidence: dict = {}
    if live_url:
        try:
            evidence["live_site"] = await fetch_page(live_url)
        except (FetchError, Exception) as e:
            evidence["live_site"] = {"error": f"Could not load {live_url}: {e}"}
    if repo_url:
        try:
            evidence["repository"] = await fetch_repo(repo_url)
        except (FetchError, Exception) as e:
            evidence["repository"] = {"error": f"Could not read repository: {e}"}
    return evidence


async def verify(milestone: dict, live_url: str | None, repo_url: str | None, notes: str | None) -> dict:
    evidence = await collect_evidence(live_url, repo_url)
    prompt = (
        f"MILESTONE: {milestone['title']} - {milestone['goal']}\n"
        f"DELIVERABLES: {json.dumps(milestone['deliverables'])}\n"
        f"ACCEPTANCE CRITERIA:\n" + "\n".join(f"- {c}" for c in milestone["acceptance_criteria"]) +
        f"\n\nDEVELOPER NOTES (claims only): {notes or '(none)'}\n\n"
        f"EVIDENCE:\n{json.dumps(evidence, indent=1)[:14000]}"
    )
    report = await generate(VerificationReport, SYSTEM, prompt, temperature=0.1)
    counts = {k: sum(1 for c in report.checks if c.verdict == k) for k in ("met", "not_met", "unverifiable")}
    return {
        **report.model_dump(),
        "counts": counts,
        "evidence_summary": {
            "live_site": {k: evidence["live_site"].get(k) for k in ("url", "status", "ms", "title", "is_https", "error")}
            if "live_site" in evidence else None,
            "repository": {k: evidence["repository"].get(k) for k in ("repo", "language", "recent_commits", "pushed_at", "error")}
            if "repository" in evidence else None,
        },
    }
