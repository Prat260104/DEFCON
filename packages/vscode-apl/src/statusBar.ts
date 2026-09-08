import type { AgentEvent, StatusBarDisplayInfo } from "./types.js";

/**
 * Computes the status bar presentation details based on active daemon and pending events.
 */
export function computeStatusBarInfo(
  isActive: boolean,
  pendingEvent: AgentEvent | null
): StatusBarDisplayInfo {
  if (!isActive) {
    return {
      state: "inactive",
      text: "$(circle-slash) APL: Inactive",
      tooltip: "Agent Permission Layer is inactive.\nRun 'defcon start' or 'npm run dev -- start' in terminal to monitor coding agents.",
      command: "apl.checkStatus",
    };
  }

  if (pendingEvent) {
    const risk = pendingEvent.riskLevel || "medium";
    const agent = pendingEvent.agent || "Agent";
    const cmd = pendingEvent.command ? ` "${pendingEvent.command.slice(0, 80)}"` : "";

    if (risk === "high") {
      return {
        state: "pending_action",
        text: "$(alert) APL: 🔴 High Risk",
        tooltip: `⚠️ PERMISSION REQUIRED [HIGH RISK]\nAgent: ${agent}\nCommand:${cmd}\nClick to inspect audit details.`,
        command: "apl.showAuditLog",
        backgroundColorKey: "statusBarItem.errorBackground",
      };
    }

    if (risk === "medium") {
      return {
        state: "pending_action",
        text: "$(warning) APL: 🟡 Action Pending",
        tooltip: `⚠️ PERMISSION REQUIRED [MEDIUM RISK]\nAgent: ${agent}\nCommand:${cmd}\nClick to inspect audit details.`,
        command: "apl.showAuditLog",
        backgroundColorKey: "statusBarItem.warningBackground",
      };
    }

    return {
      state: "pending_action",
      text: "$(info) APL: 🟢 Action Pending",
      tooltip: `ℹ️ Action Pending [LOW RISK]\nAgent: ${agent}\nCommand:${cmd}\nClick to inspect audit details.`,
      command: "apl.showAuditLog",
    };
  }

  return {
    state: "active",
    text: "$(shield) APL: Active",
    tooltip: "🛡️ Agent Permission Layer is active.\nMonitoring Claude Code, Gemini CLI, Cline, and IDE coding agents in real time.\nClick to view recent audit logs.",
    command: "apl.showAuditLog",
  };
}
