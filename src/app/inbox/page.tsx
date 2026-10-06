"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Inbox as InboxIcon, MessageSquare } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar, Badge, Empty, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { InboxItem } from "@/lib/types";

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
};

export default function InboxPage() {
  const { me } = useAuth();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ conversations: InboxItem[] }>("/api/inbox")).conversations);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  useEffect(() => {
    if (!me) return;
    const ch = supabase
      .channel("inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_comments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "check_ins" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [me, load]);

  const isDev = me?.role === "developer";

  return (
    <AppShell ready={!!me}>
      <PageHeader title="Inbox" sub="Every project conversation in one place: messages, check-ins and what needs your reply." />
      <ErrorNote message={error} onRetry={load} />
      {!items && !error && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>}
      {items && !items.length && (
        <Empty icon={<InboxIcon className="h-5 w-5" />} title="No conversations yet"
          body="Once a contract is signed, you and the other side get a shared project chat. It will show up here." />
      )}
      <div className="space-y-2">
        {items?.map((c) => {
          const lm = c.last_message;
          const fromMe = lm && lm.author_id === me?.id;
          return (
            <Link key={c.contract_id} href={`/contracts/${c.contract_id}?tab=messages`}
              className={`flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition-all hover:border-ink/25 hover:bg-white ${c.unread ? "border-ink/15 bg-white shadow-[0_1px_2px_rgba(20,20,19,0.05)]" : "border-line bg-panel/60"}`}>
              <Avatar name={c.with || c.title} className="h-11 w-11 text-[13px]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`truncate text-[14px] ${c.unread ? "font-semibold" : "font-medium"}`}>
                    {c.with} <span className="font-normal text-muted">· {c.title}</span>
                  </p>
                  {lm && <span className="shrink-0 text-[11px] text-muted">{ago(lm.created_at)}</span>}
                </div>
                <p className={`mt-0.5 truncate text-[13px] ${c.unread ? "text-ink" : "text-body"}`}>
                  {lm ? <>{fromMe && <span className="text-muted">You: </span>}{lm.body}</> : <span className="text-muted">No messages yet. Say hello.</span>}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {c.check_in_due && <Badge tone="warn"><ClipboardCheck className="h-3 w-3" /> {isDev ? "Weekly check-in due" : "Check-in overdue"}</Badge>}
                  {c.check_in_unacknowledged && <Badge tone="info"><ClipboardCheck className="h-3 w-3" /> New check-in to review</Badge>}
                </div>
              </div>
              {c.unread > 0 ? (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-clay px-1.5 text-[11px] font-semibold text-white">{c.unread}</span>
              ) : (
                <MessageSquare className="h-4 w-4 text-line-strong" />
              )}
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
