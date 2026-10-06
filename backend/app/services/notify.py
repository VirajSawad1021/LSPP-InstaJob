"""Notifications: always in-app (live via realtime), optionally by email for the important ones.

Every call is best-effort: a failed notification must never fail the action that caused it.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.config import APP_URL, EMAIL_FROM, RESEND_API_KEY
from app.db import db, now_iso, pool

log = logging.getLogger("instajob.notify")

# Kinds worth an email (a chat message is not; a payment or a dispute is).
EMAIL_KINDS = {
    "contract_ready", "contract_active", "funded", "submitted", "approved", "changes_requested",
    "change_proposed", "change_raised", "change_applied", "checkin_due", "dispute_opened", "dispute_ruling",
    "dispute_resolved", "offers_ready",
}


def party_ids(c: dict) -> dict[str, str | None]:
    dev = db().table("developers").select("user_id").eq("id", c["developer_id"]).limit(1).execute().data
    return {"client": c["client_id"], "developer": dev[0]["user_id"] if dev else None}


def notify(user_id: str | None, kind: str, title: str, body: str | None = None, *, contract_id: str | None = None,
           link: str | None = None) -> None:
    if not user_id:
        return
    try:
        row = db().table("notifications").insert({
            "user_id": user_id, "contract_id": contract_id, "kind": kind, "title": title[:200],
            "body": (body or "")[:600] or None, "link": link,
        }).execute().data[0]
        if RESEND_API_KEY and kind in EMAIL_KINDS:
            pool.submit(_email, row)
    except Exception as e:  # noqa: BLE001
        log.warning("notify failed: %s", e)


def notify_side(c: dict, side: str, kind: str, title: str, body: str | None = None, tab: str | None = None) -> None:
    """Notify one party of a contract ('client' or 'developer')."""
    try:
        uid = party_ids(c).get(side)
    except Exception as e:  # noqa: BLE001
        log.warning("notify lookup failed: %s", e)
        return
    notify(uid, kind, title, body, contract_id=c["id"], link=f"/contracts/{c['id']}" + (f"?tab={tab}" if tab else ""))


def notify_other(c: dict, actor_side: str, *args, **kwargs) -> None:
    notify_side(c, "developer" if actor_side == "client" else "client", *args, **kwargs)


def notify_both(c: dict, *args, **kwargs) -> None:
    notify_side(c, "client", *args, **kwargs)
    notify_side(c, "developer", *args, **kwargs)


def notify_message(c: dict, actor_side: str, author: str, text: str) -> None:
    """Chat messages collapse into one unread notification per conversation instead of one per message."""
    try:
        uid = party_ids(c).get("developer" if actor_side == "client" else "client")
        if not uid:
            return
        existing = (
            db().table("notifications").select("id").eq("user_id", uid).eq("contract_id", c["id"])
            .eq("kind", "message").is_("read_at", "null").limit(1).execute().data
        )
        title = f"{author} sent a message"
        if existing:
            db().table("notifications").update({"title": title, "body": text[:600], "created_at": now_iso()}).eq("id", existing[0]["id"]).execute()
        else:
            notify(uid, "message", title, text, contract_id=c["id"], link=f"/contracts/{c['id']}?tab=messages")
    except Exception as e:  # noqa: BLE001
        log.warning("notify_message failed: %s", e)


def recently_notified(user_id: str, contract_id: str, kind: str, within: timedelta) -> bool:
    since = (datetime.now(timezone.utc) - within).isoformat()
    return bool(
        db().table("notifications").select("id").eq("user_id", user_id).eq("contract_id", contract_id)
        .eq("kind", kind).gte("created_at", since).limit(1).execute().data
    )


def _email(n: dict) -> None:
    try:
        prof = db().table("profiles").select("email_notifications").eq("id", n["user_id"]).limit(1).execute().data
        if prof and not prof[0].get("email_notifications", True):
            return
        user = db().auth.admin.get_user_by_id(n["user_id"]).user
        if not user or not user.email or user.email.endswith("@instajob.demo"):
            return  # demo accounts have no real inbox
        url = APP_URL + (n.get("link") or "/")
        body = html.escape(n.get("body") or "")
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={
                "from": EMAIL_FROM, "to": [user.email], "subject": n["title"],
                "html": (
                    f"<div style='font-family:system-ui,sans-serif;max-width:520px;color:#141413'>"
                    f"<p style='font-size:16px;font-weight:600'>{html.escape(n['title'])}</p>"
                    f"<p style='font-size:14px;line-height:1.6;color:#4a4a45'>{body}</p>"
                    f"<p><a href='{url}' style='display:inline-block;background:#141413;color:#fff;padding:10px 18px;"
                    f"border-radius:999px;text-decoration:none;font-size:13px'>Open in InstaJob</a></p>"
                    f"<p style='font-size:11px;color:#8a877f'>You can turn these emails off from the bell menu in InstaJob.</p></div>"
                ),
            },
            timeout=10,
        )
        if r.status_code < 300:
            db().table("notifications").update({"emailed_at": now_iso()}).eq("id", n["id"]).execute()
        else:
            log.warning("email failed: %s %s", r.status_code, r.text[:200])
    except Exception as e:  # noqa: BLE001
        log.warning("email failed: %s", e)
