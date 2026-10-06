"""Walk the guided demo like a presenter: reset, then acts 2-6 across two browsers.

    python -m scripts.ui_demo_check [out_dir]
"""
from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from scripts.screens import WEB

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "ui-demo")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        fnd = b.new_context(viewport={"width": 1360, "height": 900}).new_page()
        dev = b.new_context(viewport={"width": 1360, "height": 900}).new_page()

        # guide: server check + reset
        fnd.goto(f"{WEB}/demo")
        expect(fnd.get_by_text("Server ready")).to_be_visible(timeout=90000)
        fnd.get_by_role("button", name="Reset demo").click()
        expect(fnd.get_by_text("Everything is back to the start")).to_be_visible(timeout=60000)
        fnd.screenshot(path=str(OUT / "01-guide.png"), full_page=True)
        print("  guide: server ready, demo reset")

        # act 2: offers, choose Ayam
        fnd.get_by_role("button", name="Open the offers").click()
        expect(fnd.get_by_text("Ready-to-sign offers")).to_be_visible(timeout=30000)
        fnd.screenshot(path=str(OUT / "02-offers.png"), full_page=True)
        card = fnd.locator("div", has_text="Ayam Shrestha").filter(has=fnd.get_by_role("button", name="Choose this deal")).last
        card.get_by_role("button", name="Choose this deal").click()
        fnd.wait_for_url("**/contracts/**", timeout=30000)
        expect(fnd.get_by_text("Waiting for the developer to sign")).to_be_visible(timeout=30000)
        print("  act 2: offers shown, deal chosen, founder lands on the contract")

        # act 3: developer signs (one click from the guide in the second window)
        dev.goto(f"{WEB}/demo")
        expect(dev.get_by_text("Server ready")).to_be_visible(timeout=60000)
        dev.get_by_role("button", name="Switch to the developer").click()
        dev.get_by_role("button", name="Review done: sign contract").click(timeout=30000)
        expect(dev.get_by_text("Developer signed").first).to_be_visible(timeout=20000)
        print("  act 3: developer signed from the guide")

        # act 4: workspace in flight (founder), via the sidebar switcher round trip
        fnd.goto(f"{WEB}/demo")
        fnd.get_by_role("button", name="Open the Gym CRM workspace").click()
        expect(fnd.get_by_text("A mediation needs your input")).to_be_visible(timeout=30000)
        fnd.screenshot(path=str(OUT / "03-workspace.png"), full_page=True)
        print("  act 4: gym workspace with next-step bar")

        # act 5: founder answers the dispute, Mediator rules live, both accept
        fnd.get_by_role("button", name="Open", exact=True).first.click()
        fnd.get_by_placeholder("Your side, in a few sentences").fill("I assumed staff login and an Excel export were obviously part of a CRM.")
        fnd.get_by_role("button", name="Send to the Mediator").click()
        expect(fnd.get_by_text("Mediator's proposal").first).to_be_visible(timeout=150000)
        rec = fnd.locator("text=Mediator's proposal").first.locator("xpath=following-sibling::p[1]").inner_text()
        print("  act 5: Mediator proposes ->", rec)
        fnd.screenshot(path=str(OUT / "04-ruling.png"), full_page=True)
        fnd.get_by_role("button", name="Accept proposal").click()
        dev.goto(fnd.url)
        dev.get_by_role("button", name="Accept proposal").click(timeout=30000)
        expect(dev.get_by_text("Both accepted").first).to_be_visible(timeout=20000)
        print("  act 5: both accepted ->", dev.get_by_text("Both accepted").first.inner_text()[:120])

        # act 6: founder requests the change, agents price it live, both approve
        fnd.goto(fnd.url.split("?")[0] + "?tab=changes")
        fnd.get_by_role("button", name="Request a change").click()
        fnd.locator("textarea").first.fill("Google sign-in for gym staff and an Excel export of all payments.")
        fnd.get_by_placeholder("e.g. 600").fill("500")
        fnd.get_by_placeholder("e.g. 1").fill("1")
        fnd.get_by_role("button", name="Scope and price it").click()
        expect(fnd.get_by_text("Awaiting approval").first.or_(fnd.get_by_text("No price agreed").first)).to_be_visible(timeout=240000)
        fnd.screenshot(path=str(OUT / "05-change.png"), full_page=True)
        if fnd.get_by_text("Awaiting approval").count():
            fnd.get_by_role("button", name="Approve and amend contract").first.click()
            dev.goto(fnd.url)
            dev.get_by_role("button", name="Approve and amend contract").first.click(timeout=30000)
            expect(dev.get_by_text("Added to contract").first).to_be_visible(timeout=20000)
            print("  act 6: change priced and added to the contract")
        else:
            print("  act 6: agents found no price inside the caps (shown honestly)")
        b.close()
    print("DEMO CHECK OK")


if __name__ == "__main__":
    main()
