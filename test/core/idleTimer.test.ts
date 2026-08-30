import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IdleTimerManager } from "../../src/core/idleTimer.js";
import type { AgentEvent } from "../../src/core/types.js";

describe("IdleTimerManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts timer on permission_required event and triggers re-nudge on expiration", async () => {
    const onNudge = vi.fn();
    const manager = new IdleTimerManager({ timeoutSeconds: 30, onNudge });

    const event: AgentEvent = {
      agent: "claude-code",
      type: "permission_required",
      command: "rm -rf /test",
      riskLevel: "high",
      timestamp: Date.now(),
    };

    manager.handleEvent(event);
    expect(manager.isPending).toBe(true);
    expect(onNudge).not.toHaveBeenCalled();

    // Advance 29 seconds - should not trigger yet
    vi.advanceTimersByTime(29000);
    expect(onNudge).not.toHaveBeenCalled();

    // Advance 1 more second - 30s elapsed, triggers re-nudge!
    vi.advanceTimersByTime(1000);
    expect(onNudge).toHaveBeenCalledOnce();
    expect(onNudge).toHaveBeenCalledWith(event);
    expect(manager.totalNudges).toBe(1);
  });

  it("cancels active timer when a working/completed event arrives", () => {
    const onNudge = vi.fn();
    const manager = new IdleTimerManager({ timeoutSeconds: 30, onNudge });

    manager.handleEvent({
      agent: "gemini-cli",
      type: "permission_required",
      timestamp: Date.now(),
    });
    expect(manager.isPending).toBe(true);

    // 10 seconds later, user approves and agent transitions to "working"
    vi.advanceTimersByTime(10000);
    manager.handleEvent({
      agent: "gemini-cli",
      type: "working",
      command: "npm test",
      timestamp: Date.now(),
    });

    expect(manager.isPending).toBe(false);

    // Advance past 30 seconds - onNudge must NOT be called
    vi.advanceTimersByTime(30000);
    expect(onNudge).not.toHaveBeenCalled();
  });

  it("resets timer if another permission_required event arrives", () => {
    const onNudge = vi.fn();
    const manager = new IdleTimerManager({ timeoutSeconds: 30, onNudge });

    const event1: AgentEvent = {
      agent: "claude-code",
      type: "permission_required",
      command: "cmd-1",
      timestamp: 100,
    };

    const event2: AgentEvent = {
      agent: "claude-code",
      type: "permission_required",
      command: "cmd-2",
      timestamp: 200,
    };

    manager.handleEvent(event1);
    vi.advanceTimersByTime(20000); // 20s passed

    // New permission event arrives before timeout
    manager.handleEvent(event2);

    // 15s later (35s from event1, but only 15s from event2) - should not have fired yet
    vi.advanceTimersByTime(15000);
    expect(onNudge).not.toHaveBeenCalled();

    // 15s more (30s from event2) - now it fires with event2
    vi.advanceTimersByTime(15000);
    expect(onNudge).toHaveBeenCalledOnce();
    expect(onNudge).toHaveBeenCalledWith(event2);
  });
});
