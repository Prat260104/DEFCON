import { Command } from "commander";
import { EventBus } from "../../core/eventBus.js";
import { StallAlertTimer } from "../../core/stallTimer.js";
import { ClaudeCodeAdapter } from "../../adapters/claudeCode.js";
import { GeminiCliAdapter } from "../../adapters/geminiCli.js";
import { AntigravityAdapter } from "../../adapters/antigravityTranscript.js";
import { KiroAdapter } from "../../adapters/kiro.js";
import { SqliteEventStore } from "../../storage/sqliteStore.js";
import { notify } from "../../notify/index.js";
import { loadConfig, getDefaultInboxPath } from "../configManager.js";

export function createStartCommand(): Command {
  const cmd = new Command("start");

  cmd
    .description("Start the Agent Permission Layer daemon in foreground mode")
    .option("--inbox <path>", "Custom inbox.jsonl file path")
    .action(async (options) => {
      const config = loadConfig();
      const inboxPath = options.inbox || config.inboxPath || getDefaultInboxPath();

      console.log("\n========================================================");
      console.log("  🛡️  Agent Permission Layer (APL) — Daemon Active");
      console.log("========================================================");
      console.log(`  Inbox:         ${inboxPath}`);
      console.log(`  Notifications: ${config.notifications.enabled ? "Enabled" : "Disabled"}`);
      console.log("  Press Ctrl+C to stop monitoring.\n");

      const eventBus = new EventBus();
      const storage = new SqliteEventStore();
      const stallTimer = new StallAlertTimer({
        stallAlertSeconds: config.stallAlertSeconds ?? 35,
        whitelistSafetyTimeoutSeconds: config.whitelistSafetyTimeoutSeconds ?? 75,
        repeatAlertIntervalSeconds: config.repeatAlertIntervalSeconds ?? 60,
        maxRepeatAlerts: config.maxRepeatAlerts ?? 3,
        onStallAlert: async (event, elapsedMs, escalationLevel = 1) => {
          const stallSec = Math.round(elapsedMs / 1000);
          const isDrift = Boolean(event.metadata?.["isWhitelisted"]);
          const escSuffix = escalationLevel > 1 ? ` (Escalation ${escalationLevel})` : "";

          if (isDrift) {
            console.log(`\n  ⚠️ [WHITELIST DRIFT ALERT${escSuffix}] Agent waiting ${stallSec}s on whitelisted command (${event.command})! Your whitelist or IDE auto-approve settings may have changed.`);
          } else {
            console.log(`\n  🔊 [STALL ALERT${escSuffix}] Agent has been blocked for ${stallSec}s! Firing alarm...`);
          }
        },
      });

      // Automatically record all unique events in audit log & handle stall timer
      eventBus.subscribe(async (event) => {
        try {
          await storage.save(event);
        } catch (err) {
          console.warn("[storage] Failed to save event to audit DB:", err);
        }

        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        const riskBadge =
          event.riskLevel === "high"
            ? "🔴 [HIGH]"
            : event.riskLevel === "medium"
              ? "🟡 [MED]"
              : "🟢 [LOW]";

        console.log(`  [${timestamp}] ${riskBadge} ${event.agent} | ${event.type}: ${event.command ?? "(no command)"}`);

        if (config.notifications.enabled) {
          stallTimer.handleEvent(event);
        }
      });

      // Initialize enabled adapters
      const adapters: { name: string; stop: () => Promise<void> }[] = [];

      if (config.adapters["claude-code"]) {
        const claudeAdapter = new ClaudeCodeAdapter(inboxPath);
        claudeAdapter.onEvent((event) => eventBus.emit(event));
        await claudeAdapter.start();
        adapters.push(claudeAdapter);
        console.log("  ✅ Watching Claude Code events...");
      }

      if (config.adapters["gemini-cli"]) {
        const geminiAdapter = new GeminiCliAdapter(inboxPath);
        geminiAdapter.onEvent((event) => eventBus.emit(event));
        await geminiAdapter.start();
        adapters.push(geminiAdapter);
        console.log("  ✅ Watching Gemini CLI events...");
      }

      if (config.adapters["antigravity"]) {
        const antigravityAdapter = new AntigravityAdapter();
        antigravityAdapter.onEvent((event) => eventBus.emit(event));
        await antigravityAdapter.start();
        adapters.push(antigravityAdapter);
        console.log("  ✅ Watching Antigravity events...");
      }

      if (config.adapters["kiro"] !== false) {
        const kiroAdapter = new KiroAdapter(inboxPath);
        kiroAdapter.onEvent((event) => eventBus.emit(event));
        await kiroAdapter.start();
        adapters.push(kiroAdapter);
        console.log("  ✅ Watching Kiro IDE events...");
      }

      // Graceful shutdown handling
      const cleanup = async () => {
        console.log("\n\n  Shutting down APL daemon...");
        for (const adapter of adapters) {
          await adapter.stop();
        }
        console.log("  Daemon stopped safely. Goodbye!\n");
        process.exit(0);
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      // Keep process alive
      await new Promise(() => {});
    });

  return cmd;
}
