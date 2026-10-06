"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Download, Loader2, MonitorSmartphone, RotateCcw, Sparkles } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button, ErrorNote } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { DEMO, signInAsDemo, type DemoRole } from "@/lib/demo";

interface Links {
  ready: boolean;
  offers_project_id: string | null;
  offers_contract_id: string | null;
  offers_status: string | null;
  gym_contract_id: string | null;
}

interface Act {
  n: number;
  title: string;
  minutes: string;
  live?: string;
  enter: { role: DemoRole; label: string; path: (l: Links) => string | null }[];
  say: string[];
}

const ACTS: Act[] = [
  {
    n: 1, title: "An idea becomes a Build Plan", minutes: "2 min", live: "AI runs live, about 1 minute",
    enter: [{ role: "founder", label: "Start as the founder", path: () => "/client/new" }],
    say: [
      "A non-technical founder describes the product in plain words, for example a booking app for home tutors in Kathmandu.",
      "The Requirements Agent asks only the questions that change scope, then writes a milestone Build Plan with checkable acceptance criteria and an honest estimate.",
      "Optional on stage: if time is short, skip to act 2, which is ready and waiting.",
    ],
  },
  {
    n: 2, title: "Agents negotiate in parallel", minutes: "2 min",
    enter: [{ role: "founder", label: "Open the offers", path: (l) => (l.offers_project_id ? `/client/projects/${l.offers_project_id}` : null) }],
    say: [
      "Three developers' agents negotiated with the founder's agent at the same time. Every offer here already fits the budget, deadline and must-haves.",
      "Open a negotiation room to replay it: offers, counter-offers and guardrails. The log is hash-chained, so tampering is detectable.",
      "Hard limits live in code, not prompts: the developer's minimum rate is never shown and can't be argued away.",
      "Choose Ayam's deal. The contract is drafted and signed by the founder.",
    ],
  },
  {
    n: 3, title: "The developer signs", minutes: "1 min",
    enter: [{
      role: "developer", label: "Switch to the developer",
      path: (l) => (l.offers_contract_id ? `/contracts/${l.offers_contract_id}?tab=contract` : "/developer"),
    }],
    say: [
      "Ayam gets a notification and sees the same contract, including what's excluded.",
      "After both signatures the workspace opens. The founder's next step is to fund the first milestone into escrow.",
    ],
  },
  {
    n: 4, title: "A project in flight", minutes: "2 min",
    enter: [{ role: "founder", label: "Open the Gym CRM workspace", path: (l) => (l.gym_contract_id ? `/contracts/${l.gym_contract_id}?tab=board` : null) }],
    say: [
      "Two weeks in: m1 approved and paid, m2 delivered. The bar at the top always shows each person the one thing to do next.",
      "Payments: m1 was funded, held and released; m2's $600 is in escrow. Every movement is in an append-only ledger.",
      "Messages: a decision pinned in chat becomes part of the contract. Check-ins: the AI drafts weekly updates from real activity only.",
    ],
  },
  {
    n: 5, title: "A disagreement, settled by the Mediator Agent", minutes: "2 min", live: "AI runs live, about 30 seconds",
    enter: [
      { role: "founder", label: "Answer as the founder", path: (l) => (l.gym_contract_id ? `/contracts/${l.gym_contract_id}?tab=contract` : null) },
      { role: "developer", label: "Accept as the developer", path: (l) => (l.gym_contract_id ? `/contracts/${l.gym_contract_id}?tab=contract` : null) },
    ],
    say: [
      "The founder asked for Google sign-in and an Excel export before approving m2. The developer says those were never in the contract and asked the Mediator.",
      "Answer as the founder, for example: \"I assumed staff login was obvious.\" The Mediator weighs the verification evidence, the criteria and the pinned decisions.",
      "It should find m2 done and flag the extras as scope creep. Accept on both sides: $600 is released from escrow and m3 starts.",
    ],
  },
  {
    n: 6, title: "Scope change, priced by both agents", minutes: "2 min", live: "AI runs live, about 40 seconds",
    enter: [{ role: "founder", label: "Request the change", path: (l) => (l.gym_contract_id ? `/contracts/${l.gym_contract_id}?tab=changes` : null) }],
    say: [
      "Request: \"Google sign-in for staff and an Excel export of payments.\" Set a cap, for example $400 and 1 extra week.",
      "The Change Scoping Agent sizes just this change; both agents negotiate its price inside the same hard limits.",
      "Approve as founder and developer: the contract, board, timeline and escrow update on their own.",
    ],
  },
];

type Health = { state: "checking" | "waking" | "ready" | "down"; ms?: number };

export default function DemoGuide() {
  const [links, setLinks] = useState<Links | null>(null);
  const [health, setHealth] = useState<Health>({ state: "checking" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetAt, setResetAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      setLinks(await api<Links>("/api/demo"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  // The API sleeps on free hosting: wake it up before the audience is watching.
  useEffect(() => {
    let live = true;
    const t0 = performance.now();
    const slow = setTimeout(() => live && setHealth({ state: "waking" }), 1500);
    api<{ ok: boolean }>("/api/health")
      .then(() => {
        if (!live) return;
        setHealth({ state: "ready", ms: Math.round(performance.now() - t0) });
        load();
      })
      .catch(() => live && setHealth({ state: "down" }))
      .finally(() => clearTimeout(slow));
    return () => {
      live = false;
      clearTimeout(slow);
    };
  }, [load]);

  async function enter(key: string, role: DemoRole, pathFor: (l: Links) => string | null) {
    setBusy(key);
    setError(null);
    try {
      const fresh = await api<Links>("/api/demo"); // earlier acts may have created a contract since the page loaded
      setLinks(fresh);
      const path = pathFor(fresh);
      if (!path) {
        setBusy(null);
        return setError("This scenario isn't set up yet. Press Reset demo first.");
      }
      await signInAsDemo(role);
      window.location.assign(path);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setError(null);
    try {
      await signInAsDemo("founder");
      setLinks(await api<Links>("/api/demo/reset", { body: {} }));
      setResetAt(new Date());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const dot = { checking: "bg-muted", waking: "bg-warn animate-pulse", ready: "bg-good", down: "bg-bad" }[health.state];
  const healthText = {
    checking: "Checking the server…",
    waking: "Waking the server up (free hosting sleeps after 15 minutes; this can take up to a minute)…",
    ready: `Server ready${health.ms ? ` · ${health.ms} ms` : ""}`,
    down: "The server isn't responding. Check that the API is running.",
  }[health.state];

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1080px] items-center justify-between px-5 sm:px-8">
          <Logo />
          <Link href="/" className="text-[13px] font-medium text-body hover:text-ink">Back to the site</Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
          <div>
            <p className="text-[13px] font-medium text-muted">Demo guide</p>
            <h1 className="mt-2 text-[34px] font-medium leading-[1.1] tracking-[-0.035em] sm:text-[44px]">A ten-minute tour of InstaJob</h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-body">
              Six acts, from a founder&apos;s idea to a paid milestone. Each button signs you in as the right person and opens the right screen.
              Reset puts everything back to the start in a few seconds.
            </p>
            <p className="mt-5 flex items-center gap-2 text-[13px] text-body">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} /> {healthText}
            </p>
          </div>

          <div className="h-fit space-y-4 rounded-3xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-medium">Before you present</p>
              {links?.ready && <span className="inline-flex items-center gap-1 text-[12px] font-medium text-good"><Check className="h-3.5 w-3.5" /> Scenarios ready</span>}
            </div>
            <ol className="space-y-2 text-[12px] leading-relaxed text-body">
              <li>1. Reset the demo so every act starts fresh.</li>
              <li className="flex gap-1.5"><span>2.</span><span>Best with two windows side by side: this one as the founder, a private window as the developer. Notifications then arrive live.</span></li>
              <li>3. Acts marked <span className="font-medium text-ink">live</span> call the AI for real. Everything else is instant.</li>
            </ol>
            <Button className="w-full" onClick={reset} loading={busy === "reset"} disabled={health.state !== "ready"}>
              <RotateCcw className="h-4 w-4" /> Reset demo
            </Button>
            {resetAt && <p className="text-center text-[12px] text-good">Reset at {resetAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Everything is back to the start.</p>}
            <div className="grid grid-cols-2 gap-2 border-t border-line pt-4 text-[11px] text-muted">
              {(Object.keys(DEMO) as DemoRole[]).map((r) => (
                <div key={r}>
                  <p className="font-medium text-ink">{DEMO[r].label}</p>
                  <p>{DEMO[r].name}</p>
                  <p className="truncate">{DEMO[r].email}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <figure className="mt-12">
          <video
            src="/motion/instajob-reel-web.mp4"
            poster="/motion/instajob-reel-poster.jpg"
            autoPlay muted loop playsInline preload="metadata"
            className="aspect-video w-full rounded-3xl border border-line bg-[#ecebe6]"
          />
          <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
            <span>The whole flow in 14 seconds. One shape, never cut: every frame is rendered from code.</span>
            <a href="/motion/instajob-reel.mp4" download className="inline-flex items-center gap-1.5 font-medium text-body hover:text-ink">
              <Download className="h-3.5 w-3.5" /> Download with sound (1080p MP4)
            </a>
          </figcaption>
        </figure>

        <div className="mt-6"><ErrorNote message={error} /></div>

        <ol className="mt-10 space-y-4">
          {ACTS.map((a) => (
            <li key={a.n} className="grid gap-5 rounded-3xl border border-line p-6 sm:grid-cols-[56px_1fr] sm:p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-[15px] font-medium text-white">{a.n}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="text-[19px] font-medium tracking-[-0.02em]">{a.title}</h2>
                  <span className="text-[12px] text-muted">{a.minutes}</span>
                  {a.live && <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-medium text-info"><Sparkles className="h-3 w-3" />{a.live}</span>}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {a.say.map((s) => (
                    <li key={s} className="flex gap-2.5 text-[14px] leading-relaxed text-body"><span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-muted" />{s}</li>
                  ))}
                </ul>
                <div className="mt-5 flex flex-wrap gap-2">
                  {a.enter.map((e, i) => {
                    const key = `${a.n}-${i}`;
                    return (
                      <Button key={key} variant={i === 0 ? "primary" : "secondary"} size="sm" loading={busy === key}
                        disabled={!links || health.state !== "ready"} onClick={() => enter(key, e.role, e.path)}>
                        {e.label} <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    );
                  })}
                  {a.enter.length === 1 && <span className="self-center text-[12px] text-muted">as {DEMO[a.enter[0].role].name}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-panel p-6">
          <p className="flex items-center gap-2 text-[14px] text-body"><MonitorSmartphone className="h-4 w-4" /> Signed-in demo accounts show a switcher in the sidebar to jump between founder and developer.</p>
          {busy && busy !== "reset" && <span className="inline-flex items-center gap-2 text-[13px] text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</span>}
        </div>
      </main>
    </div>
  );
}
