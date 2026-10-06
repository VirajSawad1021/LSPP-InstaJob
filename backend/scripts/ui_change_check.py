"""Two-browser check of change requests: a chat message becomes a change request, the agents
price it inside both sides' limits, both people approve, and the contract is amended.

    python -m scripts.ui_change_check [out_dir]
"""
from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from app.db import db, one
from scripts.screens import WEB, sign_in
from scripts.ui_chat_check import contract_id

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "ui-change")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cid = contract_id()
    before = one("contracts", id=cid)
    print(f"  contract before: ${float(before['total_price']):,.0f}, {before['timeline_weeks']} weeks, {len(before['milestones'])} milestones")
    with sync_playwright() as p:
        b = p.chromium.launch()
        dev = b.new_context(viewport={"width": 1280, "height": 900}).new_page()
        fnd = b.new_context(viewport={"width": 1280, "height": 900}).new_page()
        sign_in(dev, "ayam@instajob.demo")
        sign_in(fnd, "founder@instajob.demo")

        # founder turns a chat message into a change request
        fnd.goto(f"{WEB}/contracts/{cid}?tab=messages")
        box = fnd.get_by_placeholder("Message the")
        box.wait_for(timeout=30000)
        box.fill("Could parents also get a refund through Khalti when a tutor cancels a class?")
        box.press("Enter")
        row = fnd.locator("div.group", has_text="refund through Khalti when a tutor cancels").last
        row.wait_for(timeout=15000)
        row.hover()
        row.get_by_title("Turn into a change request").click()
        expect(fnd.get_by_text("From a message")).to_be_visible(timeout=10000)
        assert "Khalti" in fnd.locator("textarea").first.input_value()
        print("  message handed over to the change request form")
        fnd.get_by_placeholder("e.g. 600").fill("2500")
        fnd.get_by_placeholder("e.g. 1").fill("3")
        fnd.get_by_role("button", name="Scope and price it").click()
        expect(fnd.get_by_text("Change Scoping Agent").first).to_be_visible(timeout=15000)
        print("  scoping agent working")
        expect(fnd.get_by_text("Awaiting approval").first).to_be_visible(timeout=240000)
        fnd.get_by_text("Agents' conversation").first.click()
        fnd.screenshot(path=str(OUT / "01-founder-proposed.png"), full_page=True)
        x = db().table("change_requests").select("*").eq("contract_id", cid).order("created_at", desc=True).limit(1).execute().data[0]
        print(f"  agents agreed: ${x['price_delta']:,.0f}, +{x['weeks_delta']} weeks ({x['scope']['kind']}, ~{x['scope']['est_hours']} h)")
        for t in x["transcript"]:
            print(f"    [{t['audience']}] {t['actor']}: {t['text'][:90]}" + (f" (${t['price']}, +{t['weeks']}w)" if t.get("price") is not None else ""))

        # developer sees it without the founder's caps, both approve
        dev.goto(f"{WEB}/contracts/{cid}?tab=changes")
        expect(dev.get_by_text("Awaiting approval").first).to_be_visible(timeout=30000)
        assert "2,500" not in dev.content(), "founder's cap leaked to the developer"
        print("  developer view has no founder caps")
        dev.get_by_role("button", name="Approve and amend contract").first.click()
        expect(dev.get_by_text("You approved").first).to_be_visible(timeout=15000)
        fnd.reload()
        fnd.get_by_role("button", name="Approve and amend contract").first.click(timeout=30000)
        expect(fnd.get_by_text("Added to contract").first).to_be_visible(timeout=20000)
        after = one("contracts", id=cid)
        print(f"  contract after: ${float(after['total_price']):,.0f}, {after['timeline_weeks']} weeks, {len(after['milestones'])} milestones")
        assert float(after["total_price"]) == float(before["total_price"]) + float(x["price_delta"])
        fnd.screenshot(path=str(OUT / "02-founder-approved.png"), full_page=True)
        fnd.goto(f"{WEB}/contracts/{cid}?tab=board")
        fnd.wait_for_timeout(2500)
        fnd.screenshot(path=str(OUT / "03-board.png"), full_page=True)

        # developer raises one; the founder must agree before any pricing happens
        dev.goto(f"{WEB}/contracts/{cid}?tab=changes")
        dev.get_by_role("button", name="Request a change").click()
        dev.locator("textarea").first.fill("Add an admin CSV export of all bookings for the tutor centre's accountant.")
        dev.get_by_role("button", name="Send to the founder").click()
        fnd.goto(f"{WEB}/contracts/{cid}?tab=changes")
        expect(fnd.get_by_role("button", name="Let the agents price it")).to_be_visible(timeout=120000)
        print("  developer-raised change waits for the founder's limits")
        fnd.screenshot(path=str(OUT / "04-dev-raised.png"), full_page=True)
        fnd.get_by_role("button", name="Not now").click()
        expect(fnd.get_by_text("Declined").first).to_be_visible(timeout=15000)

        # a status update is not a change: the scoping agent must refuse rather than invent one
        dev.get_by_role("button", name="Request a change").click()
        dev.locator("textarea").first.fill("Thanks! Starting on the calendar today.")
        dev.get_by_role("button", name="Send to the founder").click()
        expect(dev.get_by_text("Not scoped:").first).to_be_visible(timeout=120000)
        print("  non-request refused:", dev.get_by_text("Not scoped:").first.inner_text()[:120])
        b.close()
    print("CHANGE CHECK OK")


if __name__ == "__main__":
    main()
