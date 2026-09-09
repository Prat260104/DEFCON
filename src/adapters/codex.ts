import type { AgentAdapter, AgentEvent, AgentEventType, AdapterStatus, RiskLevel } from "../core/types.js";
import { classify } from "../risk/classify.js";

/**
 * OpenAI Codex CLI adapter — translates Codex lifecycle hook payloads into AgentEvents.
 *
 * Architecture:
 * Codex CLI invokes lifecycle hooks (PreToolUse, PermissionRequest, PostToolUse)
 * configured in ~/.codex/hooks.json. The hook appends JSON over stdin to
 * ~/.apl/inbox.jsonl, which this adapter observes via chokidar.
 *
 * Lifecycle mapping:
 * - PreToolUse        → "working" (or caches command for subsequent prompt)
 * - PermissionRequest → "permission_required" (initiates stall timer & risk classification)
 * - PostToolUse       → "completed" (clears active stall timer)
 */

// ─── Verified Codex Hook Payload Types ─────────────────────────────────────

export interface CodexPreToolUsePayload {
  hook_event_name: "PreToolUse";
  session_id?: string;
  turn_id?: string;
  cwd?: string;
  model?: string;
  permission_mode?: string;
  tool_name: string;
  tool_use_id?: string;
  transcript_path?: string | null;
  tool_input?: {
    command?: string;
    cmd?: string;
    [key: string]: unknown;
  } | unknown;
  agent?: string;
  [key: string]: unknown;
}

export interface CodexPermissionRequestPayload {
  hook_event_name: "PermissionRequest";
  session_id?: string;
  turn_id?: string;
  cwd?: string;
  model?: string;
  permission_mode?: string;
  tool_name: string;
  transcript_path?: string | null;
  tool_input?: {
    command?: string;
    cmd?: string;
    [key: string]: unknown;
  } | unknown;
  agent?: string;
  [key: string]: unknown;
}

export interface CodexPostToolUsePayload {
  hook_event_name: "PostToolUse";
  session_id?: string;
  turn_id?: string;
  cwd?: string;
  model?: string;
  permission_mode?: string;
  tool_name: string;
  tool_use_id?: string;
  tool_response?: unknown;
  transcript_path?: string | null;
  tool_input?: unknown;
  agent?: string;
  [key: string]: unknown;
}

export type CodexPayload =
  | CodexPreToolUsePayload
  | CodexPermissionRequestPayload
  | CodexPostToolUsePayload;

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a raw JSONL line from the inbox file into a Codex payload.
 * Returns null for malformed or non-Codex lines.
 */
export function parseCodexPayload(line: string): CodexPayload | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    const eventName = obj["hook_event_name"];

    // Codex hook events
    if (eventName === "PermissionRequest" || eventName === "PostToolUse") {
      return obj as unknown as CodexPayload;
    }

    if (eventName === "PreToolUse") {
      // Differentiate from Claude Code's PreToolUse
      const isCodex =
        obj["agent"] === "codex" ||
        "turn_id" in obj ||
        "transcript_path" in obj ||
        "model" in obj ||
        ("permission_mode" in obj &&
          ["default", "acceptEdits", "plan", "dontAsk", "bypassPermissions"].includes(
            String(obj["permission_mode"]),
          ));

      if (isCodex) {
        return obj as unknown as CodexPayload;
      }
    }

    // Explicitly tagged codex agent with recognized hook events
    if (
      obj["agent"] === "codex" &&
      typeof eventName === "string" &&
      ["PreToolUse", "PermissionRequest", "PostToolUse"].includes(eventName)
    ) {
      return obj as unknown as CodexPayload;
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Event Mapper ───────────────────────────────────────────────────────────

/** Session command cache for correlating PreToolUse and PermissionRequest */
export const codexSessionCommandCache = new Map<
  string,
  { command?: string; riskLevel?: RiskLevel; timestamp: number }
>();

function extractCommand(toolInput: unknown): string | undefined {
  if (!toolInput) return undefined;
  if (typeof toolInput === "string") return toolInput;
  if (typeof toolInput === "object") {
    const obj = toolInput as Record<string, unknown>;
    if (typeof obj["command"] === "string") return obj["command"];
    if (typeof obj["cmd"] === "string") return obj["cmd"];
  }
  return undefined;
}

/**
 * Map a parsed Codex payload to a canonical AgentEvent.
 */
export function mapCodexEvent(
  payload: CodexPayload,
  cache = codexSessionCommandCache,
): AgentEvent {
  const base = {
    agent: "codex" as const,
    sessionId: payload.session_id,
    timestamp: Date.now(),
    metadata: {
      cwd: payload.cwd,
      turnId: payload.turn_id,
      model: payload.model,
      toolName: payload.tool_name,
    },
  };

  const command = extractCommand(payload.tool_input);
  const riskLevel = command ? classify(command).level : undefined;

  // Cache command if available
  if (payload.session_id && command) {
    cache.set(payload.session_id, {
      command,
      riskLevel,
      timestamp: Date.now(),
    });
  }

  if (payload.hook_event_name === "PermissionRequest") {
    // If command wasn't in PermissionRequest tool_input, fallback to cached command
    let finalCommand = command;
    let finalRisk = riskLevel;

    if (!finalCommand && payload.session_id && cache.has(payload.session_id)) {
      const cached = cache.get(payload.session_id);
      if (cached && Date.now() - cached.timestamp < 300_000) {
        finalCommand = cached.command;
        finalRisk = cached.riskLevel;
      }
    }

    return {
      ...base,
      type: "permission_required" as AgentEventType,
      command: finalCommand,
      riskLevel: finalRisk,
      metadata: {
        ...base.metadata,
        permissionMode: payload.permission_mode,
      },
    };
  }

  if (payload.hook_event_name === "PostToolUse") {
    return {
      ...base,
      type: "completed" as AgentEventType,
      command,
      riskLevel,
      metadata: {
        ...base.metadata,
        toolUseId: payload.tool_use_id,
      },
    };
  }

  // PreToolUse: if command requires confirmation (medium/high risk or not bypassed),
  // Codex is stopped waiting for user approval in the terminal!
  const isBypass =
    payload.permission_mode === "bypassPermissions" ||
    payload.permission_mode === "dontAsk";
  const isPendingApproval = !isBypass && (riskLevel === "medium" || riskLevel === "high");

  return {
    ...base,
    type: isPendingApproval ? ("permission_required" as AgentEventType) : ("working" as AgentEventType),
    command,
    riskLevel,
    metadata: {
      ...base.metadata,
      toolUseId: payload.tool_use_id,
      permissionMode: payload.permission_mode,
    },
  };
}

// ─── CodexAdapter Class ─────────────────────────────────────────────────────

export class CodexAdapter implements AgentAdapter {
  readonly name = "codex";

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

    const dir = dirname(this.inboxPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.inboxPath)) {
      writeFileSync(this.inboxPath, "");
    }

    try {
      this.lastFileSize = statSync(this.inboxPath).size;
    } catch {
      this.lastFileSize = 0;
    }

    const chokidar = await import("chokidar");
    this.watcher = chokidar.watch(this.inboxPath, {
      persistent: true,
      ignoreInitial: true,
    });

    const onFileChange = () => {
      this.processNewLines().catch((err) => {
        console.error("[codex adapter] Error processing inbox:", err);
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
      const payload = parseCodexPayload(line);
      if (!payload) continue;

      const event = mapCodexEvent(payload);
      this.lastEventAt = event.timestamp;

      for (const cb of this.callbacks) {
        try {
          cb(event);
        } catch (err) {
          console.error("[codex adapter] Callback error:", err);
        }
      }
    }
  }
}
