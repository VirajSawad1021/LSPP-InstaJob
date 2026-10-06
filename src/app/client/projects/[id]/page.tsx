"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, FileSignature, Handshake, Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DeveloperHeader, MatchCard, MilestoneCard, NegotiationBadge, OfferTable, PlanOverview } from "@/components/domain";
import { AgentWorking, Badge, Button, Card, Empty, ErrorNote, LinkButton, SectionTitle, Spinner, usd } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useRequireRole } from "@/lib/auth";
import { projectStatus } from "@/lib/labels";
import type { Contract, Estimate, Match, Negotiation, Project } from "@/lib/types";

interface Detail {
  project: Project;
  estimate: Estimate | null;
  matches: Match[];
  negotiations: Negotiation[];
  contract: Contract | null;
}

export default function ProjectPage() {
  const me = useRequireRole("client");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"deals" | "plan">("deals");

  const load = useCallback(async () => {
    try {
      const next = await api<Detail>(`/api/projects/${id}`);
      setD(next);
      // Preselect the strongest matches the first time, before any negotiation exists.
      setPicked((cur) =>
        cur.length || next.negotiations.length
          ? cur
          : next.matches.filter((m) => m.concerns.length === 0 || m.score >= 60).slice(0, 3).map((m) => m.developer_id),
      );
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  // Poll while any negotiation is in flight (negotiation rows aren't exposed to the browser directly).
  const live = d?.negotiations.some((n) => ["pending", "running", "paused"].includes(n.status));
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [live, load]);

  const negByDev = useMemo(() => new Map(d?.negotiations.map((n) => [n.developer_id, n])), [d]);
  // Every negotiation that reached a deal, including ones not chosen, so the comparison stays visible.
  const agreed = (d?.negotiations.filter((n) => n.agreed_offer && ["agreed", "selected", "not_selected"].includes(n.status)) ?? [])
    .sort((a, b) => (a.status === "selected" ? -1 : b.status === "selected" ? 1 : 0));
  const cheapest = agreed.length ? Math.min(...agreed.map((n) => n.agreed_offer!.total_price)) : null;
  const fastest = agreed.length ? Math.min(...agreed.map((n) => n.agreed_offer!.timeline_weeks)) : null;

  async function negotiate() {
    setBusy("negotiate");
    setError(null);
    try {
      await api(`/api/projects/${id}/negotiate`, { body: { developer_ids: picked } });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function select(nid: string) {
    setBusy(nid);
    setError(null);
    try {
      const c = await api<Contract>(`/api/projects/${id}/select`, { body: { negotiation_id: nid } });
      router.push(`/contracts/${c.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  const draft = !!d && ["clarifying", "planned"].includes(d.project.status);
  useEffect(() => {
    if (draft) router.replace(`/client/new?project=${id}`);
  }, [draft, id, router]);

  const p = d?.project;
  const plan = p?.plan;

  return (
    <AppShell ready={!!me}>
      {!d && !error && <Spinner label="Loading project" />}
      <ErrorNote message={error} onRetry={load} />
      {p && plan && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/client" className="text-[12px] text-muted hover:text-ink">← Projects</Link>
              <h1 className="mt-1 text-[28px] font-medium tracking-[-0.03em]">{plan.title}</h1>
              <p className="mt-1 text-[13px] text-body">
                Budget {usd(p.budget_max)} · {p.deadline_weeks} weeks · {plan.milestones.length} milestones
              </p>
            </div>
            <Badge tone={projectStatus[p.status].tone}>{projectStatus[p.status].label}</Badge>
          </div>

          {d.contract && (
            <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 p-5 art-charcoal text-white">
              <div className="flex items-center gap-3">
                <FileSignature className="h-6 w-6" />
                <div>
                  <p className="text-[15px] font-bold">Contract {d.contract.status === "active" ? "active" : d.contract.status.replace("_", " ")}</p>
                  <p className="text-[12px] text-white/70">{usd(d.contract.total_price)} · {d.contract.timeline_weeks} weeks · {d.contract.milestones.length} milestones</p>
                </div>
              </div>
              <LinkButton href={`/contracts/${d.contract.id}`} variant="secondary">Open workspace <ArrowRight className="h-4 w-4" /></LinkButton>
            </Card>
          )}

          <div className="mt-6 flex gap-1 border-b border-line">
            {(["deals", "plan"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold ${tab === t ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
                {t === "deals" ? "Developers & deals" : "Build Plan"}
              </button>
            ))}
          </div>

          {tab === "plan" && (
            <div className="mt-6 space-y-3">
              <PlanOverview plan={plan} />
              {plan.milestones.map((m) => <MilestoneCard key={m.id} m={m} />)}
            </div>
          )}

          {tab === "deals" && (
            <div className="mt-6 space-y-10">
              {agreed.length > 0 && (
                <section>
                  <SectionTitle title={d.contract ? "Offers your agent secured" : "Ready-to-sign offers"} sub="Every offer below already satisfies your budget, deadline and must-haves, and each developer's own limits." />
                  <div className="grid gap-4 lg:grid-cols-3">
                    {agreed.map((n) => (
                      <Card key={n.id} className={`flex flex-col p-5 ${n.status === "selected" ? "border-ink ring-1 ring-ink" : n.status === "not_selected" ? "opacity-70" : ""}`}>
                        <DeveloperHeader d={n.developer!} />
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {n.agreed_offer!.total_price === cheapest && <Badge tone="good"><Trophy className="h-3 w-3" /> Lowest price</Badge>}
                          {n.agreed_offer!.timeline_weeks === fastest && <Badge tone="info">Fastest</Badge>}
                          {n.agreed_offer!.lines.every((l) => l.included) && <Badge tone="dark">Full scope</Badge>}
                        </div>
                        <div className="mt-3 flex-1"><OfferTable offer={n.agreed_offer!} plan={plan} /></div>
                        <div className="mt-4 flex gap-2">
                          <LinkButton href={`/negotiations/${n.id}`} variant="secondary" size="sm" className="flex-1">Replay</LinkButton>
                          {!d.contract && (
                            <Button size="sm" className="flex-1" onClick={() => select(n.id)} loading={busy === n.id} disabled={!!busy}>
                              Choose this deal
                            </Button>
                          )}
                          {n.status === "selected" && <Badge tone="dark" className="self-center">Chosen</Badge>}
                          {n.status === "not_selected" && <Badge className="self-center">Not chosen</Badge>}
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {d.negotiations.length > 0 && (
                <section>
                  <SectionTitle title="Agent negotiations" sub="Open any negotiation to watch it live, pause it or steer your agent." />
                  <div className="grid gap-3">
                    {d.negotiations.map((n) => (
                      <Link key={n.id} href={`/negotiations/${n.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-5 py-4 transition-all hover:border-neutral-400">
                        <DeveloperHeader d={n.developer!} />
                        <div className="flex items-center gap-4">
                          <span className="text-[12px] text-muted">
                            {n.status === "running" || n.status === "paused" ? `Turn ${n.round}/${n.max_rounds}` : n.outcome_summary?.slice(0, 80)}
                          </span>
                          {n.latest_offer && n.status === "running" && (
                            <span className="text-[13px] font-semibold tabular-nums">{usd(n.latest_offer.total_price)} · {n.latest_offer.timeline_weeks}w</span>
                          )}
                          <NegotiationBadge status={n.status} />
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {!d.contract && (
                <section>
                  <SectionTitle
                    title="Matched developers"
                    sub="Ranked by skills, similar shipped work, budget fit and capacity. Pick up to 5 to negotiate with in parallel."
                    right={
                      picked.filter((x) => !negByDev.has(x)).length > 0 && (
                        <Button onClick={negotiate} loading={busy === "negotiate"}>
                          <Handshake className="h-4 w-4" /> Start {picked.filter((x) => !negByDev.has(x)).length} negotiation{picked.filter((x) => !negByDev.has(x)).length > 1 ? "s" : ""}
                        </Button>
                      )
                    }
                  />
                  {busy === "negotiate" && <div className="mb-4"><AgentWorking agent="Your client agent" task="Opening negotiations with each developer's agent" /></div>}
                  {d.matches.length === 0 ? (
                    <Empty title="No developers matched yet" body="Try widening the budget or deadline on the Build Plan." />
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {d.matches.map((m) => {
                        const n = negByDev.get(m.developer_id);
                        return (
                          <MatchCard
                            key={m.id}
                            match={m}
                            selected={picked.includes(m.developer_id) || !!n}
                            disabled={!!n || (!picked.includes(m.developer_id) && picked.length >= 5)}
                            onToggle={n ? undefined : () => setPicked((s) => (s.includes(m.developer_id) ? s.filter((x) => x !== m.developer_id) : [...s, m.developer_id]))}
                            footer={n && (
                              <Link href={`/negotiations/${n.id}`} className="mt-4 flex items-center justify-between rounded-full bg-panel px-4 py-2 text-[12px] font-semibold">
                                <NegotiationBadge status={n.status} /> <span>Open room →</span>
                              </Link>
                            )}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
