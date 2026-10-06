"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, ExternalLink, FolderGit2, HelpCircle, Lock, Printer, ShieldCheck, XCircle } from "lucide-react";
import { DeveloperHeader } from "@/components/domain";
import { AgentWorking, Badge, Button, Card, ErrorNote, Field, inputCls, Spinner, usd } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ContractDetail, ContractMilestone, Dispute, EscrowData, Submission } from "@/lib/types";
import { DisputeCard, OpenDispute } from "./Dispute";

const msTone: Record<ContractMilestone["status"], ["neutral" | "info" | "warn" | "good" | "dark", string]> = {
  pending: ["neutral", "Not started"],
  in_progress: ["info", "In progress"],
  submitted: ["warn", "Submitted for review"],
  changes_requested: ["warn", "Changes requested"],
  approved: ["good", "Approved and paid"],
};

function Report({ s }: { s: Submission }) {
  const r = s.report;
  if (s.status === "verifying") return <AgentWorking agent="Verification Agent" task="Loading the live site and repository, checking each criterion" />;
  if (s.status === "error" || !r?.checks) return <ErrorNote message={`Verification failed: ${r?.error ?? "unknown error"}. The developer can resubmit.`} />;
  const icon = { met: <CheckCircle2 className="h-4 w-4 text-good" />, not_met: <XCircle className="h-4 w-4 text-bad" />, unverifiable: <HelpCircle className="h-4 w-4 text-muted" /> };
  const ev = r.evidence_summary;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="good">{r.counts?.met} met</Badge>
        {!!r.counts?.not_met && <Badge tone="bad">{r.counts.not_met} not met</Badge>}
        {!!r.counts?.unverifiable && <Badge>{r.counts.unverifiable} check manually</Badge>}
        {ev?.live_site && !ev.live_site.error && (
          <span className="text-[11px] text-muted">Site: HTTP {ev.live_site.status} in {ev.live_site.ms} ms{ev.live_site.is_https ? " · HTTPS" : ""}</span>
        )}
        {ev?.repository && !ev.repository.error && (
          <span className="text-[11px] text-muted">Repo: {ev.repository.language} · {ev.repository.recent_commits} recent commits</span>
        )}
      </div>
      <p className="text-[13px] text-ink">{r.summary}</p>
      <ul className="space-y-2">
        {r.checks.map((c) => (
          <li key={c.criterion} className="flex gap-2 rounded-xl bg-panel px-3 py-2">
            <span className="mt-0.5">{icon[c.verdict]}</span>
            <div>
              <p className="text-[12px] font-semibold text-ink">{c.criterion}</p>
              <p className="text-[12px] text-body">{c.evidence}</p>
            </div>
          </li>
        ))}
      </ul>
      {r.suggested_next_step && <p className="text-[12px] text-muted">Next step: {r.suggested_next_step}</p>}
    </div>
  );
}

/** Contract terms, signatures and Proof of Done per milestone (the "Contract & delivery" tab). */
export function Delivery({ id, onChanged, onOpenPayments }: { id: string; onChanged?: () => void; onOpenPayments?: () => void }) {
  const { session, loading } = useAuth();
  const [d, setD] = useState<ContractDetail | null>(null);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [money, setMoney] = useState<EscrowData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, { live_url: string; repo_url: string; notes: string }>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [decisions, setDecisions] = useState<{ id: string; body: string; author_name: string | null; pinned_at: string }[]>([]);
  useEffect(() => {
    if (!loading && session) api<typeof decisions>(`/api/contracts/${id}/decisions`).then(setDecisions).catch(() => {});
  }, [loading, session, id]);

  const load = useCallback(async () => {
    try {
      const [cd, ds, es] = await Promise.all([
        api<ContractDetail>(`/api/contracts/${id}`),
        api<{ disputes: Dispute[] }>(`/api/contracts/${id}/disputes`),
        api<EscrowData>(`/api/contracts/${id}/escrow`),
      ]);
      setD(cd);
      setDisputes(ds.disputes);
      setMoney(es);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    if (!loading && session) load();
  }, [loading, session, load]);

  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`contract-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "milestone_submissions", filter: `contract_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [session, id, load]);

  const verifying = d?.submissions.some((s) => s.status === "verifying") || disputes.some((x) => x.status === "mediating");
  useEffect(() => {
    if (!verifying) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [verifying, load]);

  const call = (key: string, path: string, body: object = {}) => run(key, () => api(path, { body }));

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const c = d?.contract;
  const side = d?.side;
  const myApproval = c && side ? (side === "client" ? c.client_approved_at : c.developer_approved_at) : null;
  const paid = money?.balances.released ?? 0;

  return (
    <div>
      <ErrorNote message={error} onRetry={load} />
      {!d && !error && <Spinner label="Loading contract" />}
      {d && c && side && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-[13px] text-body">{c.summary}</p>
            <Button variant="secondary" size="sm" onClick={() => window.print()} className="no-print"><Printer className="h-3.5 w-3.5" /> Print / PDF</Button>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Fixed price", usd(c.total_price)], ["Timeline", `${c.timeline_weeks} weeks`], ["Paid so far", usd(paid)], ["Revisions", `${c.terms.revisions_per_milestone} per milestone`]].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-line bg-white px-4 py-3"><p className="text-[11px] text-muted">{k}</p><p className="mt-0.5 text-[20px] font-medium tabular-nums tracking-[-0.02em]">{v}</p></div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <Card className="p-5">
              <p className="text-[14px] font-medium">Parties</p>
              <div className="mt-3"><DeveloperHeader d={d.developer} /></div>
              <p className="mt-3 text-[13px]"><span className="text-body">Founder:</span> <b>{d.client_name}</b></p>
              <div className="mt-4 space-y-1.5 text-[12px]">
                <p className="flex items-center gap-1.5">{c.client_approved_at ? <CheckCircle2 className="h-4 w-4 text-good" /> : <CircleDashed className="h-4 w-4 text-muted" />} Founder signed {c.client_approved_at && new Date(c.client_approved_at).toLocaleString()}</p>
                <p className="flex items-center gap-1.5">{c.developer_approved_at ? <CheckCircle2 className="h-4 w-4 text-good" /> : <CircleDashed className="h-4 w-4 text-muted" />} Developer signed {c.developer_approved_at && new Date(c.developer_approved_at).toLocaleString()}
                  {d.developer.is_demo_persona && c.developer_approved_at && <span className="text-muted">(demo persona, auto-signed)</span>}</p>
              </div>
              {c.status === "pending_approval" && !myApproval && (
                <Button className="mt-4 w-full" onClick={() => run("approve", () => api(`/api/contracts/${id}/approve`, { body: {} }))} loading={busy === "approve"}>
                  Review done: sign contract
                </Button>
              )}
              {c.status === "pending_approval" && myApproval && <p className="mt-4 text-[12px] text-muted">Waiting for the other party to sign.</p>}
            </Card>
            <Card className="p-5">
              <p className="text-[14px] font-medium">Terms</p>
              <dl className="mt-2 space-y-2 text-[12px]">
                {[["Payment", c.terms.payment], ["Verification", c.terms.verification], ["Change requests", c.terms.change_requests], ["IP", c.terms.ip],
                  ["Starts", `Within ${c.terms.start_in_days} days of signing`], ["Excluded", c.terms.excluded_scope.join(" · ") || "Nothing"]].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[110px_1fr] gap-2"><dt className="font-medium text-ink">{k}</dt><dd className="text-body">{v}</dd></div>
                ))}
              </dl>
            </Card>
          </div>

          {decisions.length > 0 && (
            <Card className="border-warn/40 p-5">
              <p className="text-[14px] font-medium text-ink">Agreed clarifications <span className="font-normal text-muted">({decisions.length})</span></p>
              <p className="mt-0.5 text-[12px] text-muted">Decisions pinned in Messages by either party. They clarify, and form part of, this agreement.</p>
              <ol className="mt-3 space-y-2">
                {decisions.map((x, i) => (
                  <li key={x.id} className="flex gap-3 text-[13px]">
                    <span className="font-mono text-muted">{i + 1}.</span>
                    <span className="flex-1 text-ink">{x.body}</span>
                    <span className="shrink-0 text-[11px] text-muted">{x.author_name} · {new Date(x.pinned_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <div>
            <h2 className="text-[18px] font-medium tracking-[-0.01em]">Milestones</h2>
            <p className="text-[12px] text-muted">Proof of Done: the developer submits a live URL or repo, the Verification Agent checks each criterion, then the founder approves and pays.</p>
            <div className="mt-4 space-y-4">
              {c.milestones.map((m) => {
                const subs = d.submissions.filter((s) => s.milestone_id === m.id);
                const latest = subs.find((s) => s.status !== "superseded") ?? subs[0];
                const replaced = subs.filter((s) => s.status === "superseded").length;
                const [tone, label] = msTone[m.status];
                const collapsed = m.status === "approved" && !expanded[m.id];
                const f = form[m.id] ?? { live_url: "", repo_url: "", notes: "" };
                const mDisputes = disputes.filter((x) => x.milestone_id === m.id);
                const openDispute = mDisputes.find((x) => ["awaiting_response", "mediating", "proposed", "failed"].includes(x.status));
                const shownDispute = openDispute ?? mDisputes[0];
                const funds = money?.balances.milestones[m.id];
                const funded = !!funds?.fully_funded;
                // Before the founder reviews, a delivery the Verification Agent flagged can be replaced.
                const canReplace = m.status === "submitted" && !!latest && ["needs_work", "error"].includes(latest.status);
                const canSubmit = side === "developer" && c.status === "active" && (m.status === "in_progress" || m.status === "changes_requested" || canReplace) && !openDispute;
                const canReview = side === "client" && latest && ["verified", "needs_work"].includes(latest.status) && !openDispute;
                const canDispute = c.status === "active" && !openDispute && latest && latest.status !== "verifying"
                  && (m.status === "changes_requested" || (m.status === "submitted" && side === "client"));
                return (
                  <Card key={m.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[15px] font-medium tracking-[-0.01em]"><span className="font-mono text-[11px] text-muted">{m.id}</span> {m.title}</p>
                        <p className="text-[12px] text-body">{m.goal}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {funds && m.status !== "approved" && (
                          funded ? <span title="Held in escrow" className="inline-flex items-center gap-1 text-[11px] font-medium text-ink"><Lock className="h-3 w-3" /> Secured</span>
                            : c.status === "active" && (
                              <button onClick={onOpenPayments} className={`text-[11px] font-medium underline-offset-2 hover:underline ${m.status === "pending" ? "text-muted" : "text-warn"}`}>
                                {m.status === "pending" ? "Funded when it starts" : "Not funded"}
                              </button>
                            )
                        )}
                        <span className="text-[13px] font-medium tabular-nums">{usd(m.price)} · {m.weeks}w</span>
                        <Badge tone={tone}>{label}</Badge>
                      </div>
                    </div>
                    {m.status === "approved" && (
                      <button onClick={() => setExpanded({ ...expanded, [m.id]: !expanded[m.id] })} className="mt-3 text-[12px] font-medium text-muted hover:text-ink">
                        {collapsed ? `Show criteria and delivery history (${subs.length} submission${subs.length === 1 ? "" : "s"})` : "Hide delivery history"}
                      </button>
                    )}
                    {!collapsed && (
                      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                        {m.acceptance_criteria.map((a) => <li key={a} className="flex gap-1.5 text-[12px] text-body"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />{a}</li>)}
                      </ul>
                    )}

                    {!collapsed && latest && (
                      <div className="mt-4 rounded-2xl border border-line p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px]">
                          <span className="font-medium">{replaced ? "Latest submission" : "Submission"}</span>
                          {replaced > 0 && <span className="text-muted">({replaced} earlier {replaced === 1 ? "one" : "ones"} replaced)</span>}
                          {latest.live_url && <a href={latest.live_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-info underline"><ExternalLink className="h-3 w-3" />Live site</a>}
                          {latest.repo_url && <a href={latest.repo_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-info underline"><FolderGit2 className="h-3 w-3" />Repo</a>}
                          <span className="text-muted">{new Date(latest.created_at).toLocaleString()}</span>
                        </div>
                        <Report s={latest} />
                        {latest.client_feedback && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-warn-bg px-3 py-2 text-[12px] leading-relaxed text-warn">Founder: {latest.client_feedback}</p>}
                        {canReview && (
                          <div className="mt-4 space-y-2 border-t border-line pt-4">
                            <input className={inputCls} placeholder="Feedback for the developer (required to request changes)" value={feedback[latest.id] ?? ""}
                              onChange={(e) => setFeedback({ ...feedback, [latest.id]: e.target.value })} />
                            <div className="flex gap-2">
                              <Button onClick={() => run(`ok-${latest.id}`, () => api(`/api/submissions/${latest.id}/review`, { body: { decision: "approve", feedback: feedback[latest.id] || null } }))}
                                loading={busy === `ok-${latest.id}`}>Approve and release {usd(m.price)} from escrow</Button>
                              <Button variant="secondary" disabled={!feedback[latest.id]}
                                onClick={() => run(`ch-${latest.id}`, () => api(`/api/submissions/${latest.id}/review`, { body: { decision: "changes", feedback: feedback[latest.id] } }))}
                                loading={busy === `ch-${latest.id}`}>Request changes</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!collapsed && shownDispute && (
                      <div className="mt-4"><DisputeCard x={shownDispute} side={side} price={m.price} busy={busy} run={call} /></div>
                    )}
                    {canDispute && <div className="mt-4"><OpenDispute cid={id} mid={m.id} side={side} busy={busy} run={call} /></div>}

                    {canSubmit && !funded && (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn-bg/40 p-4 text-[13px]">
                        <span className="text-ink">The founder hasn&apos;t funded {m.id} yet. You can submit once {usd(funds?.to_fund ?? m.price)} is held in escrow.</span>
                        <Button size="sm" variant="secondary" onClick={onOpenPayments}>See payments</Button>
                      </div>
                    )}
                    {canSubmit && funded && (
                      <div className="mt-4 space-y-3 rounded-2xl bg-panel p-4">
                        <p className="text-[14px] font-medium">{canReplace ? "Fix it and resubmit" : "Submit this milestone"}</p>
                        {canReplace && (
                          <p className="-mt-1 text-[12px] leading-relaxed text-body">
                            The founder hasn&apos;t reviewed this yet. If a link was wrong or something was missing, resubmit with the right live URL or repo.
                            The Verification Agent checks it again, and it doesn&apos;t use one of your revisions.
                          </p>
                        )}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Live URL"><input className={inputCls} placeholder="https://your-deploy.vercel.app" value={f.live_url} onChange={(e) => setForm({ ...form, [m.id]: { ...f, live_url: e.target.value } })} /></Field>
                          <Field label="Public GitHub repo"><input className={inputCls} placeholder="https://github.com/you/repo" value={f.repo_url} onChange={(e) => setForm({ ...form, [m.id]: { ...f, repo_url: e.target.value } })} /></Field>
                        </div>
                        <Field label="Notes for the founder (optional)"><input className={inputCls} value={f.notes} onChange={(e) => setForm({ ...form, [m.id]: { ...f, notes: e.target.value } })} /></Field>
                        <Button disabled={!f.live_url && !f.repo_url} loading={busy === `sub-${m.id}`}
                          onClick={() => run(`sub-${m.id}`, () => api(`/api/contracts/${id}/milestones/${m.id}/submit`, {
                            body: { live_url: f.live_url || null, repo_url: f.repo_url || null, notes: f.notes || null },
                          }))}>
                          {canReplace ? "Resubmit for verification" : "Submit for verification"}
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
