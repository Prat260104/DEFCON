import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentEvent } from "./types.js";

export function getDefaultInboxPath(): string {
  return join(homedir(), ".apl", "inbox.jsonl");
}

export function getDefaultConfigPath(): string {
  return join(homedir(), ".apl", "config.json");
}

export function getDefaultDbPath(): string {
  return join(homedir(), ".apl", "audit.sqlite");
}

/**
 * Safely read recent lines from ~/.apl/inbox.jsonl (or custom path).
 * Never throws — returns empty array if file is missing or inaccessible.
 */
export function readRecentInboxEvents(
  filePath: string = getDefaultInboxPath(),
  limit: number = 50
): AgentEvent[] {
  try {
    if (!existsSync(filePath)) {
      return [];
    }

    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim().length > 0);
    const recentLines = lines.slice(-limit).reverse();

    const events: AgentEvent[] = [];
    for (const line of recentLines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === "object" && typeof parsed.agent === "string") {
          events.push(parsed as AgentEvent);
        }
      } catch {
        // Skip malformed lines safely
      }
    }

    return events;
  } catch {
    return [];
  }
}

/**
 * Evaluates whether there is an active command awaiting developer response.
 * Inspects recent events in reverse order:
 * If the most recent event for an agent/session is `permission_required` and occurred within maxAgeMs (default 3 mins),
 * returns that event. If resolved by `completed` or `working`, returns null.
 */
export function getActivePendingEvent(
  events: AgentEvent[],
  maxAgeMs: number = 3 * 60 * 1000
): AgentEvent | null {
  if (events.length === 0) return null;

  const now = Date.now();
  const sessionStates = new Map<string, AgentEvent>();

  // Events are ordered newest first (since we reversed lines in readRecentInboxEvents)
  for (const evt of events) {
    const key = evt.sessionId || evt.agent;
    if (!sessionStates.has(key)) {
      sessionStates.set(key, evt);
    }
  }

  let highestPending: AgentEvent | null = null;
  for (const [_, latest] of sessionStates.entries()) {
    if (latest.type === "permission_required") {
      const age = now - (latest.timestamp || now);
      if (age <= maxAgeMs) {
        if (!highestPending || (latest.riskLevel === "high" && highestPending.riskLevel !== "high")) {
          highestPending = latest;
        }
      }
    }
  }

  return highestPending;
}

/**
 * Check whether the APL daemon or directory is alive.
 * Returns true if ~/.apl directory exists and has been active recently.
 */
export function isDaemonActive(inboxPath: string = getDefaultInboxPath()): boolean {
  try {
    const aplDir = join(homedir(), ".apl");
    if (!existsSync(aplDir)) {
      return false;
    }

    if (existsSync(inboxPath)) {
      const stat = statSync(inboxPath);
      // If inbox was modified within the last 12 hours, considered active/configured
      const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
      return ageHours <= 24;
    }

    return existsSync(join(aplDir, "config.json"));
  } catch {
    return false;
  }
}
