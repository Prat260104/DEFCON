import type { AgentEvent } from "./types.js";
import { notify } from "../notify/index.js";

export interface IdleTimerOptions {
  /** Idle timeout in seconds before triggering re-nudge. Default: 30 seconds. */
  timeoutSeconds?: number;
  /** Custom re-nudge callback (useful for testing or custom alerts). */
  onNudge?: (event: AgentEvent) => void | Promise<void>;
}

/**
 * Manages unattended idle detection and periodic re-nudges when an agent
 * is stalled awaiting user permission.
 */
export class IdleTimerManager {
  private timeoutMs: number;
  private onNudge?: (event: AgentEvent) => void | Promise<void>;
  private activeTimer: NodeJS.Timeout | null = null;
  private pendingEvent: AgentEvent | null = null;
  private nudgeCount = 0;

  constructor(options: IdleTimerOptions = {}) {
    this.timeoutMs = (options.timeoutSeconds ?? 30) * 1000;
    this.onNudge = options.onNudge;
  }

  /**
   * Handle an incoming AgentEvent.
   * - If "permission_required", starts the idle timer.
   * - If "working", "completed", or "error", cancels the idle timer.
   */
  handleEvent(event: AgentEvent): void {
    if (event.type === "permission_required") {
      this.startTimer(event);
    } else {
      this.cancel();
    }
  }

  private startTimer(event: AgentEvent): void {
    this.cancel();
    this.pendingEvent = event;
    this.nudgeCount = 0;

    this.activeTimer = setTimeout(() => {
      this.triggerNudge();
    }, this.timeoutMs);
  }

  private async triggerNudge(): Promise<void> {
    if (!this.pendingEvent) return;

    this.nudgeCount++;

    if (this.onNudge) {
      try {
        await this.onNudge(this.pendingEvent);
      } catch (err) {
        console.error("[idleTimer] onNudge handler error:", err);
      }
    } else {
      // Default re-nudge: fire notification reminder
      const nudgeEvent: AgentEvent = {
        ...this.pendingEvent,
        metadata: {
          ...this.pendingEvent.metadata,
          isReNudge: true,
          nudgeCount: this.nudgeCount,
        },
      };
      await notify(nudgeEvent);
    }
  }

  /**
   * Cancel any pending idle timer and clear pending event.
   */
  cancel(): void {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    this.pendingEvent = null;
  }

  get isPending(): boolean {
    return this.activeTimer !== null;
  }

  get totalNudges(): number {
    return this.nudgeCount;
  }
}
