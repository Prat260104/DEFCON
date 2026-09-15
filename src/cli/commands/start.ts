import { Command } from "commander";
import { EventBus } from "../../core/eventBus.js";
import { StallAlertTimer } from "../../core/stallTimer.js";
import { ClaudeCodeAdapter } from "../../adapters/claudeCode.js";
import { GeminiCliAdapter } from "../../adapters/geminiCli.js";
import { AntigravityAdapter } from "../../adapters/antigravityTranscript.js";
import { KiroAdapter } from "../../adapters/kiro.js";
import { CodexAdapter } from "../../adapters/codex.js";
import { SqliteEventStore } from "../../storage/sqliteStore.js";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfig, getDefaultInboxPath, saveConfig } from "../configManager.js";
import { AplWebSocketServer } from "../../server/websocket.js";
import { TrayManager } from "../../core/trayManager.js";
import { resolveSoundForEvent, playAudio, importSoundFile } from "../../notify/soundManager.js";
import { notify } from "../../notify/index.js";
import { sanitizePath } from "../../core/pathSanitizer.js";
import type { AgentEvent, RiskLevel } from "../../core/types.js";
import type { SoundTier } from "../configManager.js";

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
      console.log(`  Inbox:         ${sanitizePath(inboxPath)}`);
      console.log(`  Notifications: ${config.notifications.enabled ? "Enabled" : "Disabled"}`);
      console.log("  Press Ctrl+C to stop monitoring.\n");

      const eventBus = new EventBus();
      const storage = new SqliteEventStore();
      let latestPendingEvent: AgentEvent | null = null;

      // 1. Initialize WebSocket Server for Tray Companion & external tools
      const wsServer = new AplWebSocketServer({
        port: 48123,
        getActiveState: () => ({ active: true, pendingEvent: latestPendingEvent }),
      });
      try {
        await wsServer.start();
        console.log(`  WebSocket:     ws://127.0.0.1:48123 (Loopback event stream)`);
      } catch (err) {
        console.warn(`  ⚠️  WebSocket server failed to start:`, err);
      }

      // 2. Initialize Tray Companion Manager
      const trayManager = new TrayManager({ verbose: true });

      const stallTimer = new StallAlertTimer({
        stallAlertSeconds: config.stallAlertSeconds ?? 35,
        whitelistSafetyTimeoutSeconds: config.whitelistSafetyTimeoutSeconds ?? 75,
        repeatAlertIntervalSeconds: config.repeatAlertIntervalSeconds ?? 60,
        maxRepeatAlerts: config.maxRepeatAlerts ?? 3,
        config: config, // Pass config for custom sound resolution
        onStallAlert: async (event, elapsedMs, escalationLevel = 1) => {
          const stallSec = Math.round(elapsedMs / 1000);
          const isDrift = Boolean(event.metadata?.["isWhitelisted"]);
          const escSuffix = escalationLevel > 1 ? ` (Escalation ${escalationLevel})` : "";

          // Resolve the ACTUAL sound name matching what resolveSoundForEvent / notify will play
          const stallEvent: AgentEvent = {
            ...event,
            metadata: {
              ...event.metadata,
              isStallAlert: true,
              stallSeconds: stallSec,
              escalationLevel,
            },
          };
          const { soundName } = resolveSoundForEvent(stallEvent, config);

          // Broadcast stall alert over WebSocket with the resolved sound name
          wsServer.broadcast({
            type: "stall",
            level: escalationLevel,
            seconds: stallSec,
            sound: soundName,
          });

          if (isDrift) {
            console.log(
              `\n  ⚠️ [WHITELIST DRIFT ALERT${escSuffix}] Agent waiting ${stallSec}s on whitelisted command (${event.command})! Your whitelist or IDE auto-approve settings may have changed.`,
            );
          } else {
            console.log(
              `\n  🔊 [STALL ALERT${escSuffix}] Agent has been blocked for ${stallSec}s! Firing alarm (${soundName})...`,
            );
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

        // Track pending state and broadcast to WebSocket clients
        if (event.type === "permission_required") {
          latestPendingEvent = event;
          wsServer.broadcast({ type: "state", active: true, pendingEvent: latestPendingEvent });
        } else if (
          latestPendingEvent &&
          (event.type === "completed" || event.type === "working") &&
          (event.sessionId === latestPendingEvent.sessionId ||
            event.agent === latestPendingEvent.agent)
        ) {
          latestPendingEvent = null;
          wsServer.broadcast({ type: "state", active: true, pendingEvent: null });
        }

        // Broadcast raw event
        wsServer.broadcast({ type: "event", event });

        // Relay event to central inbox for IDE status bar & external observers
        try {
          const dir = dirname(inboxPath);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          appendFileSync(inboxPath, JSON.stringify(event) + "\n", "utf-8");
        } catch (err) {
          console.warn("[daemon] Failed to relay event to inbox:", err);
        }

        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        const riskBadge =
          event.riskLevel === "high"
            ? "🔴 [HIGH]"
            : event.riskLevel === "medium"
              ? "🟡 [MED]"
              : "🟢 [LOW]";

        console.log(
          `  [${timestamp}] ${riskBadge} ${event.agent} | ${event.type}: ${event.command ?? "(no command)"}`,
        );

        if (config.notifications.enabled) {
          stallTimer.handleEvent(event);
        }
      });

      // Handle inbound WebSocket messages (e.g. Quit from Tray, Test Sound)
      wsServer.onClientMessage(async (msg, ws) => {
        if (msg.type === "shutdown") {
          // Handshake protocol: acknowledge before daemon teardown!
          wsServer.sendTo(ws, { type: "shutdown_ack" });
          console.log("\n  [tray] Clean shutdown requested from Tray menu.");
          setTimeout(() => {
            cleanup();
          }, 50);
        } else if (msg.type === "test_sound") {
          const tier = (msg.tier ?? "high") as SoundTier;
          console.log(`\n  🔔 [tray] Test sound requested from menu (tier: "${tier}")`);
          const testEvent: AgentEvent = {
            agent: "tray",
            type: "permission_required",
            riskLevel: tier === "stall" ? "medium" : (tier as RiskLevel),
            command: "test_sound",
            timestamp: Date.now(),
            metadata: tier === "stall" ? { isStallAlert: true } : undefined,
          };
          const { soundName, soundFilePath } = resolveSoundForEvent(testEvent, config);
          console.log(
            `  🔊 [audio] Playing test sound: "${soundName}" (${soundFilePath ?? "system default"})`,
          );
          if (soundFilePath) {
            await playAudio(soundFilePath);
          } else {
            await playAudio(soundName);
          }
        } else if (msg.type === "set_stall_timeout") {
          const sec = Number(msg.seconds);
          if (sec > 0) {
            stallTimer.updateStallAlertSeconds(sec);
            config.stallAlertSeconds = sec;
            saveConfig(config);
            wsServer.broadcast({ type: "config_updated", key: "stallAlertSeconds", value: sec });
            console.log(`\n  ⏱️  [config] Updated stall alert threshold to ${sec}s`);
            notify({
              agent: "DEFCON",
              type: "permission_required",
              riskLevel: "low",
              command: `Stall alert threshold updated to ${sec}s`,
              timestamp: Date.now(),
            });
          }
        } else if (msg.type === "import_sound") {
          const res = importSoundFile(msg.filePath, msg.name);
          if (res.success && res.soundName) {
            if (msg.tier && res.destPath) {
              config.notifications = config.notifications || ({} as any);
              config.notifications.customSounds = config.notifications.customSounds || {};
              config.notifications.customSounds[msg.tier] = sanitizePath(res.destPath);
              saveConfig(config);
            }
            wsServer.broadcast({
              type: "sound_imported",
              success: true,
              soundName: res.soundName,
              tier: msg.tier,
            });
            console.log(
              `\n  🎵 [sound] Imported custom sound "${res.soundName}"${msg.tier ? ` for ${msg.tier}` : ""}`,
            );
            if (res.destPath) {
              await playAudio(res.destPath);
            }
            notify({
              agent: "DEFCON",
              type: "permission_required",
              riskLevel: "low",
              command: `Loaded sound "${res.soundName}"${msg.tier ? ` for ${msg.tier}` : ""}`,
              timestamp: Date.now(),
            });
          } else {
            wsServer.broadcast({
              type: "sound_imported",
              success: false,
              error: res.error ? sanitizePath(res.error) : undefined,
            });
            console.warn(`\n  ⚠️  [sound] Failed to import sound: ${sanitizePath(res.error)}`);
          }
        } else if (msg.type === "reset_sounds") {
          if (config.notifications) {
            config.notifications.customSounds = {};
            saveConfig(config);
          }
          wsServer.broadcast({ type: "config_updated", key: "customSounds", value: {} });
          console.log("\n  🔄 [sound] Reset all audio mappings to system defaults");
          notify({
            agent: "DEFCON",
            type: "permission_required",
            riskLevel: "low",
            command: "All sound mappings reset to system defaults",
            timestamp: Date.now(),
          });
        }
      });

      // Automatically launch the Tray Companion
      trayManager.start((code, signal) => {
        console.log(`\n  [tray] Tray companion exited (${code ?? signal}). Stopping daemon...`);
        cleanup();
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

      if (config.adapters["codex"] !== false) {
        const codexAdapter = new CodexAdapter(inboxPath);
        codexAdapter.onEvent((event) => eventBus.emit(event));
        await codexAdapter.start();
        adapters.push(codexAdapter);
        console.log("  ✅ Watching OpenAI Codex events...");
      }

      // Graceful shutdown handling
      let isCleaningUp = false;
      const cleanup = async () => {
        if (isCleaningUp) return;
        isCleaningUp = true;

        console.log("\n\n  Shutting down APL daemon...");
        // 1. Terminate the tray companion child process (SIGTERM -> SIGKILL)
        await trayManager.stop();

        // 2. Stop all agent adapters
        for (const adapter of adapters) {
          await adapter.stop();
        }

        // 3. Stop WebSocket server
        await wsServer.stop();

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
