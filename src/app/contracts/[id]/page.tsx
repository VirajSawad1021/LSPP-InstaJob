"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardCheck, FilePlus2, FileSignature, Landmark, Lock, Scale, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Avatar, Badge, Button, ErrorNote, PageLoader, usd } from "@/components/ui";
import { Board, fmtDate, type BoardCard } from "@/components/workspace/Board";
import { Delivery } from "@/components/workspace/Delivery";
import { Chat } from "@/components/workspace/Chat";
import { CheckIns } from "@/components/workspace/CheckIns";
import { Changes } from "@/components/workspace/Changes";
import { Payments } from "@/components/workspace/Payments";
import { ActivityFeed, MilestonePanel } from "@/components/workspace/Panels";
import { CalendarMonth, Timeline } from "@/components/workspace/Timeline";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { WorkspaceData } from "@/lib/types";

const TABS = [
  { key: "board", label: "Board" },
  { key: "messages", label: "Messages" },
  { key: "checkins", label: "Check-ins" },
  { key: "changes", label: "Changes" },
  { key: "payments", label: "Payments" },
  { key: "timeline", label: "Timeline" },
  { key: "activity", label: "Activity" },
  { key: "contract", label: "Contract & delivery" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const HEALTH = {
  on_track: { label: "On track", tone: "good" as const },
  late: { label: "Behind schedule", tone: "bad" as const },
  done: { label: "Completed", tone: "good" as const },
  not_started: { label: "Awaiting signatures", tone: "warn" as const },
};

function Workspace() {
  const { me, session, loading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as Tab) || "board";
  const [d, setD] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [changeDraft, setChangeDraft] = useState<{ messageId: string; text: string } | null>(null);
  const clearDraft = useCallback(() => setChangeDraft(null), []);

  const load = useCallback(async () => {
    try {
      setD(await api<WorkspaceData>(`/api/contracts/${id}/workspace`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    if (!loading && session) load();
  }, [loading, session, load]);

  // Both sides see each other's changes live.
  useEffect(() => {
    if (!session) return;
    const f = `contract_id=eq.${id}`;
    const ch = supabase
      .channel(`workspace-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "milestone_tasks", filter: f }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "project_comments", filter: f }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "milestone_submissions", filter: f }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts", filter: `id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `contract_id=eq.${id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [session, id, load]);

  const setTab = (t: Tab) => router.replace(`/contracts/${id}?tab=${t}`, { scroll: false });

  const cards: BoardCard[] = useMemo(() => {
    if (!d) return [];
    return d.schedule.milestones.map((m) => ({
      key: m.id, milestoneId: m.id, title: m.title, status: m.status, price: m.price, dueDate: m.due_date, late: m.late,
      tasksDone: m.tasks_done, tasksTotal: m.tasks_total, comments: d.comments.filter((c) => c.milestone_id === m.id).length,
      funded: d.contract.status === "active" ? d.escrow.milestones[m.id]?.fully_funded : undefined,
    }));
  }, [d]);

  const c = d?.contract;
  const s = d?.schedule;
  const health = s ? HEALTH[s.health] : null;
  const [funding, setFunding] = useState(false);

  async function fundNow(mid: string) {
    setFunding(true);
    try {
      await api(`/api/contracts/${id}/milestones/${mid}/fund`, { body: {} });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setFunding(false);
    }
  }

  /** The single most useful thing this person can do right now. */
  const next = useMemo(() => {
    if (!d || !c) return null;
    const client = d.side === "client";
    const myApproval = client ? c.client_approved_at : c.developer_approved_at;
    if (c.status === "pending_approval") {
      return myApproval
        ? { icon: FileSignature, text: `Waiting for the ${client ? "developer" : "founder"} to sign.`, tone: "muted" as const }
        : { icon: FileSignature, text: "Review the contract and sign to start.", action: "Review and sign", tab: "contract" as Tab };
    }
    if (d.disputes_waiting) return { icon: Scale, text: "A mediation needs your input.", action: "Open", tab: "contract" as Tab };
    if (d.changes_waiting) return { icon: FilePlus2, text: `${d.changes_waiting === 1 ? "A change request needs" : `${d.changes_waiting} change requests need`} your decision.`, action: "Review", tab: "changes" as Tab };
    const cur = c.milestones.find((m) => m.status !== "approved" && m.status !== "pending");
    const e = cur ? d.escrow.milestones[cur.id] : null;
    if (c.status === "active" && cur && e && !e.fully_funded) {
      return client
        ? { icon: Landmark, text: `Fund ${cur.id} (${cur.title}) so the developer can deliver it.`, fund: cur.id, amount: e.to_fund }
        : { icon: Landmark, text: `Waiting for the founder to fund ${cur.id}. You'll get a notification when ${usd(e.to_fund)} is in escrow.`, tone: "muted" as const };
    }
    const latest = cur && d.submissions.find((x) => x.milestone_id === cur.id);
    if (client && cur?.status === "submitted" && latest && ["verified", "needs_work"].includes(latest.status)) {
      return { icon: ScanSearch, text: `${cur.id} is delivered and verified. Review it and release payment.`, action: "Review delivery", tab: "contract" as Tab };
    }
    if (!client && cur?.status === "submitted" && latest && ["needs_work", "error"].includes(latest.status)) {
      return { icon: ScanSearch, text: `The Verification Agent flagged ${cur.id}. Fix the links or the work and resubmit before the founder reviews it.`, action: "Resubmit", tab: "contract" as Tab };
    }
    if (!client && d.check_in_due) return { icon: ClipboardCheck, text: "Your weekly check-in is due.", action: "Write it", tab: "checkins" as Tab };
    if (!client && cur && e?.fully_funded && (cur.status === "in_progress" || cur.status === "changes_requested")) {
      return { icon: Lock, text: `${cur.id} is secured in escrow (${usd(e.held)}). Submit it for verification when it's ready.`, action: "Submit", tab: "contract" as Tab };
    }
    return null;
  }, [d, c]);

  return (
    <AppShell ready={!!me} wide>
      <ErrorNote message={error} onRetry={load} />
      {!d && !error && <PageLoader />}
      {d && c && s && health && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <Link href={d.side === "client" ? `/client/projects/${c.project_id}` : "/developer/work"} className="text-[12px] font-medium text-muted hover:text-ink">
                ← {d.side === "client" ? "Project" : "My work"}
              </Link>
              <h1 className="mt-2 text-[24px] font-medium leading-tight tracking-[-0.03em] sm:text-[30px]">{c.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-body">
                <span className="inline-flex items-center gap-2"><Avatar name={d.developer.full_name} className="h-6 w-6 text-[9px]" />{d.developer.full_name}</span>
                <span className="text-line-strong">·</span>
                <span className="inline-flex items-center gap-2"><Avatar name={d.client_name || "Founder"} className="h-6 w-6 text-[9px]" />{d.client_name}</span>
                <Badge tone={health.tone}>{health.label}</Badge>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-[560px] sm:grid-cols-4">
              {[
                ["Progress", `${s.progress}%`],
                ["In escrow", usd(d.escrow.held)],
                ["Paid", `${usd(s.paid)} / ${usd(s.total)}`],
                ["Finish", s.end_date ? fmtDate(s.end_date) : "After signing"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-line bg-white px-4 py-3">
                  <p className="text-[11px] text-muted">{k}</p>
                  <p className="mt-0.5 truncate text-[16px] font-medium tabular-nums tracking-[-0.01em]">{v}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-ink transition-all duration-700" style={{ width: `${s.progress}%` }} />
          </div>

          {next && (
            <div className={`mt-5 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 ${next.tone === "muted" ? "bg-panel" : "bg-ink text-white"}`}>
              <next.icon className={`h-4 w-4 shrink-0 ${next.tone === "muted" ? "text-muted" : "text-white/80"}`} />
              <p className={`min-w-0 flex-1 text-[13px] ${next.tone === "muted" ? "text-body" : ""}`}>{next.text}</p>
              {"fund" in next && next.fund && (
                <Button size="sm" variant="light" loading={funding} onClick={() => fundNow(next.fund!)}>
                  <Landmark className="h-3.5 w-3.5" /> Fund {usd(next.amount ?? 0)}
                </Button>
              )}
              {"tab" in next && next.tab && next.tab !== tab && (
                <Button size="sm" variant="light" onClick={() => setTab(next.tab!)}>{next.action} <ArrowRight className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          )}

          <div className="mt-8 flex gap-1 overflow-x-auto border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${tab === t.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                {t.label}
                {t.key === "messages" && d.unread_messages > 0 && tab !== "messages" && (
                  <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-clay px-1.5 text-[10px] font-semibold text-white">{d.unread_messages}</span>
                )}
                {t.key === "changes" && d.changes_waiting > 0 && tab !== "changes" && (
                  <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-warn px-1.5 text-[10px] font-semibold text-white">{d.changes_waiting}</span>
                )}
                {t.key === "contract" && d.disputes_waiting > 0 && tab !== "contract" && (
                  <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-warn px-1.5 text-[10px] font-semibold text-white">{d.disputes_waiting}</span>
                )}
                {t.key === "checkins" && d.check_in_due && <span className="ml-1.5 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full bg-warn" title="Check-in due" />}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {tab === "board" && (
              <Board cards={cards} onOpen={(card) => setOpen(card.milestoneId)} />
            )}
            {tab === "timeline" && (
              <div className="space-y-6">
                <Timeline rows={s.milestones.map((m) => ({ key: m.id, label: `${m.id} · ${m.title}`, status: m.status, start: m.start_date, due: m.due_date, late: m.late }))} />
                <CalendarMonth
                  events={s.milestones.flatMap((m) => [
                    ...(m.start_date ? [{ date: m.start_date, label: `Start ${m.id}`, tone: "start" as const, onClick: () => setOpen(m.id) }] : []),
                    ...(m.due_date ? [{ date: m.due_date, label: `${m.id} due`, tone: m.status === "approved" ? ("done" as const) : m.late ? ("late" as const) : ("due" as const), onClick: () => setOpen(m.id) }] : []),
                  ])}
                />
              </div>
            )}
            {tab === "messages" && (
              <Chat
                cid={id}
                onOpenMilestone={setOpen}
                onChangeRequest={c.status === "active" || c.status === "completed" ? (m) => {
                  setChangeDraft({ messageId: m.id, text: m.body });
                  setTab("changes");
                } : undefined}
              />
            )}
            {tab === "changes" && (
              <Changes cid={id} draft={changeDraft} onDraftUsed={clearDraft} onChanged={load} milestones={c.milestones.map((m) => ({ id: m.id, title: m.title }))} />
            )}
            {tab === "checkins" && <CheckIns cid={id} onPosted={load} />}
            {tab === "activity" && <ActivityFeed data={d} onChanged={load} />}
            {tab === "contract" && <Delivery id={id} onChanged={load} onOpenPayments={() => setTab("payments")} />}
            {tab === "payments" && <Payments cid={id} version={c.updated_at} onChanged={load} />}
          </div>

          {open && (
            <MilestonePanel
              data={d}
              milestoneId={open}
              onClose={() => setOpen(null)}
              onChanged={load}
              onOpenDelivery={() => {
                setOpen(null);
                setTab("contract");
              }}
            />
          )}
        </>
      )}
    </AppShell>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Workspace />
    </Suspense>
  );
}
