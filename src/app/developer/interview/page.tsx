"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, ErrorNote, inputCls, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useRequireRole } from "@/lib/auth";
import type { Interview } from "@/lib/types";

export default function InterviewPage() {
  const me = useRequireRole("developer");
  const router = useRouter();
  const [iv, setIv] = useState<Interview | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const start = useCallback(async () => {
    try {
      setIv(await api<Interview>("/api/interview", { body: {} }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (me) start();
  }, [me, start]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [iv?.transcript.length, busy]);

  async function send() {
    if (!iv || !text.trim()) return;
    const content = text.trim();
    setText("");
    setBusy(true);
    setError(null);
    setIv({ ...iv, transcript: [...iv.transcript, { role: "user", content }] });
    try {
      setIv(await api<Interview>(`/api/interview/${iv.id}/message`, { body: { content } }));
    } catch (e) {
      setError(errorMessage(e));
      setIv(iv);
      setText(content);
    } finally {
      setBusy(false);
    }
  }

  const x = iv?.extracted ?? {};

  return (
    <AppShell ready={!!me}>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex h-[76vh] min-h-[480px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white"><Bot className="h-4 w-4" /></span>
              <div>
                <p className="text-[14px] font-bold">Skill Agent</p>
                <p className="text-[11px] text-muted">Builds the profile your agent negotiates with</p>
              </div>
            </div>
            <span className="text-[12px] font-semibold tabular-nums">{iv?.progress ?? 0}%</span>
          </div>
          <div className="h-1 bg-panel-2"><div className="h-1 bg-ink transition-all" style={{ width: `${iv?.progress ?? 0}%` }} /></div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
            {!iv && !error && <Spinner label="Starting interview" />}
            {iv?.transcript.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${m.role === "user" ? "rounded-tr-sm bg-ink text-white" : "rounded-tl-sm bg-panel-2 text-ink"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <Spinner label="Skill Agent is thinking" />}
            <div ref={endRef} />
          </div>
          <div className="border-t border-line p-3">
            <ErrorNote message={error} />
            {iv?.complete ? (
              <Button className="w-full" size="lg" onClick={() => router.push("/developer/profile?from=interview")}>Review my profile</Button>
            ) : (
              <div className="flex gap-2">
                <textarea
                  className={`${inputCls} min-h-11 resize-none`}
                  rows={2}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Answer in your own words…"
                  disabled={!iv || busy}
                />
                <Button onClick={send} disabled={!text.trim() || busy} className="self-end"><Send className="h-4 w-4" /></Button>
              </div>
            )}
            {!iv?.complete && (iv?.progress ?? 0) >= 40 && (
              <button onClick={() => router.push("/developer/profile?from=interview")} className="mt-2 text-[12px] text-muted underline underline-offset-2">
                Skip ahead and fill in the rest myself
              </button>
            )}
          </div>
        </Card>

        <Card className="h-fit p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Profile so far</p>
          <p className="mt-2 text-[16px] font-bold">{x.headline || "Your headline will appear here"}</p>
          {x.bio && <p className="mt-1 text-[13px] leading-relaxed text-body">{x.bio}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">{(x.skills ?? []).map((s) => <Badge key={s}>{s}</Badge>)}</div>
          <dl className="mt-4 space-y-1.5 text-[12px]">
            {[
              ["Usual rate", x.rate_target ? `$${x.rate_target}/h` : "…"],
              ["Minimum rate", x.rate_floor ? `$${x.rate_floor}/h (private)` : "…"],
              ["Hours / week", x.weekly_hours ?? "…"],
              ["Communication", x.work_style?.communication || "…"],
              ["Ideal client", x.work_style?.ideal_client || "…"],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4"><dt className="text-body">{k}</dt><dd className="text-right font-semibold">{String(v)}</dd></div>
            ))}
          </dl>
          {(x.shipped_projects ?? []).length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Shipped work</p>
              {x.shipped_projects!.map((p) => (
                <div key={p.name} className="rounded-xl bg-panel px-3 py-2 text-[12px]"><b>{p.name}</b>: {p.what}</div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
