"use client";

import { AppShell } from "@/components/AppShell";
import { LinkButton, PageHeader } from "@/components/ui";
import { WorkOverview } from "@/components/workspace/WorkOverview";
import { useRequireRole } from "@/lib/auth";

export default function Portfolio() {
  const me = useRequireRole("client");
  return (
    <AppShell ready={!!me} wide>
      <PageHeader title="Portfolio" sub="Progress, deadlines and spend across every project you're building." />
      <WorkOverview role="client" emptyAction={<LinkButton href="/client/new">Start a project</LinkButton>} />
    </AppShell>
  );
}
