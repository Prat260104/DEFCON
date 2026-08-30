import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Proof of Concept: Real-Time Antigravity Transcript Observer
 *
 * Antigravity IDE streams conversation steps to:
 * ~/.gemini/antigravity-ide/brain/<conv-id>/.system_generated/logs/transcript.jsonl
 *
 * By inspecting the latest line:
 * - If last step is PLANNER_RESPONSE with tool_calls and no subsequent step,
 *   the IDE is currently rendering an "Allow/Deny" prompt on screen!
 */
import { resolvePolicy, DEFAULT_POLICY_CONFIG, type PolicyConfig } from "../risk/policy.js";
import { loadConfig } from "../cli/configManager.js";

export interface PendingApprovalResult {
  isPending: boolean;
  toolName?: string;
  command?: string;
  args?: unknown;
  isWhitelisted?: boolean;
  reason?: string;
}

export function checkAntigravityPendingApproval(
  transcriptPath: string,
  policyConfig?: PolicyConfig,
): PendingApprovalResult {
  if (!existsSync(transcriptPath)) {
    return { isPending: false };
  }

  try {
    const content = readFileSync(transcriptPath, "utf-8").trim();
    const lines = content.split("\n").filter(Boolean);
    if (lines.length === 0) return { isPending: false };

    const lastLine = lines[lines.length - 1];
    if (!lastLine) return { isPending: false };

    try {
      const step = JSON.parse(lastLine);
      if (step.type === "PLANNER_RESPONSE" && Array.isArray(step.tool_calls) && step.tool_calls.length > 0) {
        const toolCall = step.tool_calls[0];
        const command =
          (toolCall.args?.CommandLine as string) ||
          (toolCall.args?.command as string) ||
          `tool:${toolCall.name}`;

        // Check if command is on whitelist
        const config = policyConfig || loadConfig();
        const policyDecision = resolvePolicy(command, config);
        const isWhitelisted = policyDecision.isWhitelisted;

        return {
          isPending: true,
          toolName: toolCall.name,
          command,
          args: toolCall.args,
          isWhitelisted,
          reason: isWhitelisted ? "Command is whitelisted (tracked with safety-net timeout)" : undefined,
        };
      }
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) {
        // Expected partial write during concurrent appends — ignore silently
        return { isPending: false };
      }
      console.error("[antigravityTranscript] Unexpected step parsing error:", parseErr);
    }
  } catch (fileErr) {
    // Log unexpected file read or permission errors rather than swallowing silently
    console.error("[antigravityTranscript] Failed to read transcript file:", fileErr);
  }

  return { isPending: false };
}

import type { AgentAdapter, AgentEvent, AdapterStatus } from "../core/types.js";
import { classify } from "../risk/classify.js";

export class AntigravityAdapter implements AgentAdapter {
  readonly name = "antigravity";

  private callbacks: Array<(event: AgentEvent) => void> = [];
  private watcher: ReturnType<typeof import("chokidar").watch> | null = null;
  private running = false;
  private lastEventAt?: number;
  private brainDir: string;
  private pendingSessions = new Set<string>();

  constructor(brainDir?: string) {
    this.brainDir = brainDir ?? join(homedir(), ".gemini", "antigravity-ide", "brain");
  }

  async start(): Promise<void> {
    if (this.running) return;

    const { existsSync, mkdirSync } = await import("node:fs");
    if (!existsSync(this.brainDir)) {
      mkdirSync(this.brainDir, { recursive: true });
    }

    const chokidar = await import("chokidar");

    this.watcher = chokidar.watch(this.brainDir, {
      persistent: true,
      ignoreInitial: false,
      depth: 5,
    });

    const onFileEvent = (filePath: string) => {
      if (filePath.endsWith("transcript.jsonl")) {
        this.processTranscript(filePath);
      }
    };

    this.watcher.on("change", onFileEvent);
    this.watcher.on("add", onFileEvent);

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

  private processTranscript(filePath: string): void {
    // Extract conversation ID from path: .../<conv-id>/.system_generated/logs/transcript.jsonl
    const match = filePath.match(/([^/]+)\/\.system_generated\/logs\/transcript\.jsonl$/);
    const convId = match ? match[1] : undefined;
    const sessionKey = convId ?? filePath;

    const check = checkAntigravityPendingApproval(filePath);
    const wasPending = this.pendingSessions.has(sessionKey);

    if (check.isPending && check.command) {
      this.pendingSessions.add(sessionKey);
      this.lastEventAt = Date.now();

      const riskResult = classify(check.command);
      const event: AgentEvent = {
        agent: "antigravity",
        sessionId: convId,
        type: "permission_required",
        command: check.command,
        riskLevel: riskResult.level,
        timestamp: this.lastEventAt,
        metadata: {
          toolName: check.toolName,
          isWhitelisted: check.isWhitelisted,
          transcriptPath: filePath,
        },
      };

      for (const cb of this.callbacks) {
        cb(event);
      }
    } else if (wasPending && !check.isPending) {
      // User responded or command completed — notify resolution to cancel stall timer
      this.pendingSessions.delete(sessionKey);
      this.lastEventAt = Date.now();

      const event: AgentEvent = {
        agent: "antigravity",
        sessionId: convId,
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
}
