import type { Metadata } from "next";
import { SiteShell } from "@/components/marketing/Chrome";
import { ArtFrame, CtaBand, FeatureRow, PageHero, UiRow } from "@/components/marketing/Page";

export const metadata: Metadata = { title: "For founders · InstaJob" };

export default function Founders() {
  return (
    <SiteShell>
      <PageHero
        kicker="For founders"
        title="You bring the idea. Your agent brings back signed-ready deals."
        body="No job posts, no pile of proposals, no guessing at what a fair price is. Describe what you want built; InstaJob scopes it, finds the right developers and negotiates for you."
        cta={{ href: "/auth?mode=signup", label: "Start with your idea" }}
        art="/art/warm.webp"
      />
      <section className="mx-auto max-w-[1240px] space-y-28 px-5 py-16 sm:px-8">
        <FeatureRow
          id="plan" n="01" title="A Build Plan in about a minute"
          body="The Requirements Agent reads your idea and asks only what changes the plan: platforms, payments, user roles, existing designs. Then it writes milestones a developer can price and a machine can verify."
          points={["Every milestone is a deployed, demoable slice, not 'backend done'", "Acceptance criteria are checkable from a live URL or repository", "Risks such as payment approvals or missing designs are flagged up front", "A market check compares real platform rates with your budget before anyone is contacted"]}
          visual={
            <ArtFrame art="/art/sage.webp">
              <UiRow left="m1 · Tutor directory & search" right="Must · 18h" />
              <UiRow left="m2 · Registration & verification" right="Must · 16h" />
              <UiRow left="m3 · Booking & local payments" right="Must · 22h" />
              <UiRow left="m4 · Tutor dashboard" right="Should · 14h" />
              <UiRow left="Budget covers the must-haves" right="Market check" tone="good" />
            </ArtFrame>
          }
        />
        <FeatureRow
          id="match" n="02" flip title="Matches you can actually understand"
          body="Developers are ranked on four things you care about, and every score comes with the reason behind it. No black-box 'top match' labels."
          points={["Skills: which of your plan's technologies they know", "Past work: how close their shipped projects are to yours", "Budget fit: whether the must-haves fit at their rates", "Capacity: whether their weekly hours meet your deadline"]}
          visual={
            <ArtFrame art="/art/warm.webp">
              <UiRow left="Ayam Shrestha · shipped a tutor marketplace" right="88" />
              <UiRow left="Rohan Mehta · booking apps for 90 salons" right="85" />
              <UiRow left="Kiran Rai · Next.js + Supabase tools" right="85" />
              <UiRow left="Marcus Webb · minimum rate above budget" right="Declined" tone="warn" />
            </ArtFrame>
          }
        />
        <FeatureRow
          id="negotiate" n="03" title="Negotiations you can watch, pause and steer"
          body="Your agent negotiates with up to five developers' agents at once. It trades scope, time and price, drops nice-to-haves before it squeezes quality, and never exceeds your limits."
          points={["Live negotiation room with every offer and the price trend", "Pause any negotiation, or tell your agent 'speed matters more than price'", "Your instructions are private; the developer only sees that you gave some", "Every message is on a tamper-evident audit chain"]}
          visual={
            <ArtFrame art="/art/orb.webp">
              <UiRow left="Developer's agent: $2,240 · 4 weeks" />
              <UiRow left="Your agent: $1,920, reuse PadhaiSathi parts" />
              <UiRow left="Developer's agent: $2,080 · 1 revision" />
              <UiRow left="Your agent: $2,000 · 2 revisions" />
              <UiRow left="Deal agreed inside both limits" right="Ready to sign" tone="good" />
            </ArtFrame>
          }
        />
        <FeatureRow
          id="verify" n="04" flip title="Pay per milestone, after Proof of Done"
          body="Pick the offer you like best. The contract is generated from the agreed terms, so every number in it is one both agents were allowed to agree to. Each milestone is verified before you release payment."
          points={["Side-by-side comparison of ready-to-sign offers", "Contract terms: milestone payments, revisions, change requests, IP", "The Verification Agent checks each criterion against the live site and repository", "Approve and release, or request changes with a note"]}
          visual={
            <ArtFrame art="/art/sage.webp">
              <UiRow left="Search page lists tutors with filters" right="Met" tone="good" />
              <UiRow left="Tutor profile shows hourly rate" right="Met" tone="good" />
              <UiRow left="Parents can sign up with email" right="Check yourself" />
              <UiRow left="README has setup steps" right="Needs work" tone="warn" />
            </ArtFrame>
          }
        />
      </section>
      <CtaBand title="Your first Build Plan is a sentence away." href="/auth?mode=signup" label="Describe your idea" />
    </SiteShell>
  );
}
