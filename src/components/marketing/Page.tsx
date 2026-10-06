import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./Reveal";

/** Building blocks shared by the long-form marketing pages. */

export function PageHero({ kicker, title, body, cta, art }: {
  kicker: string; title: React.ReactNode; body: string; cta?: { href: string; label: string }; art: string;
}) {
  return (
    <section className="mx-auto max-w-[1240px] px-5 pb-16 pt-16 sm:px-8 sm:pt-24">
      <Reveal>
        <p className="text-[15px] text-muted">{kicker}</p>
        <h1 className="mt-3 max-w-4xl text-[44px] font-medium leading-[1.03] tracking-[-0.035em] sm:text-[68px]">{title}</h1>
      </Reveal>
      <Reveal delay={120}>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-xl text-[17px] leading-relaxed text-body">{body}</p>
          {cta && (
            <Link href={cta.href} className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-white hover:bg-ink-soft">
              {cta.label} <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </Reveal>
      <Reveal delay={200}>
        <div className="mt-14 h-[240px] rounded-[32px] bg-cover bg-center sm:h-[360px]" style={{ backgroundImage: `url(${art})` }} />
      </Reveal>
    </section>
  );
}

export function FeatureRow({ id, n, title, body, points, visual, flip }: {
  id?: string; n: string; title: string; body: string; points?: string[]; visual: React.ReactNode; flip?: boolean;
}) {
  return (
    <div id={id} className={`grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-20 ${flip ? "lg:[&>*:first-child]:order-2" : ""}`}>
      <Reveal>{visual}</Reveal>
      <Reveal delay={120}>
        <p className="font-mono text-[13px] text-muted">{n}</p>
        <h2 className="mt-3 text-[28px] font-medium leading-tight tracking-[-0.025em] sm:text-[36px]">{title}</h2>
        <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-body">{body}</p>
        {points && (
          <ul className="mt-6 space-y-3 border-t border-line pt-6">
            {points.map((p) => (
              <li key={p} className="flex gap-3 text-[15px] text-ink">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-clay" /> {p}
              </li>
            ))}
          </ul>
        )}
      </Reveal>
    </div>
  );
}

export function ArtFrame({ art, children }: { art: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] bg-cover bg-center px-5 py-12 sm:px-12" style={{ backgroundImage: `url(${art})` }}>
      <div className="mx-auto max-w-md space-y-2.5">{children}</div>
    </div>
  );
}

export function UiRow({ left, right, tone }: { left: React.ReactNode; right?: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  const c = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-muted";
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/92 px-4 py-3 shadow-sm backdrop-blur">
      <span className="text-[14px] text-ink">{left}</span>
      {right && <span className={`shrink-0 text-[12px] font-medium ${c}`}>{right}</span>}
    </div>
  );
}

export function CtaBand({ title, href, label }: { title: string; href: string; label: string }) {
  return (
    <section className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8">
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] bg-ink px-8 py-12 text-white sm:px-12">
          <p className="max-w-2xl text-[28px] font-medium leading-tight tracking-[-0.025em] sm:text-[36px]">{title}</p>
          <Link href={href} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-ink hover:bg-cream">
            {label} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
