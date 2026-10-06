"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CalendarDays, CheckCircle2, ClipboardCheck, FilePlus2, FileSignature, FileText, Gavel, Landmark, Scale, Wallet, MessageSquare, Pin, Play, ScanSearch, Send, ShieldCheck, ThumbsUp, Trash2, Undo2, Upload, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { ActivityItem, WorkspaceData } from "@/lib/types";
import { Avatar, Button, ErrorNote, inputCls, usd } from "@/components/ui";
import { fmtDate } from "./Board";

const STATUS_LABEL: Record<string, string> = {
  pending: "Up next", in_progress: "In progress", submitted: "In review", changes_requested: "Changes requested", approved: "Done",
};

function Composer({ placeholder, onSend }: { placeholder: string; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onSend(text.trim());
      setText("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-2">
      <input className={inputCls} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
      <Button onClick={send} loading={busy} disabled={!text.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
    </div>
  );
}

function Comment({ role, name, body, at, me }: { role: string; name: string | null; body: string; at: string; me: boolean }) {
  return (
    <div className={`flex gap-2.5 ${me ? "flex-row-reverse" : ""}`}>
      <Avatar name={name || role} className="h-7 w-7 text-[10px]" />
      <div className={`max-w-[85%] ${me ? "text-right" : ""}`}>
        <p className="text-[11px] text-muted">{name || (role === "client" ? "Founder" : "Developer")} · {new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
        <p className={`mt-0.5 inline-block rounded-2xl px-3 py-2 text-left text-[13px] leading-relaxed ${me ? "rounded-tr-md bg-ink text-white" : "rounded-tl-md bg-panel-2 text-ink"}`}>{body}</p>
      </div>
    </div>
  );
}

/** Slide-over for one milestone: acceptance criteria, shared task checklist and discussion. */
export function MilestonePanel({
  data, milestoneId, onClose, onChanged, onOpenDelivery,
}: { data: WorkspaceData; milestoneId: string; onClose: () => void; onChanged: () => Promise<void>; onOpenDelivery: () => void }) {
  const m = data.contract.milestones.find((x) => x.id === milestoneId)!;
  const sched = data.schedule.milestones.find((x) => x.id === milestoneId)!;
  const tasks = data.tasks.filter((t) => t.milestone_id === milestoneId);
  const comments = data.comments.filter((c) => c.milestone_id === milestoneId);
  const [newTask, setNewTask] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const canWork = data.contract.status === "active";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/25 animate-fade-in" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col bg-white shadow-2xl animate-fade-in">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0">
            <p className="text-[12px] text-muted"><span className="font-mono">{m.id}</span> · {STATUS_LABEL[m.status]}</p>
            <h3 className="mt-1 text-[20px] font-medium leading-snug tracking-[-0.02em]">{m.title}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-body">
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{sched.start_date ? `${fmtDate(sched.start_date)} to ${fmtDate(sched.due_date)}` : "Starts once signed"}</span>
              <span className="font-medium text-ink">{usd(m.price)}</span>
              {sched.late && <span className="font-medium text-bad">Overdue</span>}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6 scrollbar-thin">
          <ErrorNote message={error} />
          <section>
            <p className="text-[13px] font-medium text-ink">Done when</p>
            <ul className="mt-2 space-y-1.5">
              {m.acceptance_criteria.map((c) => (
                <li key={c} className="flex gap-2 text-[13px] leading-relaxed text-body"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{c}</li>
              ))}
            </ul>
          </section>

          <section>
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-medium text-ink">Tasks</p>
              <p className="text-[12px] text-muted">{tasks.filter((t) => t.done).length}/{tasks.length} done</p>
            </div>
            <p className="text-[12px] text-muted">A shared checklist, so both sides can see progress inside the milestone.</p>
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
              {tasks.map((t) => (
                <li key={t.id} className="group flex items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox" checked={t.done} disabled={!canWork}
                    onChange={(e) => run(() => api(`/api/tasks/${t.id}`, { method: "PATCH", body: { done: e.target.checked } }))}
                    className="h-4 w-4 shrink-0 accent-black"
                  />
                  <span className={`flex-1 text-[13px] ${t.done ? "text-muted line-through" : "text-ink"}`}>{t.title}</span>
                  {canWork && (
                    <button onClick={() => run(() => api(`/api/tasks/${t.id}`, { method: "DELETE" }))} className="text-muted opacity-0 transition-opacity hover:text-bad group-hover:opacity-100" aria-label="Delete task">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
              {!tasks.length && <li className="px-3 py-4 text-center text-[12px] text-muted">No tasks yet.</li>}
            </ul>
            {canWork && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTask.trim()) return;
                  const title = newTask.trim();
                  setNewTask("");
                  run(() => api(`/api/contracts/${data.contract.id}/tasks`, { body: { milestone_id: milestoneId, title } }));
                }}
              >
                <input className={inputCls} value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task, e.g. Build the search filters" />
                <Button type="submit" variant="secondary" disabled={!newTask.trim()}>Add</Button>
              </form>
            )}
          </section>

          <section>
            <p className="text-[13px] font-medium text-ink">Discussion</p>
            <div className="mt-3 space-y-3">
              {comments.map((c) => <Comment key={c.id} role={c.author_role} name={c.author_name} body={c.body} at={c.created_at} me={c.author_role === data.side} />)}
              {!comments.length && <p className="text-[12px] text-muted">No messages about this milestone yet.</p>}
            </div>
            <div className="mt-3">
              <Composer placeholder="Write to the other side…" onSend={(body) => run(() => api(`/api/contracts/${data.contract.id}/comments`, { body: { body, milestone_id: milestoneId } }))} />
            </div>
          </section>
        </div>

        <div className="border-t border-line px-6 py-4">
          <Button className="w-full" onClick={onOpenDelivery}>
            {data.side === "developer" ? "Submit this milestone for verification" : "Review delivery and payment"}
          </Button>
        </div>
      </aside>
    </div>
  );
}

const ICONS: Record<ActivityItem["kind"], React.ComponentType<{ className?: string }>> = {
  signed: FileSignature, started: Play, submitted: Upload, verified: ScanSearch, approved: BadgeCheck, changes: Undo2, task: CheckCircle2, comment: MessageSquare,
  decision: Pin, checkin: ClipboardCheck, ack: ThumbsUp, change: FilePlus2, amended: FileText,
  fund: Landmark, release: Wallet, refund: Undo2, dispute: Scale, resolved: Gavel,
};

/** Everything that happened on the project, newest first, plus a general discussion box. */
export function ActivityFeed({ data, onChanged }: { data: WorkspaceData; onChanged: () => Promise<void> }) {
  const titles = Object.fromEntries(data.contract.milestones.map((m) => [m.id, m.title]));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="rounded-[20px] border border-line bg-white p-5">
        <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
          {data.activity.map((e, i) => {
            const Icon = ICONS[e.kind];
            return (
              <li key={i} className="relative flex gap-3">
                <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${e.kind === "approved" ? "bg-good-bg text-good" : e.kind === "changes" ? "bg-warn-bg text-warn" : "bg-panel-2 text-ink"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 pt-1">
                  <p className={`text-[13px] leading-relaxed text-ink ${e.kind === "comment" ? "rounded-2xl bg-panel px-3 py-2" : ""}`}>
                    {e.kind === "comment" && <span className="mr-1 font-medium">{e.who === "client" ? data.client_name ?? "Founder" : data.developer.full_name}:</span>}
                    {e.text}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {new Date(e.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {e.milestone_id && ` · ${e.milestone_id} ${titles[e.milestone_id] ?? ""}`}
                  </p>
                </div>
              </li>
            );
          })}
          {!data.activity.length && <p className="text-[13px] text-muted">Nothing has happened yet.</p>}
        </ol>
      </div>
      <div className="h-fit space-y-3 rounded-[20px] border border-line bg-panel p-5 lg:sticky lg:top-6">
        <p className="text-[14px] font-medium">Message the {data.side === "client" ? "developer" : "founder"}</p>
        <p className="text-[12px] text-muted">For anything not tied to one milestone. Milestone questions go on the milestone card.</p>
        <Composer placeholder="Write a message…" onSend={async (body) => {
          await api(`/api/contracts/${data.contract.id}/comments`, { body: { body } });
          await onChanged();
        }} />
      </div>
    </div>
  );
}
