"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button, ErrorNote, Field, inputCls } from "@/components/ui";
import { homeFor, useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

function AuthForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { me, session, refresh } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [role, setRole] = useState<Role>(params.get("role") === "developer" ? "developer" : "client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Supabase reports failed OAuth / email links as ?error_description=... on the redirect.
  const [error, setError] = useState<string | null>(
    params.get("error_description") ? `Sign-in didn't complete: ${params.get("error_description")}. Please try again.` : null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session && me) router.replace(homeFor(me));
  }, [session, me, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name, role }, emailRedirectTo: `${location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice("Check your inbox to confirm your email, then sign in.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const m = await refresh();
      router.replace(homeFor(m));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    if (mode === "signup") localStorage.setItem("instajob_pending_role", role);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-[32px] font-medium tracking-[-0.03em]">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1 text-[13px] text-body">
            {mode === "signup" ? "Your agent starts working as soon as you're in." : "Sign in to your agent's workspace."}
          </p>

          {mode === "signup" && (
            <div className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-cream-2 p-1">
              {(["client", "developer"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-full py-2 text-[13px] font-medium transition-all ${role === r ? "bg-white text-ink shadow-sm" : "text-body"}`}
                >
                  {r === "client" ? "I'm a founder" : "I'm a developer"}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={google}
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-white text-[14px] font-medium hover:border-ink/40"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-[11px] text-muted">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <Field label="Full name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
              <input
                className={inputCls} type="password" value={password} minLength={mode === "signup" ? 8 : undefined}
                onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </Field>
            <ErrorNote message={error} />
            {notice && <div className="rounded-xl bg-good-bg px-4 py-3 text-[13px] text-good">{notice}</div>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-[13px] text-body">
            {mode === "signup" ? "Already have an account? " : "New to InstaJob? "}
            <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="font-semibold text-ink underline underline-offset-2">
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </div>
      <div className="relative hidden p-3 lg:block">
        <div className="relative flex h-full flex-col justify-end overflow-hidden rounded-[28px] bg-cover bg-center p-10" style={{ backgroundImage: "url(/art/warm.webp)" }}>
          <div className="max-w-sm space-y-2.5">
            <div className="rounded-2xl bg-white/92 p-4 shadow-sm backdrop-blur">
              <p className="text-[12px] text-muted">Your agent · negotiating with Ayam&apos;s agent</p>
              <p className="mt-1 text-[14px] text-ink">&ldquo;You can reuse PadhaiSathi components, which cuts hours. $1,920 for the full scope.&rdquo;</p>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white/92 p-4 shadow-sm backdrop-blur">
              <span className="text-[14px] font-medium text-ink">Deal agreed · $2,000 · 4 weeks</span>
              <span className="text-[12px] font-medium text-good">Inside your limits</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
