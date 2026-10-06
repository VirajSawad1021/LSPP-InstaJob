"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MilestoneStatus } from "@/lib/types";
import { fmtDate } from "./Board";

export interface TimelineRow {
  key: string;
  label: string;
  group?: string;
  status: MilestoneStatus;
  start: string | null;
  due: string | null;
  late: boolean;
}

const DAY = 86_400_000;
const toMs = (d: string) => new Date(`${d}T00:00:00`).getTime();
const todayMs = () => {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
};

function barTone(r: TimelineRow) {
  if (r.status === "approved") return "bg-good";
  if (r.late) return "bg-bad";
  if (r.status === "pending") return "bg-line-strong";
  return "bg-ink";
}

/** Gantt-style view: sequential milestone bars against calendar weeks, with a "today" marker. */
export function Timeline({ rows }: { rows: TimelineRow[] }) {
  const scheduled = rows.filter((r) => r.start && r.due);
  if (!scheduled.length) {
    return <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-[13px] text-muted">The timeline appears once the contract is signed by both sides.</p>;
  }
  const min = Math.min(...scheduled.map((r) => toMs(r.start!)), todayMs());
  const max = Math.max(...scheduled.map((r) => toMs(r.due!)), todayMs() + 7 * DAY);
  const span = max - min;
  const pos = (ms: number) => `${((ms - min) / span) * 100}%`;
  const weeks: number[] = [];
  for (let t = min; t <= max; t += 7 * DAY) weeks.push(t);

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="min-w-[720px] rounded-[20px] border border-line bg-white p-4">
        <div className="grid grid-cols-[220px_1fr] gap-3">
          <div />
          <div className="relative h-6 border-b border-line">
            {weeks.map((w) => (
              <span key={w} className="absolute -translate-x-1/2 text-[10px] text-muted" style={{ left: pos(w) }}>
                {new Date(w).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            ))}
          </div>
          {rows.map((r, i) => {
            // Rows arrive grouped by project; print the project name above its first row.
            const header = r.group && (i === 0 || rows[i - 1].group !== r.group) ? r.group : null;
            return (
              <div key={r.key} className="contents">
                {header && <p className="col-span-2 pt-3 text-[12px] font-medium text-ink">{header}</p>}
                <div className="min-w-0 py-1.5">
                  <p className="truncate text-[13px] text-ink">{r.label}</p>
                  <p className={`text-[11px] ${r.late ? "text-bad" : "text-muted"}`}>
                    {r.due ? `${r.late ? "Overdue · " : "Due "}${fmtDate(r.due)}` : "Not scheduled"}
                  </p>
                </div>
                <div className="relative my-1.5 h-8 rounded-lg bg-panel">
                  {weeks.map((w) => <span key={w} className="absolute inset-y-0 w-px bg-line" style={{ left: pos(w) }} />)}
                  {r.start && r.due && (
                    <span
                      className={`absolute inset-y-1.5 rounded-md ${barTone(r)} transition-all`}
                      style={{ left: pos(toMs(r.start)), width: `calc(${((toMs(r.due) - toMs(r.start)) / span) * 100}% - 2px)` }}
                      title={`${fmtDate(r.start)} to ${fmtDate(r.due)}`}
                    />
                  )}
                  <span className="absolute inset-y-0 w-0.5 bg-clay" style={{ left: pos(todayMs()) }} title="Today" />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 border-t border-line pt-3 text-[11px] text-body">
          {[["bg-line-strong", "Up next"], ["bg-ink", "In progress / review"], ["bg-good", "Done"], ["bg-bad", "Overdue"], ["bg-clay", "Today"]].map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5"><span className={`h-2 w-3 rounded-sm ${c}`} />{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface CalendarEvent {
  date: string;
  label: string;
  tone: "due" | "late" | "done" | "start";
  onClick?: () => void;
}

const TONES: Record<CalendarEvent["tone"], string> = {
  due: "bg-ink text-white",
  late: "bg-bad-bg text-bad",
  done: "bg-good-bg text-good",
  start: "bg-info-bg text-info",
};

/** Month calendar of milestone starts and due dates. */
export function CalendarMonth({ events }: { events: CalendarEvent[] }) {
  const initial = useMemo(() => {
    const now = new Date();
    const upcoming = events.map((e) => toMs(e.date)).filter((t) => t >= todayMs()).sort((a, b) => a - b)[0];
    const d = upcoming ? new Date(upcoming) : now;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [events]);
  const [month, setMonth] = useState(initial);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((startOffset + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - startOffset + 1;
    return day >= 1 && day <= daysInMonth ? new Date(month.getFullYear(), month.getMonth(), day) : null;
  });
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const today = key(new Date());

  return (
    <div className="rounded-[20px] border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[15px] font-medium">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
        <div className="flex gap-1">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-full p-1.5 text-body hover:bg-panel-2" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="rounded-full px-3 text-[12px] text-body hover:bg-panel-2">Today</button>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-full p-1.5 text-body hover:bg-panel-2" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <p key={d} className="bg-panel py-1.5 text-center text-[11px] font-medium text-muted">{d}</p>
        ))}
        {cells.map((d, i) => {
          const evs = d ? byDay.get(key(d)) ?? [] : [];
          return (
            <div key={i} className={`min-h-[84px] p-1.5 ${d ? "bg-white" : "bg-panel/60"}`}>
              {d && (
                <p className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${key(d) === today ? "bg-clay font-semibold text-white" : "text-body"}`}>
                  {d.getDate()}
                </p>
              )}
              <div className="space-y-1">
                {evs.map((e, j) => (
                  <button key={j} onClick={e.onClick} className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[10.5px] font-medium ${TONES[e.tone]}`} title={e.label}>
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
