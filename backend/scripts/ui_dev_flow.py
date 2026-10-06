"""Browser end-to-end for a brand-new developer: Skill Agent interview -> profile review -> dashboard.

    python -m scripts.ui_dev_flow [out_dir]

Creates a temporary developer login, drives the real UI with live Gemini, then deletes the account.
"""
from __future__ import annotations

import secrets
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from app.db import db
from scripts.screens import WEB

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "ui-dev-flow")
ANSWERS = [
    "I build web apps for small businesses, mostly Next.js with TypeScript, Supabase and Tailwind. Sometimes Stripe.",
    "Last year I built 'ClinicQ', an online queue and appointment system for a dental clinic in Lalitpur. I did everything: "
    "the booking flow, SMS reminders and the admin dashboard. It cut walk-in waiting time roughly in half.",
    "I work async, post a short Loom every Friday and deploy a preview link for every feature. Ideal clients are founders who "
    "decide quickly. Red flag: clients who change scope without writing it down.",
    "I usually charge 30 dollars an hour. The absolute minimum I'd accept is 20. I have about 25 hours a week and can start next week. "
    "I'm in Kathmandu, UTC+5:45.",
    "Dealbreakers: no unpaid test tasks. My agent should be collaborative, not too aggressive.",
    "Nothing else, that's everything.",
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    email = f"qa-dev-{secrets.token_hex(3)}@instajob.demo"
    password = secrets.token_urlsafe(16)
    user = db().auth.admin.create_user({
        "email": email, "password": password, "email_confirm": True,
        "user_metadata": {"full_name": "Sita Maharjan", "role": "developer"},
    }).user
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.goto(f"{WEB}/auth")
            page.fill('input[type="email"]', email)
            page.fill('input[type="password"]', password)
            page.click('button[type="submit"]')
            page.wait_for_url("**/developer/interview", timeout=30000)
            expect(page.get_by_text("I'm your Skill Agent")).to_be_visible(timeout=30000)

            box = page.get_by_placeholder("Answer in your own words")
            for i, a in enumerate(ANSWERS):
                if page.get_by_role("button", name="Review my profile").count():
                    break
                box.fill(a)
                box.press("Enter")
                page.wait_for_function(
                    "() => !document.body.innerText.includes('Skill Agent is thinking')", timeout=90000, polling=500,
                )
                page.wait_for_timeout(600)
                print(f"  answered {i + 1}")
            page.screenshot(path=str(OUT / "01-interview.png"), full_page=True)

            done = page.get_by_role("button", name="Review my profile")
            skip = page.get_by_role("button", name="Skip ahead and fill in the rest myself")
            (done if done.count() else skip).click()
            page.wait_for_url("**/developer/profile**")
            expect(page.get_by_text("Negotiation limits (private)")).to_be_visible(timeout=30000)
            page.wait_for_timeout(1000)
            page.screenshot(path=str(OUT / "02-profile.png"), full_page=True)
            floor = page.locator("label:has-text('Minimum rate') input").input_value()
            print("  extracted floor:", floor)

            page.get_by_role("button", name="Save and activate my agent").click()
            page.wait_for_url("**/developer", timeout=90000)
            expect(page.get_by_text("Negotiation limits")).to_be_visible(timeout=30000)
            page.wait_for_timeout(2500)
            page.screenshot(path=str(OUT / "03-dashboard.png"), full_page=True)
            browser.close()
            print("DEV UI FLOW OK")
    finally:
        db().auth.admin.delete_user(user.id)  # cascades to profile, developer row and interview
        print("  cleaned up", email)


if __name__ == "__main__":
    main()
