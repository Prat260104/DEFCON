import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exec } from "node:child_process";
import { resolvePolicy } from "../risk/policy.js";
import { classify } from "../risk/classify.js";
import { notify } from "../notify/index.js";
import { SqliteEventStore } from "../storage/sqliteStore.js";
import { loadConfig } from "../cli/configManager.js";
import type { AgentEvent } from "../core/types.js";

/**
 * Creates and configures the Agent Permission Layer MCP Server.
 */
export function createAplMcpServer(storage?: SqliteEventStore): McpServer {
  const server = new McpServer({
    name: "agent-permission-layer",
    version: "0.1.0",
  });

  const eventStore = storage ?? new SqliteEventStore();

  // ─── Tool 1: apl_execute_command ───────────────────────────────────────────
  server.tool(
    "apl_execute_command",
    "Executes a shell command guarded by APL's deterministic risk engine and approval policy. Intercepts dangerous commands, triggers audio alerts, and logs to the local audit trail.",
    {
      command: z.string().describe("The shell command to evaluate and execute"),
      cwd: z.string().optional().describe("Working directory for command execution"),
      timeoutMs: z
        .number()
        .optional()
        .describe("Execution timeout in milliseconds (default: 60000ms)"),
    },
    async ({ command, cwd, timeoutMs }) => {
      const config = loadConfig();
      const policyConfig = {
        policies: config.policies,
        whitelist: config.whitelist,
        blacklist: config.blacklist,
      };

      // 1. Evaluate policy and risk level
      const decision = resolvePolicy(command, policyConfig);

      const event: AgentEvent = {
        agent: "mcp-client",
        type: "working",
        command,
        riskLevel: decision.riskLevel,
        timestamp: Date.now(),
        metadata: {
          cwd,
          policyAction: decision.action,
          isBlacklisted: decision.isBlacklisted,
          isWhitelisted: decision.isWhitelisted,
        },
      };

      // 2. Trigger audio cue & notification (non-blocking)
      notify(event).catch(() => {});

      // 3. Check for active block
      if (decision.action === "block") {
        await eventStore.save({
          ...event,
          type: "error",
          metadata: { ...event.metadata, blocked: true, reason: decision.reason },
        });

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `🚨 BLOCKED BY APL SECURITY POLICY\nReason: ${decision.reason}\nRisk Level: ${decision.riskLevel.toUpperCase()}\nCommand: ${command}\n\nExecution was aborted by APL guardrails.`,
            },
          ],
        };
      }

      // 4. Execute the command
      return new Promise((resolve) => {
        const timeout = timeoutMs ?? 60000;

        exec(command, { cwd, timeout }, async (error, stdout, stderr) => {
          const success = !error;
          const statusType = success ? "completed" : "error";

          await eventStore.save({
            ...event,
            type: statusType,
            metadata: {
              ...event.metadata,
              exitCode: error ? (error.code ?? 1) : 0,
            },
          });

          const outputText = [
            stdout ? `STDOUT:\n${stdout.trim()}` : "",
            stderr ? `STDERR:\n${stderr.trim()}` : "",
            error ? `ERROR:\n${error.message}` : "",
          ]
            .filter(Boolean)
            .join("\n\n");

          resolve({
            isError: !success,
            content: [
              {
                type: "text" as const,
                text: outputText || "(Command completed with no output)",
              },
            ],
          });
        });
      });
    },
  );

  // ─── Tool 2: apl_check_permission ─────────────────────────────────────────
  server.tool(
    "apl_check_permission",
    "Pre-flight inspects a proposed shell command to return its deterministic risk classification and policy decision without executing it.",
    {
      command: z.string().describe("The shell command to inspect"),
    },
    async ({ command }) => {
      const config = loadConfig();
      const policyConfig = {
        policies: config.policies,
        whitelist: config.whitelist,
        blacklist: config.blacklist,
      };

      const decision = resolvePolicy(command, policyConfig);
      const classification = classify(command);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                command,
                riskLevel: decision.riskLevel,
                action: decision.action,
                label: classification.label,
                reason: decision.reason,
                isBlacklisted: decision.isBlacklisted,
                isWhitelisted: decision.isWhitelisted,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}
