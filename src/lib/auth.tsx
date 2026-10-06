"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";
import { api } from "./api";
import type { Me, Role } from "./types";

interface AuthState {
  session: Session | null;
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const m = await api<Me>("/api/me");
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const desc = q.get("error_description");
    if (desc && !window.location.pathname.startsWith("/auth")) {
      window.location.replace(`/auth?error_description=${encodeURIComponent(desc)}`);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await refresh();
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN") refresh();
      if (event === "SIGNED_OUT") setMe(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMe(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, me, loading, refresh, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function homeFor(me: Me | null): string {
  if (!me) return "/auth";
  if (!me.role) return "/onboarding";
  if (me.role === "developer") return me.developer?.profile_complete ? "/developer" : "/developer/interview";
  return "/client";
}

/** Redirects away unless signed in with the given role. Returns the user once ready. */
export function useRequireRole(role: Role): Me | null {
  const { me, session, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/auth");
    else if (me && me.role !== role) router.replace(homeFor(me));
  }, [loading, session, me, role, router]);
  return me && me.role === role ? me : null;
}
