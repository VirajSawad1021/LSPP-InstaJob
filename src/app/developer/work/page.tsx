"use client";

import { AppShell } from "@/components/AppShell";
import { LinkButton, PageHeader } from "@/components/ui";
import { WorkOverview } from "@/components/workspace/WorkOverview";
import { useRequireRole } from "@/lib/auth";

export default function MyWork() {
  const me = useRequireRole("developer");
  return (
    <AppShell ready={!!me} wide>
      <PageHeader title="My work" sub="Every client project in one place: what's due, what's in review and what you've been paid." />
      <WorkOverview role="developer" emptyAction={<LinkButton href="/marketplace">Browse open projects</LinkButton>} />
    </AppShell>
  );
}
