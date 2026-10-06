"""Browser end-to-end: drive the real founder UI through the whole flow and screenshot each step.

    python -m scripts.ui_flow [out_dir]

Needs frontend + backend running and seed data. Uses live Gemini calls.
"""
from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

from scripts.screens import WEB, sign_in

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "ui-flow")
IDEA = (
    "A simple CRM for small gyms in Kathmandu to track members, renewals and payments, and send "
    "WhatsApp reminders when a membership is about to expire. Gym owners manage it from a laptop."
)


def snap(page: Page, name: str) -> None:
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    print("  shot", name)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        sign_in(page, "founder@instajob.demo")

        page.goto(f"{WEB}/client/new")
        page.get_by_placeholder("Describe what you want built").fill(IDEA)
        snap(page, "01-idea")
        page.get_by_role("button", name="Plan it").click()
        expect(page.get_by_text("Your Requirements Agent asks")).to_be_visible(timeout=60000)

        # tap the first suggested answer of every question
        for card in page.locator("div.space-y-6 > div").all():
            opts = card.locator("button")
            if opts.count():
                opts.first.click()
        page.get_by_placeholder("e.g. 3000").fill("2500")
        page.get_by_placeholder("e.g. 6").fill("6")
        snap(page, "02-questions")
        page.get_by_role("button", name="Build my plan").click()
        expect(page.get_by_text("Market check")).to_be_visible(timeout=90000)
        snap(page, "03-plan")

        page.get_by_role("button", name="Publish and find developers").click()
        page.wait_for_url("**/client/projects/**", timeout=90000)
        expect(page.get_by_text("Matched developers")).to_be_visible(timeout=30000)
        snap(page, "04-matches")

        page.get_by_role("button", name="Start").first.click()
        expect(page.get_by_text("Agent negotiations")).to_be_visible(timeout=30000)
        page.get_by_role("link", name="Open room").first.click()
        page.wait_for_url("**/negotiations/**")
        page.wait_for_timeout(15000)
        snap(page, "05-room-live")

        # wait for all negotiations to settle, then compare offers
        page.go_back()
        for _ in range(40):
            page.wait_for_timeout(5000)
            if page.get_by_text("Negotiating", exact=True).count() == 0 and page.get_by_text("Starting", exact=True).count() == 0:
                break
        page.reload()
        page.wait_for_timeout(3000)
        snap(page, "06-offers")
        browser.close()
        print("UI FLOW OK")


if __name__ == "__main__":
    main()
