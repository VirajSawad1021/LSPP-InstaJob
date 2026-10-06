"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ArtTile, Badge, ErrorNote, LinkButton, PageHeader, Skeleton, usd } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useRequireRole } from "@/lib/auth";
import { projectStatus } from "@/lib/labels";
import type { ProjectStatus, WorkItem } from "@/lib/types";

interface Row {
  id: string;
  title: string | null;
  status: ProjectStatus;
  budget_max: number | null;
  deadline_weeks: number | null;
  created_at: string;
}

const NEXT_STEP: Partial<Record<ProjectStatus, string>> = {
  clarifying: "Answer a few questions to get your Build Plan",
  planned: "Review the plan and publish it",
  open: "Pick developers and start negotiating",
  negotiating: "Agents are negotiating: compare offers",
  contracted: "Waiting for the developer to sign",
  in_progress: "Track milestones and review deliveries",
  completed: "All milestones approved",
};

export default function ClientHome() {
  const me = useRequireRole("client");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [work, setWork] = useState<Record<string, WorkItem>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, w] = await Promise.all([api<Row[]>("/api/projects"), api<WorkItem[]>("/api/work").catch(() => [] as WorkItem[])]);
      setRows(p);
      setWork(Object.fromEntries(w.map((x) => [x.project_id, x])));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  const first = me?.full_name?.split(" ")[0];

  return (
    <AppShell ready={!!me}>
      <PageHeader
        title={`Hi ${first ?? "there"}`}
        sub="Every project, and what your agent is doing on it right now."
        right={<LinkButton href="/client/new"><Plus className="h-4 w-4" /> New project</LinkButton>}
      />
      <ErrorNote message={error} onRetry={load} />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <Link href="/client/new" className="group flex min-h-[260px] flex-col justify-between rounded-[24px] border border-dashed border-line-strong bg-panel p-6 transition-colors hover:border-ink/40 hover:bg-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-white transition-transform group-hover:scale-105">
            <Plus className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[18px] font-medium tracking-[-0.02em]">Start a new project</p>
            <p className="mt-1 text-[13px] leading-relaxed text-body">Describe your idea in plain words. You&apos;ll have a Build Plan in about a minute.</p>
          </div>
        </Link>

        {!rows && !error && [0, 1].map((i) => <Skeleton key={i} className="min-h-[260px] rounded-[24px]" />)}

        {rows?.map((p) => {
          const s = projectStatus[p.status];
          const href = p.status === "clarifying" || p.status === "planned" ? `/client/new?project=${p.id}` : `/client/projects/${p.id}`;
          const w = work[p.id];
          const cur = w?.schedule.milestones.find((m) => m.status !== "approved");
          return (
            <Link key={p.id} href={href} className="group flex min-h-[260px] flex-col overflow-hidden rounded-[24px] border border-line bg-white transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(20,20,19,0.35)]">
              <ArtTile seed={p.id} className="h-28 shrink-0">
                <span className="absolute left-4 top-4"><Badge className="bg-white/85 text-ink backdrop-blur">{s.label}</Badge></span>
              </ArtTile>
              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <p className="text-[16px] font-medium leading-snug tracking-[-0.01em]">{p.title || "Untitled project"}</p>
                  <p className="mt-1 text-[12px] text-muted">
                    {p.budget_max ? usd(p.budget_max) : "No budget"} · {p.deadline_weeks ? `${p.deadline_weeks} weeks` : "no deadline"} · {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                {w && w.status !== "pending_approval" && (
                  <div className="mt-4">
                    <div className="h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-ink" style={{ width: `${w.schedule.progress}%` }} /></div>
                    <p className="mt-2 text-[12px] tabular-nums text-muted">
                      {w.schedule.progress}% · paid {usd(w.schedule.paid)} of {usd(w.schedule.total)}{w.escrow.held > 0 ? ` · ${usd(w.escrow.held)} in escrow` : ""}
                    </p>
                  </div>
                )}
                <p className="mt-4 flex items-center justify-between gap-3 text-[13px] text-body">
                  {w && cur && w.status === "active" ? `Now: ${cur.id} ${cur.title}` : NEXT_STEP[p.status]}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {rows && rows.length === 0 && (
        <p className="mt-8 text-[13px] text-muted">Tip: the more you say about who uses your product and what they do, the better the Build Plan.</p>
      )}
    </AppShell>
  );
}
