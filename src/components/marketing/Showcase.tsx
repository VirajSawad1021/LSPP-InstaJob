"use client";

import { useEffect, useState } from "react";
import { Bot, Check, CircleHelp, ShieldCheck, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Demo content comes from a real InstaJob test run (Gemini agents).   */
/* ------------------------------------------------------------------ */

const IDEA = "A booking app for home tutors in Kathmandu. Parents search tutors by subject and area, book weekly sessions and pay online.";
const MILESTONES = [
  { id: "m1", title: "Tutor directory & search", h: 18, p: "Must" },
  { id: "m2", title: "Tutor registration & verification", h: 16, p: "Must" },
  { id: "m3", title: "Booking & local payments", h: 22, p: "Must" },
  { id: "m4", title: "Tutor dashboard & schedule", h: 14, p: "Should" },
];

function useTicker(active: boolean, steps: number, ms: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((x) => (x < steps ? x + 1 : x)), ms);
    return () => clearInterval(t);
  }, [active, steps, ms]);
  return active ? n : 0;
}

function ScopeDemo({ active }: { active: boolean }) {
  const n = useTicker(active, MILESTONES.length + 2, 650);
  const chars = useTicker(active, IDEA.length, 12);
  return (
    <div className="grid h-full gap-4 p-5 md:grid-cols-[0.9fr_1.1fr] md:p-6">
      <div className="flex flex-col">
        <p className="text-[12px] text-muted">Your idea</p>
        <p className="mt-2 min-h-[96px] rounded-2xl bg-panel p-4 text-[14px] leading-relaxed text-ink">
          {IDEA.slice(0, Math.max(chars, active ? 0 : IDEA.length))}
          <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-ink" />
        </p>
        <p className="mt-5 text-[12px] text-muted">Requirements Agent asked</p>
        <div className="mt-2 space-y-2">
          {[["Website or mobile app?", "Mobile-friendly website"], ["Which payments?", "eSewa and Khalti"]].map(([q, a], i) => (
            <div key={q} className={`rounded-2xl border border-line bg-white p-3 transition-all duration-500 ${n > i ? "opacity-100" : "translate-y-2 opacity-0"}`}>
              <p className="text-[13px] text-ink">{q}</p>
              <span className="mt-2 inline-block rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-white">{a}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[15px] font-semibold tracking-tight">Build Plan</p>
          <p className="text-[12px] text-muted">70 h · 4 milestones</p>
        </div>
        <div className="mt-3 space-y-2">
          {MILESTONES.map((m, i) => (
            <div key={m.id} className={`rounded-xl border border-line px-3 py-2.5 transition-all duration-500 ${n > i + 1 ? "opacity-100" : "translate-y-2 opacity-0"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-ink"><span className="mr-1.5 font-mono text-[11px] text-muted">{m.id}</span>{m.title}</p>
                <span className="text-[11px] text-muted">{m.p} · {m.h}h</span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-body"><Check className="h-3 w-3 text-good" /> 3 checkable acceptance criteria</p>
            </div>
          ))}
        </div>
        <div className={`mt-3 rounded-xl bg-good-bg px-3 py-2 text-[12px] text-good transition-opacity duration-500 ${n > MILESTONES.length + 1 ? "opacity-100" : "opacity-0"}`}>
          Market check: must-haves ≈ $1,456 at platform rates. Your $2,800 budget covers it.
        </div>
      </div>
    </div>
  );
}

const DEVS = [
  { name: "Ayam Shrestha", role: "Next.js + Supabase, marketplace MVPs", score: 88, bars: [0.67, 0.93, 1, 1], art: "art-bronze", why: "Shipped a tutor marketplace in Nepal" },
  { name: "Rohan Mehta", role: "Booking & scheduling apps", score: 85, bars: [0.67, 0.86, 0.9, 1], art: "art-sea", why: "Built appointment booking for 90 salons" },
  { name: "Kiran Rai", role: "Supabase dashboards & tools", score: 85, bars: [0.67, 0.8, 1, 1], art: "art-olive", why: "Next.js + Supabase inventory system" },
];

function MatchDemo({ active }: { active: boolean }) {
  const n = useTicker(active, DEVS.length, 500);
  return (
    <div className="h-full p-5 md:p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-semibold tracking-tight">Ranked for your Build Plan</p>
        <p className="text-[12px] text-muted">16 developers scanned</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {DEVS.map((d, i) => (
          <div key={d.name} className={`rounded-2xl border border-line bg-white p-4 transition-all duration-500 ${n > i ? "opacity-100" : "translate-y-3 opacity-0"}`}>
            <div className="flex items-center justify-between">
              <span className={`relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[12px] font-semibold text-white ${d.art}`}>
                {d.name.split(" ").map((x) => x[0]).join("")}
              </span>
              <span className="text-[22px] font-semibold tabular-nums tracking-tight">{d.score}</span>
            </div>
            <p className="mt-3 text-[14px] font-semibold">{d.name}</p>
            <p className="text-[12px] text-body">{d.role}</p>
            <div className="mt-3 space-y-1.5">
              {["Skills", "Past work", "Budget", "Capacity"].map((l, j) => (
                <div key={l} className="flex items-center gap-2">
                  <span className="w-16 text-[10px] text-muted">{l}</span>
                  <span className="h-1 flex-1 rounded-full bg-panel-2">
                    <span className="block h-1 rounded-full bg-ink transition-all duration-700" style={{ width: n > i ? `${d.bars[j] * 100}%` : "0%" }} />
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 flex gap-1.5 text-[11px] text-body"><Check className="mt-0.5 h-3 w-3 shrink-0 text-good" />{d.why}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const TURNS = [
  { who: "dev", text: "I built PadhaiSathi, a tutor marketplace in Nepal with local booking and payments. Full scope, 4 weeks.", total: 2240 },
  { who: "client", text: "You can reuse PadhaiSathi components, which cuts hours. $1,920 for the full scope, same 4 weeks.", total: 1920 },
  { who: "dev", text: "I can meet you at $2,080. To balance it, revisions drop to 1 per milestone.", total: 2080 },
  { who: "client", text: "We need 2 revisions for testing. Final: $2,000, full scope, 4 weeks.", total: 2000 },
  { who: "dev", text: "Accepted: $2,000, full scope, 2 revisions per milestone.", total: 2000, accept: true },
];

function NegotiateDemo({ active }: { active: boolean }) {
  const n = useTicker(active, TURNS.length, 1500);
  const shown = TURNS.slice(0, Math.max(1, n));
  const last = shown[shown.length - 1];
  return (
    <div className="grid h-full gap-4 p-5 md:grid-cols-[1.3fr_0.7fr] md:p-6">
      <div className="space-y-2.5 overflow-hidden">
        {shown.map((t, i) => (
          <div key={i} className={`flex gap-2 animate-fade-in ${t.who === "client" ? "flex-row-reverse" : ""}`}>
            <span className={`relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold text-white ${t.who === "dev" ? "art-bronze" : "bg-ink"}`}>
              {t.who === "dev" ? "AS" : <Bot className="h-3.5 w-3.5" />}
            </span>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[12.5px] leading-relaxed ${t.who === "dev" ? "rounded-tl-md bg-panel-2 text-ink" : "rounded-tr-md bg-ink text-white"}`}>
              {"accept" in t && <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-[#7fc98d]">Deal agreed</span>}
              {t.text}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-[11px] text-muted">On the table</p>
          <p key={last.total} className="mt-1 text-[30px] font-semibold tabular-nums tracking-tight animate-fade-in">${last.total.toLocaleString()}</p>
          <p className="text-[12px] text-body">4 milestones · 4 weeks</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4 text-[12px]">
          <p className="text-[11px] text-muted">Founder&apos;s hard limits</p>
          <p className="mt-1.5 flex justify-between"><span className="text-body">Budget</span><span className="font-medium">$2,800</span></p>
          <p className="flex justify-between"><span className="text-body">Deadline</span><span className="font-medium">6 weeks</span></p>
          <p className="flex justify-between"><span className="text-body">Never drop</span><span className="font-medium">m1, m2, m3</span></p>
        </div>
        <p className="flex items-center gap-1.5 rounded-2xl bg-good-bg px-3 py-2 text-[11px] text-good"><ShieldCheck className="h-3.5 w-3.5" /> Audit chain verified · 7 events</p>
      </div>
    </div>
  );
}

const CHECKS = [
  { c: "Visiting /tutors lists tutors with subject and area filters", v: "met", e: "Page returned HTTP 200 with a filter form (subject, area)" },
  { c: "Selecting a tutor opens /tutors/[id] with bio and rate", v: "met", e: "Internal link /tutors/42 found; page shows 'Rs 800/hr'" },
  { c: "Parents can create an account with email", v: "unverifiable", e: "Needs a signed-in session. Founder should try /signup" },
  { c: "Repository has a README with setup steps", v: "not_met", e: "README.md is the default template, with no setup section" },
];

function VerifyDemo({ active }: { active: boolean }) {
  const n = useTicker(active, CHECKS.length, 700);
  const icon = { met: <Check className="h-3.5 w-3.5 text-good" />, not_met: <X className="h-3.5 w-3.5 text-bad" />, unverifiable: <CircleHelp className="h-3.5 w-3.5 text-muted" /> };
  return (
    <div className="h-full p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold tracking-tight">m1 · Tutor directory &amp; search</p>
        <p className="font-mono text-[11px] text-muted">tutors-ktm.vercel.app · github.com/ayam/tutors</p>
      </div>
      <div className="mt-4 space-y-2">
        {CHECKS.map((x, i) => (
          <div key={x.c} className={`flex gap-3 rounded-2xl border border-line bg-white px-4 py-3 transition-all duration-500 ${n > i ? "opacity-100" : "translate-y-2 opacity-0"}`}>
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel-2">{icon[x.v as keyof typeof icon]}</span>
            <div>
              <p className="text-[13px] font-medium text-ink">{x.c}</p>
              <p className="text-[12px] text-body">{x.e}</p>
            </div>
          </div>
        ))}
      </div>
      <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-panel px-4 py-3 text-[12px] transition-opacity duration-500 ${n >= CHECKS.length ? "opacity-100" : "opacity-0"}`}>
        <span className="text-body">2 met · 1 to check yourself · 1 needs work</span>
        <span className="font-medium text-ink">Request changes, or approve and release $520</span>
      </div>
    </div>
  );
}

const TABS = [
  { key: "scope", label: "Scope", sub: "Requirements Agent", C: ScopeDemo },
  { key: "match", label: "Match", sub: "Explainable ranking", C: MatchDemo },
  { key: "negotiate", label: "Negotiate", sub: "Agent to agent", C: NegotiateDemo },
  { key: "verify", label: "Verify", sub: "Proof of Done", C: VerifyDemo },
];
const DURATION = 9000;

export function Showcase() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setI((x) => (x + 1) % TABS.length), DURATION);
    return () => clearTimeout(t);
  }, [i, paused]);

  return (
    <div
      className="relative overflow-hidden rounded-[32px] bg-cover bg-center p-3 sm:p-6 md:p-10"
      style={{ backgroundImage: "url(/art/warm.webp)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto mb-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-white/70 p-1 backdrop-blur-md">
        {TABS.map((t, idx) => (
          <button
            key={t.key}
            onClick={() => setI(idx)}
            className={`relative overflow-hidden rounded-full px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-colors sm:px-5 ${idx === i ? "bg-white text-ink shadow-sm" : "text-body hover:text-ink"}`}
          >
            {t.label}
            {idx === i && !paused && (
              <span key={i} className="absolute inset-x-3 bottom-1 h-[2px] origin-left rounded-full bg-ink/15">
                <span className="block h-full origin-left animate-[grow_9s_linear_forwards] rounded-full bg-ink/60" />
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mx-auto max-w-[980px] overflow-hidden rounded-[22px] bg-white shadow-[0_24px_60px_-24px_rgba(60,30,10,0.35)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="text-[12px] text-muted">{TABS[i].sub}</p>
          <p className="text-[12px] text-muted">Kathmandu home-tutor app</p>
        </div>
        <div className="min-h-[420px]">
          {TABS.map((t, idx) => (idx === i ? <t.C key={t.key} active /> : null))}
        </div>
      </div>
    </div>
  );
}
