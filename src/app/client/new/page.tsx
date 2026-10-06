"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MilestoneCard, PlanOverview } from "@/components/domain";
import { AgentWorking, Button, Card, ErrorNote, Field, inputCls, PageLoader, usd } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useRequireRole } from "@/lib/auth";
import type { Estimate, Priority, Project } from "@/lib/types";

const EXAMPLES = [
  "A booking app for home tutors in Kathmandu. Parents search tutors by subject and area, book weekly sessions and pay online. Tutors manage their schedule.",
  "A simple CRM for small gyms to track members, renewals and send WhatsApp reminders when a membership is about to expire.",
  "A marketplace where local farmers list vegetables and restaurants pre-order for next-day delivery.",
];

type PlanResponse = Project & { estimate: Estimate };
type Step = "idea" | "questions" | "plan";

function Stepper({ step }: { step: Step }) {
  const steps: [Step, string][] = [["idea", "Idea"], ["questions", "Questions"], ["plan", "Build Plan"]];
  const idx = steps.findIndex(([s]) => s === step);
  return (
    <div className="flex items-center gap-2">
      {steps.map(([s, label], i) => (
        <div key={s} className="flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i <= idx ? "bg-ink text-white" : "bg-panel-2 text-muted"}`}>
            {i < idx ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={`text-[12px] font-semibold ${i <= idx ? "text-ink" : "text-muted"}`}>{label}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong" />}
        </div>
      ))}
    </div>
  );
}

function NewProject() {
  const me = useRequireRole("client");
  const router = useRouter();
  const params = useSearchParams();
  const resumeId = params.get("project");

  const [project, setProject] = useState<PlanResponse | Project | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [idea, setIdea] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState<null | "clarify" | "plan" | "edit" | "publish">(null);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(!!resumeId);

  const step: Step = !project ? "idea" : project.status === "clarifying" ? "questions" : "plan";

  // Id of the project already on screen. After creating a project we put its id in the URL;
  // without this guard that URL change would reload it and wipe answers the user is typing.
  const loadedId = useRef<string | null>(null);

  const loadResume = useCallback(async () => {
    if (!resumeId || loadedId.current === resumeId) {
      setResuming(false);
      return;
    }
    try {
      const r = await api<{ project: Project; estimate: Estimate | null }>(`/api/projects/${resumeId}`);
      if (!["clarifying", "planned"].includes(r.project.status)) {
        router.replace(`/client/projects/${resumeId}`);
        return;
      }
      loadedId.current = r.project.id;
      setProject(r.project);
      setEstimate(r.estimate);
      setAnswers(r.project.questions.map((q) => q.answer ?? ""));
      setBudget(r.project.budget_max ? String(r.project.budget_max) : "");
      setDeadline(r.project.deadline_weeks ? String(r.project.deadline_weeks) : "");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setResuming(false);
    }
  }, [resumeId, router]);

  useEffect(() => {
    if (me) loadResume();
  }, [me, loadResume]);

  async function clarify() {
    setBusy("clarify");
    setError(null);
    try {
      const p = await api<Project>("/api/projects", { body: { idea } });
      loadedId.current = p.id;
      setProject(p);
      setAnswers(p.questions.map(() => ""));
      router.replace(`/client/new?project=${p.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function makePlan() {
    if (!project) return;
    setBusy("plan");
    setError(null);
    try {
      const p = await api<PlanResponse>(`/api/projects/${project.id}/plan`, {
        body: {
          answers: answers.map((a) => a.trim() || null),
          budget_max: budget ? Number(budget) : null,
          deadline_weeks: deadline ? Number(deadline) : null,
        },
      });
      setProject(p);
      setEstimate(p.estimate);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function edit(body: { priorities?: Record<string, Priority>; budget_max?: number; deadline_weeks?: number }) {
    if (!project) return;
    setBusy("edit");
    setError(null);
    try {
      const p = await api<PlanResponse>(`/api/projects/${project.id}/plan`, { method: "PATCH", body });
      setProject(p);
      setEstimate(p.estimate);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!project) return;
    setBusy("publish");
    setError(null);
    try {
      await api(`/api/projects/${project.id}/publish`, { body: {} });
      router.push(`/client/projects/${project.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  const plan = project?.plan;
  const budgetNum = project?.budget_max ?? null;
  const tight = !!(estimate && budgetNum && estimate.cost_must_low > budgetNum);
  const stretch = !!(estimate && budgetNum && !tight && estimate.cost_all_median > budgetNum);

  return (
    <AppShell ready={!!me && !resuming}>
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[28px] font-medium tracking-[-0.03em]">{plan?.title || project?.title || "What do you want to build?"}</h1>
          <Stepper step={step} />
        </div>

        <div className="mt-6 space-y-4">
          <ErrorNote message={error} />

          {step === "idea" && (
            <div className="space-y-6">
              <div className="rounded-[28px] bg-cover bg-center p-3 sm:p-8" style={{ backgroundImage: "url(/art/warm.webp)" }}>
                <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_24px_60px_-28px_rgba(60,30,10,0.4)]">
                  <textarea
                    autoFocus
                    className="block min-h-[190px] w-full resize-none bg-transparent px-6 pt-6 text-[18px] leading-relaxed tracking-[-0.01em] text-ink placeholder:text-[#b1aea6] focus:outline-none"
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && idea.trim().length >= 20) clarify();
                    }}
                    placeholder="Describe what you want built, who it's for, and what they should be able to do…"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
                    {busy === "clarify" ? (
                      <AgentWorking agent="Requirements Agent" task="Reading your idea and deciding what to ask" />
                    ) : (
                      <span className="px-2 text-[12px] text-muted">
                        {idea.trim().length < 20 ? "A couple of sentences is enough." : `${idea.trim().length} characters · Ctrl + Enter to continue`}
                      </span>
                    )}
                    <Button onClick={clarify} disabled={idea.trim().length < 20} loading={busy === "clarify"}>
                      <Sparkles className="h-4 w-4" /> Plan it
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[13px] text-muted">Or start from an example</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setIdea(ex)}
                      className={`rounded-2xl border bg-white p-4 text-left text-[13px] leading-relaxed text-body transition-all hover:border-ink/40 hover:text-ink ${idea === ex ? "border-ink text-ink" : "border-line"}`}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-line bg-panel p-5 sm:grid-cols-3">
                {[
                  ["1", "2–4 quick questions", "Only the ones that change scope or cost."],
                  ["2", "Your Build Plan", "Milestones, acceptance criteria and honest estimates."],
                  ["3", "Matched developers", "Publish when you're happy; nothing is sent before."],
                ].map(([n, t, b]) => (
                  <div key={n} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink ring-1 ring-line">{n}</span>
                    <div>
                      <p className="text-[13px] font-medium text-ink">{t}</p>
                      <p className="text-[12px] text-body">{b}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "questions" && project && (
            <>
              <Card className="p-6">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Your Requirements Agent asks</p>
                <div className="mt-4 space-y-6">
                  {project.questions.map((q, i) => (
                    <div key={q.question}>
                      <p className="text-[15px] font-semibold text-ink">{q.question}</p>
                      <p className="mt-0.5 text-[12px] text-muted">{q.why}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {q.options.map((o) => (
                          <button
                            key={o}
                            onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? o : x)))}
                            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all ${
                              answers[i] === o ? "border-ink bg-ink text-white" : "border-line text-body hover:border-neutral-400"
                            }`}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                      <input
                        className={`${inputCls} mt-2`}
                        placeholder="Or type your own answer (optional)"
                        value={q.options.includes(answers[i]) ? "" : answers[i] ?? ""}
                        onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                      />
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-6">
                <p className="text-[15px] font-semibold">Budget and timing</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  These become your agent&apos;s hard limits. It will never agree to more than this.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Maximum budget (USD, total)">
                    <input className={inputCls} type="number" min={100} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 3000" />
                  </Field>
                  <Field label="Deadline (weeks)">
                    <input className={inputCls} type="number" min={1} max={52} value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="e.g. 6" />
                  </Field>
                </div>
                <div className="mt-6 flex items-center justify-between gap-4">
                  {busy === "plan" ? (
                    <AgentWorking agent="Requirements Agent" task="Writing milestones, acceptance criteria and estimates" />
                  ) : <span />}
                  <Button onClick={makePlan} loading={busy === "plan"} disabled={!budget || !deadline}>
                    Build my plan <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            </>
          )}

          {step === "plan" && plan && (
            <>
              <PlanOverview plan={plan} />

              {estimate && (
                <Card className={`p-5 ${tight ? "border-[#ecd0d0]" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Market check</p>
                      <p className="mt-1 text-[14px] text-ink">
                        {estimate.hours_total} h total ({estimate.hours_must} h must-have). At platform rates that&apos;s about{" "}
                        <b>{usd(estimate.cost_must_low)}</b> for must-haves and <b>{usd(estimate.cost_all_median)}</b> for everything.
                      </p>
                      {tight && (
                        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-bad">
                          <AlertTriangle className="h-4 w-4" /> Your budget is below the cheapest realistic cost of the must-haves. Raise it or downgrade a milestone.
                        </p>
                      )}
                      {stretch && (
                        <p className="mt-1 text-[13px] text-warn">Budget covers the must-haves; agents will trade the rest.</p>
                      )}
                    </div>
                    <div className="flex items-end gap-2">
                      <Field label="Budget">
                        <input className={`${inputCls} w-28`} type="number" defaultValue={project.budget_max ?? ""} onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v && v !== project.budget_max) edit({ budget_max: v });
                        }} />
                      </Field>
                      <Field label="Weeks">
                        <input className={`${inputCls} w-20`} type="number" defaultValue={project.deadline_weeks ?? ""} onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v && v !== project.deadline_weeks) edit({ deadline_weeks: v });
                        }} />
                      </Field>
                    </div>
                  </div>
                </Card>
              )}

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[18px] font-semibold tracking-[-0.01em]">Milestones</p>
                  <p className="text-[12px] text-muted">Change a priority to give your agent room: must-haves are never traded away.</p>
                </div>
                {busy === "edit" && <span className="text-[12px] text-muted">Saving…</span>}
              </div>
              <div className="space-y-3">
                {plan.milestones.map((m) => (
                  <MilestoneCard key={m.id} m={m} onPriority={(p) => edit({ priorities: { [m.id]: p } })} />
                ))}
              </div>

              {plan.out_of_scope.length > 0 && (
                <p className="text-[12px] text-muted"><span className="font-semibold text-body">Out of scope:</span> {plan.out_of_scope.join(" · ")}</p>
              )}

              <Card className="sticky bottom-4 flex flex-wrap items-center justify-between gap-4 p-4 shadow-sm">
                {busy === "publish" ? (
                  <AgentWorking agent="Matching" task="Embedding your plan and ranking verified developers" />
                ) : (
                  <p className="text-[13px] text-body">Happy with the plan? Publishing finds and ranks developers for it.</p>
                )}
                <Button size="lg" onClick={publish} loading={busy === "publish"} disabled={busy === "edit"}>
                  Publish and find developers <ArrowRight className="h-4 w-4" />
                </Button>
              </Card>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <NewProject />
    </Suspense>
  );
}
