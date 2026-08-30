#!/usr/bin/env node

/**
 * Antigravity IDE & Kiro IDE Lifecycle Hook Adapter for APL.
 *
 * Implements Antigravity PreToolUse contract:
 * - Reads JSON payload from stdin
 * - Classifies tool call risk and matches against APL approval policies
 * - Emits event to ~/.apl/inbox.jsonl for central daemon tracking & stall detection
 * - Outputs JSON decision to stdout:
 *     - "deny": Hard blocks blacklisted / critical commands BEFORE the Allow button appears
 *     - "force_ask": Forces interactive prompt with high-risk badge and reason
 *     - "allow": Whitelisted/safe commands
 *     - "ask": Standard prompt
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { classify } from "../risk/classify.js";
import { resolvePolicy } from "../risk/policy.js";
import { getDefaultInboxPath, loadConfig } from "../cli/configManager.js";
import type { AgentEvent } from "../core/types.js";

interface AntigravityHookInput {
  toolCall?: {
    name?: string;
    args?: {
      CommandLine?: string;
      command?: string;
      [key: string]: unknown;
    };
  };
  stepIdx?: number;
  conversationId?: string;
  workspacePaths?: string[];
  [key: string]: unknown;
}

interface AntigravityHookOutput {
  decision: "allow" | "deny" | "ask" | "force_ask";
  reason?: string;
  permissionOverrides?: string[];
}

export function processAntigravityHook(rawInput: string): AntigravityHookOutput {
  let parsed: AntigravityHookInput;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    return { decision: "ask" };
  }

  const toolName = parsed.toolCall?.name || "run_command";
  const command =
    parsed.toolCall?.args?.CommandLine ||
    parsed.toolCall?.args?.command ||
    `tool:${toolName}`;

  const config = loadConfig();
  const riskResult = classify(command);
  const policyResult = resolvePolicy(command, config);

  // Relay event to central inbox for daemon stall timer and audit
  try {
    const inboxPath = config.inboxPath || getDefaultInboxPath();
    const dir = dirname(inboxPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const event: AgentEvent = {
      agent: "antigravity",
      type: "permission_required",
      command,
      riskLevel: riskResult.level,
      timestamp: Date.now(),
      metadata: {
        toolName,
        stepIdx: parsed.stepIdx,
        conversationId: parsed.conversationId,
        label: riskResult.label,
      },
    };

    appendFileSync(inboxPath, JSON.stringify(event) + "\n", "utf-8");
  } catch (err) {
    // Relaying must not crash the hook
    console.error("[antigravity-hook] Failed to write to inbox:", err);
  }

  // 1. Hard Block (Blacklisted / Critical Policy)
  if (policyResult.action === "block") {
    return {
      decision: "deny",
      reason: `🚨 BLOCKED BY APL: ${policyResult.reason || "Command matched security blacklist"}`,
    };
  }

  // 2. Auto-approve if action resolved to auto-approve by policy
  if (policyResult.action === "auto-approve") {
    return {
      decision: "allow",
      reason: `APL: Auto-approved (${policyResult.reason || "Whitelisted"})`,
    };
  }

  // 3. High Risk: Force explicit confirmation with alert banner
  if (riskResult.level === "high") {
    return {
      decision: "force_ask",
      reason: `🔴 APL HIGH RISK (${riskResult.label || "Destructive operation detected"})`,
    };
  }

  // 4. Medium Risk: Prompt with warning
  if (riskResult.level === "medium") {
    return {
      decision: "ask",
      reason: `🟡 APL MEDIUM RISK: ${riskResult.label || "System modification"}`,
    };
  }

  return {
    decision: "ask",
    reason: `🟢 APL LOW RISK`,
  };
}

async function main() {
  let buffer = "";
  process.stdin.setEncoding("utf-8");

  for await (const chunk of process.stdin) {
    buffer += chunk;
  }

  if (!buffer.trim()) {
    process.stdout.write(JSON.stringify({ decision: "ask" }) + "\n");
    return;
  }

  const result = processAntigravityHook(buffer);
  process.stdout.write(JSON.stringify(result) + "\n");
}

if (process.argv[1]?.endsWith("antigravity.js") || process.argv[1]?.endsWith("antigravity.ts")) {
  main().catch((err) => {
    console.error("[antigravity-hook] Execution error:", err);
    process.stdout.write(JSON.stringify({ decision: "ask" }) + "\n");
  });
}
