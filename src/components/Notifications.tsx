"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  BadgeCheck, Bell, CheckCheck, ClipboardCheck, FilePlus2, FileSignature, Gavel, Handshake, Landmark, MessageSquareText,
  ScanSearch, Undo2, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { AppNotification } from "@/lib/types";

interface Data {
  notifications: AppNotification[];
  unread: number;
  email: { available: boolean; enabled: boolean };
}

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  message: MessageSquareText,
  contract_ready: FileSignature, contract_active: FileSignature, completed: BadgeCheck,
  funded: Landmark, approved: Landmark,
  submitted: ScanSearch, verified: ScanSearch, changes_requested: Undo2,
  change_raised: FilePlus2, change_proposed: FilePlus2, change_applied: FilePlus2, change_declined: FilePlus2,
  checkin: ClipboardCheck, checkin_ack: ClipboardCheck, checkin_due: ClipboardCheck,
  dispute_opened: Gavel, dispute_ruling: Gavel, dispute_resolved: Gavel,
  offers_ready: Handshake, negotiation: Handshake,
};

export function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Bell with live unread count, a panel of recent notifications, and a toast for new ones. */
export function NotificationBell({ placement }: { placement: "sidebar" | "header" }) {
  const { me } = useAuth();
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      setD(await api<Data>("/api/notifications"));
    } catch {
      /* the bell is never worth an error banner */
    }
  }, []);

  useEffect(() => {
    if (me?.id) load();
  }, [me?.id, load]);

  useEffect(() => {
    if (!me?.id) return;
    const ch = supabase
      .channel(`notifications-${me.id}-${placement}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` }, (p) => {
        if (placement === "sidebar") setToast(p.new as AppNotification);
        load();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [me?.id, placement, load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function go(n: AppNotification) {
    setOpen(false);
    setToast(null);
    if (!n.read_at) {
      setD((x) => x && { ...x, unread: Math.max(0, x.unread - 1), notifications: x.notifications.map((y) => (y.id === n.id ? { ...y, read_at: new Date().toISOString() } : y)) });
      api("/api/notifications/read", { body: { ids: [n.id] } }).catch(() => {});
    }
    if (n.link) router.push(n.link);
  }

  async function readAll() {
    setD((x) => x && { ...x, unread: 0, notifications: x.notifications.map((y) => ({ ...y, read_at: y.read_at ?? new Date().toISOString() })) });
    await api("/api/notifications/read", { body: { all: true } }).catch(() => {});
  }

  async function setEmail(enabled: boolean) {
    setD((x) => x && { ...x, email: { ...x.email, enabled } });
    await api("/api/notifications/email", { body: { enabled } }).catch(() => load());
  }

  const unread = d?.unread ?? 0;
  const pos = placement === "sidebar" ? "fixed left-[256px] top-3 w-[380px]" : "fixed inset-x-3 top-16";

  return (
    <>
      <button
        ref={button}
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-full p-2 text-body transition-colors hover:bg-white hover:text-ink ${open ? "bg-white text-ink ring-1 ring-line" : ""}`}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-clay px-1 text-[10px] font-semibold text-white ring-2 ring-cream">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && createPortal(
        <div ref={panel} className={`${pos} z-50 flex max-h-[min(640px,calc(100vh-24px))] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_60px_-20px_rgba(20,20,19,0.35)] animate-fade-in`}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[14px] font-medium">Notifications</p>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={readAll} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-muted hover:bg-panel-2 hover:text-ink">
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded-full p-1 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto scrollbar-thin">
            {d?.notifications.map((n) => {
              const Icon = ICON[n.kind] ?? Bell;
              return (
                <li key={n.id}>
                  <button onClick={() => go(n)} className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-panel ${n.read_at ? "" : "bg-cream/50"}`}>
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${n.read_at ? "bg-panel-2 text-muted" : "bg-ink text-white"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] leading-snug ${n.read_at ? "text-body" : "font-medium text-ink"}`}>{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-[12px] leading-relaxed text-muted">{n.body}</span>}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[11px] text-muted">{ago(n.created_at)}</span>
                      {!n.read_at && <span className="h-2 w-2 rounded-full bg-clay" />}
                    </span>
                  </button>
                </li>
              );
            })}
            {d && !d.notifications.length && (
              <li className="px-6 py-12 text-center">
                <Bell className="mx-auto h-5 w-5 text-muted" />
                <p className="mt-2 text-[13px] font-medium">You&apos;re all caught up</p>
                <p className="mt-1 text-[12px] text-muted">Messages, payments, approvals, change requests and check-ins show up here.</p>
              </li>
            )}
          </ul>
          {d?.email.available && (
            <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-line px-4 py-3 text-[12px] text-body">
              <span>Also email me about payments, approvals and disputes</span>
              <input type="checkbox" className="h-4 w-4 accent-black" checked={d.email.enabled} onChange={(e) => setEmail(e.target.checked)} />
            </label>
          )}
        </div>,
        document.body,
      )}

      {toast && !open && createPortal(
        <button
          onClick={() => go(toast)}
          className="fixed bottom-5 right-5 z-50 flex w-[340px] max-w-[calc(100vw-40px)] gap-3 rounded-2xl border border-line bg-white p-4 text-left shadow-[0_24px_60px_-20px_rgba(20,20,19,0.4)] animate-rise"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white">
            {(() => {
              const Icon = ICON[toast.kind] ?? Bell;
              return <Icon className="h-4 w-4" />;
            })()}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium leading-snug text-ink">{toast.title}</span>
            {toast.body && <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted">{toast.body}</span>}
          </span>
        </button>,
        document.body,
      )}
    </>
  );
}
