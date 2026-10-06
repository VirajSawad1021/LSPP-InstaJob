"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import { homeFor, useAuth } from "@/lib/auth";
import type { Me } from "@/lib/types";

/** OAuth / email-confirmation landing. supabase-js exchanges the PKCE code automatically. */
export default function AuthCallback() {
  const { session, loading, refresh } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      const t = setTimeout(() => setError("Sign-in didn't complete. Please try again."), 4000);
      return () => clearTimeout(t);
    }
    (async () => {
      let me = await refresh();
      const pending = localStorage.getItem("instajob_pending_role");
      if (me && !me.role && (pending === "client" || pending === "developer")) {
        try {
          await api<Me>("/api/me/role", { body: { role: pending } });
          me = await refresh();
        } catch {}
      }
      localStorage.removeItem("instajob_pending_role");
      router.replace(homeFor(me));
    })();
  }, [loading, session, refresh, router]);

  return error ? (
    <div className="mx-auto max-w-md py-24">
      <ErrorNote message={error} onRetry={() => router.replace("/auth")} />
    </div>
  ) : (
    <div className="mx-auto max-w-md py-24"><PageLoader /></div>
  );
}
