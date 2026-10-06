"""Seed demo data: developer personas + two demo logins.

    python -m scripts.seed           # create/refresh personas and demo accounts
    python -m scripts.seed --reset   # also wipe the demo founder's projects (fresh demo run)

Demo logins (password below):
    founder@instajob.demo   Aakriti, startup founder (client)
    ayam@instajob.demo      Ayam, full-stack developer (real developer account)
"""
from __future__ import annotations

import asyncio
import sys

from app.db import db
from app.llm import embed
from app.services.matching import developer_embedding_text, plan_embedding_text

DEMO_PASSWORD = "InstaJob-Demo-2026"


def P(name, what, stack, role, outcome="", url=""):
    return {"name": name, "what": what, "stack": stack, "role": role, "outcome": outcome, "url": url}


def WS(communication, process, ideal_client, red_flags):
    return {"communication": communication, "process": process, "ideal_client": ideal_client, "red_flags": red_flags}


AYAM = {
    "full_name": "Ayam Shrestha",
    "headline": "Full-stack Next.js + Supabase developer for marketplace MVPs",
    "bio": "Ayam has spent two years shipping two-sided marketplaces and booking products for early-stage founders. "
           "He built the booking and payments flow for a Kathmandu tutoring startup end to end and prefers small, "
           "weekly deployed increments over big-bang launches.",
    "location": "Kathmandu, Nepal", "timezone": "Asia/Kathmandu (UTC+5:45)",
    "skills": ["Next.js", "React", "TypeScript", "Supabase", "Postgres", "Stripe", "Tailwind", "Node.js", "Vercel"],
    "years_experience": 2, "rate_floor": 22, "rate_target": 32, "weekly_hours": 32, "availability": "immediate",
    "work_style": WS("Async-first, short Loom demo every Friday", "Deploys to a preview URL after every feature",
                     "Founders who can make decisions quickly", "Changing scope without a written change request"),
    "shipped_projects": [
        P("PadhaiSathi", "Tutor marketplace where parents book and pay for home tutoring sessions", ["Next.js", "Supabase", "Stripe"],
          "Built booking calendar, payments and tutor dashboards solo", "400+ sessions booked in first 3 months"),
        P("KhajaGhar", "Pre-order lunch app for office canteens", ["Next.js", "Postgres", "Tailwind"],
          "Full-stack build and deployment", "Used daily by 3 offices"),
    ],
    "github_username": None, "negotiation_style": "collaborative",
    "dealbreakers": ["No unpaid trial work", "No work without written milestones"],
}

PERSONAS = [
    {"full_name": "Priya Nair", "headline": "Senior full-stack engineer, SaaS and marketplaces",
     "bio": "Priya has led engineering for three funded SaaS startups and ships production-grade marketplaces with strong test coverage.",
     "location": "Bangalore, India", "timezone": "Asia/Kolkata (UTC+5:30)",
     "skills": ["Next.js", "React", "TypeScript", "Node.js", "Postgres", "Stripe", "AWS", "Prisma"], "years_experience": 8,
     "rate_floor": 55, "rate_target": 70, "weekly_hours": 25, "negotiation_style": "firm",
     "work_style": WS("Twice-weekly calls", "Sprint planning every Monday", "Funded startups with a PM", "Fixed price without a spec"),
     "shipped_projects": [P("RentLoop", "Equipment rental marketplace", ["Next.js", "Stripe Connect", "Postgres"], "Tech lead", "$1.2M GMV year one")],
     "dealbreakers": ["No equity-only deals"]},
    {"full_name": "Marcus Webb", "headline": "Staff engineer for complex SaaS platforms",
     "bio": "Marcus spent a decade at scale-ups building payments and multi-tenant platforms.",
     "location": "Austin, USA", "timezone": "America/Chicago (UTC-6)",
     "skills": ["React", "Next.js", "TypeScript", "Go", "Postgres", "Stripe", "Kubernetes"], "years_experience": 12,
     "rate_floor": 110, "rate_target": 140, "weekly_hours": 20, "negotiation_style": "firm",
     "work_style": WS("Weekly written status", "Architecture doc before code", "Series A+ teams", "Unclear ownership"),
     "shipped_projects": [P("PayGrid", "Multi-tenant billing platform", ["Go", "Postgres", "Stripe"], "Architect", "Processed $40M/yr")],
     "dealbreakers": ["No projects under $10k"]},
    {"full_name": "Sujan Karki", "headline": "React Native + Firebase mobile developer",
     "bio": "Sujan builds cross-platform mobile apps with offline support and push notifications.",
     "location": "Pokhara, Nepal", "timezone": "Asia/Kathmandu (UTC+5:45)",
     "skills": ["React Native", "Expo", "Firebase", "TypeScript", "Node.js"], "years_experience": 3,
     "rate_floor": 20, "rate_target": 28, "weekly_hours": 35, "negotiation_style": "flexible",
     "work_style": WS("Daily WhatsApp updates", "TestFlight build every week", "First-time founders", "No designs at all"),
     "shipped_projects": [P("TrekLog", "Offline trekking route tracker", ["React Native", "Firebase"], "Solo developer", "12k downloads")],
     "dealbreakers": []},
    {"full_name": "Elena Petrova", "headline": "Backend and API engineer (Python/FastAPI)",
     "bio": "Elena designs clean APIs, data models and integrations for startups.",
     "location": "Sofia, Bulgaria", "timezone": "Europe/Sofia (UTC+2)",
     "skills": ["Python", "FastAPI", "Postgres", "Redis", "Docker", "AWS"], "years_experience": 6,
     "rate_floor": 45, "rate_target": 60, "weekly_hours": 30, "negotiation_style": "collaborative",
     "work_style": WS("Async, detailed PR descriptions", "API-first with OpenAPI docs", "Technical co-founders", "Frontend-heavy work"),
     "shipped_projects": [P("Ledgerly", "Accounting API for SMEs", ["FastAPI", "Postgres"], "Backend lead")],
     "dealbreakers": ["No frontend-only projects"]},
    {"full_name": "Rohan Mehta", "headline": "Next.js + Stripe developer for booking and scheduling apps",
     "bio": "Rohan specialises in scheduling, calendars and payments for service businesses.",
     "location": "Pune, India", "timezone": "Asia/Kolkata (UTC+5:30)",
     "skills": ["Next.js", "React", "TypeScript", "Stripe", "Postgres", "Supabase", "Google Calendar API", "Tailwind"],
     "years_experience": 4, "rate_floor": 30, "rate_target": 42, "weekly_hours": 30, "negotiation_style": "collaborative",
     "work_style": WS("Two calls a week", "Staging link for every milestone", "Service businesses going online", "Micromanagement"),
     "shipped_projects": [P("SlotBook", "Appointment booking for salons", ["Next.js", "Stripe", "Supabase"], "Full-stack", "90 salons onboarded")],
     "dealbreakers": []},
    {"full_name": "Anisha Gurung", "headline": "Product-minded frontend developer (React, design systems)",
     "bio": "Anisha turns rough ideas into polished, accessible interfaces and pairs well with backend developers.",
     "location": "Lalitpur, Nepal", "timezone": "Asia/Kathmandu (UTC+5:45)",
     "skills": ["React", "Next.js", "TypeScript", "Tailwind", "Figma", "Framer Motion"], "years_experience": 3,
     "rate_floor": 18, "rate_target": 26, "weekly_hours": 30, "negotiation_style": "flexible",
     "work_style": WS("Daily async updates", "Figma first, then code", "Design-driven founders", "Backend-heavy scope"),
     "shipped_projects": [P("Mitho Menu", "Digital menus for cafes", ["Next.js", "Tailwind"], "Frontend + design")],
     "dealbreakers": ["No backend-only work"]},
    {"full_name": "Tomás Alvarez", "headline": "Full-stack developer for AI features in SaaS",
     "bio": "Tomás adds LLM features (chat, search, summarisation) to existing products.",
     "location": "Buenos Aires, Argentina", "timezone": "America/Argentina/Buenos_Aires (UTC-3)",
     "skills": ["Python", "TypeScript", "Next.js", "OpenAI API", "LangChain", "pgvector", "Postgres"], "years_experience": 5,
     "rate_floor": 40, "rate_target": 55, "weekly_hours": 25, "negotiation_style": "collaborative",
     "work_style": WS("Weekly demo", "Prototype first, harden later", "Products with real users", "Pure research"),
     "shipped_projects": [P("DocuChat", "Chat with your contracts", ["Next.js", "pgvector"], "Solo")],
     "dealbreakers": []},
    {"full_name": "Bikash Thapa", "headline": "Laravel/PHP developer for e-commerce",
     "bio": "Bikash builds and maintains e-commerce stores with local payment gateways.",
     "location": "Kathmandu, Nepal", "timezone": "Asia/Kathmandu (UTC+5:45)",
     "skills": ["PHP", "Laravel", "MySQL", "Vue", "eSewa", "Khalti"], "years_experience": 5,
     "rate_floor": 15, "rate_target": 22, "weekly_hours": 40, "negotiation_style": "flexible",
     "work_style": WS("Phone calls", "Weekly releases", "Retail businesses", "Very short deadlines"),
     "shipped_projects": [P("Pasal", "Clothing store with eSewa checkout", ["Laravel", "MySQL"], "Full-stack")],
     "dealbreakers": []},
    {"full_name": "Hannah Brooks", "headline": "Senior React Native engineer, health and fitness apps",
     "bio": "Hannah has shipped HIPAA-aware mobile apps and wearable integrations.",
     "location": "Toronto, Canada", "timezone": "America/Toronto (UTC-5)",
     "skills": ["React Native", "TypeScript", "HealthKit", "Node.js", "Postgres"], "years_experience": 9,
     "rate_floor": 85, "rate_target": 105, "weekly_hours": 20, "negotiation_style": "firm",
     "work_style": WS("Weekly call", "Formal QA per release", "Health startups", "No budget for QA"),
     "shipped_projects": [P("StrideCoach", "Running coach app", ["React Native", "HealthKit"], "Lead mobile")],
     "dealbreakers": ["No gambling or crypto"]},
    {"full_name": "Kiran Rai", "headline": "Supabase + Next.js developer for internal tools and dashboards",
     "bio": "Kiran builds admin panels, CRMs and reporting dashboards quickly on Supabase.",
     "location": "Dharan, Nepal", "timezone": "Asia/Kathmandu (UTC+5:45)",
     "skills": ["Next.js", "Supabase", "Postgres", "TypeScript", "Tailwind", "Chart.js"], "years_experience": 2,
     "rate_floor": 16, "rate_target": 24, "weekly_hours": 25, "negotiation_style": "flexible",
     "work_style": WS("Async", "Deploy every two days", "Ops-heavy small businesses", "Vague requirements"),
     "shipped_projects": [P("StockBook", "Inventory dashboard for a pharmacy chain", ["Next.js", "Supabase"], "Solo")],
     "dealbreakers": []},
    {"full_name": "Wei Chen", "headline": "Real-time and maps specialist (logistics, delivery)",
     "bio": "Wei builds live tracking, routing and dispatch systems.",
     "location": "Singapore", "timezone": "Asia/Singapore (UTC+8)",
     "skills": ["TypeScript", "Node.js", "Google Maps", "WebSockets", "React", "Postgres", "Redis"], "years_experience": 7,
     "rate_floor": 60, "rate_target": 75, "weekly_hours": 30, "negotiation_style": "collaborative",
     "work_style": WS("Daily standup message", "Load-test before launch", "Logistics startups", "No test devices"),
     "shipped_projects": [P("DashDrop", "Courier dispatch with live tracking", ["Node.js", "Google Maps", "Redis"], "Lead")],
     "dealbreakers": []},
    {"full_name": "Sarah Okafor", "headline": "Full-stack developer for EdTech and learning platforms",
     "bio": "Sarah builds course platforms, quizzes and progress tracking for education startups.",
     "location": "Lagos, Nigeria", "timezone": "Africa/Lagos (UTC+1)",
     "skills": ["Next.js", "React", "Node.js", "Postgres", "Stripe", "Supabase", "TypeScript"], "years_experience": 4,
     "rate_floor": 28, "rate_target": 38, "weekly_hours": 30, "negotiation_style": "collaborative",
     "work_style": WS("Weekly call + async", "Milestone demos", "Mission-driven EdTech", "No user research"),
     "shipped_projects": [P("LearnLoop", "Cohort course platform", ["Next.js", "Stripe", "Supabase"], "Full-stack", "3k learners")],
     "dealbreakers": []},
    {"full_name": "Dipesh Adhikari", "headline": "Junior full-stack developer (MERN)",
     "bio": "Dipesh is early in his career and has shipped two client projects on the MERN stack.",
     "location": "Butwal, Nepal", "timezone": "Asia/Kathmandu (UTC+5:45)",
     "skills": ["MongoDB", "Express", "React", "Node.js", "JavaScript"], "years_experience": 1,
     "rate_floor": 10, "rate_target": 15, "weekly_hours": 40, "negotiation_style": "flexible",
     "work_style": WS("Available on call", "Frequent check-ins", "Patient founders", "None"),
     "shipped_projects": [P("GymLog", "Membership tracker for a local gym", ["React", "Node.js", "MongoDB"], "Solo")],
     "dealbreakers": []},
    {"full_name": "Lucas Martin", "headline": "Shopify and headless commerce developer",
     "bio": "Lucas builds headless storefronts and subscription commerce.",
     "location": "Lyon, France", "timezone": "Europe/Paris (UTC+1)",
     "skills": ["Shopify", "Next.js", "GraphQL", "Stripe", "TypeScript"], "years_experience": 6,
     "rate_floor": 50, "rate_target": 65, "weekly_hours": 25, "negotiation_style": "firm",
     "work_style": WS("Weekly call", "Staging store per milestone", "DTC brands", "No product photos"),
     "shipped_projects": [P("BeanBox", "Coffee subscription storefront", ["Shopify", "Next.js"], "Lead dev")],
     "dealbreakers": []},
    {"full_name": "Nabin Shahi", "headline": "Flutter developer for consumer apps",
     "bio": "Nabin ships Flutter apps with clean architecture and Firebase backends.",
     "location": "Kathmandu, Nepal", "timezone": "Asia/Kathmandu (UTC+5:45)",
     "skills": ["Flutter", "Dart", "Firebase", "Khalti", "REST APIs"], "years_experience": 3,
     "rate_floor": 18, "rate_target": 25, "weekly_hours": 35, "negotiation_style": "collaborative",
     "work_style": WS("Daily Slack update", "Weekly APK builds", "Consumer apps", "No clear owner"),
     "shipped_projects": [P("BusYatra", "Bus ticket booking app", ["Flutter", "Firebase", "Khalti"], "Solo", "20k bookings")],
     "dealbreakers": []},
]


async def upsert_developer(d: dict, user_id: str | None) -> None:
    row = {
        "availability": "immediate", "github_username": None, "auto_negotiate": True,
        **d, "user_id": user_id, "is_demo_persona": user_id is None, "profile_complete": True,
    }
    row["embedding"] = await embed(developer_embedding_text(row))
    existing = db().table("developers").select("id").eq("full_name", d["full_name"]).limit(1).execute().data
    if existing:
        db().table("developers").update(row).eq("id", existing[0]["id"]).execute()
    else:
        db().table("developers").insert(row).execute()
    print(f"  developer: {d['full_name']}")


def M(i, title, goal, deliverables, criteria, hours, priority):
    return {"id": f"m{i}", "title": title, "goal": goal, "deliverables": deliverables,
            "acceptance_criteria": criteria, "est_hours": hours, "priority": priority}


# Open projects posted by other (sample) founders, so developers always have something to discover.
SAMPLE_PROJECTS = [
    {
        "raw_idea": "A CRM for small gyms in Kathmandu to track members, renewals and payments, with WhatsApp reminders before memberships expire.",
        "budget_max": 2200, "deadline_weeks": 6,
        "plan": {
            "title": "Gym Membership CRM", "target_users": "Owners and front-desk staff of small gyms",
            "summary": "A web dashboard where gym owners manage members, log payments and see who is due for renewal. Members get automatic WhatsApp reminders a few days before their membership expires.",
            "tech_stack": ["Next.js", "Supabase", "Tailwind", "WhatsApp Cloud API"],
            "required_skills": ["Next.js", "Supabase", "Postgres", "Tailwind", "WhatsApp Cloud API"],
            "milestones": [
                M(1, "Member directory & plans", "Staff can add members and assign membership plans.", ["Deployed member list with search", "Plan management"],
                  ["Visiting /members lists members with a search box", "Creating a member with a plan shows their expiry date"], 24, "must"),
                M(2, "Payments & renewals", "Staff can log payments and see renewals due this week.", ["Payment log", "Renewals-due view"],
                  ["Logging a payment extends the member's expiry date", "/renewals lists members expiring in the next 7 days"], 20, "must"),
                M(3, "WhatsApp reminders", "Members automatically get a reminder before expiry.", ["Scheduled reminder job", "Message template"],
                  ["A member expiring in 3 days receives a WhatsApp message in the sandbox", "Reminder history is visible per member"], 22, "should"),
                M(4, "Revenue dashboard", "Owners see monthly revenue and churn.", ["Dashboard with two charts"],
                  ["/dashboard shows monthly revenue for the last 6 months"], 12, "nice"),
            ],
            "risks": [{"risk": "WhatsApp business verification can take days", "mitigation": "Build against the sandbox number; start verification in week 1"}],
            "assumptions": ["Payments are logged manually, not processed online"], "out_of_scope": ["Mobile app for members"],
        },
    },
    {
        "raw_idea": "A marketplace where farmers around Kathmandu list vegetables and restaurants pre-order for next-day delivery.",
        "budget_max": 3400, "deadline_weeks": 8,
        "plan": {
            "title": "Farm-to-Restaurant Pre-orders", "target_users": "Small farms and restaurant purchasing managers",
            "summary": "Farmers post what they will harvest tomorrow; restaurants pre-order before a cutoff; the platform produces pick lists and delivery routes for the morning run.",
            "tech_stack": ["Next.js", "Supabase", "Stripe", "Google Maps"],
            "required_skills": ["Next.js", "Supabase", "Postgres", "Stripe", "Google Maps"],
            "milestones": [
                M(1, "Farmer listings", "Farmers can list tomorrow's produce with quantities and prices.", ["Farmer signup", "Listing form"],
                  ["A farmer can publish a listing visible at /market", "Listings disappear after the daily cutoff"], 26, "must"),
                M(2, "Restaurant pre-orders", "Restaurants can pre-order before the cutoff.", ["Cart", "Order confirmation"],
                  ["Ordering more than the available quantity is blocked", "Orders appear on the farmer's dashboard"], 30, "must"),
                M(3, "Payments", "Restaurants pay by card when ordering.", ["Stripe checkout", "Payout report"],
                  ["Completing test-mode checkout marks the order as paid"], 18, "must"),
                M(4, "Delivery routes", "The driver gets an ordered route each morning.", ["Route view on a map"],
                  ["/routes shows today's stops in order on a map"], 20, "should"),
            ],
            "risks": [{"risk": "Produce availability changes overnight", "mitigation": "Let farmers mark items unavailable and auto-refund"}],
            "assumptions": ["A single delivery driver at launch"], "out_of_scope": ["Native mobile apps"],
        },
    },
    {
        "raw_idea": "An online queue and appointment system for a dental clinic in Lalitpur, with SMS reminders.",
        "budget_max": 1800, "deadline_weeks": 5,
        "plan": {
            "title": "Dental Clinic Booking & Queue", "target_users": "Patients and front-desk staff of a single clinic",
            "summary": "Patients book appointments online and see their live queue position on the day; staff manage the schedule and the walk-in queue from one screen.",
            "tech_stack": ["Next.js", "Supabase", "Tailwind"],
            "required_skills": ["Next.js", "Supabase", "Postgres", "Tailwind"],
            "milestones": [
                M(1, "Online booking", "Patients can book an available slot.", ["Public booking page", "Confirmation page"],
                  ["/book shows available slots for the next 14 days", "Booking a slot removes it from the list"], 20, "must"),
                M(2, "Front-desk schedule & queue", "Staff see today's schedule and manage walk-ins.", ["Staff dashboard"],
                  ["/staff shows today's appointments in time order", "Adding a walk-in updates the queue position"], 18, "must"),
                M(3, "SMS reminders", "Patients get a reminder the day before.", ["Reminder job"],
                  ["A booking for tomorrow triggers a reminder in the SMS provider's test log"], 10, "should"),
            ],
            "risks": [{"risk": "Local SMS gateway onboarding", "mitigation": "Abstract the provider; use a test gateway first"}],
            "assumptions": ["One clinic, two dentists"], "out_of_scope": ["Insurance billing"],
        },
    },
]


async def seed_sample_projects(owner_id: str) -> None:
    """Idempotent: re-running resets these projects to 'open' and clears negotiations on them."""
    for sp in SAMPLE_PROJECTS:
        emb = await embed(plan_embedding_text(sp["plan"]))
        row = {**sp, "client_id": owner_id, "title": sp["plan"]["title"], "status": "open", "questions": [], "embedding": emb}
        existing = db().table("projects").select("id").eq("client_id", owner_id).eq("title", row["title"]).limit(1).execute().data
        if existing:
            db().table("negotiations").delete().eq("project_id", existing[0]["id"]).execute()
            db().table("matches").delete().eq("project_id", existing[0]["id"]).execute()
            db().table("projects").update(row).eq("id", existing[0]["id"]).execute()
        else:
            db().table("projects").insert(row).execute()
        print(f"  open project: {row['title']}")


def ensure_user(email: str, full_name: str, role: str) -> str:
    admin = db().auth.admin
    for u in admin.list_users(per_page=1000):
        if u.email == email:
            db().table("profiles").update({"role": role, "full_name": full_name}).eq("id", u.id).execute()
            return u.id
    res = admin.create_user({
        "email": email, "password": DEMO_PASSWORD, "email_confirm": True,
        "user_metadata": {"full_name": full_name, "role": role},
    })
    print(f"  created login: {email}")
    return res.user.id


async def main(reset: bool) -> None:
    founder_id = ensure_user("founder@instajob.demo", "Aakriti Joshi", "client")
    ayam_id = ensure_user("ayam@instajob.demo", "Ayam Shrestha", "developer")
    if reset:
        db().table("projects").delete().eq("client_id", founder_id).execute()
        print("  reset: removed the demo founder's projects, negotiations and contracts")
    await upsert_developer(AYAM, ayam_id)
    for d in PERSONAS:
        await upsert_developer(d, None)
    samples_id = ensure_user("sample-founders@instajob.demo", "Sample founders", "client")
    await seed_sample_projects(samples_id)
    print(f"\nDone. Demo password for both logins: {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main(reset="--reset" in sys.argv))
