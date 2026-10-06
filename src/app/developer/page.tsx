"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, FileSignature, Lock, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NegotiationBadge, ScoreRing } from "@/components/domain";
import { Badge, Button, Card, Empty, ErrorNote, LinkButton, PageHeader, SectionTitle, Skeleton, usd } from "@/components/ui";
import { fmtDate } from "@/components/workspace/Board";
import { api, errorMessage } from "@/lib/api";
import { useRequireRole } from "@/lib/auth";
import type { Contract, Negotiation, Project, WorkItem } from "@/lib/types";

interface Discovered {
  project: Project;
  score: number;
  reasons: string[];
  concerns: string[];
  negotiation: { id: string; status: Negotiation["status"] } | null;
}

const HEALTH = {
  on_track: ["On track", "good"], late: ["Behind", "bad"], done: ["Completed", "good"], not_started: ["Awaiting signatures", "warn"],
} as const;

export default function DeveloperHome() {
  const me = useRequireRole("developer");
  const router = useRouter();
  const [negs, setNegs] = useState<Negotiation[] | null>(null);
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [work, setWork] = useState<WorkItem[] | null>(null);
  const [found, setFound] = useState<Discovered[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [n, c, w, f] = await Promise.all([
        api<Negotiation[]>("/api/negotiations"),
        api<Contract[]>("/api/contracts"),
        api<WorkItem[]>("/api/work"),
        api<Discovered[]>("/api/developers/me/projects"),
      ]);
      setNegs(n);
      setContracts(c);
      setWork(w);
      setFound(f);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    if (!me.developer?.profile_complete) router.replace("/developer/interview");
    else load();
  }, [me, load, router]);

  const live = negs?.some((n) => n.status === "running" || n.status === "pending");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [live, load]);

  async function pitch(projectId: string) {
    setBusy(projectId);
    try {
      const r = await api<{ negotiation_id: string }>(`/api/projects/${projectId}/pitch`, { body: {} });
      router.push(`/negotiations/${r.negotiation_id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  const dev = me?.developer;
  const pendingSign = contracts?.filter((c) => c.status === "pending_approval" && !c.developer_approved_at) ?? [];
  const active = (work ?? []).filter((w) => w.status !== "pending_approval");
  const secured = active.reduce((a, w) => a + (w.escrow?.held ?? 0), 0);
  const earned = active.reduce((a, w) => a + w.schedule.paid, 0);
  const running = negs?.filter((n) => n.status === "running" || n.status === "pending").length ?? 0;

  return (
    <AppShell ready={!!me?.developer?.profile_complete}>
      {dev && (
        <div className="space-y-12">
          <PageHeader title={`Hi ${me?.full_name?.split(" ")[0] ?? "there"}`} sub="What your agent is doing, what you're building, and what's secured for you." />

          <div className="-mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Secured in escrow", work ? usd(secured) : "…"],
              ["Earned", work ? usd(earned) : "…"],
              ["Active projects", work ? String(active.filter((w) => w.status === "active").length) : "…"],
              ["Agent negotiating now", negs ? String(running) : "…"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-line bg-white px-4 py-3">
                <p className="text-[11px] text-muted">{k}</p>
                <p className="mt-0.5 text-[22px] font-medium tabular-nums tracking-[-0.02em]">{v}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="relative overflow-hidden border-0 bg-cover bg-center p-6 text-ink" style={{ backgroundImage: "url(/art/sage.webp)" }}>
              <div className="flex w-fit items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[12px] font-medium text-ink backdrop-blur">
                <Bot className="h-4 w-4" /> Your agent is {dev.auto_negotiate ? "active" : "paused"}
              </div>
              <div className="mt-4 max-w-xl rounded-2xl bg-white/85 p-4 backdrop-blur">
                <p className="text-[20px] font-medium leading-snug tracking-[-0.02em]">{dev.headline}</p>
                <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-body">{dev.bio}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {dev.skills.slice(0, 8).map((s) => <span key={s} className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-ink backdrop-blur">{s}</span>)}
              </div>
            </Card>
            <Card className="flex flex-col p-6">
              <p className="text-[14px] font-medium">Your agent&apos;s limits</p>
              <p className="mt-0.5 text-[12px] text-muted">Enforced in code on every offer. The minimum is never shown to founders.</p>
              <dl className="mt-4 flex-1 space-y-2.5 text-[13px]">
                {[
                  ["Minimum rate (private)", `$${dev.rate_floor}/h`],
                  ["Usual rate", `$${dev.rate_target}/h`],
                  ["Capacity", `${dev.weekly_hours} h/week`],
                  ["Style", dev.negotiation_style ? dev.negotiation_style[0].toUpperCase() + dev.negotiation_style.slice(1) : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-line pb-2.5 last:border-0"><dt className="text-body">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>
                ))}
              </dl>
              <LinkButton href="/developer/profile" variant="secondary" size="sm" className="mt-4 w-full">Edit profile and limits</LinkButton>
            </Card>
          </div>

          <ErrorNote message={error} onRetry={load} />

          {pendingSign.length > 0 && (
            <section>
              <SectionTitle title="Waiting for your signature" sub="A founder chose your agent's deal. Review the contract and sign to start." />
              <div className="grid gap-3">
                {pendingSign.map((c) => (
                  <Link key={c.id} href={`/contracts/${c.id}?tab=contract`} className="group flex items-center justify-between gap-4 rounded-2xl bg-ink px-5 py-4 text-white">
                    <span className="flex items-center gap-3 text-[14px] font-medium"><FileSignature className="h-4 w-4 text-white/70" />{c.title}</span>
                    <span className="flex items-center gap-2 text-[13px] tabular-nums text-white/80">{usd(c.total_price)} · {c.timeline_weeks} weeks <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle title="Active work" sub="Your contracts, how far along they are, and what's held in escrow for you." />
            {!work && <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>}
            {work && active.length === 0 && <Empty title="No contracts yet" body="When a founder picks your agent's offer and you sign, the project shows up here." />}
            {active.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                {active.map((w) => {
                  const [label, tone] = HEALTH[w.schedule.health];
                  const cur = w.schedule.milestones.find((m) => m.status !== "approved");
                  return (
                    <Link key={w.contract_id} href={`/contracts/${w.contract_id}`} className="group rounded-2xl border border-line bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(20,20,19,0.35)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-medium tracking-[-0.01em]">{w.title}</p>
                          <p className="mt-0.5 text-[12px] text-muted">for {w.client_name ?? "a founder"}</p>
                        </div>
                        <Badge tone={tone}>{label}</Badge>
                      </div>
                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-ink" style={{ width: `${w.schedule.progress}%` }} /></div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px]">
                        <span className="text-body">
                          {cur ? <>Now: <span className="font-mono text-muted">{cur.id}</span> {cur.title}{cur.due_date ? ` · due ${fmtDate(cur.due_date)}` : ""}</> : "All milestones approved"}
                        </span>
                        <span className="flex items-center gap-3 tabular-nums text-muted">
                          {w.escrow.held > 0 && <span className="inline-flex items-center gap-1 text-ink"><Lock className="h-3 w-3" />{usd(w.escrow.held)}</span>}
                          <span>{usd(w.schedule.paid)} / {usd(w.schedule.total)}</span>
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {negs && (
            <section>
              <SectionTitle title="Negotiations" sub="Every deal your agent is working on or has closed." />
              {negs.length === 0 ? (
                <Empty title="No negotiations yet" body="When a founder picks you, or you send your agent to a project below, it shows up here." />
              ) : (
                <Card className="divide-y divide-line">
                  {negs.slice(0, 6).map((n) => (
                    <Link key={n.id} href={`/negotiations/${n.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-panel">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium">{n.project?.title}</p>
                        <p className="truncate text-[12px] text-muted">{n.outcome_summary ?? `Turn ${n.round} of ${n.max_rounds}`}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {n.latest_offer && <span className="text-[13px] font-medium tabular-nums">{usd(n.latest_offer.total_price)}</span>}
                        <NegotiationBadge status={n.status} />
                      </div>
                    </Link>
                  ))}
                </Card>
              )}
            </section>
          )}

          {found && (
            <section>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionTitle title="Projects that fit you" sub="Open Build Plans ranked for your skills, rates and capacity. Your agent can pitch and negotiate for you." />
                {found.length > 6 && <Link href="/marketplace" className="mb-5 inline-flex items-center gap-1 text-[13px] font-medium text-body hover:text-ink">All {found.length} in Marketplace <ArrowRight className="h-3.5 w-3.5" /></Link>}
              </div>
              {found.length === 0 ? (
                <Empty title="No open projects right now" body="Your agent keeps watching. New Build Plans are matched as founders publish them." />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {found.slice(0, 6).map((f) => (
                    <Card key={f.project.id} className="flex flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[15px] font-medium tracking-[-0.01em]">{f.project.plan?.title}</p>
                          <p className="mt-0.5 text-[12px] text-muted">Budget {usd(f.project.budget_max)} · {f.project.deadline_weeks} weeks · {f.project.plan?.milestones.length} milestones</p>
                        </div>
                        <ScoreRing score={f.score} />
                      </div>
                      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-body">{f.project.plan?.summary}</p>
                      <ul className="mt-3 flex-1 space-y-1">
                        {f.reasons.slice(0, 2).map((r) => <li key={r} className="text-[12px] text-good">✓ {r}</li>)}
                        {f.concerns.slice(0, 1).map((r) => <li key={r} className="text-[12px] text-warn">! {r}</li>)}
                      </ul>
                      <div className="mt-4">
                        {f.negotiation ? (
                          <LinkButton href={`/negotiations/${f.negotiation.id}`} variant="secondary" size="sm" className="w-full">
                            <NegotiationBadge status={f.negotiation.status} /> Open room <ArrowRight className="h-3.5 w-3.5" />
                          </LinkButton>
                        ) : (
                          <Button size="sm" className="w-full" onClick={() => pitch(f.project.id)} loading={busy === f.project.id}>
                            <Send className="h-3.5 w-3.5" /> Send my agent to pitch
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
