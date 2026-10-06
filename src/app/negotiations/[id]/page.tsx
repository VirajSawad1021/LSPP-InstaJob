"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bot, Download, Lock, Pause, Play, RotateCcw, Send, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DeveloperHeader, NegotiationBadge, OfferTable, priorityLabel } from "@/components/domain";
import { Avatar, Badge, Button, Card, ErrorNote, inputCls, Spinner, usd } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { NegEvent, NegotiationDetail, Offer } from "@/lib/types";

function PriceTrajectory({ events, budget }: { events: NegEvent[]; budget: number | null }) {
  const pts = events.filter((e) => e.offer && (e.actor === "developer_agent" || e.actor === "client_agent"));
  if (pts.length < 2) return null;
  const values = pts.map((e) => e.offer!.total_price).concat(budget ? [budget] : []);
  const max = Math.max(...values) * 1.08, min = Math.min(...values) * 0.9;
  const W = 280, H = 90;
  const x = (i: number) => 8 + (i / (pts.length - 1)) * (W - 16);
  const y = (v: number) => H - 8 - ((v - min) / (max - min || 1)) * (H - 16);
  const line = (actor: string) =>
    pts.map((e, i) => ({ e, i })).filter(({ e }) => e.actor === actor).map(({ e, i }) => `${x(i)},${y(e.offer!.total_price)}`).join(" ");
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Price over turns</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full">
        {budget && (
          <>
            <line x1="0" x2={W} y1={y(budget)} y2={y(budget)} stroke="#9b2c2c" strokeDasharray="4 4" strokeWidth="1" />
            <text x={W - 4} y={y(budget) - 4} textAnchor="end" fontSize="9" fill="#9b2c2c">budget {usd(budget)}</text>
          </>
        )}
        <polyline points={line("developer_agent")} fill="none" stroke="#855b2e" strokeWidth="2" />
        <polyline points={line("client_agent")} fill="none" stroke="#111111" strokeWidth="2" />
        {pts.map((e, i) => (
          <circle key={e.id} cx={x(i)} cy={y(e.offer!.total_price)} r="3" fill={e.actor === "developer_agent" ? "#855b2e" : "#111111"} />
        ))}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-body">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#855b2e]" />Developer agent</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink" />Founder agent</span>
      </div>
    </div>
  );
}

function EventItem({ e, devName, side }: { e: NegEvent; devName: string; side: "client" | "developer" }) {
  if (e.actor === "system") {
    return <div className="py-1 text-center text-[11px] font-medium text-muted">{e.content}</div>;
  }
  if (e.actor === "guardrail") {
    return (
      <div className="mx-auto flex max-w-[90%] gap-2 rounded-xl border border-[#f0dfbf] bg-warn-bg px-3 py-2 text-[12px] text-warn">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span><b>Guardrail:</b> {e.content}</span>
      </div>
    );
  }
  if (e.actor === "client" || e.actor === "developer") {
    return (
      <div className="mx-auto flex max-w-[90%] gap-2 rounded-xl bg-info-bg px-3 py-2 text-[12px] text-info">
        <UserRound className="mt-0.5 h-4 w-4 shrink-0" /> {e.content}
      </div>
    );
  }
  const isDev = e.actor === "developer_agent";
  const mine = (side === "developer") === isDev;
  return (
    <div className={`flex gap-2 ${isDev ? "" : "flex-row-reverse"}`}>
      {isDev ? <Avatar name={devName} className="h-8 w-8 text-[11px]" /> : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white"><Bot className="h-4 w-4" /></span>
      )}
      <div className={`max-w-[80%] ${isDev ? "" : "items-end text-right"}`}>
        <p className="mb-1 text-[11px] font-semibold text-muted">
          {isDev ? `${devName}'s agent` : "Founder's agent"}{mine ? " (yours)" : ""}
          {e.kind === "accept" && <Badge tone="good" className="ml-2">Accepted</Badge>}
          {e.kind === "walk_away" && <Badge tone="bad" className="ml-2">Walked away</Badge>}
        </p>
        <div className={`inline-block rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-relaxed ${isDev ? "rounded-tl-sm bg-panel-2 text-ink" : "rounded-tr-sm bg-ink text-white"}`}>
          {e.content}
          {e.offer && e.kind === "offer" && (
            <span className={`mt-1.5 block text-[11px] font-semibold tabular-nums ${isDev ? "text-body" : "text-white/70"}`}>
              Offer: {usd(e.offer.total_price)} · {e.offer.timeline_weeks} weeks · {e.offer.lines.filter((l) => l.included).length}/{e.offer.lines.length} milestones
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NegotiationRoom() {
  const { me, session, loading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<NegotiationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steer, setSteer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setD(await api<NegotiationDetail>(`/api/negotiations/${id}`));
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
      .channel(`neg-${id}`)
      // Every status change also writes an event, so the event stream is the only subscription needed.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "negotiation_events", filter: `negotiation_id=eq.${id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [session, id, load]);

  const status = d?.negotiation.status;
  const live = status === "running" || status === "pending";
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, 3500);
    return () => clearInterval(t);
  }, [live, load]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [d?.events.length]);

  const offers = useMemo(() => (d?.events ?? []).filter((e) => e.offer && e.actor.endsWith("_agent")), [d]);
  const current: Offer | null = d?.negotiation.agreed_offer ?? offers.at(-1)?.offer ?? null;
  const previous: Offer | null = offers.length > 1 ? offers.at(-2)!.offer : null;

  async function act(action: "pause" | "resume" | "retry") {
    setBusy(action);
    try {
      await api(`/api/negotiations/${id}/${action}`, { body: {} });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function sendSteer() {
    if (!steer.trim()) return;
    setBusy("steer");
    try {
      await api(`/api/negotiations/${id}/steer`, { body: { instruction: steer.trim() } });
      setSteer("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function exportA2A() {
    api(`/api/negotiations/${id}/a2a`).then((data) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `negotiation-${id}.a2a.json` });
      a.click();
      URL.revokeObjectURL(url);
    }).catch((e) => setError(errorMessage(e)));
  }

  const plan = d?.project.plan;
  const side = d?.side;
  const canControl = status && ["running", "paused", "pending"].includes(status);

  return (
    <AppShell ready={!!me}>
      <ErrorNote message={error} onRetry={load} />
      {!d && !error && <Spinner label="Opening negotiation room" />}
      {d && plan && side && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href={side === "client" ? `/client/projects/${d.project.id}` : "/developer"} className="text-[12px] text-muted hover:text-ink">
                ← {side === "client" ? plan.title : "Dashboard"}
              </Link>
              <h1 className="mt-1 text-[24px] font-medium tracking-[-0.03em]">Negotiation room</h1>
              <p className="text-[13px] text-body">{plan.title} · {d.developer.full_name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span title={d.audit.valid ? `SHA-256 chain head ${d.audit.head}` : "Log integrity check failed"}>
                <Badge tone={d.audit.valid ? "good" : "bad"}>
                  <ShieldCheck className="h-3 w-3" /> {d.audit.valid ? `Audit chain verified · ${d.audit.count} events` : `Tampered at #${d.audit.broken_at_seq}`}
                </Badge>
              </span>
              <NegotiationBadge status={d.negotiation.status} />
              {live && <Badge>Turn {d.negotiation.round}/{d.negotiation.max_rounds}</Badge>}
              {status === "running" && <Button size="sm" variant="secondary" onClick={() => act("pause")} loading={busy === "pause"}><Pause className="h-3.5 w-3.5" /> Pause</Button>}
              {status === "paused" && <Button size="sm" onClick={() => act("resume")} loading={busy === "resume"}><Play className="h-3.5 w-3.5" /> Resume</Button>}
              {status === "failed" && <Button size="sm" onClick={() => act("retry")} loading={busy === "retry"}><RotateCcw className="h-3.5 w-3.5" /> Retry</Button>}
              <Button size="sm" variant="ghost" onClick={exportA2A} title="Export as A2A messages"><Download className="h-3.5 w-3.5" /> A2A</Button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Card className="flex h-[70vh] min-h-[480px] min-w-0 flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <DeveloperHeader d={d.developer} />
                <span className="hidden shrink-0 items-center gap-2 text-[12px] font-semibold text-body sm:flex">
                  Founder&apos;s agent <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white"><Bot className="h-4 w-4" /></span>
                </span>
              </div>
              <div ref={feedRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
                {d.events.map((e) => <div key={e.id} className="animate-fade-in"><EventItem e={e} devName={d.developer.full_name.split(" ")[0]} side={side} /></div>)}
                {live && (
                  <div className="flex justify-center"><Spinner label={d.running ? "Agents are thinking…" : "Waiting for the next turn…"} /></div>
                )}
              </div>
              {canControl && (
                <div className="border-t border-line p-3">
                  <div className="flex gap-2">
                    <input
                      className={inputCls}
                      value={steer}
                      onChange={(e) => setSteer(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendSteer()}
                      placeholder={side === "client" ? "Instruct your agent, e.g. “Prioritise speed over price”" : "Instruct your agent, e.g. “Push for 3 revisions max”"}
                    />
                    <Button onClick={sendSteer} loading={busy === "steer"} disabled={!steer.trim()}><Send className="h-4 w-4" /></Button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">Only your agent sees this. It applies from the next turn, within your hard limits.</p>
                  {d.negotiation.steering[side] && <p className="mt-1 text-[11px] text-info">Current instruction: {d.negotiation.steering[side]}</p>}
                </div>
              )}
            </Card>

            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {d.negotiation.agreed_offer ? "Agreed terms" : "Offer on the table"}
                  </p>
                  {previous && !d.negotiation.agreed_offer && <span className="text-[11px] text-muted">highlighted = changed</span>}
                </div>
                <div className="mt-3">
                  {current ? <OfferTable offer={current} plan={plan} compare={d.negotiation.agreed_offer ? null : previous} /> : <p className="text-[13px] text-muted">No offer yet.</p>}
                </div>
                {current?.notes && <p className="mt-2 text-[12px] italic text-body">&ldquo;{current.notes}&rdquo;</p>}
                {d.negotiation.outcome_summary && !live && <p className="mt-3 rounded-xl bg-panel px-3 py-2 text-[12px] text-ink">{d.negotiation.outcome_summary}</p>}
                {side === "client" && status === "agreed" && (
                  <Link href={`/client/projects/${d.project.id}`} className="mt-3 block text-center text-[12px] font-semibold underline underline-offset-2">Compare with other offers and choose →</Link>
                )}
              </Card>

              <Card className="p-5">
                <PriceTrajectory events={d.events} budget={side === "client" ? d.project.budget_max : null} />
                {offers.length < 2 && <p className="text-[12px] text-muted">The price chart appears after the first counter-offer.</p>}
              </Card>

              <Card className="p-5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><Lock className="h-3.5 w-3.5" /> Your agent&apos;s hard limits</p>
                <ul className="mt-2 space-y-1.5 text-[13px]">
                  {side === "client" ? (
                    <>
                      <li className="flex justify-between"><span className="text-body">Max budget</span><b>{usd(d.project.budget_max)}</b></li>
                      <li className="flex justify-between"><span className="text-body">Deadline</span><b>{d.project.deadline_weeks} weeks</b></li>
                      <li className="flex justify-between gap-4"><span className="text-body">Never drop</span>
                        <b className="text-right">{plan.milestones.filter((m) => m.priority === "must").map((m) => m.id).join(", ")}</b></li>
                    </>
                  ) : (
                    <>
                      <li className="flex justify-between"><span className="text-body">Minimum rate</span><b>${d.developer.rate_floor}/h</b></li>
                      <li className="flex justify-between"><span className="text-body">Capacity</span><b>{d.developer.weekly_hours} h/week</b></li>
                      <li className="flex justify-between"><span className="text-body">Style</span><b className="capitalize">{d.developer.negotiation_style}</b></li>
                    </>
                  )}
                </ul>
                <p className="mt-3 text-[11px] text-muted">
                  {side === "client"
                    ? "Enforced by software on every offer and every acceptance. Your budget and deadline are part of your posted brief; your instructions to your agent stay private."
                    : "Enforced by software on every offer and every acceptance. The founder never sees your minimum rate or negotiation style."}
                </p>
              </Card>

              <Card className="p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Scope being negotiated</p>
                <ul className="mt-2 space-y-1">
                  {plan.milestones.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="truncate"><span className="font-mono text-muted">{m.id}</span> {m.title}</span>
                      <span className="shrink-0 text-muted">{priorityLabel[m.priority]} · {m.est_hours}h</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
