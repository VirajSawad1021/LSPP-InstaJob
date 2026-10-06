"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Minus, Plus } from "lucide-react";
import { SiteShell } from "@/components/marketing/Chrome";
import { CountUp, Reveal } from "@/components/marketing/Reveal";
import { Showcase } from "@/components/marketing/Showcase";
import { homeFor, useAuth } from "@/lib/auth";

const STACK = ["Gemini 3.5 Flash", "LangGraph", "Agent2Agent protocol", "Supabase", "pgvector", "FastAPI", "Next.js", "SHA-256 audit chain"];

const FAQ = [
  ["Does the AI sign contracts for me?", "No. Agents prepare deals; people sign them. The founder chooses between ready-to-sign offers, and the developer approves the contract before any work starts."],
  ["What stops the agents from agreeing to a bad deal?", "Hard limits that live in software, not in the prompt. Every offer and every acceptance is checked against the founder's budget, deadline and must-have milestones, and against the developer's private minimum rate and weekly capacity. An offer that breaks a limit is rejected before the other side ever sees it."],
  ["Can the other agent trick mine with a clever message?", "Messages between agents are treated as untrusted data. Even if one said \"ignore your limits\", the checks above would still block the offer, because they don't read the conversation at all."],
  ["What stays private?", "A developer's minimum rate, dealbreakers and negotiation style are never shown to founders, and neither side sees the other's instructions to its agent. Database row-level security enforces this, not just the interface. The budget and deadline you post are part of your public brief, like on any job board, so developers can decide whether to pitch."],
  ["What happens if the AI model is down?", "The negotiation pauses and says so, and you can retry from the exact turn where it stopped. InstaJob never invents a result to hide an error."],
  ["What is A2A?", "Agent2Agent is an open protocol for agents from different systems to talk to each other. Every developer agent on InstaJob publishes an Agent Card, and every negotiation can be exported as A2A messages."],
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-line border-y border-line">
      {FAQ.map(([q, a], i) => (
        <div key={q}>
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-6 py-6 text-left">
            <span className="text-[18px] tracking-[-0.01em] text-ink sm:text-[20px]">{q}</span>
            {open === i ? <Minus className="h-5 w-5 shrink-0 text-muted" /> : <Plus className="h-5 w-5 shrink-0 text-muted" />}
          </button>
          <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${open === i ? "grid-rows-[1fr] pb-6 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <p className="max-w-3xl overflow-hidden text-[15px] leading-relaxed text-body">{a}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { me, session } = useAuth();
  const start = session ? homeFor(me) : "/auth?mode=signup";

  return (
    <SiteShell>
      {/* ---------------- hero ---------------- */}
      <section className="mx-auto max-w-[1240px] px-5 pb-12 pt-16 sm:px-8 sm:pt-24">
        <div className="grid items-end gap-10 lg:grid-cols-2">
          <Reveal>
            <h1 className="text-[46px] font-medium leading-[1.02] tracking-[-0.035em] text-ink sm:text-[72px]">
              Describe it once.
              <br />
              Agents do the hiring.
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <div className="lg:pb-3">
              <p className="max-w-[520px] text-[17px] leading-relaxed text-body">
                InstaJob turns a founder&apos;s idea into a milestone build plan, finds developers with proof of shipped work, and lets
                two AI agents negotiate a fixed-price deal inside both sides&apos; limits. People only approve.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href={start} className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-white transition-colors hover:bg-ink-soft">
                  Start with your idea <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/developers" className="inline-flex h-12 items-center rounded-full border border-line-strong bg-white/60 px-6 text-[15px] font-medium text-ink transition-colors hover:bg-white">
                  I&apos;m a developer
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- product showcase ---------------- */}
      <section id="product" className="mx-auto max-w-[1240px] scroll-mt-20 px-3 sm:px-8">
        <Reveal delay={200}>
          <Showcase />
        </Reveal>
      </section>

      {/* ---------------- stack marquee ---------------- */}
      <section className="mx-auto mt-16 max-w-[1240px] px-5 sm:px-8">
        <p className="text-center text-[13px] text-muted">Built on</p>
        <div className="relative mt-5 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <div className="flex w-max animate-[marquee_38s_linear_infinite] gap-14">
            {[...STACK, ...STACK].map((s, i) => (
              <span key={i} className="whitespace-nowrap text-[20px] font-medium tracking-[-0.02em] text-ink/40">{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- two sides ---------------- */}
      <section className="mx-auto max-w-[1240px] px-5 py-28 sm:px-8">
        <Reveal>
          <h2 className="max-w-3xl text-[36px] font-medium leading-[1.08] tracking-[-0.03em] sm:text-[52px]">
            One marketplace, two agents. <span className="text-muted">Each works only for its own side.</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {[
            {
              who: "For founders", title: "Your agent scopes the work and drives the bargain", href: "/founders", cta: "How it works for founders",
              art: "/art/warm.webp",
              ui: (
                <div className="space-y-2">
                  <div className="rounded-xl bg-white p-3 shadow-sm">
                    <p className="text-[11px] text-muted">Offer on the table</p>
                    <p className="text-[22px] font-semibold tracking-tight">$2,000 <span className="text-[13px] font-normal text-body">· 4 weeks · full scope</span></p>
                  </div>
                  <div className="rounded-xl bg-white/90 p-3 text-[12px] text-body shadow-sm">Your agent: &ldquo;You can reuse PadhaiSathi components. $1,920 for the full scope.&rdquo;</div>
                </div>
              ),
            },
            {
              who: "For developers", title: "Your agent pitches with proof and never goes below your floor", href: "/developers", cta: "How it works for developers",
              art: "/art/sage.webp",
              ui: (
                <div className="space-y-2">
                  <div className="rounded-xl bg-white p-3 shadow-sm">
                    <p className="text-[11px] text-muted">Projects that fit you</p>
                    <p className="text-[15px] font-semibold">Kathmandu home-tutor app <span className="float-right text-[18px] tabular-nums">88</span></p>
                    <p className="text-[12px] text-body">Budget $2,800 · 6 weeks · 4 milestones</p>
                  </div>
                  <div className="rounded-xl bg-white/90 p-3 text-[12px] text-body shadow-sm">Minimum rate $22/h, private to you, enforced on every offer.</div>
                </div>
              ),
            },
          ].map((c, i) => (
            <Reveal key={c.who} delay={i * 120}>
              <div className="group flex h-full flex-col">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[15px] text-muted">{c.who}</p>
                    <p className="mt-1 max-w-md text-[22px] font-medium leading-snug tracking-[-0.02em]">{c.title}</p>
                  </div>
                </div>
                <div className="relative mt-6 flex min-h-[300px] flex-1 items-end overflow-hidden rounded-[28px] bg-cover bg-center p-6 sm:p-8" style={{ backgroundImage: `url(${c.art})` }}>
                  <div className="w-full max-w-sm transition-transform duration-700 group-hover:-translate-y-1">{c.ui}</div>
                </div>
                <Link href={c.href} className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-medium text-ink hover:gap-2.5 hover:underline">
                  {c.cta} <ArrowRight className="h-4 w-4 transition-all" />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- how it works: alternating rows ---------------- */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-[1240px] px-5 py-28 sm:px-8">
          <Reveal>
            <p className="text-[15px] text-muted">How it works</p>
            <h2 className="mt-2 max-w-3xl text-[36px] font-medium leading-[1.08] tracking-[-0.03em] sm:text-[52px]">From a sentence to a verified milestone.</h2>
          </Reveal>
          <div className="mt-20 space-y-28">
            {[
              {
                n: "01", t: "A build plan you can hold people to", b: "The Requirements Agent asks only the questions that change scope, like platforms, payments and roles, then writes milestones with deliverables and acceptance criteria that a machine can check. Hour estimates stay honest; if your budget is too small, the plan says so before anyone is contacted.",
                vis: (
                  <div className="space-y-2.5">
                    {["Tutor directory & search", "Booking & local payments", "Tutor dashboard"].map((x, i) => (
                      <div key={x} className="flex items-center justify-between rounded-2xl bg-white/90 px-4 py-3 shadow-sm backdrop-blur" style={{ marginLeft: i * 18 }}>
                        <span className="text-[14px] font-medium">{x}</span>
                        <span className="text-[12px] text-muted">{["Must · 18h", "Must · 22h", "Should · 14h"][i]}</span>
                      </div>
                    ))}
                  </div>
                ), art: "/art/sage.webp",
              },
              {
                n: "02", t: "Five negotiations at once, and you can step in at any time", b: "Your agent and each shortlisted developer's agent trade scope, time and price as typed offers. Watch the price converge live, pause any negotiation, or tell your agent what matters most. Your instructions stay private to your side.",
                vis: (
                  <div className="space-y-2.5">
                    {[["Rohan", "$2,420", "6w"], ["Ayam", "$2,000", "4w"], ["Kiran", "$1,480", "4w"]].map(([nm, p, w], i) => (
                      <div key={nm} className="flex items-center justify-between rounded-2xl bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
                        <span className="text-[14px] font-medium">{nm}&apos;s agent</span>
                        <span className="text-[14px] tabular-nums">{p} <span className="text-muted">· {w}</span></span>
                        <span className={`text-[12px] ${i === 1 ? "font-medium text-good" : "text-muted"}`}>{i === 1 ? "Chosen" : "Agreed"}</span>
                      </div>
                    ))}
                  </div>
                ), art: "/art/warm.webp",
              },
              {
                n: "03", t: "Pay for proof, not promises", b: "When a milestone is submitted, the Verification Agent loads the live site and reads the repository, then checks every acceptance criterion and cites its evidence. Anything it can't check from outside, it tells you to check yourself. You approve and release payment, or send it back.",
                vis: (
                  <div className="space-y-2.5">
                    {[["Search page lists tutors with filters", "Met"], ["Tutor profile shows rate", "Met"], ["README has setup steps", "Needs work"]].map(([c, v]) => (
                      <div key={c} className="flex items-center justify-between gap-3 rounded-2xl bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
                        <span className="text-[14px]">{c}</span>
                        <span className={`text-[12px] font-medium ${v === "Met" ? "text-good" : "text-warn"}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                ), art: "/art/orb.webp",
              },
            ].map((row, i) => (
              <div key={row.n} className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-20 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
                <Reveal>
                  <div className="relative overflow-hidden rounded-[28px] bg-cover bg-center px-6 py-14 sm:px-12" style={{ backgroundImage: `url(${row.art})` }}>
                    <div className="mx-auto max-w-md">{row.vis}</div>
                  </div>
                </Reveal>
                <Reveal delay={120}>
                  <p className="font-mono text-[13px] text-muted">{row.n}</p>
                  <h3 className="mt-3 text-[28px] font-medium leading-tight tracking-[-0.025em] sm:text-[34px]">{row.t}</h3>
                  <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-body">{row.b}</p>
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- numbers ---------------- */}
      <section className="mx-auto max-w-[1240px] px-5 py-28 sm:px-8">
        <Reveal>
          <p className="text-[15px] text-muted">Measured in our end-to-end test runs</p>
        </Reveal>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {[
            { k: "Seconds from shortlist to three ready-to-sign offers", v: <CountUp to={49} suffix="s" /> },
            { k: "Agreements that satisfy both sides' hard limits", v: <CountUp to={100} suffix="%" /> },
            { k: "Negotiations your agent can run in parallel", v: <CountUp to={5} /> },
            { k: "Turns before an agent must accept or walk away", v: <CountUp to={8} /> },
          ].map((r, i) => (
            <Reveal key={r.k} delay={i * 80}>
              <div className="grid items-baseline gap-2 py-7 sm:grid-cols-2">
                <p className="text-[15px] text-body">{r.k}</p>
                <p className="text-[56px] font-medium leading-none tracking-[-0.04em] sm:text-[72px]">{r.v}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- safety teaser ---------------- */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-28 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
          <Reveal>
            <p className="text-[15px] text-white/50">Safety, built in</p>
            <h2 className="mt-2 text-[36px] font-medium leading-[1.08] tracking-[-0.03em] sm:text-[52px]">Agents talk. Software decides what&apos;s allowed.</h2>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-white/60">
              Letting AI negotiate money is only acceptable if its limits can&apos;t be argued away. So they aren&apos;t in the prompt at all.
            </p>
            <Link href="/safety" className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-white hover:underline">
              Read how it works <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { t: "Hard limits in code", b: "Budget, deadline, must-haves, rate floor and capacity are checked on every offer and acceptance.", svg: <path d="M20 44V30a20 20 0 0 1 40 0v14M14 44h52v30H14z" /> },
              { t: "Tamper-evident log", b: "Each message is chained to the last with SHA-256; edits break the chain visibly.", svg: <><rect x="8" y="30" width="22" height="18" rx="9" /><rect x="29" y="30" width="22" height="18" rx="9" /><rect x="50" y="30" width="22" height="18" rx="9" /></> },
              { t: "Private by side", b: "Row-level security keeps each side's floor, budget and instructions to themselves.", svg: <><circle cx="28" cy="40" r="16" /><circle cx="52" cy="40" r="16" /></> },
              { t: "No fake success", b: "If the model fails, the room says so and resumes from the exact turn. Nothing is invented.", svg: <><circle cx="40" cy="40" r="26" /><path d="M40 24v18l10 8" /></> },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 90}>
                <div className="h-full rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
                  <svg viewBox="0 0 80 80" className="h-14 w-14 fill-none stroke-white/70" strokeWidth="1.2">{c.svg}</svg>
                  <p className="mt-6 text-[17px] font-medium">{c.t}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-white/55">{c.b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- faq ---------------- */}
      <section id="faq" className="mx-auto grid max-w-[1240px] scroll-mt-20 gap-10 px-5 py-28 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <h2 className="text-[36px] font-medium leading-[1.08] tracking-[-0.03em] sm:text-[48px]">Questions people ask first</h2>
        </Reveal>
        <Reveal delay={100}>
          <Faq />
        </Reveal>
      </section>

      {/* ---------------- about ---------------- */}
      <section id="about" className="mx-auto max-w-[1240px] scroll-mt-20 px-5 sm:px-8">
        <Reveal>
          <div className="grid gap-8 rounded-[28px] border border-line bg-white p-8 sm:p-12 lg:grid-cols-2">
            <p className="text-[24px] font-medium leading-snug tracking-[-0.02em]">
              InstaJob is built by Team Alchemists for the Leapfrog Student Partner Program 2026.
            </p>
            <p className="text-[15px] leading-relaxed text-body">
              We started from a simple observation: freelancers spend more time writing proposals than building, and founders drown in
              them. Agents can do the matching, scoping and haggling, as long as people keep control of every decision that matters.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ---------------- final cta ---------------- */}
      <section className="mx-auto max-w-[1240px] px-5 py-28 sm:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-[36px] bg-[#f8f4eb] px-6 py-20 text-center sm:py-28">
            <div aria-hidden className="pointer-events-none absolute inset-0 animate-[drift_12s_ease-in-out_infinite] bg-[url(/art/orb.webp)] bg-[length:auto_150%] bg-center bg-no-repeat" />
            <div className="relative">
              <h2 className="mx-auto max-w-3xl text-[40px] font-medium leading-[1.04] tracking-[-0.035em] sm:text-[64px]">Your MVP, scoped and negotiated before lunch.</h2>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link href={start} className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-white hover:bg-ink-soft">
                  Describe your idea <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/auth?mode=signup&role=developer" className="inline-flex h-12 items-center rounded-full bg-white/80 px-6 text-[15px] font-medium text-ink backdrop-blur hover:bg-white">
                  Create a developer agent
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </SiteShell>
  );
}
