import type { AgentEvent } from "./types.js";
import { notify } from "../notify/index.js";

export interface StallTimerOptions {
  /** Seconds to wait before firing alert for normal commands. Default: 35 seconds. */
  stallAlertSeconds?: number;
  /** Safety-net seconds to wait before firing alert for whitelisted commands that fail to resolve. Default: 75 seconds. */
  whitelistSafetyTimeoutSeconds?: number;
  /** Recurring reminder interval in seconds if unacknowledged. Default: 60 seconds. */
  repeatAlertIntervalSeconds?: number;
  /** Maximum number of recurring repeat alerts to fire after the initial alert. Default: 3. */
  maxRepeatAlerts?: number;
  /** Custom callback when stall alert fires. */
  onStallAlert?: (
    event: AgentEvent,
    elapsedMs: number,
    escalationLevel?: number,
  ) => void | Promise<void>;
}

/**
 * Stall Alert Timer — fires an alert ONLY if the developer has not responded
 * to a permission request within the configured timeout (default 35s for normal commands,
 * 75s safety-net for whitelisted commands).
 *
 * If the developer approves/denies (or the auto-run command finishes) before the timer
 * expires, the timer is cancelled silently with zero notification noise.
 *
 * Multi-tier acoustic escalation:
 * Alert 1 (initial @ 35s): Tier sound (Pop/Ping/Sosumi or configured tier custom sound)
 * Alert 2 (+60s @ 95s): Sosumi (high urgency)
 * Alert 3 (+120s @ 215s): Basso or custom stall sound (maximum urgency)
 */
interface ActiveTimerEntry {
  timer: NodeJS.Timeout | null;
  event: AgentEvent;
  startedAt: number;
  hasFired: boolean;
  repeatCount: number;
}

export class StallAlertTimer {
  private defaultTimeoutMs: number;
  private whitelistSafetyTimeoutMs: number;
  private repeatAlertIntervalMs: number;
  private maxRepeatAlerts: number;
  private onStallAlert?: (
    event: AgentEvent,
    elapsedMs: number,
    escalationLevel?: number,
  ) => void | Promise<void>;
  private activeTimers = new Map<string, ActiveTimerEntry>();

  constructor(options: StallTimerOptions = {}) {
    this.defaultTimeoutMs = Math.max(1, options.stallAlertSeconds ?? 35) * 1000;
    this.whitelistSafetyTimeoutMs = Math.max(1, options.whitelistSafetyTimeoutSeconds ?? 75) * 1000;
    this.repeatAlertIntervalMs = Math.max(1, options.repeatAlertIntervalSeconds ?? 60) * 1000;
    this.maxRepeatAlerts = Math.max(0, options.maxRepeatAlerts ?? 3);
    this.onStallAlert = options.onStallAlert;
  }

  private getSessionKey(event: AgentEvent): string {
    return event.sessionId || event.agent;
  }

  /**
   * Called when a new event arrives from an agent.
   * - "permission_required" → starts countdown for this specific session.
   * - Any other type ("working", "completed", "error") → cancels countdown for this specific session.
   */
  handleEvent(event: AgentEvent): void {
    const key = this.getSessionKey(event);

    if (event.type === "permission_required") {
      this.startCountdown(key, event);
    } else {
      // Developer responded or command completed for this session — cancel silently and immediately
      this.cancel(key);
    }
  }

  private startCountdown(key: string, event: AgentEvent): void {
    this.cancel(key);

    const startedAt = Date.now();
    const isWhitelisted = Boolean(event.metadata?.["isWhitelisted"]);
    const delayMs = isWhitelisted ? this.whitelistSafetyTimeoutMs : this.defaultTimeoutMs;

    const timer = setTimeout(() => {
      this.fireAlert(key);
    }, delayMs);

    this.activeTimers.set(key, {
      timer,
      event,
      startedAt,
      hasFired: false,
      repeatCount: 0,
    });
  }

  private async fireAlert(key: string): Promise<void> {
    const entry = this.activeTimers.get(key);
    if (!entry) return;

    entry.hasFired = true;
    const elapsedMs = Date.now() - entry.startedAt;
    const isWhitelisted = Boolean(entry.event.metadata?.["isWhitelisted"]);
    const stallSeconds = Math.round(elapsedMs / 1000);
    const repeatCount = entry.repeatCount;
    const escalationLevel = Math.min(3, repeatCount + 1);

    entry.event.metadata = {
      ...entry.event.metadata,
      isStallAlert: true,
      isWhitelistDrift: isWhitelisted,
      stallSeconds,
      escalationLevel,
      repeatCount,
    };

    const stallEvent: AgentEvent = {
      ...entry.event,
      metadata: entry.event.metadata,
    };

    // Invoke callback/hook immediately (2 args for compatibility)
    if (this.onStallAlert) {
      try {
        const result = this.onStallAlert(entry.event, elapsedMs);
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch((err) => {
            console.error("[stallTimer] onStallAlert hook error:", err);
          });
        }
      } catch (err) {
        console.error("[stallTimer] onStallAlert hook error:", err);
      }
    }

    // Schedule next escalation reminder if repeat count is below maxRepeatAlerts
    if (entry.repeatCount < this.maxRepeatAlerts) {
      entry.repeatCount += 1;
      // Interval backoff: repeat 1 uses 1 * interval (60s), repeat 2 uses 2 * interval (120s), etc.
      const nextDelayMs = entry.repeatCount * this.repeatAlertIntervalMs;
      entry.timer = setTimeout(() => {
        this.fireAlert(key);
      }, nextDelayMs);
    } else {
      entry.timer = null;
    }

    // Fire the real OS notification & audio alarm asynchronously (non-blocking)
    notify(stallEvent).catch((err) => {
      console.error("[stallTimer] Failed to dispatch OS notification:", err);
    });
  }

  /**
   * Cancel pending stall timer for a specific session, or all sessions if no key provided.
   * Clears any active setTimeout immediately to ensure no lingering callbacks can fire.
   */
  cancel(key?: string): void {
    if (key) {
      const entry = this.activeTimers.get(key);
      if (entry) {
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.timer = null;
        }
        this.activeTimers.delete(key);
      }
    } else {
      for (const entry of this.activeTimers.values()) {
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.timer = null;
        }
      }
      this.activeTimers.clear();
    }
  }

  checkPending(key?: string): boolean {
    if (key) return this.activeTimers.has(key);
    return this.activeTimers.size > 0;
  }

  checkHasFired(key?: string): boolean {
    if (key) return this.activeTimers.get(key)?.hasFired ?? false;
    for (const entry of this.activeTimers.values()) {
      if (entry.hasFired) return true;
    }
    return false;
  }

  // Backwards-compatible getter properties
  get isPending(): boolean {
    return this.activeTimers.size > 0;
  }

  get hasFired(): boolean {
    for (const entry of this.activeTimers.values()) {
      if (entry.hasFired) return true;
    }
    return false;
  }

  get activeSessionCount(): number {
    return this.activeTimers.size;
  }
}
