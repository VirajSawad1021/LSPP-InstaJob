"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderGit2, Lock, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AgentWorking, Button, Card, ErrorNote, Field, inputCls } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth, useRequireRole } from "@/lib/auth";
import type { Developer, Interview, ShippedProject } from "@/lib/types";

interface Form {
  full_name: string;
  headline: string;
  bio: string;
  location: string;
  timezone: string;
  skills: string;
  years_experience: string;
  rate_floor: string;
  rate_target: string;
  weekly_hours: string;
  availability: string;
  negotiation_style: "firm" | "collaborative" | "flexible";
  dealbreakers: string;
  github_username: string;
  auto_negotiate: boolean;
  communication: string;
  process: string;
  ideal_client: string;
  red_flags: string;
  shipped_projects: ShippedProject[];
}

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function ProfilePage() {
  const me = useRequireRole("developer");
  const { refresh } = useAuth();
  const router = useRouter();
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me) return;
    (async () => {
      try {
        const dev = await api<Developer | null>("/api/developers/me");
        const iv = dev ? null : await api<Interview | null>("/api/interview/latest");
        const x = iv?.extracted ?? {};
        const src = dev ?? {
          full_name: me.full_name ?? "", headline: x.headline ?? "", bio: x.bio ?? "", location: "", timezone: x.timezone ?? "",
          skills: x.skills ?? [], years_experience: x.years_experience ?? null, rate_floor: x.rate_floor ?? undefined,
          rate_target: x.rate_target ?? null, weekly_hours: x.weekly_hours ?? 30, availability: x.availability || "immediate",
          negotiation_style: x.negotiation_style ?? "collaborative", dealbreakers: x.dealbreakers ?? [], github_username: null,
          auto_negotiate: true, work_style: x.work_style ?? {}, shipped_projects: x.shipped_projects ?? [],
        };
        setF({
          full_name: src.full_name ?? "", headline: src.headline ?? "", bio: src.bio ?? "", location: src.location ?? "",
          timezone: src.timezone ?? "", skills: (src.skills ?? []).join(", "), years_experience: src.years_experience?.toString() ?? "",
          rate_floor: src.rate_floor?.toString() ?? "", rate_target: src.rate_target?.toString() ?? "",
          weekly_hours: src.weekly_hours?.toString() ?? "30", availability: src.availability ?? "immediate",
          negotiation_style: src.negotiation_style ?? "collaborative", dealbreakers: (src.dealbreakers ?? []).join(", "),
          github_username: src.github_username ?? "", auto_negotiate: src.auto_negotiate ?? true,
          communication: src.work_style?.communication ?? "", process: src.work_style?.process ?? "",
          ideal_client: src.work_style?.ideal_client ?? "", red_flags: src.work_style?.red_flags ?? "",
          shipped_projects: src.shipped_projects ?? [],
        });
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [me]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => (s ? { ...s, [k]: v } : s));

  async function save() {
    if (!f) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api("/api/developers/me", {
        method: "PUT",
        body: {
          full_name: f.full_name, headline: f.headline, bio: f.bio, location: f.location, timezone: f.timezone,
          skills: list(f.skills), years_experience: f.years_experience ? Number(f.years_experience) : null,
          rate_floor: Number(f.rate_floor), rate_target: Number(f.rate_target), weekly_hours: Number(f.weekly_hours),
          availability: f.availability, negotiation_style: f.negotiation_style, dealbreakers: list(f.dealbreakers),
          github_username: f.github_username.trim() || null, auto_negotiate: f.auto_negotiate,
          work_style: { communication: f.communication, process: f.process, ideal_client: f.ideal_client, red_flags: f.red_flags },
          shipped_projects: f.shipped_projects,
        },
      });
      const m = await refresh();
      setSaved(true);
      if (m?.developer?.profile_complete) router.push("/developer");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const valid = f && f.full_name && f.headline && list(f.skills).length > 0 && Number(f.rate_floor) > 0 && Number(f.rate_target) >= Number(f.rate_floor) && Number(f.weekly_hours) >= 5;

  return (
    <AppShell ready={!!me && (!!f || !!error)}>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-[28px] font-medium tracking-[-0.03em]">Your agent&apos;s profile</h1>
          <p className="mt-1 text-[13px] text-body">This is what your agent pitches with and the limits it negotiates within.</p>
        </div>
        <ErrorNote message={error} />
        {f && (
          <>
            <Card className="space-y-4 p-6">
              <p className="text-[15px] font-bold">Public profile</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name"><input className={inputCls} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
                <Field label="Headline"><input className={inputCls} value={f.headline} onChange={(e) => set("headline", e.target.value)} /></Field>
              </div>
              <Field label="Bio"><textarea className={`${inputCls} min-h-24`} value={f.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
              <Field label="Skills" hint="Comma separated, specific technologies"><input className={inputCls} value={f.skills} onChange={(e) => set("skills", e.target.value)} /></Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Location"><input className={inputCls} value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
                <Field label="Timezone"><input className={inputCls} value={f.timezone} onChange={(e) => set("timezone", e.target.value)} /></Field>
                <Field label="Years of experience"><input className={inputCls} type="number" value={f.years_experience} onChange={(e) => set("years_experience", e.target.value)} /></Field>
              </div>
              <Field label="GitHub username" hint="Optional. Your public repos and languages are shown as verified evidence.">
                <div className="relative">
                  <FolderGit2 className="absolute left-3 top-3 h-4 w-4 text-muted" />
                  <input className={`${inputCls} pl-9`} value={f.github_username} onChange={(e) => set("github_username", e.target.value)} placeholder="octocat" />
                </div>
              </Field>
            </Card>

            <Card className="space-y-4 p-6">
              <p className="text-[15px] font-bold">Shipped work</p>
              {f.shipped_projects.length === 0 && <p className="text-[13px] text-muted">None captured yet. The Skill Agent adds these during the interview.</p>}
              {f.shipped_projects.map((p, i) => (
                <div key={i} className="flex items-start justify-between gap-3 rounded-xl bg-panel px-4 py-3">
                  <div className="text-[13px]">
                    <p className="font-semibold">{p.name} <span className="font-normal text-muted">· {p.stack.join(", ")}</span></p>
                    <p className="text-body">{p.what}</p>
                    {p.outcome && <p className="text-muted">{p.outcome}</p>}
                  </div>
                  <button onClick={() => set("shipped_projects", f.shipped_projects.filter((_, j) => j !== i))} className="text-muted hover:text-bad"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </Card>

            <Card className="space-y-4 p-6">
              <p className="text-[15px] font-bold">How you work</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Communication"><input className={inputCls} value={f.communication} onChange={(e) => set("communication", e.target.value)} /></Field>
                <Field label="Process"><input className={inputCls} value={f.process} onChange={(e) => set("process", e.target.value)} /></Field>
                <Field label="Ideal client"><input className={inputCls} value={f.ideal_client} onChange={(e) => set("ideal_client", e.target.value)} /></Field>
                <Field label="Red flags"><input className={inputCls} value={f.red_flags} onChange={(e) => set("red_flags", e.target.value)} /></Field>
              </div>
            </Card>

            <Card className="space-y-4 border-ink p-6">
              <p className="flex items-center gap-2 text-[15px] font-bold"><Lock className="h-4 w-4" /> Negotiation limits (private)</p>
              <p className="-mt-2 text-[12px] text-muted">Enforced by software. Clients and their agents never see your minimum.</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Minimum rate (USD/h)"><input className={inputCls} type="number" value={f.rate_floor} onChange={(e) => set("rate_floor", e.target.value)} /></Field>
                <Field label="Usual rate (USD/h)"><input className={inputCls} type="number" value={f.rate_target} onChange={(e) => set("rate_target", e.target.value)} /></Field>
                <Field label="Hours per week"><input className={inputCls} type="number" value={f.weekly_hours} onChange={(e) => set("weekly_hours", e.target.value)} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Negotiation style">
                  <select className={inputCls} value={f.negotiation_style} onChange={(e) => set("negotiation_style", e.target.value as Form["negotiation_style"])}>
                    <option value="firm">Firm: hold close to my usual rate</option>
                    <option value="collaborative">Collaborative: find win-win structures</option>
                    <option value="flexible">Flexible: prioritise closing good-fit deals</option>
                  </select>
                </Field>
                <Field label="Availability"><input className={inputCls} value={f.availability} onChange={(e) => set("availability", e.target.value)} /></Field>
              </div>
              <Field label="Dealbreakers" hint="Comma separated"><input className={inputCls} value={f.dealbreakers} onChange={(e) => set("dealbreakers", e.target.value)} /></Field>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={f.auto_negotiate} onChange={(e) => set("auto_negotiate", e.target.checked)} className="h-4 w-4 accent-black" />
                Let my agent negotiate with founders automatically (I still approve every contract)
              </label>
            </Card>

            <div className="flex items-center justify-end gap-3 pb-8">
              {busy && <AgentWorking agent="Matching index" task="Embedding your profile and verifying GitHub" />}
              {saved && !busy && <span className="text-[12px] text-good">Saved</span>}
              <Button size="lg" onClick={save} loading={busy} disabled={!valid}>Save and activate my agent</Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
