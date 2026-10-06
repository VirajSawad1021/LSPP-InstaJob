"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Landmark, Lock, ShieldCheck, Wallet } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { EscrowData, EscrowEntry } from "@/lib/types";
import { Badge, Button, Card, ErrorNote, PageLoader, usd } from "@/components/ui";

const ENTRY = {
  fund: { icon: Lock, label: "Funded into escrow", tone: "text-ink" },
  release: { icon: ArrowUpRight, label: "Released to the developer", tone: "text-good" },
  refund: { icon: ArrowDownLeft, label: "Returned to the founder", tone: "text-info" },
} as const;

function Bar({ price, released, held }: { price: number; released: number; held: number }) {
  const r = Math.min(100, (100 * released) / Math.max(1, price));
  const h = Math.min(100 - r, (100 * held) / Math.max(1, price));
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-panel-2" aria-hidden>
      <div className="h-full bg-good" style={{ width: `${r}%` }} />
      <div className="h-full bg-ink" style={{ width: `${h}%` }} />
    </div>
  );
}

/** Simulated escrow: fund each milestone, money is held, released on approval. */
export function Payments({ cid, version, onChanged }: { cid: string; version: string; onChanged: () => void }) {
  const [d, setD] = useState<EscrowData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await api<EscrowData>(`/api/contracts/${cid}/escrow`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [cid]);

  useEffect(() => {
    load();
  }, [load, version]);

  async function fund(mid: string) {
    setBusy(mid);
    setError(null);
    try {
      setD(await api<EscrowData>(`/api/contracts/${cid}/milestones/${mid}/fund`, { body: {} }));
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!d) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;
  const b = d.balances;
  const isClient = d.side === "client";
  const total = d.milestones.reduce((a, m) => a + m.price, 0);
  const titles = Object.fromEntries(d.milestones.map((m) => [m.id, m.title]));
  const canFund = isClient && d.status === "active";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <ErrorNote message={error} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Contract total", usd(total), null],
            [isClient ? "Held in escrow" : "Secured for you", usd(b.held), "bg-ink"],
            [isClient ? "Paid to developer" : "Paid out to you", usd(b.released), "bg-good"],
            ["Not yet funded", usd(b.to_fund), null],
          ].map(([k, v, dot]) => (
            <div key={k as string} className="rounded-2xl border border-line bg-white px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] text-muted">{dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}{k}</p>
              <p className="mt-0.5 text-[20px] font-medium tabular-nums tracking-[-0.02em]">{v}</p>
            </div>
          ))}
        </div>

        <Card className="divide-y divide-line">
          {d.milestones.map((m) => {
            const e = b.milestones[m.id];
            const closed = m.status === "approved";
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                <div className="min-w-[200px] flex-1">
                  <p className="text-[14px] font-medium"><span className="mr-1.5 font-mono text-[11px] text-muted">{m.id}</span>{m.title}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="w-full max-w-[160px] flex-1"><Bar price={e.price} released={e.released} held={e.held} /></div>
                    <p className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-muted">
                      {closed
                        ? `${usd(e.released)} released${e.refunded ? ` · ${usd(e.refunded)} returned` : ""}`
                        : e.funded
                          ? `${usd(e.held)} held of ${usd(e.price)}`
                          : `${usd(e.price)} not funded`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {closed ? (
                    <Badge tone="good">Paid</Badge>
                  ) : e.fully_funded ? (
                    <Badge tone="dark"><Lock className="h-3 w-3" /> Secured</Badge>
                  ) : canFund ? (
                    <Button size="sm" onClick={() => fund(m.id)} loading={busy === m.id}>
                      <Landmark className="h-3.5 w-3.5" /> {e.funded ? `Top up ${usd(e.to_fund)}` : `Fund ${usd(e.to_fund)}`}
                    </Button>
                  ) : (
                    <Badge tone={m.status === "in_progress" || m.status === "changes_requested" ? "warn" : "neutral"}>
                      {m.status === "pending" ? "Funded when it starts" : "Awaiting funding"}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </Card>

        <div>
          <p className="text-[14px] font-medium">Ledger</p>
          <p className="text-[12px] text-muted">Every movement, in order. Append-only: entries are never edited.</p>
          <ol className="mt-3 space-y-1">
            {[...d.ledger].reverse().map((x: EscrowEntry) => {
              const k = ENTRY[x.kind];
              return (
                <li key={x.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-panel">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel-2 ${k.tone}`}><k.icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink">{k.label} · <span className="text-muted">{x.milestone_id} {titles[x.milestone_id]}</span></p>
                    <p className="text-[11px] text-muted">{new Date(x.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{x.note ? ` · ${x.note}` : ""}</p>
                  </div>
                  <p className={`text-[14px] font-medium tabular-nums ${k.tone}`}>{usd(Number(x.amount))}</p>
                </li>
              );
            })}
            {!d.ledger.length && (
              <li className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-[13px] text-muted">
                {isClient ? "Nothing funded yet. Fund the milestone in progress so the developer can deliver it." : "Nothing funded yet. You'll be notified when the founder funds a milestone."}
              </li>
            )}
          </ol>
        </div>
      </div>

      <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-6">
        <p className="flex items-center gap-2 text-[14px] font-medium"><ShieldCheck className="h-4 w-4" /> How escrow works</p>
        <ol className="space-y-2.5 text-[12px] leading-relaxed text-body">
          <li><span className="font-semibold text-ink">1. Fund.</span> The founder funds each milestone before it is delivered. The developer sees it&apos;s secured.</li>
          <li><span className="font-semibold text-ink">2. Hold.</span> The money is held while the developer builds and the Verification Agent checks the delivery.</li>
          <li><span className="font-semibold text-ink">3. Release.</span> Approving the milestone releases it to the developer. In a dispute, a Mediator ruling both of you accept can split it.</li>
        </ol>
        <p className="flex gap-2 rounded-xl bg-panel px-3 py-2.5 text-[11px] leading-relaxed text-muted">
          <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Simulated for this prototype: no real money moves. In production this would sit with a licensed payment partner.
        </p>
      </Card>
    </div>
  );
}
