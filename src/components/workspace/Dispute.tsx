"use client";

import { useState } from "react";
import { CheckCircle2, HelpCircle, Scale, XCircle } from "lucide-react";
import type { Dispute } from "@/lib/types";
import { AgentWorking, Badge, Button, usd } from "@/components/ui";

const REC = {
  approve: { label: "Release the full milestone", tone: "good" as const },
  partial: { label: "Release part and close the milestone", tone: "warn" as const },
  rework: { label: "Specific rework, money stays in escrow", tone: "info" as const },
};

const FINDING = {
  met: <CheckCircle2 className="h-4 w-4 text-good" />,
  not_met: <XCircle className="h-4 w-4 text-bad" />,
  unclear: <HelpCircle className="h-4 w-4 text-muted" />,
};

const textarea =
  "w-full resize-y rounded-xl border border-line-strong/80 bg-white px-3.5 py-2.5 text-[14px] leading-relaxed focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";

type Run = (key: string, path: string, body?: object) => Promise<void>;

/** "Disagree? Ask the Mediator" entry point for a milestone that was submitted and reviewed. */
export function OpenDispute({ cid, mid, side, busy, run }: { cid: string; mid: string; side: "client" | "developer"; busy: string | null; run: Run }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink">
        <Scale className="h-3.5 w-3.5" /> {side === "developer" ? "Believe this is done? Ask the Mediator Agent" : "Can't agree on this delivery? Ask the Mediator Agent"}
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl border border-line p-4">
      <p className="flex items-center gap-2 text-[14px] font-medium"><Scale className="h-4 w-4" /> Ask the Mediator Agent</p>
      <p className="text-[12px] leading-relaxed text-body">
        Explain what you think is and isn&apos;t done. The other side gives their view, then a neutral agent checks the evidence against each
        acceptance criterion and the agreed clarifications, and proposes an outcome. Nothing happens unless you both accept it.
      </p>
      <textarea className={textarea} rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus
        placeholder={side === "developer" ? "e.g. All three criteria are met on the live site. The reminder emails the founder wants were never in the contract." : "e.g. The booking works, but reminders are part of criterion 3 and they are not sent."} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button disabled={text.trim().length < 10} loading={busy === `open-${mid}`}
          onClick={() => run(`open-${mid}`, `/api/contracts/${cid}/milestones/${mid}/disputes`, { statement: text.trim() })}>
          Open dispute
        </Button>
      </div>
    </div>
  );
}

/** One dispute: statements, the Mediator's ruling, and each side's acceptance. */
export function DisputeCard({ x, side, price, busy, run }: { x: Dispute; side: "client" | "developer"; price: number; busy: string | null; run: Run }) {
  const [reply, setReply] = useState("");
  const other = side === "client" ? "developer" : "client";
  const who = (s: string) => (s === "client" ? "Founder" : "Developer");
  const mine = x.opened_role === side;
  const r = x.ruling;
  const iAccepted = side === "client" ? x.client_accepted_at : x.developer_accepted_at;
  const theyAccepted = side === "client" ? x.developer_accepted_at : x.client_accepted_at;
  const closed = ["resolved", "rejected", "withdrawn"].includes(x.status);

  return (
    <div className={`space-y-4 rounded-2xl border p-4 ${closed ? "border-line" : "border-ink/20 bg-panel/60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[14px] font-medium"><Scale className="h-4 w-4" /> Mediation</p>
        <Badge tone={x.status === "resolved" ? "good" : x.status === "proposed" ? "warn" : x.status === "failed" ? "bad" : closed ? "neutral" : "info"}>
          {{ awaiting_response: mine ? `Waiting for the ${other === "client" ? "founder" : "developer"}` : "Your response needed", mediating: "Mediator reviewing", proposed: "Proposal ready", resolved: "Resolved", rejected: "Not accepted", withdrawn: "Withdrawn", failed: "Needs a retry" }[x.status]}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(["client", "developer"] as const).map((s) => {
          const st = s === "client" ? x.client_statement : x.developer_statement;
          return (
            <div key={s} className="rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-line">
              <p className="text-[11px] font-semibold text-muted">{who(s)}{s === x.opened_role ? " · opened" : ""}</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{st || <span className="text-muted">{x.status === "awaiting_response" ? "Not answered yet" : "Chose not to add a statement"}</span>}</p>
            </div>
          );
        })}
      </div>

      {x.status === "awaiting_response" && !mine && (
        <div className="space-y-2">
          <textarea className={textarea} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Your side, in a few sentences. Point to criteria, messages or the live site." />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" loading={busy === `skip-${x.id}`} onClick={() => run(`skip-${x.id}`, `/api/disputes/${x.id}/respond`, { statement: "" })}>Skip, let the Mediator decide</Button>
            <Button disabled={!reply.trim()} loading={busy === `reply-${x.id}`} onClick={() => run(`reply-${x.id}`, `/api/disputes/${x.id}/respond`, { statement: reply.trim() })}>Send to the Mediator</Button>
          </div>
        </div>
      )}
      {x.status === "awaiting_response" && mine && (
        <div className="flex items-center justify-between gap-3 text-[12px] text-muted">
          <span>The Mediator starts as soon as the {other === "client" ? "founder" : "developer"} answers.</span>
          <button onClick={() => run(`wd-${x.id}`, `/api/disputes/${x.id}/withdraw`)} className="font-medium hover:text-bad">Withdraw</button>
        </div>
      )}

      {x.status === "mediating" && <AgentWorking agent="Mediator Agent" task="Checking the evidence against each acceptance criterion and the agreed clarifications" />}

      {x.status === "failed" && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-bad-bg px-3.5 py-2.5 text-[13px] text-bad">
          The AI model was unavailable. Nothing changed.
          <Button size="sm" variant="secondary" loading={busy === `retry-${x.id}`} onClick={() => run(`retry-${x.id}`, `/api/disputes/${x.id}/retry`)}>Retry</Button>
        </div>
      )}

      {r && (
        <div className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-line">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Mediator&apos;s proposal</p>
              <p className="mt-1 text-[16px] font-medium tracking-[-0.01em]">{REC[r.recommendation].label}</p>
            </div>
            {r.recommendation !== "rework" && (
              <div className="text-right">
                <p className="text-[22px] font-medium tabular-nums tracking-[-0.02em]">{usd((price * r.release_percent) / 100)}</p>
                <p className="text-[11px] text-muted">{r.release_percent}% to the developer{r.release_percent < 100 ? `, ${usd(price - (price * r.release_percent) / 100)} back to the founder` : ""}</p>
              </div>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-ink">{r.summary}</p>
          <ul className="space-y-1.5">
            {r.findings.map((f) => (
              <li key={f.criterion} className="flex gap-2 rounded-lg bg-panel px-3 py-2">
                <span className="mt-0.5">{FINDING[f.finding]}</span>
                <div><p className="text-[12px] font-semibold text-ink">{f.criterion}</p><p className="text-[12px] text-body">{f.reasoning}</p></div>
              </li>
            ))}
          </ul>
          {r.scope_creep && <p className="rounded-lg bg-warn-bg px-3 py-2 text-[12px] text-warn">Part of this is beyond the written contract. The fair route for that is a change request.</p>}
          {r.rework_items.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-ink">Rework</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-body">{r.rework_items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          )}
          <p className="text-[12px] leading-relaxed text-body">{r.rationale}</p>
          <p className="border-l-2 border-ink/20 pl-3 text-[12px] italic text-body">{side === "client" ? r.note_to_founder : r.note_to_developer}</p>

          {x.status === "proposed" && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <div className="space-y-0.5 text-[12px]">
                <p className={iAccepted ? "text-good" : "text-muted"}>{iAccepted ? "✓ You accepted" : "○ Your decision"}</p>
                <p className={theyAccepted ? "text-good" : "text-muted"}>{theyAccepted ? "✓" : "○"} {who(other)} {theyAccepted ? "accepted" : "hasn't decided"}</p>
              </div>
              {!iAccepted && (
                <div className="flex gap-2">
                  <Button variant="ghost" loading={busy === `rej-${x.id}`} onClick={() => run(`rej-${x.id}`, `/api/disputes/${x.id}/reject`)}>Don&apos;t accept</Button>
                  <Button loading={busy === `acc-${x.id}`} onClick={() => run(`acc-${x.id}`, `/api/disputes/${x.id}/accept`)}>Accept proposal</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {x.outcome && <p className={`text-[13px] ${x.status === "resolved" ? "text-good" : "text-body"}`}>{x.outcome}</p>}
    </div>
  );
}
