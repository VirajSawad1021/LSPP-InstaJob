"use client";

import { AlertCircle, CalendarDays, CheckSquare, Lock, MessageSquare } from "lucide-react";
import type { MilestoneStatus } from "@/lib/types";
import { usd } from "@/components/ui";

export interface BoardCard {
  key: string;
  milestoneId: string;
  title: string;
  project?: string;
  status: MilestoneStatus;
  price: number;
  dueDate: string | null;
  late: boolean;
  tasksDone: number;
  tasksTotal: number;
  comments?: number;
  /** Escrow state: true = fully funded, false = not yet funded, undefined = unknown or not applicable. */
  funded?: boolean;
}

const COLUMNS: { key: string; label: string; hint: string; match: MilestoneStatus[] }[] = [
  { key: "todo", label: "Up next", hint: "Not started yet", match: ["pending"] },
  { key: "doing", label: "In progress", hint: "Being built", match: ["in_progress", "changes_requested"] },
  { key: "review", label: "In review", hint: "Submitted, being verified", match: ["submitted"] },
  { key: "done", label: "Done", hint: "Approved and paid", match: ["approved"] },
];

export function fmtDate(d: string | null, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", opts) : "Not scheduled";
}

function Card({ c, onOpen }: { c: BoardCard; onOpen: (c: BoardCard) => void }) {
  const pct = c.tasksTotal ? Math.round((100 * c.tasksDone) / c.tasksTotal) : 0;
  return (
    <button
      onClick={() => onOpen(c)}
      className="group w-full rounded-2xl border border-line bg-white p-4 text-left shadow-[0_1px_2px_rgba(20,20,19,0.04)] transition-all hover:-translate-y-0.5 hover:border-ink/30 hover:shadow-[0_10px_24px_-16px_rgba(20,20,19,0.35)]"
    >
      {c.project && <p className="mb-1 truncate text-[11px] font-medium text-muted">{c.project}</p>}
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-medium leading-snug text-ink">
          <span className="mr-1 font-mono text-[11px] text-muted">{c.milestoneId}</span>
          {c.title}
        </p>
        <span className="shrink-0 text-[12px] font-medium tabular-nums text-ink">{usd(c.price)}</span>
      </div>
      {c.status === "changes_requested" && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn">
          <AlertCircle className="h-3 w-3" /> Changes requested
        </p>
      )}
      {c.tasksTotal > 0 && (
        <div className="mt-3">
          <div className="h-1 rounded-full bg-panel-2">
            <div className="h-1 rounded-full bg-ink transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className={`inline-flex items-center gap-1 whitespace-nowrap ${c.late ? "font-medium text-bad" : ""}`}>
          <CalendarDays className="h-3.5 w-3.5" />
          {c.late ? `Overdue · ${fmtDate(c.dueDate)}` : fmtDate(c.dueDate)}
        </span>
        {c.tasksTotal > 0 && (
          <span className="inline-flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" />{c.tasksDone}/{c.tasksTotal}</span>
        )}
        {!!c.comments && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{c.comments}</span>}
        {c.status !== "approved" && c.funded === true && <span className="ml-auto inline-flex items-center gap-1 font-medium text-ink" title="Held in escrow"><Lock className="h-3 w-3" />Secured</span>}
        {c.status !== "approved" && c.status !== "pending" && c.funded === false && <span className="ml-auto font-medium text-warn">Not funded</span>}
      </div>
    </button>
  );
}

/** Milestone kanban. Columns follow the contract state machine; cards move as work is submitted and approved. */
export function Board({ cards, onOpen, empty }: { cards: BoardCard[]; onOpen: (c: BoardCard) => void; empty?: string }) {
  if (!cards.length) return <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-[13px] text-muted">{empty ?? "No milestones yet."}</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[880px] grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const items = cards.filter((c) => col.match.includes(c.status));
          return (
            <div key={col.key} className="flex flex-col rounded-[20px] bg-panel p-3">
              <div className="flex items-baseline justify-between px-1 pb-3">
                <p className="text-[13px] font-medium text-ink">{col.label}</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] tabular-nums text-muted ring-1 ring-line">{items.length}</span>
              </div>
              <div className="space-y-2.5">
                {items.map((c) => <Card key={c.key} c={c} onOpen={onOpen} />)}
                {!items.length && <p className="px-1 py-6 text-center text-[12px] text-muted">{col.hint}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
