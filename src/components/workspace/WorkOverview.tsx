"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { WorkItem } from "@/lib/types";
import { ArtTile, Badge, Empty, ErrorNote, Skeleton, usd } from "@/components/ui";
import { Board, fmtDate, type BoardCard } from "./Board";
import { CalendarMonth, Timeline } from "./Timeline";

const HEALTH = {
  on_track: ["On track", "good"], late: ["Behind", "bad"], done: ["Completed", "good"], not_started: ["Awaiting signatures", "warn"],
} as const;

/** Every contract at a glance: project cards, then one board / calendar / timeline across all of them. */
export function WorkOverview({ role, emptyAction }: { role: "client" | "developer"; emptyAction: React.ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "calendar" | "timeline">("board");

  const load = useCallback(async () => {
    try {
      setItems(await api<WorkItem[]>("/api/work"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const cards: BoardCard[] = useMemo(
    () => (items ?? []).filter((w) => w.status !== "pending_approval").flatMap((w) =>
      w.schedule.milestones.map((m) => ({
        key: `${w.contract_id}:${m.id}`, milestoneId: m.id, title: m.title, project: w.title, status: m.status, price: m.price,
        dueDate: m.due_date, late: m.late, tasksDone: m.tasks_done, tasksTotal: m.tasks_total,
      })),
    ),
    [items],
  );
  const byKey = useMemo(() => new Map((items ?? []).map((w) => [w.contract_id, w])), [items]);
  const open = (contractId: string) => router.push(`/contracts/${contractId}`);

  if (error) return <ErrorNote message={error} onRetry={load} />;
  if (!items) return <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>;
  if (!items.length) {
    return <Empty title="No contracts yet" body={role === "developer" ? "When a founder picks your agent's offer, the project shows up here." : "Once you choose a deal, the project's progress shows up here."} action={emptyAction} />;
  }

  const active = items.filter((w) => w.status === "active");
  const dueSoon = active.flatMap((w) => w.schedule.milestones.filter((m) => m.days_left != null && m.days_left <= 7 && m.status !== "approved")).length;
  const held = items.reduce((a, w) => a + (w.escrow?.held ?? 0), 0);
  const paid = items.reduce((a, w) => a + w.schedule.paid, 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Active projects", String(active.length)],
          ["Due in 7 days", String(dueSoon)],
          [role === "developer" ? "Earned" : "Paid", usd(paid)],
          [role === "developer" ? "Secured in escrow" : "Held in escrow", usd(held)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] text-muted">{k}</p>
            <p className="mt-0.5 text-[22px] font-medium tabular-nums tracking-[-0.02em]">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((w) => {
          const [label, tone] = HEALTH[w.schedule.health];
          const next = w.schedule.milestones.find((m) => m.status !== "approved");
          return (
            <Link key={w.contract_id} href={`/contracts/${w.contract_id}`} className="group overflow-hidden rounded-[22px] border border-line bg-white transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(20,20,19,0.35)]">
              <ArtTile seed={w.contract_id} className="h-16" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px] font-medium leading-snug">{w.title}</p>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <p className="mt-1 text-[12px] text-muted">{role === "developer" ? `for ${w.client_name}` : `with ${w.developer_name}`}</p>
                <div className="mt-4 flex items-center justify-between text-[12px]">
                  <span className="text-body">{w.schedule.approved}/{w.schedule.count} milestones</span>
                  <span className="font-medium tabular-nums">{w.schedule.progress}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-panel-2"><div className="h-1.5 rounded-full bg-ink" style={{ width: `${w.schedule.progress}%` }} /></div>
                <p className="mt-3 flex items-center justify-between text-[12px] text-body">
                  {next ? `Next: ${next.title} · ${next.due_date ? fmtDate(next.due_date) : "after signing"}` : "All milestones approved"}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[17px] font-medium tracking-[-0.01em]">All milestones</p>
          <div className="flex gap-1 rounded-full bg-cream-2 p-1">
            {(["board", "calendar", "timeline"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-full px-4 py-1.5 text-[13px] font-medium capitalize ${view === v ? "bg-white text-ink shadow-sm" : "text-body"}`}>{v}</button>
            ))}
          </div>
        </div>
        {view === "board" && <Board cards={cards} onOpen={(c) => open(c.key.split(":")[0])} empty="Milestones appear here once contracts are signed." />}
        {view === "calendar" && (
          <CalendarMonth
            events={items.flatMap((w) => w.schedule.milestones.filter((m) => m.due_date).map((m) => ({
              date: m.due_date!, label: `${w.title.split(" ").slice(0, 2).join(" ")} · ${m.id}`,
              tone: m.status === "approved" ? ("done" as const) : m.late ? ("late" as const) : ("due" as const),
              onClick: () => open(w.contract_id),
            })))}
          />
        )}
        {view === "timeline" && (
          <Timeline rows={items.flatMap((w) => w.schedule.milestones.map((m) => ({
            key: `${w.contract_id}:${m.id}`, group: byKey.get(w.contract_id)?.title, label: `${m.id} · ${m.title}`,
            status: m.status, start: m.start_date, due: m.due_date, late: m.late,
          })))} />
        )}
      </div>
    </div>
  );
}
