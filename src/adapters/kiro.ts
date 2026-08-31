import { readFileSync, existsSync, mkdirSync, createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import chokidar, { type FSWatcher } from "chokidar";
import type { AgentAdapter, AgentEvent, AgentEventType, AdapterStatus } from "../core/types.js";
import { classify } from "../risk/classify.js";
import { resolvePolicy, type PolicyConfig } from "../risk/policy.js";
import { loadConfig } from "../cli/configManager.js";

/**
 * Kiro IDE Adapter — Universal Dual-Mode Observer
 *
 * 1. GUI Transcript Observer Mode:
 *    Kiro IDE streams live chat messages to:
 *    ~/.kiro/sessions/<workspaceHash>/sess_<uuid>/messages.jsonl
 *    When a tool is blocked awaiting developer approval in the IDE UI, Kiro writes a
 *    `pending_interaction` entry with `interactionType: "tool_approval"` and `question: "<command>"`.
 *
 * 2. Shell Hook Relay Mode:
 *    For headless tasks or agentic scripts, Kiro triggers `.kiro/hooks/*.json` which appends
 *    events to ~/.apl/inbox.jsonl.
 */

// ─── Kiro GUI Transcript Parser ─────────────────────────────────────────────

export interface KiroPendingCheckResult {
  isPending: boolean;
  command?: string;
  toolCallId?: string;
  sessionId?: string;
  isWhitelisted?: boolean;
  reason?: string;
}

export function checkKiroSessionPending(
  messagesPath: string,
  policyConfig?: PolicyConfig,
): KiroPendingCheckResult {
  if (!existsSync(messagesPath)) {
    return { isPending: false };
  }

  try {
    const content = readFileSync(messagesPath, "utf-8").trim();
    if (!content) return { isPending: false };

    const lines = content.split("\n").filter(Boolean);
    if (lines.length === 0) return { isPending: false };

    // Search backwards from the end of the session transcript
    let pendingToolCallId: string | undefined;
    let pendingCommand: string | undefined;

    const resolvedToolCallIds = new Set<string>();

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line) continue;

      try {
        const msg = JSON.parse(line);
        const payload = msg.payload;
        if (!payload || typeof payload !== "object") continue;

        // If a tool result arrived, mark that toolCallId as resolved
        if (payload.type === "tool_result" && typeof payload.toolCallId === "string") {
          resolvedToolCallIds.add(payload.toolCallId);
        }

        // If a turn ended or session paused before resolving, cancel
        if (payload.type === "turn_end" && payload.stopReason === "cancelled") {
          // If turn cancelled without a pending interaction after it, nothing is pending
          if (!pendingToolCallId) {
            return { isPending: false };
          }
        }

        // Check for pending interaction (tool_approval)
        if (
          payload.type === "pending_interaction" &&
          payload.interactionType === "tool_approval" &&
          typeof payload.question === "string"
        ) {
          const toolCallId = payload.toolCallId || payload.executionId;
          if (!toolCallId || !resolvedToolCallIds.has(toolCallId)) {
            pendingToolCallId = toolCallId;
            pendingCommand = payload.question;
            break; // Found the active pending tool
          }
        }
      } catch {
        // Skip malformed line
        continue;
      }
    }

    if (pendingCommand) {
      const config = policyConfig || loadConfig();
      const policyDecision = resolvePolicy(pendingCommand, config);
      const isWhitelisted = policyDecision.isWhitelisted;

      return {
        isPending: true,
        command: pendingCommand,
        toolCallId: pendingToolCallId,
        isWhitelisted,
        reason: isWhitelisted ? "Command is whitelisted (tracked with safety-net timeout)" : undefined,
      };
    }
  } catch (fileErr) {
    console.error("[kiroAdapter] Failed to read messages file:", fileErr);
  }

  return { isPending: false };
}

// ─── Kiro Shell Hook Payload Types & Parsers ────────────────────────────────

export interface KiroHookPayload {
  agent?: "kiro" | "kiro-ide" | string;
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  event?: string;
  trigger?: string;
  tool_name?: string;
  tool_input?: { command?: string; [key: string]: unknown };
  command?: string;
  status?: string;
  notification_type?: string;
  [key: string]: unknown;
}

export function parseKiroPayload(line: string): KiroHookPayload | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    const isKiroAgent = obj["agent"] === "kiro" || obj["agent"] === "kiro-ide";

    if (isKiroAgent) {
      return obj as KiroHookPayload;
    }

    const source = obj["source"] ?? obj["client"];
    if (source === "kiro" || source === "kiro-ide") {
      return obj as KiroHookPayload;
    }

    return null;
  } catch {
    return null;
  }
}

export const kiroSessionCommandCache = new Map<
  string,
  { command: string; riskLevel?: import("../core/types.js").RiskLevel; timestamp: number }
>();

export function mapKiroEvent(
  payload: KiroHookPayload,
  cache = kiroSessionCommandCache,
): AgentEvent {
  const base = {
    agent: "kiro" as const,
    sessionId: payload.session_id,
    timestamp: Date.now(),
    metadata: {
      cwd: payload.cwd,
      toolName: payload.tool_name,
    },
  };

  const hookEvent = payload.hook_event_name || payload.event || payload.trigger;
  const isPreTool =
    hookEvent === "PreToolUse" ||
    hookEvent === "ToolExecution" ||
    hookEvent === "BeforeTool" ||
    payload.tool_input !== undefined ||
    payload.command !== undefined;

  if (isPreTool) {
    const command =
      typeof payload.tool_input?.command === "string"
        ? payload.tool_input.command
        : typeof payload.command === "string"
          ? payload.command
          : undefined;

    const riskLevel = command ? classify(command).level : undefined;
    const type: AgentEventType =
      payload.status === "pending" ? "permission_required" : "working";

    if (payload.session_id && command) {
      cache.set(payload.session_id, { command, riskLevel, timestamp: Date.now() });
    }

    return {
      ...base,
      type,
      command,
      riskLevel,
    };
  }

  const isPermissionRequired =
    hookEvent === "PermissionRequired" ||
    payload.notification_type === "permission_prompt" ||
    payload.status === "pending";

  const isCompleted =
    hookEvent === "Completed" ||
    hookEvent === "AfterTool" ||
    payload.status === "completed" ||
    payload.status === "approved" ||
    payload.status === "denied";

  if (isPermissionRequired) {
    const cached = payload.session_id ? cache.get(payload.session_id) : undefined;
    return {
      ...base,
      type: "permission_required",
      command: cached?.command,
      riskLevel: cached?.riskLevel,
    };
  }

  if (isCompleted) {
    const cached = payload.session_id ? cache.get(payload.session_id) : undefined;
    if (payload.session_id) cache.delete(payload.session_id);
    return {
      ...base,
      type: "completed",
      command: cached?.command,
      riskLevel: cached?.riskLevel,
    };
  }

  return {
    ...base,
    type: "working",
  };
}

// ─── Kiro Adapter Main Class ────────────────────────────────────────────────

export class KiroAdapter implements AgentAdapter {
  readonly name = "kiro";
  private running = false;
  private lastEventAt?: number;
  private sessionWatcher?: FSWatcher;
  private inboxWatcher?: FSWatcher;
  private lastInboxOffset = 0;
  private callbacks: Array<(event: AgentEvent) => void> = [];
  private pendingSessions = new Set<string>();

  private readonly kiroSessionsDir: string;
  private readonly inboxPath: string;

  constructor(inboxPath?: string, kiroSessionsDir?: string) {
    this.inboxPath = inboxPath || join(homedir(), ".apl", "inbox.jsonl");
    this.kiroSessionsDir = kiroSessionsDir || join(homedir(), ".kiro", "sessions");
  }

  onEvent(callback: (event: AgentEvent) => void): void {
    this.callbacks.push(callback);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // 1. Start Session Transcript Watcher (GUI Mode)
    if (!existsSync(this.kiroSessionsDir)) {
      try {
        mkdirSync(this.kiroSessionsDir, { recursive: true });
      } catch {}
    }

    this.sessionWatcher = chokidar.watch(this.kiroSessionsDir, {
      persistent: true,
      ignoreInitial: false,
      depth: 5,
    });

    const onSessionFileEvent = (filePath: string) => {
      if (filePath.endsWith("messages.jsonl")) {
        this.processSessionTranscript(filePath);
      }
    };

    this.sessionWatcher.on("change", onSessionFileEvent);
    this.sessionWatcher.on("add", onSessionFileEvent);

    // 2. Start Inbox Hook Watcher (Relay Mode)
    if (existsSync(this.inboxPath)) {
      try {
        this.lastInboxOffset = statSync(this.inboxPath).size;
      } catch {
        this.lastInboxOffset = 0;
      }
    }

    this.inboxWatcher = chokidar.watch(this.inboxPath, {
      persistent: true,
      usePolling: true,
      interval: 100,
      ignoreInitial: false,
    });

    this.inboxWatcher.on("change", () => this.readNewInboxLines());
    this.inboxWatcher.on("add", () => {
      this.lastInboxOffset = 0;
      this.readNewInboxLines();
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.sessionWatcher) {
      await this.sessionWatcher.close();
      this.sessionWatcher = undefined;
    }

    if (this.inboxWatcher) {
      await this.inboxWatcher.close();
      this.inboxWatcher = undefined;
    }
  }

  async getStatus(): Promise<AdapterStatus> {
    return {
      running: this.running,
      lastEventAt: this.lastEventAt,
    };
  }

  private processSessionTranscript(filePath: string): void {
    // Extract session ID: ~/.kiro/sessions/<workspaceHash>/sess_<uuid>/messages.jsonl
    const match = filePath.match(/sess_([^/]+)\/messages\.jsonl$/);
    const sessionId = match ? match[1] : filePath;
    const sessionKey = `kiro:${sessionId}`;

    const check = checkKiroSessionPending(filePath);
    const wasPending = this.pendingSessions.has(sessionKey);

    if (check.isPending && check.command) {
      this.pendingSessions.add(sessionKey);
      this.lastEventAt = Date.now();

      const riskResult = classify(check.command);
      const event: AgentEvent = {
        agent: "kiro",
        sessionId,
        type: "permission_required",
        command: check.command,
        riskLevel: riskResult.level,
        timestamp: this.lastEventAt,
        metadata: {
          toolCallId: check.toolCallId,
          isWhitelisted: check.isWhitelisted,
          transcriptPath: filePath,
        },
      };

      for (const cb of this.callbacks) {
        cb(event);
      }
    } else if (wasPending && !check.isPending) {
      this.pendingSessions.delete(sessionKey);
      this.lastEventAt = Date.now();

      const event: AgentEvent = {
        agent: "kiro",
        sessionId,
        type: "completed",
        timestamp: this.lastEventAt,
        metadata: {
          transcriptPath: filePath,
        },
      };

      for (const cb of this.callbacks) {
        cb(event);
      }
    }
  }

  private readNewInboxLines(): void {
    if (!existsSync(this.inboxPath)) return;

    let currentSize: number;
    try {
      currentSize = statSync(this.inboxPath).size;
    } catch {
      return;
    }

    if (currentSize < this.lastInboxOffset) {
      this.lastInboxOffset = 0;
    }

    if (currentSize === this.lastInboxOffset) return;

    const stream = createReadStream(this.inboxPath, {
      start: this.lastInboxOffset,
      encoding: "utf-8",
    });

    this.lastInboxOffset = currentSize;
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      const payload = parseKiroPayload(line);
      if (payload) {
        const event = mapKiroEvent(payload);
        this.lastEventAt = Date.now();
        for (const cb of this.callbacks) {
          cb(event);
        }
      }
    });
  }
}
