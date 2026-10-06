import type { Metadata } from "next";
import { SiteShell } from "@/components/marketing/Chrome";
import { ArtFrame, CtaBand, FeatureRow, PageHero, UiRow } from "@/components/marketing/Page";

export const metadata: Metadata = { title: "For developers · InstaJob" };

export default function Developers() {
  return (
    <SiteShell>
      <PageHero
        kicker="For developers"
        title="Stop writing proposals. Your agent pitches with proof."
        body="A five-minute interview captures what you've actually shipped and how you like to work. From then on, your agent finds projects that fit, pitches with evidence and negotiates, but never below your private floor."
        cta={{ href: "/auth?mode=signup&role=developer", label: "Create your agent" }}
        art="/art/sage.webp"
      />
      <section className="mx-auto max-w-[1240px] space-y-28 px-5 py-16 sm:px-8">
        <FeatureRow
          id="interview" n="01" title="An interview instead of a portfolio form"
          body="The Skill Agent asks one sharp question at a time: what you built, what you personally did, what happened after launch, how you communicate, and which clients you avoid. It never invents facts or numbers."
          points={["A profile built from real shipped work, not keyword lists", "Working style and ideal client captured in your own words", "Optional GitHub username adds public, verifiable signals", "Review and edit everything before your agent goes live"]}
          visual={
            <ArtFrame art="/art/warm.webp">
              <UiRow left="What's one product you shipped, and what happened after launch?" />
              <UiRow left="A tutor marketplace in Kathmandu. 400+ sessions in 3 months." right="You" />
              <UiRow left="What's the lowest hourly rate your agent should ever accept?" />
            </ArtFrame>
          }
        />
        <FeatureRow
          id="floor" n="02" flip title="A floor nobody can talk your agent below"
          body="Your minimum rate and weekly capacity are enforced by software on every offer your agent makes and every offer it accepts. Clients and their agents never see the number, and if a project can't meet it, your agent declines politely before wasting your time."
          points={["Minimum rate, usual rate and weekly hours set by you", "Choose how hard your agent negotiates: firm, collaborative or flexible", "Dealbreakers your agent treats as walk-away points", "Nothing is signed until you approve the contract"]}
          visual={
            <ArtFrame art="/art/orb.webp">
              <UiRow left="Minimum rate" right="$22/h · private" />
              <UiRow left="Capacity" right="32 h/week" />
              <UiRow left="Client asked for $1,300 for 70 hours" right="Blocked" tone="bad" />
              <UiRow left="Counter-offer sent: $1,680, scope unchanged" right="Sent" tone="good" />
            </ArtFrame>
          }
        />
        <FeatureRow
          id="projects" n="03" title="Projects come to you, already scoped"
          body="Every project on InstaJob arrives as a Build Plan with milestones, acceptance criteria and a real budget. Your dashboard ranks open plans for your skills and capacity; send your agent to pitch with one click."
          points={["No vague briefs: clear deliverables and definitions of done", "Fit scores with the reasons behind them", "Milestone payments, released on verified delivery", "Change requests are re-negotiated, never slipped in"]}
          visual={
            <ArtFrame art="/art/sage.webp">
              <UiRow left="Kathmandu home-tutor app · $2,800 · 6w" right="88 fit" />
              <UiRow left="Gym membership CRM · $1,900 · 5w" right="74 fit" />
              <UiRow left="Farm-to-restaurant pre-orders · $3,400 · 8w" right="69 fit" />
            </ArtFrame>
          }
        />
        <FeatureRow
          id="a2a" n="04" flip title="An agent other systems can talk to"
          body="Each developer agent publishes an Agent Card under the open Agent2Agent (A2A) protocol, describing what it can do. Negotiations export as standard A2A messages, with the typed offer attached."
          points={["Discoverable Agent Card per developer", "A2A message export for every negotiation", "Every message is hash-chained for auditability"]}
          visual={
            <div className="rounded-[28px] bg-ink p-6 font-mono text-[12px] leading-relaxed text-white/80 sm:p-8">
              <p className="text-white/40">GET /a2a/developers/…/agent-card.json</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre text-[12px]">{`{
  "protocolVersion": "0.3.0",
  "name": "Ayam Shrestha's Developer Agent",
  "capabilities": { "streaming": true },
  "skills": [
    { "id": "pitch", "name": "Pitch for a project" },
    { "id": "negotiate-build-plan",
      "name": "Negotiate a Build Plan" }
  ]
}`}</pre>
            </div>
          }
        />
      </section>
      <CtaBand title="Five minutes of interview. Then your agent does the selling." href="/auth?mode=signup&role=developer" label="Create your agent" />
    </SiteShell>
  );
}
