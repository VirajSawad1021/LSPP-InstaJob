"""Two-browser check of escrow, the Mediator's resolved dispute, and notifications (bell + toast).
Uses the newest contract from `python -m scripts.e2e` (m1 funded, mediated to rework).

    python -m scripts.ui_money_check [out_dir]
"""
from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from app.db import db
from scripts.screens import WEB, sign_in

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "ui-money")


def latest_contract() -> str:
    ayam = db().table("developers").select("id").eq("full_name", "Ayam Shrestha").execute().data[0]["id"]
    return db().table("contracts").select("id").eq("developer_id", ayam).order("created_at", desc=True).limit(1).execute().data[0]["id"]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cid = latest_contract()
    with sync_playwright() as p:
        b = p.chromium.launch()
        dev = b.new_context(viewport={"width": 1360, "height": 900}).new_page()
        fnd = b.new_context(viewport={"width": 1360, "height": 900}).new_page()
        sign_in(dev, "ayam@instajob.demo")
        sign_in(fnd, "founder@instajob.demo")

        # resolved mediation is on the record
        fnd.goto(f"{WEB}/contracts/{cid}?tab=contract")
        expect(fnd.get_by_text("Mediator's proposal").first).to_be_visible(timeout=30000)
        fnd.get_by_text("Mediator's proposal").first.scroll_into_view_if_needed()
        fnd.screenshot(path=str(OUT / "01-mediation.png"))
        print("  mediation ruling shown on the contract")

        # developer resubmits m1 (funded, so allowed)
        dev.goto(f"{WEB}/contracts/{cid}?tab=contract")
        dev.get_by_placeholder("https://your-deploy.vercel.app").first.fill("https://nextjs.org/learn")
        dev.get_by_role("button", name="Submit for verification").first.click()
        print("  developer resubmitted m1")

        # founder gets a live toast + bell count, then approves from the next-step bar
        fnd.goto(f"{WEB}/contracts/{cid}?tab=board")
        expect(fnd.get_by_text("is ready for your review").first).to_be_visible(timeout=120000)
        print("  founder toast: m1 ready for review")
        fnd.get_by_role("button", name="Review delivery").click()
        fnd.get_by_role("button", name="Approve and release").first.click(timeout=30000)
        expect(dev.get_by_text("released to you").first).to_be_visible(timeout=30000)
        print("  developer toast: payment released")
        dev.screenshot(path=str(OUT / "02-dev-toast.png"))

        # founder funds m2 from the next-step bar
        fnd.goto(f"{WEB}/contracts/{cid}?tab=board")
        fnd.get_by_role("button", name="Fund $").click(timeout=30000)
        expect(fnd.get_by_role("button", name="Fund $")).to_have_count(0, timeout=20000)
        print("  founder funded m2 from the next-step bar")
        fnd.goto(f"{WEB}/contracts/{cid}?tab=payments")
        expect(fnd.get_by_text("Ledger")).to_be_visible(timeout=20000)
        fnd.wait_for_timeout(800)
        fnd.screenshot(path=str(OUT / "03-founder-payments.png"), full_page=True)
        dev.goto(f"{WEB}/contracts/{cid}?tab=payments")
        expect(dev.get_by_text("Secured for you")).to_be_visible(timeout=20000)
        dev.wait_for_timeout(800)
        dev.screenshot(path=str(OUT / "04-dev-payments.png"), full_page=True)

        # bell
        dev.get_by_role("button", name="Notifications").first.click()
        expect(dev.get_by_text("Mark all read")).to_be_visible(timeout=10000)
        dev.screenshot(path=str(OUT / "05-bell.png"))
        dev.get_by_text("Mark all read").click()
        expect(dev.get_by_role("button", name="Notifications", exact=True).first).to_be_visible(timeout=10000)
        print("  bell opened and marked all read")
        b.close()
    print("MONEY CHECK OK")


if __name__ == "__main__":
    main()
