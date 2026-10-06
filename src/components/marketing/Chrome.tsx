"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { homeFor, useAuth } from "@/lib/auth";

const links = [
  { href: "/#product", label: "Product" },
  { href: "/founders", label: "For founders" },
  { href: "/developers", label: "For developers" },
  { href: "/safety", label: "Safety" },
  { href: "/#faq", label: "FAQ" },
  { href: "/demo", label: "Live demo" },
];

export function SiteNav() {
  const { me, session } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={`sticky top-0 z-40 transition-colors duration-300 ${scrolled || open ? "border-b border-line bg-cream/90 backdrop-blur-md" : "border-b border-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden items-center gap-7 lg:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={`text-[14px] transition-colors ${pathname === l.href ? "text-ink" : "text-body hover:text-ink"}`}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {session ? (
            <Link href={homeFor(me)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-5 text-[14px] font-medium text-white hover:bg-ink-soft">
              Open app <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link href="/auth" className="hidden h-10 items-center rounded-full bg-cream-2 px-5 text-[14px] font-medium text-ink hover:bg-line-strong/60 sm:inline-flex">
                Log in
              </Link>
              <Link href="/auth?mode=signup" className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-white hover:bg-ink-soft">
                Sign up
              </Link>
            </>
          )}
          <button onClick={() => setOpen(!open)} className="rounded-full p-2 text-ink lg:hidden" aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-5 pb-6 pt-2 lg:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block border-b border-line py-3.5 text-[16px] text-ink">
              {l.label}
            </Link>
          ))}
          {!session && (
            <Link href="/auth" className="mt-4 block text-center text-[15px] font-medium text-body">Log in</Link>
          )}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const cols = [
    { title: "Product", items: [["How it works", "/#product"], ["Build Plans", "/founders#plan"], ["Negotiation room", "/founders#negotiate"], ["Proof of Done", "/founders#verify"]] },
    { title: "For developers", items: [["Create your agent", "/auth?mode=signup&role=developer"], ["Skill interview", "/developers#interview"], ["Private rate floor", "/developers#floor"], ["Agent Cards (A2A)", "/developers#a2a"]] },
    { title: "Trust", items: [["Safety", "/safety"], ["Hard limits in code", "/safety#limits"], ["Audit chain", "/safety#audit"], ["Privacy by side", "/safety#privacy"]] },
    { title: "Project", items: [["LSPP 2026", "/#about"], ["Team Alchemists", "/#about"], ["Log in", "/auth"], ["Sign up", "/auth?mode=signup"]] },
  ];
  return (
    <footer className="border-t border-line bg-cream">
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-body">
              The freelance marketplace where your AI agent scopes the work, finds the right people and negotiates the deal.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {cols.map((c) => (
              <div key={c.title}>
                <p className="text-[13px] font-medium text-ink">{c.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {c.items.map(([label, href]) => (
                    <li key={label}><Link href={href} className="text-[13px] text-body hover:text-ink">{label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[12px] text-muted">
          <span>© 2026 InstaJob · Team Alchemists · Leapfrog Student Partner Program</span>
          <span>Built with Gemini, LangGraph, Supabase and the A2A protocol</span>
        </div>
      </div>
    </footer>
  );
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
