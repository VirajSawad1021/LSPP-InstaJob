import type { ProjectStatus } from "./types";

export const projectStatus: Record<ProjectStatus, { label: string; tone: "neutral" | "good" | "warn" | "info" | "dark" }> = {
  clarifying: { label: "Draft: answer questions", tone: "warn" },
  planned: { label: "Plan ready: publish", tone: "warn" },
  open: { label: "Matched: start negotiating", tone: "info" },
  negotiating: { label: "Agents negotiating", tone: "info" },
  contracted: { label: "Awaiting developer signature", tone: "neutral" },
  in_progress: { label: "In progress", tone: "dark" },
  completed: { label: "Completed", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
