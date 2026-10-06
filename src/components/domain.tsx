"use client";

import { useState } from "react";
import { AlertTriangle, BadgeCheck, CheckCircle2, ChevronDown, CircleSlash, FolderGit2, MinusCircle } from "lucide-react";
import type { BuildPlan, Developer, Match, Milestone, NegotiationStatus, Offer, Priority } from "@/lib/types";
import { Avatar, Badge, Card, usd } from "./ui";

export const priorityTone: Record<Priority, "dark" | "info" | "neutral"> = { must: "dark", should: "info", nice: "neutral" };
export const priorityLabel: Record<Priority, string> = { must: "Must-have", should: "Should-have", nice: "Nice-to-have" };

export function MilestoneCard({
  m, onPriority, extra,
}: { m: Milestone; onPriority?: (p: Priority) => void; extra?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted">{m.id}</span>
            <p className="text-[15px] font-bold text-ink">{m.title}</p>
          </div>
          <p className="mt-1 text-[13px] text-body">{m.goal}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[12px] tabular-nums text-muted">~{m.est_hours} h</span>
          {onPriority ? (
            <select
              value={m.priority}
              onChange={(e) => onPriority(e.target.value as Priority)}
              className="rounded-full border border-line bg-white px-2 py-1 text-[11px] font-semibold focus:outline-none"
            >
              {(["must", "should", "nice"] as Priority[]).map((p) => (
                <option key={p} value={p}>{priorityLabel[p]}</option>
              ))}
            </select>
          ) : (
            <Badge tone={priorityTone[m.priority]}>{priorityLabel[m.priority]}</Badge>
          )}
        </div>
      </div>
      {extra}
      <button onClick={() => setOpen(!open)} className="mt-3 flex items-center gap-1 text-[12px] font-semibold text-body hover:text-ink">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {m.deliverables.length} deliverables · {m.acceptance_criteria.length} acceptance criteria
      </button>
      {open && (
        <div className="mt-3 grid gap-4 border-t border-line pt-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Deliverables</p>
            <ul className="mt-1.5 space-y-1">
              {m.deliverables.map((d) => (
                <li key={d} className="text-[13px] text-body">• {d}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Done when</p>
            <ul className="mt-1.5 space-y-1">
              {m.acceptance_criteria.map((c) => (
                <li key={c} className="flex gap-1.5 text-[13px] text-body">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" /> {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}

export function PlanOverview({ plan }: { plan: BuildPlan }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Summary</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{plan.summary}</p>
        <p className="mt-3 text-[12px] text-body"><span className="font-semibold text-ink">For:</span> {plan.target_users}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {plan.tech_stack.map((t) => <Badge key={t}>{t}</Badge>)}
        </div>
      </Card>
      <Card className="p-5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <AlertTriangle className="h-3.5 w-3.5 text-warn" /> Risks flagged
        </p>
        <ul className="mt-2 space-y-2">
          {plan.risks.slice(0, 4).map((r) => (
            <li key={r.risk} className="text-[12px] leading-snug">
              <span className="font-semibold text-ink">{r.risk}</span>
              <span className="block text-body">{r.mitigation}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[11px]">
        <span className="text-body">{label}</span>
        <span className="font-semibold tabular-nums text-ink">{Math.round(value * 100)}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-panel-2">
        <div className="h-1.5 rounded-full bg-ink transition-all" style={{ width: `${Math.max(4, value * 100)}%` }} />
      </div>
    </div>
  );
}

export function ScoreRing({ score }: { score: number }) {
  const r = 20, c = 2 * Math.PI * r;
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 48 48" className="h-14 w-14 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#eeeeee" strokeWidth="4" />
        <circle cx="24" cy="24" r={r} fill="none" stroke="#111111" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[14px] font-bold tabular-nums">{score}</span>
    </div>
  );
}

export function DeveloperHeader({ d, size = "md" }: { d: Developer; size?: "md" | "lg" }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={d.full_name} className={size === "lg" ? "h-12 w-12 text-[15px]" : "h-10 w-10 text-[13px]"} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
          {d.full_name}
          {d.github_signals && <span title="GitHub verified"><BadgeCheck className="h-4 w-4 text-info" /></span>}
        </p>
        <p className="truncate text-[12px] text-body">{d.headline}</p>
        <p className="text-[11px] text-muted">
          {[d.location, d.years_experience != null && `${d.years_experience} yrs`, d.rate_target && `usually $${d.rate_target}/h`]
            .filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );
}

export function MatchCard({
  match, selected, onToggle, disabled, footer,
}: { match: Match; selected?: boolean; onToggle?: () => void; disabled?: boolean; footer?: React.ReactNode }) {
  const d = match.developer!;
  const b = match.breakdown;
  return (
    <Card className={`p-5 transition-all ${selected ? "border-ink ring-1 ring-ink" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <DeveloperHeader d={d} />
        <ScoreRing score={match.score} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
        <Bar label="Skills" value={b.skills} />
        <Bar label="Past work" value={b.semantic} />
        <Bar label="Budget fit" value={b.budget} />
        <Bar label="Capacity" value={b.capacity} />
      </div>
      <ul className="mt-4 space-y-1">
        {match.reasons.slice(0, 3).map((r) => (
          <li key={r} className="flex gap-1.5 text-[12px] text-body"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" />{r}</li>
        ))}
        {match.concerns.slice(0, 2).map((r) => (
          <li key={r} className="flex gap-1.5 text-[12px] text-warn"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{r}</li>
        ))}
      </ul>
      {d.shipped_projects?.[0] && (
        <div className="mt-3 rounded-xl bg-panel px-3 py-2 text-[12px]">
          <span className="font-semibold text-ink">Shipped {d.shipped_projects[0].name}:</span>{" "}
          <span className="text-body">{d.shipped_projects[0].what}</span>
          {d.shipped_projects[0].outcome && <span className="text-muted"> · {d.shipped_projects[0].outcome}</span>}
        </div>
      )}
      {d.github_signals && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          <FolderGit2 className="h-3.5 w-3.5" /> {d.github_signals.public_repos} public repos · {d.github_signals.top_languages.slice(0, 3).join(", ")}
        </p>
      )}
      {onToggle && (
        <button
          onClick={onToggle}
          disabled={disabled}
          className={`mt-4 h-9 w-full rounded-full text-[12px] font-semibold transition-all disabled:opacity-40 ${
            selected ? "bg-ink text-white" : "border border-[#e0e0e0] hover:border-neutral-400"
          }`}
        >
          {selected ? "Selected for negotiation" : "Negotiate with this developer"}
        </button>
      )}
      {footer}
    </Card>
  );
}

export function OfferTable({ offer, plan, compare }: { offer: Offer; plan: BuildPlan; compare?: Offer | null }) {
  const prev = new Map(compare?.lines.map((l) => [l.milestone_id, l]));
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      {plan.milestones.map((m) => {
        const l = offer.lines.find((x) => x.milestone_id === m.id);
        const p = prev.get(m.id);
        const changed = compare && p && l && (p.included !== l.included || p.price !== l.price || p.weeks !== l.weeks);
        return (
          <div key={m.id} className={`flex items-center justify-between gap-2 border-b border-line px-3 py-2 last:border-0 ${changed ? "bg-warn-bg/60" : ""}`}>
            <div className="flex min-w-0 items-center gap-2">
              {l?.included ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-good" /> : <MinusCircle className="h-3.5 w-3.5 shrink-0 text-muted" />}
              <span className="font-mono text-[10px] text-muted">{m.id}</span>
              <span className={`truncate text-[12px] ${l?.included ? "text-ink" : "text-muted line-through"}`}>{m.title}</span>
            </div>
            <span className="shrink-0 text-[12px] tabular-nums">
              {l?.included ? (
                <>
                  <span className="font-semibold">{usd(l.price)}</span>
                  <span className="text-muted"> · {l.weeks}w</span>
                  {changed && p?.included && p.price !== l.price && (
                    <span className="ml-1 text-[10px] text-muted line-through">{usd(p.price)}</span>
                  )}
                </>
              ) : (
                <span className="text-muted">excluded</span>
              )}
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between bg-panel px-3 py-2">
        <span className="text-[11px] text-body">{offer.revisions_per_milestone} revision{offer.revisions_per_milestone === 1 ? "" : "s"} · starts in {offer.start_in_days}d</span>
        <span className="text-[13px] font-bold tabular-nums">{usd(offer.total_price)} · {offer.timeline_weeks} weeks</span>
      </div>
    </div>
  );
}

const statusMeta: Record<NegotiationStatus, { label: string; tone: "neutral" | "good" | "warn" | "bad" | "info" | "dark" }> = {
  pending: { label: "Starting", tone: "neutral" },
  running: { label: "Negotiating", tone: "info" },
  paused: { label: "Paused", tone: "warn" },
  agreed: { label: "Deal agreed", tone: "good" },
  impasse: { label: "No deal", tone: "neutral" },
  failed: { label: "Interrupted", tone: "bad" },
  selected: { label: "Selected", tone: "dark" },
  not_selected: { label: "Not selected", tone: "neutral" },
};

export function NegotiationBadge({ status }: { status: NegotiationStatus }) {
  const s = statusMeta[status];
  return (
    <Badge tone={s.tone}>
      {status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" />}
      {status === "impasse" && <CircleSlash className="h-3 w-3" />}
      {s.label}
    </Badge>
  );
}
