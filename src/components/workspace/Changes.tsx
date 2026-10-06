"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Bot, Check, ChevronDown, FilePlus2, MessageSquareQuote, ShieldCheck, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { ChangeRequest, ChangeStatus } from "@/lib/types";
import { AgentWorking, Badge, Button, Card, ErrorNote, Field, PageLoader, usd, type Tone } from "@/components/ui";

interface Data {
  side: "client" | "developer";
  changes: ChangeRequest[];
  headroom: { budget: number | null; weeks: number | null } | null;
}

const STATUS: Record<ChangeStatus, { label: string; tone: Tone }> = {
  scoping: { label: "Scoping", tone: "info" },
  awaiting_client: { label: "Awaiting founder", tone: "warn" },
  negotiating: { label: "Agents pricing", tone: "info" },
  proposed: { label: "Awaiting approval", tone: "warn" },
  approved: { label: "Added to contract", tone: "good" },
  rejected: { label: "Declined", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  impasse: { label: "No price agreed", tone: "bad" },
  failed: { label: "Needs a retry", tone: "bad" },
};

const ACTOR = {
  developer_agent: "Developer's agent",
  client_agent: "Founder's agent",
  guardrail: "Guardrail",
  system: "InstaJob",
} as const;

const input =
  "h-10 w-full rounded-xl border border-line-strong/80 bg-white px-3.5 text-[14px] tabular-nums focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";

const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v)));

/** Founder's private caps for one change: the agents can never agree above them. */
function Caps({ budget, weeks, onBudget, onWeeks }: { budget: string; weeks: string; onBudget: (v: string) => void; onWeeks: (v: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Most you'd pay for this change" hint="Private to your agent. Leave empty for no fixed cap.">
        <input className={input} inputMode="numeric" value={budget} onChange={(e) => onBudget(e.target.value.replace(/[^\d]/g, ""))} placeholder="e.g. 600" />
      </Field>
      <Field label="Most extra weeks" hint="0 means it has to fit in the current timeline.">
        <input className={input} inputMode="numeric" value={weeks} onChange={(e) => onWeeks(e.target.value.replace(/[^\d]/g, ""))} placeholder="e.g. 1" />
      </Field>
    </div>
  );
}

function ChangeCard({ x, side, headroom, busy, run, milestoneTitle }: {
  x: ChangeRequest;
  side: Data["side"];
  headroom: Data["headroom"];
  busy: string | null;
  run: (key: string, path: string, body?: object) => void;
  milestoneTitle: (id: string) => string;
}) {
  const [showTalk, setShowTalk] = useState(x.status === "negotiating");
  const [budget, setBudget] = useState(String(x.max_extra_budget ?? headroom?.budget ?? ""));
  const [weeks, setWeeks] = useState(String(x.max_extra_weeks ?? headroom?.weeks ?? ""));
  const st = STATUS[x.status];
  const s = x.scope;
  const isClient = side === "client";
  const mine = x.requested_role === side;
  const iApproved = isClient ? x.client_approved_at : x.developer_approved_at;
  const theyApproved = isClient ? x.developer_approved_at : x.client_approved_at;
  const talk = x.transcript.filter((t) => t.kind !== "scoped");
  const open = ["scoping", "awaiting_client", "negotiating", "proposed", "impasse", "failed"].includes(x.status);
  const [showScope, setShowScope] = useState(open);
  const caps = { max_extra_budget: num(budget), max_extra_weeks: num(weeks) };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
        <div className="min-w-0">
          <p className="text-[16px] font-medium tracking-[-0.01em]">{x.title}</p>
          <p className="mt-0.5 text-[12px] text-muted">
            Raised by the {x.requested_role === "client" ? "founder" : "developer"} · {new Date(x.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
            {x.source_message_id && <span className="inline-flex items-center gap-1"> · <MessageSquareQuote className="h-3 w-3" /> from a message</span>}
          </p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      <div className="space-y-4 px-5 pb-5">
        <p className="rounded-xl bg-panel px-3.5 py-2.5 text-[13px] leading-relaxed text-body">&ldquo;{x.description}&rdquo;</p>

        {x.status === "scoping" && <AgentWorking agent="Change Scoping Agent" task="Working out exactly what this change needs and how long it takes" />}

        {s && !showScope && (
          <button onClick={() => setShowScope(true)} className="inline-flex items-center gap-1 text-[12px] font-medium text-muted hover:text-ink">
            <ChevronDown className="h-3.5 w-3.5" /> Scope: {s.kind === "extend_milestone" ? `extends ${s.target_milestone_id}` : "new milestone"}, ~{s.est_hours} hours
          </button>
        )}
        {s && showScope && (
          <div className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <p className="text-[13px] text-ink">{s.goal}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Deliverables</p>
                  <ul className="space-y-1 text-[13px]">{s.deliverables.map((d) => <li key={d} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />{d}</li>)}</ul>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Checked by</p>
                  <ul className="space-y-1 text-[13px]">{s.acceptance_criteria.map((d) => <li key={d} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" />{d}</li>)}</ul>
                </div>
              </div>
              {s.impact && <p className="text-[12px] leading-relaxed text-muted">{s.impact}</p>}
            </div>
            <div className="flex gap-6 border-t border-line pt-3 sm:flex-col sm:gap-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
              <div>
                <p className="text-[11px] text-muted">Where</p>
                <p className="text-[13px] font-medium">{s.kind === "extend_milestone" ? `Extends ${s.target_milestone_id}` : "New milestone"}</p>
                {s.kind === "extend_milestone" && <p className="max-w-[160px] truncate text-[11px] text-muted">{milestoneTitle(s.target_milestone_id)}</p>}
              </div>
              <div>
                <p className="text-[11px] text-muted">Estimate</p>
                <p className="text-[13px] font-medium tabular-nums">~{s.est_hours} hours</p>
              </div>
            </div>
          </div>
        )}

        {x.status === "awaiting_client" && isClient && (
          <div className="space-y-4 rounded-xl border border-warn/40 bg-warn-bg/30 p-4">
            <p className="text-[13px] text-ink">The developer raised this change. If you want it, set your limits and both agents will agree on a price and timing.</p>
            <Caps budget={budget} weeks={weeks} onBudget={setBudget} onWeeks={setWeeks} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => run(`reject-${x.id}`, `/api/changes/${x.id}/reject`)} loading={busy === `reject-${x.id}`}>Not now</Button>
              <Button onClick={() => run(`price-${x.id}`, `/api/changes/${x.id}/price`, caps)} loading={busy === `price-${x.id}`}>
                <Bot className="h-4 w-4" /> Let the agents price it
              </Button>
            </div>
          </div>
        )}
        {x.status === "awaiting_client" && !isClient && (
          <p className="text-[13px] text-muted">Scoped. Waiting for the founder to agree to price it.</p>
        )}

        {x.status === "negotiating" && <AgentWorking agent="Both agents" task="Pricing just this change inside each side's hard limits" />}

        {x.status === "proposed" && x.price_delta != null && (
          <div className="rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex gap-8">
                <div><p className="text-[11px] text-muted">Adds to the contract</p><p className="text-[26px] font-medium tabular-nums tracking-[-0.02em]">+{usd(x.price_delta)}</p></div>
                <div><p className="text-[11px] text-muted">Extra time</p><p className="text-[26px] font-medium tabular-nums tracking-[-0.02em]">+{x.weeks_delta} {x.weeks_delta === 1 ? "week" : "weeks"}</p></div>
              </div>
              <div className="space-y-1 text-[12px]">
                <p className={iApproved ? "text-good" : "text-muted"}>{iApproved ? "✓ You approved" : "○ Your approval"}</p>
                <p className={theyApproved ? "text-good" : "text-muted"}>{theyApproved ? "✓" : "○"} {isClient ? "Developer" : "Founder"} {theyApproved ? "approved" : "hasn't approved yet"}</p>
              </div>
            </div>
            {!iApproved && (
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => run(`reject-${x.id}`, `/api/changes/${x.id}/reject`)} loading={busy === `reject-${x.id}`}>Decline</Button>
                <Button onClick={() => run(`approve-${x.id}`, `/api/changes/${x.id}/approve`)} loading={busy === `approve-${x.id}`}>
                  <Check className="h-4 w-4" /> Approve and amend contract
                </Button>
              </div>
            )}
          </div>
        )}

        {x.outcome && x.status !== "proposed" && (
          <p className={`text-[13px] ${x.status === "approved" ? "text-good" : x.status === "impasse" ? "text-bad" : "text-body"}`}>{x.outcome}</p>
        )}

        {x.status === "impasse" && isClient && (
          <div className="space-y-4 rounded-xl border border-line p-4">
            <p className="text-[13px] text-ink">Adjust your limits and let the agents try again, or decline the change.</p>
            <Caps budget={budget} weeks={weeks} onBudget={setBudget} onWeeks={setWeeks} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => run(`reject-${x.id}`, `/api/changes/${x.id}/reject`)} loading={busy === `reject-${x.id}`}>Decline</Button>
              <Button onClick={() => run(`price-${x.id}`, `/api/changes/${x.id}/price`, caps)} loading={busy === `price-${x.id}`}>Try again</Button>
            </div>
          </div>
        )}

        {x.status === "failed" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bad-bg px-4 py-3 text-[13px] text-bad">
            <span>The AI model was unavailable. Nothing was changed.</span>
            {!x.scope ? (
              <Button size="sm" variant="secondary" onClick={() => run(`retry-${x.id}`, `/api/changes/${x.id}/retry`)} loading={busy === `retry-${x.id}`}>Retry</Button>
            ) : isClient ? (
              <Button size="sm" variant="secondary" onClick={() => run(`price-${x.id}`, `/api/changes/${x.id}/price`, caps)} loading={busy === `price-${x.id}`}>Retry pricing</Button>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {talk.length > 0 ? (
            <button onClick={() => setShowTalk((v) => !v)} className="inline-flex items-center gap-1 text-[12px] font-medium text-muted hover:text-ink">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showTalk ? "rotate-180" : ""}`} /> Agents&apos; conversation ({talk.length})
            </button>
          ) : <span />}
          {mine && open && (
            <button onClick={() => run(`withdraw-${x.id}`, `/api/changes/${x.id}/withdraw`)} className="text-[12px] font-medium text-muted hover:text-bad">
              Withdraw
            </button>
          )}
        </div>
        {showTalk && talk.length > 0 && (
          <ol className="space-y-2 border-l border-line pl-4">
            {talk.map((t, i) => (
              <li key={i} className="text-[13px] leading-relaxed">
                <span className={`mr-2 text-[11px] font-semibold ${t.actor === "guardrail" ? "text-warn" : t.actor === "system" ? "text-muted" : "text-ink"}`}>
                  {t.actor === "guardrail" && <ShieldCheck className="mr-0.5 inline h-3 w-3 -translate-y-px" />}
                  {ACTOR[t.actor]}{t.kind === "accept" ? " accepted" : t.kind === "walk_away" ? " walked away" : ""}
                </span>
                <span className="text-body">{t.text}</span>
                {t.price != null && (
                  <span className="ml-2 whitespace-nowrap rounded-md bg-panel-2 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-ink">
                    {usd(t.price)} · +{t.weeks}w
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

/** Mid-project scope changes: scoped by an agent, priced by both agents, approved by both people. */
export function Changes({ cid, draft, onDraftUsed, onChanged, milestones }: {
  cid: string;
  draft: { messageId: string; text: string } | null;
  onDraftUsed: () => void;
  onChanged: () => void;
  milestones: { id: string; title: string }[];
}) {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<{ text: string; messageId: string | null } | null>(null);
  const [budget, setBudget] = useState("");
  const [weeks, setWeeks] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<Data>(`/api/contracts/${cid}/changes`);
      setD(r);
      setError(null);
      return r;
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [cid]);

  useEffect(() => {
    load().then((r) => {
      if (r?.headroom) {
        setBudget(r.headroom.budget != null ? String(r.headroom.budget) : "");
        setWeeks(r.headroom.weeks != null ? String(r.headroom.weeks) : "");
      }
    });
  }, [load]);

  // A message from the chat, handed over to become a change request.
  useEffect(() => {
    if (draft) {
      setForm({ text: draft.text, messageId: draft.messageId });
      onDraftUsed();
    }
  }, [draft, onDraftUsed]);

  // Agents work in the background: poll quickly while they do, slowly otherwise (the other side may act).
  const working = !!d?.changes.some((x) => x.status === "scoping" || x.status === "negotiating");
  useEffect(() => {
    const id = setInterval(async () => {
      const before = d?.changes.map((x) => x.status + x.updated_at).join();
      const r = await load();
      if (r && before !== r.changes.map((x) => x.status + x.updated_at).join() && r.changes.some((x) => x.status === "approved")) onChanged();
    }, working ? 2500 : 20000);
    return () => clearInterval(id);
  }, [working, load, d, onChanged]);

  async function run(key: string, path: string, body: object = {}) {
    setBusy(key);
    setError(null);
    try {
      await api(path, { body });
      await load();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!form) return;
    setBusy("new");
    setError(null);
    try {
      await api(`/api/contracts/${cid}/changes`, {
        body: {
          description: form.text,
          source_message_id: form.messageId,
          ...(d?.side === "client" ? { max_extra_budget: num(budget), max_extra_weeks: num(weeks) } : {}),
        },
      });
      setForm(null);
      await load();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!d) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;
  const isClient = d.side === "client";
  const title = (id: string) => milestones.find((m) => m.id === id)?.title || id;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <ErrorNote message={error} />

        {!form ? (
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-[15px] font-medium">Need something that isn&apos;t in the contract?</p>
              <p className="mt-0.5 text-[13px] text-body">Describe it in plain words. An agent scopes it, both agents price only that change, and nothing changes until you both approve.</p>
            </div>
            <Button onClick={() => setForm({ text: "", messageId: null })}><FilePlus2 className="h-4 w-4" /> Request a change</Button>
          </Card>
        ) : (
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-medium">Request a change</p>
              {form.messageId && <Badge><MessageSquareQuote className="h-3 w-3" /> From a message</Badge>}
            </div>
            <Field label="What should change?" hint="For example: “Parents should be able to get a refund through Khalti if a class is cancelled.”">
              <textarea
                autoFocus
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                rows={4}
                className="w-full resize-y rounded-xl border border-line-strong/80 px-3.5 py-2.5 text-[14px] leading-relaxed focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
              />
            </Field>
            {isClient && <Caps budget={budget} weeks={weeks} onBudget={setBudget} onWeeks={setWeeks} />}
            {isClient && d.headroom && (d.headroom.budget != null || d.headroom.weeks != null) && (
              <p className="-mt-2 text-[11px] text-muted">
                Pre-filled with what your original brief left unused{d.headroom.budget != null ? `: ${usd(d.headroom.budget)}` : ""}{d.headroom.weeks != null ? `${d.headroom.budget != null ? " and" : ":"} ${d.headroom.weeks} weeks` : ""}.
              </p>
            )}
            {!isClient && <p className="text-[12px] text-muted">The founder sets their limits before the agents price it. Your minimum rate is enforced as always.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}><X className="h-4 w-4" /> Cancel</Button>
              <Button onClick={submit} loading={busy === "new"} disabled={form.text.trim().length < 5}>
                {isClient ? "Scope and price it" : "Send to the founder"} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {d.changes.map((x) => (
          <ChangeCard key={x.id} x={x} side={d.side} headroom={d.headroom} busy={busy} run={run} milestoneTitle={title} />
        ))}
        {!d.changes.length && !form && (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-[13px] text-muted">
            No change requests yet. Scope changes mid-project are normal; here they stay priced, agreed and on the record.
          </p>
        )}
      </div>

      <Card className="h-fit space-y-3 p-5 lg:sticky lg:top-6">
        <p className="text-[14px] font-medium">How change requests work</p>
        <ol className="space-y-2.5 text-[12px] leading-relaxed text-body">
          <li><span className="font-semibold text-ink">1. Scope.</span> The Change Scoping Agent turns the request into deliverables, checks and an hour estimate. It adds to an unfinished milestone or creates a new one.</li>
          <li><span className="font-semibold text-ink">2. Price.</span> Both agents negotiate only this change. The developer&apos;s minimum rate and capacity and the founder&apos;s caps are enforced in code.</li>
          <li><span className="font-semibold text-ink">3. Approve.</span> Nothing changes until you both approve. Then the contract, board, timeline and payments update automatically.</li>
        </ol>
        {isClient && <p className="border-t border-line pt-3 text-[11px] text-muted">Your caps stay private to your agent. The developer only sees the agreed price.</p>}
      </Card>
    </div>
  );
}
