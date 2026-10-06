"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bot, BriefcaseBusiness, FolderKanban, Inbox, LayoutGrid, LogOut, Menu, MessageSquareText, PlusCircle, Store, X } from "lucide-react";
import { api } from "@/lib/api";
import { DEMO, isDemoEmail, signInAsDemo } from "@/lib/demo";
import { useAuth } from "@/lib/auth";
import { Logo } from "./Logo";
import { NotificationBell } from "./Notifications";
import { Avatar, ErrorNote, PageLoader } from "./ui";

export { Logo };

interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; match?: (p: string) => boolean }

const clientNav: NavItem[] = [
  { href: "/client", label: "Projects", icon: LayoutGrid, match: (p) => p === "/client" || p.startsWith("/client/projects") },
  { href: "/client/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/client/new", label: "New project", icon: PlusCircle, match: (p) => p.startsWith("/client/new") },
];
const devNav: NavItem[] = [
  { href: "/developer", label: "Dashboard", icon: LayoutGrid, match: (p) => p === "/developer" },
  { href: "/developer/work", label: "My work", icon: BriefcaseBusiness },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/developer/profile", label: "My agent", icon: Bot },
  { href: "/developer/interview", label: "Skill interview", icon: MessageSquareText },
];

/** Unread messages across all projects, refreshed on navigation and every 30 s. */
function useUnreadTotal(enabled: boolean, pathname: string) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const tick = () => api<{ unread_total: number }>("/api/inbox").then((r) => live && setN(r.unread_total)).catch(() => {});
    tick();
    const t = setInterval(tick, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [enabled, pathname]);
  return n;
}

/** Demo accounts only: jump between founder and developer, staying on the same project when both can see it. */
function DemoSwitcher() {
  const { me } = useAuth();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const other = me?.role === "client" ? "developer" : "founder";
  async function go() {
    setBusy(true);
    try {
      await signInAsDemo(other);
      const shared = pathname.startsWith("/contracts/") || pathname.startsWith("/negotiations/") || pathname === "/inbox" || pathname === "/marketplace";
      window.location.assign(shared ? window.location.pathname + window.location.search : other === "developer" ? "/developer" : "/client");
    } catch {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-2xl bg-ink p-3 text-white">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/60">Demo mode</p>
      <button onClick={go} disabled={busy} className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2 text-left text-[12px] font-medium transition-colors hover:bg-white/20 disabled:opacity-60">
        <span>Switch to {DEMO[other].name.split(" ")[0]} <span className="text-white/60">({DEMO[other].label.toLowerCase()})</span></span>
        <span aria-hidden>{busy ? "…" : "→"}</span>
      </button>
      <Link href="/demo" className="mt-2 block text-center text-[11px] text-white/60 hover:text-white">Open the demo guide</Link>
    </div>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { me, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const items = me?.role === "developer" ? devNav : me?.role === "client" ? clientNav : [];
  const unread = useUnreadTotal(!!me?.role, pathname);
  const context =
    pathname.startsWith("/negotiations") ? { label: "Negotiation room", icon: FolderKanban } :
    pathname.startsWith("/contracts") ? { label: "Project workspace", icon: FolderKanban } : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-6 pl-5 pr-3 pt-4">
        <Logo />
        {!onNavigate && me?.role && <NotificationBell placement="sidebar" />}
      </div>
      <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {me?.role === "developer" ? "Developer" : me?.role === "client" ? "Founder" : "Account"}
      </p>
      <nav className="space-y-0.5 px-3">
        {items.map((it) => {
          const active = it.match ? it.match(pathname) : pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={onNavigate}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${
                active ? "bg-white text-ink shadow-[0_1px_2px_rgba(20,20,19,0.06)] ring-1 ring-line" : "text-body hover:bg-white/60 hover:text-ink"
              }`}
            >
              <it.icon className="h-4 w-4" />
              {it.label}
              {it.href === "/inbox" && unread > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-clay px-1.5 text-[10px] font-semibold text-white">{unread}</span>
              )}
            </Link>
          );
        })}
        {context && (
          <span className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-ink ring-1 ring-line">
            <context.icon className="h-4 w-4" /> {context.label}
          </span>
        )}
      </nav>

      <div className="mt-auto space-y-3 p-3">
        {isDemoEmail(me?.email) ? (
          <DemoSwitcher />
        ) : (
          <div className="rounded-2xl border border-line bg-white p-3">
            <p className="text-[12px] font-semibold text-ink">How your agent works</p>
            <p className="mt-1 text-[11px] leading-relaxed text-body">
              It negotiates inside hard limits enforced by software, and nothing is signed until you approve.
            </p>
          </div>
        )}
        {me && (
          <div className="flex items-center gap-2.5 rounded-2xl px-2 py-2">
            <Avatar name={me.full_name || me.email || "?"} className="h-8 w-8 text-[11px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-ink">{me.full_name}</p>
              <p className="truncate text-[11px] text-muted">{me.email}</p>
            </div>
            <button
              onClick={async () => {
                await signOut();
                router.push("/");
              }}
              className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-ink"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children, ready = true, wide = false }: { children: React.ReactNode; ready?: boolean; wide?: boolean }) {
  const { me, session, loading, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) router.replace("/auth");
  }, [loading, session, router]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <div className="min-h-screen bg-white lg:pl-[248px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-line bg-cream/60 lg:block">
        <SideNav />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          {me?.role && <NotificationBell placement="header" />}
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink hover:bg-panel-2" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] bg-cream shadow-xl animate-fade-in">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 text-body hover:bg-white" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <SideNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main key={pathname} className={`mx-auto px-4 py-8 sm:px-8 sm:py-10 ${wide ? "max-w-[1320px]" : "max-w-[1120px]"}`}>
        {loading ? (
          <PageLoader />
        ) : session && !me ? (
          <div className="mx-auto max-w-lg py-16">
            <ErrorNote message="You're signed in, but the InstaJob server didn't respond. Make sure the backend is running." onRetry={refresh} />
          </div>
        ) : ready ? (
          <div className="animate-fade-in">{children}</div>
        ) : (
          <PageLoader />
        )}
      </main>
    </div>
  );
}
