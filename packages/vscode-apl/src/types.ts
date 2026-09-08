export type RiskLevel = "low" | "medium" | "high";

export type AgentEventType =
  | "working"
  | "permission_required"
  | "completed"
  | "idle"
  | "error";

export interface AgentEvent {
  id?: string;
  agent: string;
  type: AgentEventType;
  command?: string;
  riskLevel?: RiskLevel;
  timestamp: number;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export type StatusBarState = "active" | "inactive" | "pending_action";

export interface StatusBarDisplayInfo {
  state: StatusBarState;
  text: string;
  tooltip: string;
  command: string;
  backgroundColorKey?: "statusBarItem.warningBackground" | "statusBarItem.errorBackground";
}
