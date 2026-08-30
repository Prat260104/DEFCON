import type { AgentAdapter, AgentEvent, AgentEventType, AdapterStatus } from "../core/types.js";
import { classify } from "../risk/classify.js";

/**
 * Claude Code adapter — translates Claude Code hook payloads into AgentEvents.
 *
 * Architecture: Claude Code hooks are one-shot shell commands invoked per event,
 * not long-running processes. So the hook script appends JSON to ~/.apl/inbox.jsonl
 * and this adapter watches that file for new lines via chokidar.
 *
 * Supported hook events:
 * - PreToolUse (Bash tool) → "working" event with the command extracted
 * - Notification → "permission_required" or "completed" based on context
 */

// ─── Claude Code Hook Payload Types ─────────────────────────────────────────

export interface ClaudeCodePreToolUsePayload {
  session_id?: string;
  cwd?: string;
  hook_event_name: "PreToolUse";
  permission_mode?: string;
  tool_name: string;
  tool_input?: {
    command?: string;
    [key: string]: unknown;
  };
}

export interface ClaudeCodeNotificationPayload {
  session_id?: string;
  cwd?: string;
  hook_event_name: "Notification";
  notification_type?: string;
  [key: string]: unknown;
}

export type ClaudeCodePayload = ClaudeCodePreToolUsePayload | ClaudeCodeNotificationPayload;

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a raw JSONL line from the inbox file into a Claude Code payload.
 * Returns null for malformed lines rather than throwing.
 */
export function parseClaudeCodePayload(line: string): ClaudeCodePayload | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;

    // Must have hook_event_name to be a valid Claude Code payload
    if (typeof obj["hook_event_name"] !== "string") return null;

    return obj as unknown as ClaudeCodePayload;
  } catch {
    return null;
  }
}

// In-memory cache to correlate PreToolUse commands with subsequent Notification events
export const claudeSessionCommandCache = new Map<
  string,
  { command: string; riskLevel?: import("../core/types.js").RiskLevel; timestamp: number }
>();

/**
 * Map a Claude Code hook payload to a normalized AgentEvent.
 * Correlates session commands from PreToolUse to subsequent Notification events.
 */
export function mapClaudeCodeEvent(
  payload: ClaudeCodePayload,
  cache = claudeSessionCommandCache,
): AgentEvent {
  const base = {
    agent: "claude-code" as const,
    sessionId: payload.session_id,
    timestamp: Date.now(),
    metadata: {
      cwd: payload.cwd,
    },
  };

  if (payload.hook_event_name === "PreToolUse") {
    const command = payload.tool_input?.command;
    const type: AgentEventType = "working";
    const riskLevel = command ? classify(command).level : undefined;

    if (payload.session_id && command) {
      cache.set(payload.session_id, { command, riskLevel, timestamp: Date.now() });
    }

    return {
      ...base,
      type,
      command,
      riskLevel,
      metadata: {
        ...base.metadata,
        toolName: payload.tool_name,
        permissionMode: payload.permission_mode,
      },
    };
  }

  // Notification events — the agent is requesting attention (e.g. permission prompt)
  let command: string | undefined;
  let riskLevel: import("../core/types.js").RiskLevel | undefined;

  if (payload.session_id && cache.has(payload.session_id)) {
    const cached = cache.get(payload.session_id);
    if (cached && Date.now() - cached.timestamp < 300_000) {
      // 5 min cache window
      command = cached.command;
      riskLevel = cached.riskLevel;
    }
  }

  return {
    ...base,
    type: "permission_required" as AgentEventType,
    command,
    riskLevel,
    metadata: {
      ...base.metadata,
      notificationType: (payload as ClaudeCodeNotificationPayload).notification_type,
    },
  };
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly name = "claude-code";

  private callbacks: Array<(event: AgentEvent) => void> = [];
  private watcher: ReturnType<typeof import("chokidar").watch> | null = null;
  private running = false;
  private lastEventAt?: number;
  private inboxPath: string;
  private lastFileSize = 0;

  constructor(inboxPath?: string) {
    this.inboxPath = inboxPath ?? `${process.env["HOME"] ?? "~"}/.apl/inbox.jsonl`;
  }

  async start(): Promise<void> {
    if (this.running) return;

    const { existsSync, mkdirSync, writeFileSync, statSync } = await import("node:fs");
    const { dirname } = await import("node:path");

    // Ensure inbox directory and file exist
    const dir = dirname(this.inboxPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.inboxPath)) {
      writeFileSync(this.inboxPath, "");
    }

    // Track current file size so we only process new lines
    try {
      this.lastFileSize = statSync(this.inboxPath).size;
    } catch {
      this.lastFileSize = 0;
    }

    // Watch for file changes with zero delay
    const chokidar = await import("chokidar");
    this.watcher = chokidar.watch(this.inboxPath, {
      persistent: true,
      ignoreInitial: true,
    });

    const onFileChange = () => {
      this.processNewLines().catch((err) => {
        console.error("[claude-code adapter] Error processing inbox:", err);
      });
    };

    this.watcher.on("change", onFileChange);
    this.watcher.on("add", onFileChange);

    await new Promise<void>((resolve) => {
      if (this.watcher) {
        this.watcher.on("ready", () => resolve());
      } else {
        resolve();
      }
    });

    this.running = true;
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.running = false;
  }

  async getStatus(): Promise<AdapterStatus> {
    return {
      running: this.running,
      lastEventAt: this.lastEventAt,
    };
  }

  onEvent(callback: (event: AgentEvent) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Read only the new bytes appended since the last read, split into lines,
   * parse, and emit events.
   */
  private async processNewLines(): Promise<void> {
    const { openSync, readSync, closeSync, statSync } = await import("node:fs");

    let stat;
    try {
      stat = statSync(this.inboxPath);
    } catch {
      return;
    }

    const currentSize = stat.size;
    if (currentSize <= this.lastFileSize) {
      // File was truncated or unchanged
      this.lastFileSize = currentSize;
      return;
    }

    const bytesToRead = currentSize - this.lastFileSize;
    const buffer = Buffer.alloc(bytesToRead);

    const fd = openSync(this.inboxPath, "r");
    try {
      readSync(fd, buffer, 0, bytesToRead, this.lastFileSize);
    } finally {
      closeSync(fd);
    }

    this.lastFileSize = currentSize;

    const newContent = buffer.toString("utf-8");
    const lines = newContent.split("\n");

    for (const line of lines) {
      const payload = parseClaudeCodePayload(line);
      if (!payload) continue;

      const event = mapClaudeCodeEvent(payload);
      this.lastEventAt = event.timestamp;

      for (const cb of this.callbacks) {
        try {
          cb(event);
        } catch (err) {
          console.error("[claude-code adapter] Callback error:", err);
        }
      }
    }
  }
}
