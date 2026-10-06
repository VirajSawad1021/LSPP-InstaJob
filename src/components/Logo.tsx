import Link from "next/link";

/**
 * InstaJob mark: a lowercase "j" whose dot and tail are two agents,
 * joined by a single stroke: two sides, one agreement.
 */
export function LogoMark({ className = "h-7 w-7", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const bg = tone === "dark" ? "#141413" : "#ffffff";
  const fg = tone === "dark" ? "#ffffff" : "#141413";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill={bg} />
      <circle cx="19.5" cy="8.2" r="2.7" fill={fg} />
      <path d="M19.5 13.4v7.1a5 5 0 0 1-5 5h-1.2" fill="none" stroke={fg} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="11.3" cy="25.5" r="2.7" fill="#e8895a" />
    </svg>
  );
}

export function Logo({ tone = "dark", href = "/" }: { tone?: "dark" | "light"; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="InstaJob home">
      <LogoMark tone={tone} />
      <span className={`text-[17px] font-semibold tracking-[-0.02em] ${tone === "dark" ? "text-ink" : "text-white"}`}>instajob</span>
    </Link>
  );
}
