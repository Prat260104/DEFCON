// ─── Risk Levels ─────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";

// ─── Agent Event Model ──────────────────────────────────────────────────────

export type AgentEventType = "working" | "permission_required" | "completed" | "error";

export interface AgentEvent {
  /** The lifecycle state this event represents. */
  type: AgentEventType;

  /** Normalized agent identifier (e.g. "claude-code", "gemini-cli", "codex"). */
  agent: string;

  /** The raw command or tool input, if applicable. */
  command?: string;

  /** Risk classification — set by the risk engine, never by the adapter. */
  riskLevel?: RiskLevel;

  /** Agent session identifier for grouping related events. */
  sessionId?: string;

  /** Event timestamp in epoch milliseconds. */
  timestamp: number;

  /** Adapter-specific metadata that doesn't fit the normalized model. */
  metadata?: Record<string, unknown>;
}

// ─── Agent Adapter Interface ────────────────────────────────────────────────

export interface AdapterStatus {
  running: boolean;
  lastEventAt?: number;
}

export interface AgentAdapter {
  /** Human-readable adapter name (e.g. "claude-code"). */
  readonly name: string;

  /** Start watching for agent events. */
  start(): Promise<void>;

  /** Stop watching and clean up resources. */
  stop(): Promise<void>;

  /** Get current adapter status. */
  getStatus(): Promise<AdapterStatus>;

  /** Register a callback that receives normalized agent events. */
  onEvent(callback: (event: AgentEvent) => void): void;
}

// ─── Event Bus Types ────────────────────────────────────────────────────────

export type EventSubscriber = (event: AgentEvent) => void;

// ─── Storage Interface ──────────────────────────────────────────────────────

export interface EventStore {
  /** Persist an event. */
  save(event: AgentEvent): Promise<void>;

  /** Query recent events with optional filters. */
  query(options?: EventQueryOptions): Promise<AgentEvent[]>;
}

export interface EventQueryOptions {
  limit?: number;
  agent?: string;
  riskLevel?: RiskLevel;
  since?: number;
}
