"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Code2, Rocket } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ErrorNote } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { homeFor, useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

export default function Onboarding() {
  const { me, session, loading, refresh } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/auth");
    else if (me?.role) router.replace(homeFor(me));
  }, [loading, session, me, router]);

  async function choose(role: Role) {
    setBusy(role);
    setError(null);
    try {
      await api("/api/me/role", { body: { role } });
      router.replace(homeFor(await refresh()));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  const options = [
    { role: "client" as Role, icon: Rocket, title: "I'm a founder", body: "I have a product idea and want it built by a verified developer." },
    { role: "developer" as Role, icon: Code2, title: "I'm a developer", body: "I build MVPs and want my agent to find and negotiate projects for me." },
  ];

  return (
    <AppShell ready={!!me && !me.role}>
      <div className="mx-auto max-w-2xl py-10">
        <h1 className="text-[30px] font-medium tracking-[-0.03em]">How will you use InstaJob?</h1>
        <p className="mt-1 text-[14px] text-body">This sets up the right agent for you. You can&apos;t switch roles later on the same account.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {options.map((o) => (
            <button
              key={o.role}
              onClick={() => choose(o.role)}
              disabled={!!busy}
              className="group rounded-3xl border border-line bg-panel p-6 text-left transition-all hover:border-neutral-400 disabled:opacity-60"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-white">
                <o.icon className="h-5 w-5" />
              </span>
              <p className="mt-5 text-[17px] font-bold">{o.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-body">{o.body}</p>
              <p className="mt-4 text-[12px] font-semibold text-ink">{busy === o.role ? "Setting up..." : "Continue →"}</p>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      </div>
    </AppShell>
  );
}
