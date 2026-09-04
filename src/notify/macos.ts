import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import type { AgentEvent, RiskLevel } from "../core/types.js";
import { loadConfig, type AplConfig } from "../cli/configManager.js";
import { resolveSoundForEvent } from "./soundManager.js";

/**
 * macOS native notification implementation using AppleScript (`osascript`) & `afplay`.
 *
 * Sound priority handled in soundManager:
 * 1. Stall-specific custom sound
 * 2. Tier-specific custom sound
 * 3. Global custom sound
 * 4. Configured tier sound / system fallback
 */

const RISK_BADGE: Record<RiskLevel, string> = {
  low: "🟢 [LOW RISK]",
  medium: "🟡 [MEDIUM RISK]",
  high: "🔴 [HIGH RISK]",
};

/**
 * Escape double quotes and backslashes for safe inclusion in AppleScript string literals.
 */
function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Format notification title, subtitle, body, and resolve sound path.
 */
export function formatNotification(
  event: AgentEvent,
  configOverride?: AplConfig
): {
  title: string;
  subtitle: string;
  body: string;
  sound: string;
  soundName: string;
  soundFilePath: string | null;
} {
  const risk = event.riskLevel ?? "medium";
  const badge = RISK_BADGE[risk];
  const config = configOverride ?? loadConfig();

  const isStall = Boolean(event.metadata?.["isStallAlert"]);
  const isDrift = Boolean(event.metadata?.["isWhitelistDrift"]);
  const stallSec = (event.metadata?.["stallSeconds"] as number) ?? 35;

  let title = `APL: ${event.agent}`;
  let subtitle = `${badge} ${event.type === "permission_required" ? "Permission Required" : "Action Pending"}`;
  let body = "";

  if (isDrift) {
    title = `⚠️ Whitelist Drift (${stallSec}s)`;
    subtitle = `Unresolved Whitelisted Command`;
    body = `Agent waiting on '${event.command ?? "command"}'. Your whitelist or IDE auto-approve settings may have changed.`;
  } else if (isStall) {
    title = `⚠️ Agent Blocked (${stallSec}s)`;
    if (event.command) {
      body = event.command.length > 120 ? `${event.command.slice(0, 117)}...` : event.command;
    } else {
      body = `Agent is waiting for approval (${event.type})`;
    }
  } else {
    if (event.command) {
      body = event.command.length > 120 ? `${event.command.slice(0, 117)}...` : event.command;
    } else {
      body = `Agent is waiting for approval (${event.type})`;
    }
  }

  // Resolve sound using prioritized soundManager
  const { soundName, soundFilePath } = resolveSoundForEvent(event, config);

  return { title, subtitle, body, sound: soundName, soundName, soundFilePath };
}

/**
 * Send macOS desktop notification.
 * Resolves safely; errors are caught and logged without throwing.
 */
export async function sendMacNotification(
  event: AgentEvent,
  configOverride?: AplConfig
): Promise<boolean> {
  return new Promise((resolve) => {
    const { title, subtitle, body, soundName, soundFilePath } = formatNotification(event, configOverride);

    // Play native system sound or custom audio file directly via afplay
    if (soundFilePath && existsSync(soundFilePath)) {
      execFile("afplay", [soundFilePath], () => {
        // Audio playback finished or skipped (non-blocking)
      });
    }

    // Display visual desktop notification banner via osascript
    const script = `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}" subtitle "${escapeAppleScript(subtitle)}" sound name "${escapeAppleScript(soundName)}"`;

    execFile("osascript", ["-e", script], (error) => {
      if (error) {
        console.warn("[notify:macos] Failed to display banner notification:", error.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
