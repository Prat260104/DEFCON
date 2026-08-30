import type { AgentEvent } from "./types.js";

/**
 * Event deduplication using a sliding time window.
 *
 * Prevents the same event (same agent + type + command) from being processed
 * multiple times within a configurable window. Keeps only the last N events
 * in memory — this is a real-time filter, not a history store.
 */

const DEFAULT_WINDOW_MS = 2000;
const MAX_RECENT_EVENTS = 50;

export interface DedupeEntry {
  agent: string;
  type: string;
  command: string | undefined;
  timestamp: number;
}

/**
 * Creates a fingerprint for comparison. Two events are considered duplicates
 * if they have the same agent, type, and command within the time window.
 */
function eventFingerprint(event: AgentEvent): string {
  return `${event.agent}|${event.type}|${event.command ?? ""}`;
}

/**
 * Returns true if the event is a duplicate of a recent event within the window.
 */
export function isDuplicate(
  event: AgentEvent,
  recentEvents: DedupeEntry[],
  windowMs: number = DEFAULT_WINDOW_MS,
): boolean {
  const fingerprint = eventFingerprint(event);
  const cutoff = event.timestamp - windowMs;

  return recentEvents.some((recent) => {
    if (recent.timestamp < cutoff) return false;
    const recentFingerprint = `${recent.agent}|${recent.type}|${recent.command ?? ""}`;
    return recentFingerprint === fingerprint;
  });
}

/**
 * Manages a bounded ring buffer of recent events for deduplication.
 */
export class DedupeBuffer {
  private entries: DedupeEntry[] = [];
  private readonly maxSize: number;
  private readonly windowMs: number;

  constructor(maxSize: number = MAX_RECENT_EVENTS, windowMs: number = DEFAULT_WINDOW_MS) {
    this.maxSize = maxSize;
    this.windowMs = windowMs;
  }

  /**
   * Check if event is a duplicate and, if not, add it to the buffer.
   * Returns true if the event should be dropped (is a duplicate).
   */
  shouldDrop(event: AgentEvent): boolean {
    const duplicate = isDuplicate(event, this.entries, this.windowMs);

    if (!duplicate) {
      this.entries.push({
        agent: event.agent,
        type: event.type,
        command: event.command,
        timestamp: event.timestamp,
      });

      // Trim to max size — drop oldest entries
      if (this.entries.length > this.maxSize) {
        this.entries = this.entries.slice(-this.maxSize);
      }
    }

    return duplicate;
  }

  /** Current number of entries in the buffer. */
  get size(): number {
    return this.entries.length;
  }

  /** Clear all entries. */
  clear(): void {
    this.entries = [];
  }
}
