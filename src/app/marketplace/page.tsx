"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Search, Send, Sparkles, UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DeveloperHeader, NegotiationBadge, ScoreRing } from "@/components/domain";
import { Badge, Button, Card, Empty, ErrorNote, inputCls, LinkButton, PageHeader, Skeleton, usd } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { MarketDeveloper, MarketProject } from "@/lib/types";

type Tab = "projects" | "developers";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ProjectCard({ p, isDev, busy, onPitch }: { p: MarketProject; isDev: boolean; busy: boolean; onPitch: () => void }) {
  return (
    <Card className="flex flex-col p-5 transition-all hover:border-ink/25">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] font-medium leading-snug tracking-[-0.01em]">{p.title}</p>
          <p className="mt-1 text-[12px] text-muted">
            {usd(p.budget_max)} · {p.deadline_weeks} weeks · {p.milestones} milestones · ~{p.hours} h
          </p>
        </div>
        {p.fit && <ScoreRing score={p.fit.score} />}
      </div>
      <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-body">{p.summary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{p.required_skills.slice(0, 6).map((s) => <Badge key={s}>{s}</Badge>)}</div>
      {p.fit && (
        <ul className="mt-3 flex-1 space-y-0.5">
          {p.fit.reasons.map((r) => <li key={r} className="text-[12px] text-good">✓ {r}</li>)}
          {p.fit.concerns.map((r) => <li key={r} className="text-[12px] text-warn">! {r}</li>)}
        </ul>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-[11px] text-muted">Posted {new Date(p.created_at).toLocaleDateString()}</span>
        {isDev ? (
          p.negotiation ? (
            <LinkButton href={`/negotiations/${p.negotiation.id}`} variant="secondary" size="sm"><NegotiationBadge status={p.negotiation.status} /> Open room</LinkButton>
          ) : (
            <Button size="sm" onClick={onPitch} loading={busy}><Send className="h-3.5 w-3.5" /> Send my agent</Button>
          )
        ) : (
          <span className="text-[11px] text-muted">Developers pitch with their agents</span>
        )}
      </div>
    </Card>
  );
}

function DeveloperCard({ d, canInvite, busy, onInvite }: { d: MarketDeveloper; canInvite: boolean; busy: boolean; onInvite: () => void }) {
  return (
    <Card className="flex flex-col p-5 transition-all hover:border-ink/25">
      <div className="flex items-start justify-between gap-3">
        <DeveloperHeader d={d} />
        {d.fit && <ScoreRing score={d.fit.score} />}
      </div>
      <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-body">{d.bio}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{d.skills.slice(0, 7).map((s) => <Badge key={s}>{s}</Badge>)}</div>
      {d.shipped_projects?.[0] && (
        <p className="mt-3 rounded-xl bg-panel px-3 py-2 text-[12px]">
          <span className="font-medium text-ink">Shipped {d.shipped_projects[0].name}:</span> <span className="text-body">{d.shipped_projects[0].what}</span>
        </p>
      )}
      {d.fit && (
        <ul className="mt-3 space-y-0.5">
          {d.fit.reasons.map((r) => <li key={r} className="text-[12px] text-good">✓ {r}</li>)}
          {d.fit.concerns.map((r) => <li key={r} className="text-[12px] text-warn">! {r}</li>)}
        </ul>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-[11px] text-muted">{d.weekly_hours} h/week · {d.availability}</span>
        {canInvite && <Button size="sm" onClick={onInvite} loading={busy}><UserPlus className="h-3.5 w-3.5" /> Invite to negotiate</Button>}
      </div>
    </Card>
  );
}

function Marketplace() {
  const { me } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const isDev = me?.role === "developer";
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "projects");
  const [q, setQ] = useState("");
  const [skill, setSkill] = useState("");
  const [limit, setLimit] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [myProjects, setMyProjects] = useState<{ id: string; title: string | null; status: string }[]>([]);
  const [projects, setProjects] = useState<MarketProject[] | null>(null);
  const [devs, setDevs] = useState<MarketDeveloper[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dq = useDebounced(q);
  const dskill = useDebounced(skill);
  const dlimit = useDebounced(limit);

  useEffect(() => {
    if (me && !isDev && !params.get("tab")) setTab("developers");
  }, [me, isDev, params]);

  useEffect(() => {
    if (!me || isDev) return;
    api<{ id: string; title: string | null; status: string }[]>("/api/projects").then((rows) => {
      const open = rows.filter((r) => ["open", "negotiating"].includes(r.status));
      setMyProjects(open);
      setProjectId((cur) => cur || open[0]?.id || "");
    }).catch(() => {});
  }, [me, isDev]);

  const load = useCallback(async () => {
    setError(null);
    const qs = new URLSearchParams();
    if (dq) qs.set("q", dq);
    if (dskill) qs.set("skill", dskill);
    try {
      if (tab === "projects") {
        if (dlimit) qs.set("max_weeks", dlimit);
        setProjects(null);
        setProjects(await api<MarketProject[]>(`/api/marketplace/projects?${qs}`));
      } else {
        if (dlimit) qs.set("max_rate", dlimit);
        if (projectId) qs.set("project_id", projectId);
        setDevs(null);
        setDevs(await api<MarketDeveloper[]>(`/api/marketplace/developers?${qs}`));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [tab, dq, dskill, dlimit, projectId]);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  async function pitch(id: string) {
    setBusy(id);
    try {
      const r = await api<{ negotiation_id: string }>(`/api/projects/${id}/pitch`, { body: {} });
      router.push(`/negotiations/${r.negotiation_id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  async function invite(devId: string) {
    if (!projectId) return;
    setBusy(devId);
    try {
      const r = await api<{ negotiation_id: string }>(`/api/projects/${projectId}/invite`, { body: { developer_id: devId } });
      router.push(`/negotiations/${r.negotiation_id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  const items = tab === "projects" ? projects : devs;

  return (
    <AppShell ready={!!me} wide>
      <PageHeader
        title="Marketplace"
        sub={isDev
          ? "Every open Build Plan. Sorted by how well it fits you; send your agent to pitch for any of them."
          : "Every developer on InstaJob. Pick one of your projects to see fit scores and invite anyone to negotiate."}
      />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-fit gap-1 rounded-full bg-cream-2 p-1">
          {(["projects", "developers"] as Tab[]).map((t) => (
            <button key={t} onClick={() => { setTab(t); setLimit(""); }} className={`rounded-full px-5 py-2 text-[13px] font-medium capitalize transition-all ${tab === t ? "bg-white text-ink shadow-sm" : "text-body hover:text-ink"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap gap-2 lg:max-w-[720px] lg:flex-nowrap lg:justify-end">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted" />
            <input className={`${inputCls} pl-10`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "projects" ? "Search projects" : "Search developers"} />
          </div>
          <div className="w-40 shrink-0"><input className={inputCls} value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Skill, e.g. Stripe" /></div>
          <div className="w-32 shrink-0"><input className={inputCls} type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={tab === "projects" ? "Max weeks" : "Max $/h"} /></div>
        </div>
      </div>

      {tab === "developers" && !isDev && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
          <Sparkles className="h-4 w-4 text-clay" />
          <span className="text-[13px] text-body">Score developers for</span>
          {myProjects.length ? (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-full border border-line-strong bg-white px-3 py-1.5 text-[13px] focus:outline-none">
              {myProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          ) : (
            <span className="text-[13px] text-muted">
              no published project yet. <Link href="/client/new" className="font-medium text-ink underline underline-offset-2">Create one</Link> to invite developers.
            </span>
          )}
        </div>
      )}

      <ErrorNote message={error} onRetry={load} />
      {!items && !error && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
      )}
      {items && items.length === 0 && (
        <Empty title="Nothing matches those filters" body="Try a broader search or remove a filter." icon={<Search className="h-5 w-5" />} />
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tab === "projects" && projects?.map((p) => <ProjectCard key={p.id} p={p} isDev={isDev} busy={busy === p.id} onPitch={() => pitch(p.id)} />)}
        {tab === "developers" && devs?.map((d) => (
          <DeveloperCard key={d.id} d={d} canInvite={!isDev && !!projectId} busy={busy === d.id} onInvite={() => invite(d.id)} />
        ))}
      </div>
      {tab === "projects" && !isDev && projects && projects.length > 0 && (
        <p className="mt-6 text-[13px] text-muted">
          Browsing as a founder: see what others are building. <Link href="/client/new" className="inline-flex items-center gap-1 font-medium text-ink">Start your own <ArrowRight className="h-3.5 w-3.5" /></Link>
        </p>
      )}
    </AppShell>
  );
}

export default function MarketplacePage() {
  return (
    <Suspense>
      <Marketplace />
    </Suspense>
  );
}
