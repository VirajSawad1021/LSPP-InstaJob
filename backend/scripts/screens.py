"""Visual QA: sign in as the demo accounts and screenshot every page (desktop + mobile).

    python -m scripts.screens [out_dir]

Needs the frontend (localhost:3000) and backend (localhost:8000) running, and seed data.
"""
from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

from app.db import db
from scripts.seed import DEMO_PASSWORD

WEB = "http://localhost:3000"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "screens")


def sign_in(page: Page, email: str) -> None:
    page.goto(f"{WEB}/auth")
    page.fill('input[type="email"]', email)
    page.fill('input[type="password"]', DEMO_PASSWORD)
    page.click('button[type="submit"]')
    page.wait_for_url(lambda u: "/auth" not in u, timeout=20000)


def shot(page: Page, name: str, path: str, wait: int = 2500) -> None:
    page.goto(f"{WEB}{path}")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(wait)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    print("  ", name, path)


def ids() -> dict:
    founder = next(u for u in db().auth.admin.list_users(per_page=1000) if u.email == "founder@instajob.demo")
    projects = db().table("projects").select("id,status").eq("client_id", founder.id).in_("status", ["contracted", "in_progress", "completed"]).order("created_at", desc=True).execute().data
    out: dict = {"project": projects[0]["id"] if projects else None}
    if out["project"]:
        negs = db().table("negotiations").select("id,status").eq("project_id", out["project"]).execute().data
        out["negotiation"] = next((n["id"] for n in negs if n["status"] in ("selected", "agreed")), negs[0]["id"] if negs else None)
        c = db().table("contracts").select("id").eq("project_id", out["project"]).execute().data
        out["contract"] = c[0]["id"] if c else None
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    x = ids()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for label, vp in (("desk", {"width": 1440, "height": 900}), ("mob", {"width": 390, "height": 844})):
            ctx = browser.new_context(viewport=vp, device_scale_factor=1)
            page = ctx.new_page()
            for path in ("/", "/founders", "/developers", "/safety", "/auth"):
                shot(page, f"{label}-{path.strip('/') or 'landing'}", path)
            sign_in(page, "founder@instajob.demo")
            shot(page, f"{label}-client-home", "/client")
            shot(page, f"{label}-client-new", "/client/new")
            if x.get("project"):
                shot(page, f"{label}-project", f"/client/projects/{x['project']}")
            if x.get("negotiation"):
                shot(page, f"{label}-negotiation", f"/negotiations/{x['negotiation']}")
            if x.get("contract"):
                for tab in ("board", "messages", "checkins", "changes", "payments", "timeline", "activity", "contract"):
                    shot(page, f"{label}-workspace-{tab}", f"/contracts/{x['contract']}?tab={tab}")
            shot(page, f"{label}-marketplace-founder", "/marketplace")
            shot(page, f"{label}-portfolio", "/client/portfolio")
            shot(page, f"{label}-inbox", "/inbox")
            ctx.close()
            if label == "mob":
                break
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        sign_in(page, "ayam@instajob.demo")
        shot(page, "desk-dev-home", "/developer")
        shot(page, "desk-dev-profile", "/developer/profile")
        shot(page, "desk-dev-work", "/developer/work")
        shot(page, "desk-dev-interview", "/developer/interview")
        shot(page, "desk-dev-inbox", "/inbox")
        shot(page, "desk-marketplace-dev", "/marketplace")
        if x.get("contract"):
            for tab in ("board", "payments", "contract"):
                shot(page, f"desk-contract-dev-{tab}", f"/contracts/{x['contract']}?tab={tab}")
        browser.close()


if __name__ == "__main__":
    main()
