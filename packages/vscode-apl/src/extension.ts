import * as vscode from "vscode";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { dirname } from "node:path";
import { exec } from "node:child_process";
import {
  getDefaultInboxPath,
  getDefaultConfigPath,
  readRecentInboxEvents,
  getActivePendingEvent,
  isDaemonActive,
} from "./auditReader.js";
import { computeStatusBarInfo } from "./statusBar.js";
import type { AgentEvent } from "./types.js";

let statusBarItem: vscode.StatusBarItem;
let pollTimer: NodeJS.Timeout | undefined;
let fileWatcher: FSWatcher | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const inboxPath = getEffectiveInboxPath();
  console.log(`[APL Extension] Activating. Watching inbox at: ${inboxPath}`);

  // 1. Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  context.subscriptions.push(statusBarItem);

  // Initial status calculation
  updateStatusBar();

  // 2. Setup real-time file watcher on inbox.jsonl
  setupInboxWatcher(inboxPath);

  // 3. Setup periodic polling fallback (every 2s) for TTL/daemon heartbeat
  const config = vscode.workspace.getConfiguration("apl");
  const pollIntervalSeconds = Math.max(1, config.get<number>("pollIntervalSeconds", 2));
  pollTimer = setInterval(() => {
    updateStatusBar();
  }, pollIntervalSeconds * 1000);

  // 4. Listen for configuration updates
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("apl")) {
        const newInbox = getEffectiveInboxPath();
        console.log(`[APL Extension] Configuration changed. Re-targeting inbox to: ${newInbox}`);
        setupInboxWatcher(newInbox);
        updateStatusBar();
      }
    })
  );

  // 3. Register Command: Check Daemon Status
  const checkStatusCmd = vscode.commands.registerCommand("apl.checkStatus", async () => {
    const inboxPath = getEffectiveInboxPath();
    const active = isDaemonActive(inboxPath);
    const events = readRecentInboxEvents(inboxPath, 10);
    const pending = getActivePendingEvent(events);

    if (active) {
      if (pending) {
        const action = await vscode.window.showWarningMessage(
          `APL Active — ${pending.agent} is currently awaiting approval for: "${pending.command || pending.type}" (${pending.riskLevel?.toUpperCase() || "MEDIUM"} RISK).`,
          "View Audit Logs",
          "Open Config"
        );
        if (action === "View Audit Logs") {
          vscode.commands.executeCommand("apl.showAuditLog");
        } else if (action === "Open Config") {
          vscode.commands.executeCommand("apl.openConfig");
        }
      } else {
        const action = await vscode.window.showInformationMessage(
          `🛡️ Agent Permission Layer (APL) daemon is active.\nMonitoring coding agents in real-time.`,
          "View Audit Logs",
          "Open Config"
        );
        if (action === "View Audit Logs") {
          vscode.commands.executeCommand("apl.showAuditLog");
        } else if (action === "Open Config") {
          vscode.commands.executeCommand("apl.openConfig");
        }
      }
    } else {
      const action = await vscode.window.showWarningMessage(
        `⚠️ APL Daemon is currently inactive.\nRun 'defcon start' or 'npm run dev -- start' in terminal to monitor coding agents.`,
        "Open Config"
      );
      if (action === "Open Config") {
        vscode.commands.executeCommand("apl.openConfig");
      }
    }
  });

  // 4. Register Command: Show Recent Audit Logs (QuickPick)
  const showAuditLogCmd = vscode.commands.registerCommand("apl.showAuditLog", async () => {
    const inboxPath = getEffectiveInboxPath();
    const events = readRecentInboxEvents(inboxPath, 30);

    if (events.length === 0) {
      vscode.window.showInformationMessage(
        `No recent APL agent events recorded yet in ${inboxPath}.`
      );
      return;
    }

    const items: (vscode.QuickPickItem & { event: AgentEvent })[] = events.map((evt) => {
      const timeStr = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : "";
      const riskBadge =
        evt.riskLevel === "high"
          ? "🔴 HIGH"
          : evt.riskLevel === "medium"
          ? "🟡 MED"
          : "🟢 LOW";

      const icon =
        evt.type === "permission_required"
          ? "$(alert)"
          : evt.type === "working"
          ? "$(sync~spin)"
          : evt.type === "completed"
          ? "$(check)"
          : "$(info)";

      return {
        label: `${icon} ${evt.command || evt.type}`,
        description: `[${riskBadge}] ${evt.agent} • ${timeStr}`,
        detail: `Type: ${evt.type} | Session: ${evt.sessionId || "default"} | Risk: ${evt.riskLevel || "unknown"}`,
        event: evt,
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Recent Agent Tool Interceptions & Permissions",
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected) {
      const evt = selected.event;
      vscode.window.showInformationMessage(
        `[${evt.riskLevel?.toUpperCase() || "EVENT"}] ${evt.agent}: ${evt.command || evt.type}`,
        {
          modal: true,
          detail: `Timestamp: ${new Date(evt.timestamp).toLocaleString()}\nSession: ${evt.sessionId || "default"}\nType: ${evt.type}\nCommand: ${evt.command || "(none)"}\nMetadata: ${JSON.stringify(evt.metadata || {}, null, 2)}`,
        }
      );
    }
  });

  // 5. Register Command: Open Configuration
  const openConfigCmd = vscode.commands.registerCommand("apl.openConfig", async () => {
    const configPath = getDefaultConfigPath();
    if (!existsSync(configPath)) {
      vscode.window.showErrorMessage(
        `APL config file not found at ${configPath}. Run 'defcon setup' to initialize.`
      );
      return;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
      await vscode.window.showTextDocument(doc);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to open config: ${err.message}`);
    }
  });

  // 6. Register Command: Test Audio Alert Preview
  const testAlertCmd = vscode.commands.registerCommand("apl.testAlert", () => {
    exec("afplay /System/Library/Sounds/Sosumi.aiff", (err) => {
      if (err) {
        // Fallback notification if sound fails
        vscode.window.showInformationMessage("🔊 APL Test Alert: Sound triggered.");
      } else {
        vscode.window.showInformationMessage("🔊 Played preview: Sosumi");
      }
    });
  });

  context.subscriptions.push(checkStatusCmd, showAuditLogCmd, openConfigCmd, testAlertCmd);
}

export function deactivate(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = undefined;
  }
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}

function getEffectiveInboxPath(): string {
  const config = vscode.workspace.getConfiguration("apl");
  const customInbox = config.get<string>("inboxPath", "").trim();
  return customInbox.length > 0 ? customInbox : getDefaultInboxPath();
}

function setupInboxWatcher(inboxPath: string): void {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = undefined;
  }

  const targetToWatch = existsSync(inboxPath) ? inboxPath : dirname(inboxPath);
  if (!existsSync(targetToWatch)) {
    console.log(`[APL Extension] ⚠️ Inbox target directory does not exist yet: ${targetToWatch}`);
    return;
  }

  try {
    fileWatcher = watch(targetToWatch, (eventType, filename) => {
      console.log(`[APL Extension] 🔔 Inbox file watcher fired! (event=${eventType}, file=${filename ?? targetToWatch})`);
      updateStatusBar();
    });
    console.log(`[APL Extension] 👁️ Real-time file watcher established on: ${targetToWatch}`);
  } catch (err) {
    console.warn(`[APL Extension] Failed to establish file watcher on ${targetToWatch}:`, err);
  }
}

function updateStatusBar(): void {
  if (!statusBarItem) return;

  const config = vscode.workspace.getConfiguration("apl");
  const enabled = config.get<boolean>("enableStatusBar", true);
  if (!enabled) {
    statusBarItem.hide();
    return;
  }

  const inboxPath = getEffectiveInboxPath();
  const active = isDaemonActive(inboxPath);
  const events = readRecentInboxEvents(inboxPath, 50);
  const pendingEvent = getActivePendingEvent(events);

  console.log(
    `[APL Extension] Status update: active=${active}, totalEvents=${events.length}, pending=${
      pendingEvent ? `${pendingEvent.agent} -> "${pendingEvent.command || pendingEvent.type}" [${pendingEvent.riskLevel?.toUpperCase() || "MED"}]` : "none"
    }`
  );

  const info = computeStatusBarInfo(active, pendingEvent);
  statusBarItem.text = info.text;
  statusBarItem.tooltip = info.tooltip;
  statusBarItem.command = info.command;

  if (info.backgroundColorKey) {
    statusBarItem.backgroundColor = new vscode.ThemeColor(info.backgroundColorKey);
  } else {
    statusBarItem.backgroundColor = undefined;
  }

  statusBarItem.show();
}
