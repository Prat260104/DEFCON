import type { AgentAdapter, AgentEvent, AgentEventType, AdapterStatus } from "../core/types.js";
import { classify } from "../risk/classify.js";

/**
 * Gemini CLI adapter — translates Gemini CLI hook payloads into normalized AgentEvents.
 *
 * Architecture: Gemini CLI lifecycle hooks run local scripts at defined points
 * (BeforeTool, AfterTool, Notification). The hook appends JSON to ~/.apl/inbox.jsonl,
 * tagged with `"agent": "gemini-cli"`.
 */

export interface GeminiCliBeforeToolPayload {
  event?: "BeforeTool" | "before_tool";
  agent?: "gemini-cli";
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    [key: string]: unknown;
  };
}

export interface GeminiCliNotificationPayload {
  event?: "Notification" | "notification";
  agent?: "gemini-cli";
  session_id?: string;
  cwd?: string;
  message?: string;
  type?: string;
  [key: string]: unknown;
}

export type GeminiCliPayload = GeminiCliBeforeToolPayload | GeminiCliNotificationPayload;

/**
 * Parse a raw JSONL line into a Gemini CLI payload.
 * Returns null if not a valid Gemini CLI event.
 */
export function parseGeminiCliPayload(line: string): GeminiCliPayload | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;

    // Match if agent is explicitly gemini-cli or event matches Gemini CLI lifecycle
    const isGeminiAgent = obj["agent"] === "gemini-cli";
    const hasGeminiEvent =
      obj["event"] === "BeforeTool" ||
      obj["event"] === "before_tool" ||
      obj["event"] === "Notification" ||
      obj["event"] === "notification";

    if (isGeminiAgent || hasGeminiEvent) {
      return obj as unknown as GeminiCliPayload;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Map a Gemini CLI hook payload to a normalized AgentEvent with risk classification.
 */
export function mapGeminiCliEvent(payload: GeminiCliPayload): AgentEvent {
  const base = {
    agent: "gemini-cli" as const,
    sessionId: payload.session_id,
    timestamp: Date.now(),
    metadata: {
      cwd: payload.cwd,
    },
  };

  const isBeforeTool = payload.event === "BeforeTool" || payload.event === "before_tool" || (payload as GeminiCliBeforeToolPayload).tool_input !== undefined;

  if (isBeforeTool) {
    const toolPayload = payload as GeminiCliBeforeToolPayload;
    const command = toolPayload.tool_input?.command;
    const type: AgentEventType = "working";
    const riskLevel = command ? classify(command).level : undefined;

    return {
      ...base,
      type,
      command,
      riskLevel,
      metadata: {
        ...base.metadata,
        toolName: toolPayload.tool_name,
      },
    };
  }

  // Notification event
  const notifPayload = payload as GeminiCliNotificationPayload;
  return {
    ...base,
    type: "permission_required" as AgentEventType,
    metadata: {
      ...base.metadata,
      message: notifPayload.message,
      notificationType: notifPayload.type,
    },
  };
}

/**
 * Gemini CLI adapter implementing AgentAdapter.
 */
export class GeminiCliAdapter implements AgentAdapter {
  readonly name = "gemini-cli";

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
        console.error("[gemini-cli adapter] Error processing inbox:", err);
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
      const payload = parseGeminiCliPayload(line);
      if (!payload) continue;

      const event = mapGeminiCliEvent(payload);
      this.lastEventAt = event.timestamp;

      for (const cb of this.callbacks) {
        try {
          cb(event);
        } catch (err) {
          console.error("[gemini-cli adapter] Callback error:", err);
        }
      }
    }
  }
}
