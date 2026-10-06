"""Two-browser check of project communication: live chat, typing, attachments, #milestone refs,
pinned decisions, read receipts, inbox badges and weekly check-ins.

    python -m scripts.ui_chat_check [out_dir]
"""
from __future__ import annotations

import struct
import sys
import tempfile
import zlib
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from app.db import db
from scripts.screens import WEB, sign_in

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "ui-chat")


def tiny_png(path: Path) -> None:
    """A real 64x40 PNG (solid clay colour) to attach."""
    w, h = 64, 40
    raw = b"".join(b"\x00" + bytes([232, 137, 90]) * w for _ in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def contract_id() -> str:
    ayam = db().table("developers").select("id").eq("full_name", "Ayam Shrestha").execute().data[0]["id"]
    return db().table("contracts").select("id").eq("developer_id", ayam).eq("status", "active").order("created_at", desc=True).limit(1).execute().data[0]["id"]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    img = Path(tempfile.gettempdir()) / "wireframe.png"
    tiny_png(img)
    cid = contract_id()
    with sync_playwright() as p:
        b = p.chromium.launch()
        dev = b.new_context(viewport={"width": 1280, "height": 900}).new_page()
        fnd = b.new_context(viewport={"width": 1280, "height": 900}).new_page()
        sign_in(dev, "ayam@instajob.demo")
        sign_in(fnd, "founder@instajob.demo")
        for pg in (dev, fnd):
            pg.goto(f"{WEB}/contracts/{cid}?tab=messages")
            pg.get_by_placeholder("Message the").wait_for(timeout=30000)
        fnd.wait_for_timeout(2000)

        # typing indicator, then a message with an attachment and a milestone reference
        box = dev.get_by_placeholder("Message the")
        box.press_sequentially("Uploading the booking wireframe for ", delay=40)
        expect(fnd.get_by_text("The developer is typing")).to_be_visible(timeout=8000)
        print("  founder sees 'typing…'")
        dev.locator('input[type="file"]').set_input_files(str(img))
        dev.get_by_text("wireframe.png").wait_for(timeout=20000)
        box.press_sequentially("#m2 — does the slot picker look right?", delay=10)
        box.press("Enter")
        expect(fnd.get_by_text("does the slot picker look right?").last).to_be_visible(timeout=15000)
        print("  founder received the message live")
        expect(fnd.locator("img[alt='wireframe.png']").last).to_be_visible(timeout=15000)
        chip = fnd.get_by_role("button", name="m2", exact=False).first
        print("  #m2 rendered as a milestone chip:", chip.is_visible())

        # founder replies and pins it as a decision
        fbox = fnd.get_by_placeholder("Message the")
        fbox.fill("Yes. Decision: slots are 60 minutes, bookable up to 14 days ahead.")
        fbox.press("Enter")
        msg = fnd.get_by_text("slots are 60 minutes").last
        msg.hover()
        fnd.get_by_title("Pin as an agreed decision").last.click()
        expect(dev.get_by_text("agreed decision").first).to_be_visible(timeout=15000)
        print("  developer sees the pinned decision")
        expect(dev.get_by_text("Seen").last).to_be_visible(timeout=15000)
        print("  developer's message shows 'Seen'")
        dev.screenshot(path=str(OUT / "01-dev-chat.png"))
        fnd.screenshot(path=str(OUT / "02-founder-chat.png"))

        # decision appears on the contract
        fnd.goto(f"{WEB}/contracts/{cid}?tab=contract")
        expect(fnd.get_by_text("Agreed clarifications")).to_be_visible(timeout=20000)
        print("  decision listed under Agreed clarifications on the contract")

        # check-in: developer drafts with AI and posts; founder acknowledges
        dev.goto(f"{WEB}/contracts/{cid}?tab=checkins")
        dev.get_by_role("button", name="Draft with AI").click(timeout=20000)
        expect(dev.get_by_text("AI draft: edit before posting")).to_be_visible(timeout=60000)
        print("  AI draft ->", dev.locator("textarea").first.input_value()[:110].replace("\n", " | "))
        dev.get_by_role("button", name="Post check-in").click()
        fnd.goto(f"{WEB}/contracts/{cid}?tab=checkins")
        fnd.get_by_role("button", name="Acknowledge").first.click(timeout=20000)
        expect(dev.get_by_text("Acknowledged").first).to_be_visible(timeout=15000)
        print("  developer sees the check-in acknowledged live")
        dev.screenshot(path=str(OUT / "03-checkins.png"), full_page=True)

        # inbox + sidebar badge for the founder after a new developer message
        dev.goto(f"{WEB}/contracts/{cid}?tab=messages")
        dbox = dev.get_by_placeholder("Message the")
        dbox.fill("Thanks! Starting on the calendar today.")
        dbox.press("Enter")
        fnd.goto(f"{WEB}/inbox")
        fnd.get_by_text("Starting on the calendar today").wait_for(timeout=20000)
        print("  founder inbox shows the latest message")
        fnd.screenshot(path=str(OUT / "04-inbox.png"))
        b.close()
    print("CHAT CHECK OK")


if __name__ == "__main__":
    main()
