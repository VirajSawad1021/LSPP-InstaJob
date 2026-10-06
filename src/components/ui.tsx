"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "light";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-soft disabled:bg-[#b9b6ae]",
  secondary: "bg-white text-ink border border-line-strong hover:border-ink/40 disabled:text-muted",
  ghost: "text-body hover:text-ink hover:bg-panel-2",
  danger: "bg-white text-bad border border-[#ecd0d0] hover:border-bad",
  light: "bg-white text-ink hover:bg-cream",
};
const sizes: Record<Size, string> = { sm: "h-8 px-3.5 text-[12px]", md: "h-10 px-4.5 text-[13px]", lg: "h-12 px-6 text-[14px]" };
const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100";

export function Button({
  variant = "primary", size = "md", loading, className = "", children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button {...props} disabled={props.disabled || loading} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({
  href, variant = "primary", size = "md", className = "", children,
}: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={`rounded-2xl border border-line bg-white ${className}`}>
      {children}
    </div>
  );
}

export function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-3xl border border-line bg-panel ${className}`}>{children}</div>;
}

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "dark";
const tones: Record<Tone, string> = {
  neutral: "bg-panel-2 text-body",
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-info-bg text-info",
  dark: "bg-ink text-white",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line-strong/80 bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-[#aaa79f] transition-colors focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink disabled:bg-panel";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-[#ecd0d0] bg-bad-bg px-4 py-3 text-[13px] text-bad">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}

export function PageLoader() {
  return (
    <div className="space-y-4 animate-fade-in">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-80" />
      <div className="grid gap-4 pt-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

/** Shows which agent is working, instead of an anonymous spinner. */
export function AgentWorking({ agent, task }: { agent: string; task: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 animate-fade-in">
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full art-charcoal text-white">
        <Loader2 className="h-4 w-4 animate-spin" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink">{agent}</p>
        <p className="truncate text-[12px] text-muted">{task}</p>
      </div>
    </div>
  );
}

export function Empty({ title, body, action, icon }: { title: string; body?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line-strong bg-panel/50 px-6 py-12 text-center">
      {icon && <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-ink shadow-sm">{icon}</div>}
      <p className="text-[16px] font-semibold text-ink">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-body">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow, title, sub, right, back,
}: { eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-[12px] font-medium text-muted hover:text-ink">
            ← {back.label}
          </Link>
        )}
        {eyebrow && <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-body">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function SectionTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-body">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</p>;
}

export const usd = (n: number | null | undefined) => (n == null ? "n/a" : `$${Math.round(n).toLocaleString("en-US")}`);

const ART = ["art-olive", "art-bronze", "art-dusk", "art-clay", "art-sea", "art-charcoal"];
export function artFor(seed: string) {
  return ART[[...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % ART.length];
}

export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ${artFor(name)} ${className || "h-9 w-9 text-[12px]"}`}>
      {initials}
    </span>
  );
}

/** Gradient art tile (ElevenLabs-style) used as a visual anchor on cards. */
export function ArtTile({ seed, className = "", children }: { seed: string; className?: string; children?: React.ReactNode }) {
  return <div className={`relative overflow-hidden grain ${artFor(seed)} ${className}`}>{children}</div>;
}
