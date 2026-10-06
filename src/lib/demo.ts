import { supabase } from "./supabase";

/** Public demo accounts (the same ones scripts/seed.py creates). They hold demo data only. */
export const DEMO = {
  founder: { email: "founder@instajob.demo", name: "Aakriti Joshi", label: "Founder" },
  developer: { email: "ayam@instajob.demo", name: "Ayam Shrestha", label: "Developer" },
} as const;
export const DEMO_PASSWORD = "InstaJob-Demo-2026";
export type DemoRole = keyof typeof DEMO;

export const isDemoEmail = (email: string | null | undefined) => !!email && email.endsWith("@instajob.demo");

/** Sign in as a demo account (switching if someone else is signed in). Returns once the session is live. */
export async function signInAsDemo(role: DemoRole): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.email === DEMO[role].email) return;
  if (data.session) await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: DEMO[role].email, password: DEMO_PASSWORD });
  if (error) throw new Error(`Couldn't sign in as the demo ${DEMO[role].label.toLowerCase()}: ${error.message}`);
}
