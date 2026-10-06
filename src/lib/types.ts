export type Role = "client" | "developer";
export type Priority = "must" | "should" | "nice";

export interface Me {
  id: string;
  email: string | null;
  role: Role | null;
  full_name: string | null;
  developer: Developer | null;
}

export interface Milestone {
  id: string;
  title: string;
  goal: string;
  deliverables: string[];
  acceptance_criteria: string[];
  est_hours: number;
  priority: Priority;
}

export interface BuildPlan {
  title: string;
  summary: string;
  target_users: string;
  tech_stack: string[];
  required_skills: string[];
  milestones: Milestone[];
  risks: { risk: string; mitigation: string }[];
  assumptions: string[];
  out_of_scope: string[];
}

export interface Question {
  question: string;
  why: string;
  options: string[];
  answer: string | null;
}

export type ProjectStatus =
  | "clarifying" | "planned" | "open" | "negotiating" | "contracted" | "in_progress" | "completed" | "cancelled";

export interface Project {
  id: string;
  client_id: string;
  raw_idea: string;
  title: string | null;
  status: ProjectStatus;
  questions: Question[];
  budget_max: number | null;
  deadline_weeks: number | null;
  plan: BuildPlan | null;
  created_at: string;
}

export interface Estimate {
  hours_total: number;
  hours_must: number;
  rate_p25: number;
  rate_median: number;
  cost_must_low: number;
  cost_all_median: number;
}

export interface ShippedProject {
  name: string;
  what: string;
  stack: string[];
  role: string;
  outcome: string;
  url: string;
}

export interface WorkStyle {
  communication?: string;
  process?: string;
  ideal_client?: string;
  red_flags?: string;
}

export interface GithubSignals {
  username: string;
  public_repos: number;
  followers: number;
  top_languages: string[];
  notable_repos: { name: string; stars: number; description: string; url: string }[];
  last_push: string | null;
}

export interface Developer {
  id: string;
  user_id: string | null;
  full_name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  timezone: string | null;
  skills: string[];
  years_experience: number | null;
  rate_floor?: number;
  rate_target: number | null;
  weekly_hours: number | null;
  availability: string | null;
  work_style: WorkStyle;
  shipped_projects: ShippedProject[];
  github_username: string | null;
  github_signals: GithubSignals | null;
  negotiation_style?: "firm" | "collaborative" | "flexible";
  dealbreakers?: string[];
  auto_negotiate?: boolean;
  is_demo_persona: boolean;
  profile_complete: boolean;
}

export interface Match {
  id: string;
  project_id: string;
  developer_id: string;
  score: number;
  breakdown: {
    skills: number;
    semantic: number;
    budget: number;
    capacity: number;
    matched_skills: string[];
    missing_skills: string[];
    weeks_needed_must: number;
  };
  reasons: string[];
  concerns: string[];
  initiated_by: "client" | "developer";
  developer?: Developer;
}

export interface OfferLine {
  milestone_id: string;
  included: boolean;
  price: number;
  weeks: number;
}

export interface Offer {
  lines: OfferLine[];
  revisions_per_milestone: number;
  start_in_days: number;
  notes: string;
  total_price: number;
  timeline_weeks: number;
}

export type NegotiationStatus =
  | "pending" | "running" | "paused" | "agreed" | "impasse" | "failed" | "selected" | "not_selected";

export interface Negotiation {
  id: string;
  project_id: string;
  developer_id: string;
  status: NegotiationStatus;
  round: number;
  max_rounds: number;
  latest_offer: Offer | null;
  agreed_offer: Offer | null;
  steering: Partial<Record<"client" | "developer", string | null>>;
  outcome_summary: string | null;
  error: string | null;
  updated_at: string;
  developer?: Developer;
  project?: Pick<Project, "id" | "title" | "status" | "budget_max" | "deadline_weeks">;
}

export interface NegEvent {
  id: number;
  seq: number;
  actor: "developer_agent" | "client_agent" | "system" | "guardrail" | "client" | "developer";
  kind: "message" | "offer" | "accept" | "walk_away" | "guardrail" | "status" | "steering";
  content: string;
  offer: Offer | null;
  audience: "all" | "client" | "developer";
  hash: string;
  prev_hash: string | null;
  created_at: string;
}

export interface NegotiationDetail {
  negotiation: Negotiation;
  side: "client" | "developer";
  project: Pick<Project, "id" | "title" | "plan" | "budget_max" | "deadline_weeks" | "status" | "client_id">;
  developer: Developer;
  events: NegEvent[];
  audit: { valid: boolean; count: number; head?: string; broken_at_seq?: number };
  running: boolean;
}

export interface ContractMilestone {
  id: string;
  title: string;
  goal: string;
  deliverables: string[];
  acceptance_criteria: string[];
  price: number;
  weeks: number;
  status: "pending" | "in_progress" | "submitted" | "changes_requested" | "approved";
}

export interface Contract {
  id: string;
  project_id: string;
  negotiation_id: string;
  developer_id: string;
  client_id: string;
  title: string;
  summary: string;
  total_price: number;
  timeline_weeks: number;
  milestones: ContractMilestone[];
  terms: {
    payment: string;
    revisions_per_milestone: number;
    start_in_days: number;
    change_requests: string;
    ip: string;
    verification: string;
    excluded_scope: string[];
  };
  status: "pending_approval" | "active" | "completed" | "cancelled";
  client_approved_at: string | null;
  developer_approved_at: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CriterionCheck {
  criterion: string;
  verdict: "met" | "not_met" | "unverifiable";
  evidence: string;
}

export interface Submission {
  id: string;
  contract_id: string;
  milestone_id: string;
  live_url: string | null;
  repo_url: string | null;
  notes: string | null;
  status: "verifying" | "verified" | "needs_work" | "approved" | "changes_requested" | "error" | "superseded";
  report: {
    checks?: CriterionCheck[];
    summary?: string;
    suggested_next_step?: string;
    counts?: { met: number; not_met: number; unverifiable: number };
    evidence_summary?: {
      live_site: { url?: string; status?: number; ms?: number; title?: string; is_https?: boolean; error?: string } | null;
      repository: { repo?: string; language?: string; recent_commits?: number; pushed_at?: string; error?: string } | null;
    };
    error?: string;
  } | null;
  client_feedback: string | null;
  created_at: string;
}

export interface ContractDetail {
  contract: Contract;
  side: "client" | "developer";
  submissions: Submission[];
  developer: Developer;
  client_name: string | null;
}

export interface Interview {
  id: string;
  transcript: { role: "agent" | "user"; content: string }[];
  extracted: Partial<{
    headline: string;
    skills: string[];
    years_experience: number | null;
    shipped_projects: ShippedProject[];
    work_style: WorkStyle;
    rate_floor: number | null;
    rate_target: number | null;
    weekly_hours: number | null;
    availability: string;
    timezone: string;
    dealbreakers: string[];
    negotiation_style: "firm" | "collaborative" | "flexible";
    bio: string;
  }>;
  progress: number;
  complete: boolean;
}

/* ---------------- workspace ---------------- */
export type MilestoneStatus = ContractMilestone["status"];

export interface ScheduleItem {
  id: string;
  title: string;
  status: MilestoneStatus;
  price: number;
  weeks: number;
  start_date: string | null;
  due_date: string | null;
  late: boolean;
  days_left: number | null;
  tasks_total: number;
  tasks_done: number;
}

export interface Schedule {
  milestones: ScheduleItem[];
  progress: number;
  paid: number;
  total: number;
  approved: number;
  count: number;
  end_date: string | null;
  health: "done" | "late" | "on_track" | "not_started";
}

export interface Task {
  id: string;
  contract_id: string;
  milestone_id: string;
  title: string;
  done: boolean;
  position: number;
  done_at: string | null;
  created_at: string;
}

export interface ProjectComment {
  id: string;
  contract_id: string;
  milestone_id: string | null;
  author_role: "client" | "developer";
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface ActivityItem {
  at: string;
  kind: "signed" | "started" | "submitted" | "verified" | "approved" | "changes" | "task" | "comment" | "decision" | "checkin" | "ack" | "change" | "amended"
    | "fund" | "release" | "refund" | "dispute" | "resolved";
  text: string;
  who: "client" | "developer" | null;
  milestone_id: string | null;
}

export interface WorkspaceData {
  contract: Contract;
  side: "client" | "developer";
  developer: Developer;
  client_name: string | null;
  schedule: Schedule;
  tasks: Task[];
  comments: ProjectComment[];
  submissions: Submission[];
  activity: ActivityItem[];
  unread_messages: number;
  check_in_due: boolean;
  changes_waiting: number;
  escrow: EscrowBalances;
  disputes: { id: string; milestone_id: string; status: DisputeStatus; opened_role: "client" | "developer" }[];
  disputes_waiting: number;
}

export interface WorkItem {
  contract_id: string;
  project_id: string;
  title: string;
  status: Contract["status"];
  developer_name: string | null;
  client_name: string | null;
  schedule: Schedule;
  escrow: { held: number; released: number; to_fund: number };
}

/* ---------------- marketplace ---------------- */
export interface Fit {
  score: number;
  reasons: string[];
  concerns: string[];
}

export interface MarketProject {
  id: string;
  title: string;
  status: ProjectStatus;
  created_at: string;
  budget_max: number | null;
  deadline_weeks: number | null;
  summary: string;
  required_skills: string[];
  milestones: number;
  hours: number;
  fit: Fit | null;
  negotiation: { id: string; status: NegotiationStatus } | null;
}

export type MarketDeveloper = Developer & { fit: Fit | null };

/* ---------------- communication ---------------- */
export interface ChatAttachment {
  path: string;
  name: string;
  type: string;
  size: number;
  url?: string | null;
}

export interface ChatMessage extends ProjectComment {
  author_id: string | null;
  attachments: ChatAttachment[];
  pinned: boolean;
  pinned_at: string | null;
}

export interface ChatThread {
  side: "client" | "developer";
  messages: ChatMessage[];
  my_last_read_at: string | null;
  other_last_read_at: string | null;
  milestones: { id: string; title: string }[];
}

export interface InboxItem {
  contract_id: string;
  title: string;
  status: Contract["status"];
  with: string | null;
  last_message: { author_id: string; author_role: "client" | "developer"; author_name: string | null; body: string; created_at: string } | null;
  unread: number;
  check_in_due: boolean;
  check_in_unacknowledged: boolean;
}

export interface CheckIn {
  id: string;
  contract_id: string;
  done: string;
  next: string;
  blockers: string;
  needs: string;
  ai_drafted: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

export interface ChangeScope {
  title: string;
  kind: "new_milestone" | "extend_milestone";
  target_milestone_id: string;
  goal: string;
  deliverables: string[];
  acceptance_criteria: string[];
  est_hours: number;
  impact: string;
}

export interface ChangeTurnEntry {
  actor: "developer_agent" | "client_agent" | "guardrail" | "system";
  kind: string;
  text: string;
  price: number | null;
  weeks: number | null;
  at: string;
}

export type ChangeStatus = "scoping" | "awaiting_client" | "negotiating" | "proposed" | "approved" | "rejected" | "withdrawn" | "impasse" | "failed";

export interface ChangeRequest {
  id: string;
  contract_id: string;
  requested_by: string | null;
  requested_role: "client" | "developer";
  title: string;
  description: string;
  source_message_id: string | null;
  status: ChangeStatus;
  max_extra_budget?: number | null;
  max_extra_weeks?: number | null;
  scope: ChangeScope | null;
  transcript: ChangeTurnEntry[];
  price_delta: number | null;
  weeks_delta: number | null;
  outcome: string | null;
  client_approved_at: string | null;
  developer_approved_at: string | null;
  applied_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscrowMilestone {
  price: number;
  funded: number;
  released: number;
  refunded: number;
  held: number;
  to_fund: number;
  fully_funded: boolean;
}

export interface EscrowBalances {
  milestones: Record<string, EscrowMilestone>;
  held: number;
  released: number;
  refunded: number;
  funded: number;
  to_fund: number;
}

export interface EscrowEntry {
  id: string;
  milestone_id: string;
  kind: "fund" | "release" | "refund";
  amount: number;
  note: string | null;
  created_at: string;
}

export interface EscrowData {
  side: "client" | "developer";
  status: string;
  balances: EscrowBalances;
  ledger: EscrowEntry[];
  milestones: { id: string; title: string; price: number; status: string }[];
}

export type DisputeStatus = "awaiting_response" | "mediating" | "proposed" | "resolved" | "rejected" | "withdrawn" | "failed";

export interface MediatorRuling {
  summary: string;
  findings: { criterion: string; finding: "met" | "not_met" | "unclear"; reasoning: string }[];
  scope_creep: boolean;
  recommendation: "approve" | "partial" | "rework";
  release_percent: number;
  rework_items: string[];
  rationale: string;
  note_to_founder: string;
  note_to_developer: string;
}

export interface Dispute {
  id: string;
  contract_id: string;
  milestone_id: string;
  opened_by: string | null;
  opened_role: "client" | "developer";
  client_statement: string | null;
  developer_statement: string | null;
  status: DisputeStatus;
  ruling: MediatorRuling | null;
  client_accepted_at: string | null;
  developer_accepted_at: string | null;
  outcome: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: string;
  contract_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
