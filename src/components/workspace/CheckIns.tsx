"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, HelpCircle, Sparkles, ThumbsUp } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { CheckIn } from "@/lib/types";
import { Badge, Button, Card, ErrorNote, PageLoader } from "@/components/ui";

interface Data {
  side: "client" | "developer";
  check_ins: CheckIn[];
  due: boolean;
  every_days: number;
}

const SECTIONS = [
  { key: "done", label: "Done this week", icon: CheckCircle2, tone: "text-good", hint: "- Finished the tutor search filters" },
  { key: "next", label: "Next up", icon: ClipboardCheck, tone: "text-ink", hint: "- Start the booking calendar (m2)" },
  { key: "blockers", label: "Blockers", icon: AlertTriangle, tone: "text-warn", hint: "- Waiting on Khalti sandbox keys" },
  { key: "needs", label: "Needs from you", icon: HelpCircle, tone: "text-info", hint: "- Please confirm the cancellation policy" },
] as const;
type Key = (typeof SECTIONS)[number]["key"];

function Bullets({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
  if (!lines.length) return <p className="text-[13px] text-muted">Nothing</p>;
  return (
    <ul className="space-y-1">
      {lines.map((l, i) => <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />{l}</li>)}
    </ul>
  );
}

/** Weekly structured updates: the developer posts (AI can draft it), the founder acknowledges. */
export function CheckIns({ cid, onPosted }: { cid: string; onPosted?: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<Key, string> | null>(null);
  const [aiDrafted, setAiDrafted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await api<Data>(`/api/contracts/${cid}/checkins`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [cid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`checkins-${cid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "check_ins", filter: `contract_id=eq.${cid}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [cid, load]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const draft = () => run("draft", async () => {
    const r = await api<Record<Key, string>>(`/api/contracts/${cid}/checkins/draft`, { body: {} });
    setForm(r);
    setAiDrafted(true);
  });

  const post = () => run("post", async () => {
    await api(`/api/contracts/${cid}/checkins`, { body: { ...form, ai_drafted: aiDrafted } });
    setForm(null);
    setAiDrafted(false);
    await load();
    onPosted?.();
  });

  if (!d) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;
  const isDev = d.side === "developer";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <ErrorNote message={error} />

        {isDev && !form && (
          <Card className={`flex flex-wrap items-center justify-between gap-4 p-5 ${d.due ? "border-warn/50 bg-warn-bg/40" : ""}`}>
            <div>
              <p className="text-[15px] font-medium">{d.due ? "Your weekly check-in is due" : "Share this week's progress"}</p>
              <p className="mt-0.5 text-[13px] text-body">Four short sections. The AI can draft it from your completed tasks, submissions and messages.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setForm({ done: "", next: "", blockers: "", needs: "" })}>Write it myself</Button>
              <Button onClick={draft} loading={busy === "draft"}><Sparkles className="h-4 w-4" /> Draft with AI</Button>
            </div>
          </Card>
        )}

        {isDev && form && (
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-medium">This week&apos;s check-in</p>
              {aiDrafted && <Badge tone="info"><Sparkles className="h-3 w-3" /> AI draft: edit before posting</Badge>}
            </div>
            {SECTIONS.map((s) => (
              <label key={s.key} className="block">
                <span className={`mb-1.5 flex items-center gap-1.5 text-[12px] font-medium ${s.tone}`}><s.icon className="h-3.5 w-3.5" />{s.label}</span>
                <textarea
                  value={form[s.key]}
                  onChange={(e) => setForm({ ...form, [s.key]: e.target.value })}
                  placeholder={s.hint}
                  rows={Math.max(2, form[s.key].split("\n").length)}
                  className="w-full resize-y rounded-xl border border-line-strong/80 px-3.5 py-2.5 text-[14px] leading-relaxed focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                />
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setForm(null); setAiDrafted(false); }}>Cancel</Button>
              <Button onClick={post} loading={busy === "post"}>Post check-in</Button>
            </div>
          </Card>
        )}

        {!isDev && d.due && (
          <Card className="border-warn/50 bg-warn-bg/40 p-4 text-[13px] text-warn">
            No check-in from the developer in the last {d.every_days} days. You can nudge them in Messages.
          </Card>
        )}

        {d.check_ins.map((k, i) => (
          <Card key={k.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-medium">
                Week of {new Date(k.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                {i === 0 && <span className="ml-2 text-[12px] font-normal text-muted">latest</span>}
              </p>
              <div className="flex items-center gap-2">
                {k.ai_drafted && <Badge><Sparkles className="h-3 w-3" /> AI-assisted</Badge>}
                {k.acknowledged_at ? (
                  <Badge tone="good"><ThumbsUp className="h-3 w-3" /> Acknowledged</Badge>
                ) : !isDev ? (
                  <Button size="sm" onClick={() => run(k.id, async () => { await api(`/api/checkins/${k.id}/ack`, { body: {} }); await load(); })} loading={busy === k.id}>
                    <ThumbsUp className="h-3.5 w-3.5" /> Acknowledge
                  </Button>
                ) : (
                  <Badge tone="warn">Awaiting founder</Badge>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {SECTIONS.map((s) => (
                <div key={s.key}>
                  <p className={`mb-1.5 flex items-center gap-1.5 text-[12px] font-medium ${s.tone}`}><s.icon className="h-3.5 w-3.5" />{s.label}</p>
                  <Bullets text={k[s.key]} />
                </div>
              ))}
            </div>
          </Card>
        ))}
        {!d.check_ins.length && !form && (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-[13px] text-muted">
            {isDev ? "No check-ins yet. Post one each week so the founder always knows where things stand." : "The developer's weekly updates will appear here."}
          </p>
        )}
      </div>

      <Card className="h-fit space-y-3 p-5 lg:sticky lg:top-6">
        <p className="text-[14px] font-medium">How check-ins work</p>
        <ul className="space-y-2 text-[12px] leading-relaxed text-body">
          <li>• Every {d.every_days} days the developer posts what&apos;s done, what&apos;s next, blockers and what they need.</li>
          <li>• The AI drafts it only from real activity: completed tasks, submissions and messages. It never invents work.</li>
          <li>• The founder acknowledges it, or replies in Messages.</li>
          <li>• A missed check-in is flagged to both sides.</li>
        </ul>
      </Card>
    </div>
  );
}
