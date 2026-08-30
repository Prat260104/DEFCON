import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StallAlertTimer } from "../../src/core/stallTimer.js";
import type { AgentEvent } from "../../src/core/types.js";

describe("StallAlertTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT fire alert if developer responds before timeout", () => {
    const onStallAlert = vi.fn();
    const timer = new StallAlertTimer({ stallAlertSeconds: 35, onStallAlert });

    // Agent asks for permission
    timer.handleEvent({
      agent: "claude-code",
      type: "permission_required",
      command: "npm install express",
      riskLevel: "medium",
      timestamp: Date.now(),
    });

    expect(timer.isPending).toBe(true);

    // Developer approves after 10 seconds (well within 35s window)
    vi.advanceTimersByTime(10000);
    timer.handleEvent({
      agent: "claude-code",
      type: "working",
      command: "npm install express",
      timestamp: Date.now(),
    });

    expect(timer.isPending).toBe(false);

    // Advance past 35s — alert must NOT have fired
    vi.advanceTimersByTime(30000);
    expect(onStallAlert).not.toHaveBeenCalled();
    expect(timer.hasFired).toBe(false);
  });

  it("fires alert after timeout when developer is away", () => {
    const onStallAlert = vi.fn();
    const timer = new StallAlertTimer({ stallAlertSeconds: 35, onStallAlert });

    const event: AgentEvent = {
      agent: "gemini-cli",
      type: "permission_required",
      command: "rm -rf /dist",
      riskLevel: "high",
      timestamp: Date.now(),
    };

    timer.handleEvent(event);

    // 34 seconds — not yet
    vi.advanceTimersByTime(34000);
    expect(onStallAlert).not.toHaveBeenCalled();

    // 1 more second — 35s elapsed, NOW it fires
    vi.advanceTimersByTime(1000);
    expect(onStallAlert).toHaveBeenCalledOnce();
    expect(onStallAlert).toHaveBeenCalledWith(event, expect.any(Number));
    expect(timer.hasFired).toBe(true);
  });

  it("resets timer when a new permission_required event arrives", () => {
    const onStallAlert = vi.fn();
    const timer = new StallAlertTimer({ stallAlertSeconds: 30, onStallAlert });

    timer.handleEvent({
      agent: "claude-code",
      type: "permission_required",
      command: "cmd-1",
      timestamp: 100,
    });

    // 20s passes
    vi.advanceTimersByTime(20000);

    // New permission event resets the timer
    const event2: AgentEvent = {
      agent: "claude-code",
      type: "permission_required",
      command: "cmd-2",
      timestamp: 200,
    };
    timer.handleEvent(event2);

    // 15s from event2 (35s from event1) — should not fire yet
    vi.advanceTimersByTime(15000);
    expect(onStallAlert).not.toHaveBeenCalled();

    // 15s more (30s from event2) — fires with event2
    vi.advanceTimersByTime(15000);
    expect(onStallAlert).toHaveBeenCalledOnce();
    expect(onStallAlert).toHaveBeenCalledWith(event2, expect.any(Number));
  });

  it("uses default 35s timeout when no option provided", () => {
    const onStallAlert = vi.fn();
    const timer = new StallAlertTimer({ onStallAlert });

    timer.handleEvent({
      agent: "claude-code",
      type: "permission_required",
      command: "test",
      timestamp: Date.now(),
    });

    vi.advanceTimersByTime(34999);
    expect(onStallAlert).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onStallAlert).toHaveBeenCalledOnce();
  });

  it("applies safety-net timeout (75s) to whitelisted commands and fires on drift", () => {
    const onStallAlert = vi.fn();
    const timer = new StallAlertTimer({
      stallAlertSeconds: 35,
      whitelistSafetyTimeoutSeconds: 75,
      onStallAlert,
    });

    // Whitelisted command arrives
    const event: AgentEvent = {
      agent: "antigravity",
      type: "permission_required",
      command: "npm run build",
      timestamp: Date.now(),
      metadata: { isWhitelisted: true },
    };

    timer.handleEvent(event);

    // At 35s: standard timer would have fired, but whitelisted command must NOT fire yet
    vi.advanceTimersByTime(35000);
    expect(onStallAlert).not.toHaveBeenCalled();

    // At 60s: still waiting for slow build or safety net
    vi.advanceTimersByTime(25000);
    expect(onStallAlert).not.toHaveBeenCalled();

    // At 75s (15s more): safety-net elapsed — fires with drift alert!
    vi.advanceTimersByTime(15000);
    expect(onStallAlert).toHaveBeenCalledOnce();
    expect(onStallAlert).toHaveBeenCalledWith(event, expect.any(Number));
    expect(timer.hasFired).toBe(true);
  });

  it("cancels silently if a whitelisted command resolves before safety-net timeout", () => {
    const onStallAlert = vi.fn();
    const timer = new StallAlertTimer({
      stallAlertSeconds: 35,
      whitelistSafetyTimeoutSeconds: 75,
      onStallAlert,
    });

    // Whitelisted command starts
    timer.handleEvent({
      agent: "antigravity",
      type: "permission_required",
      command: "npm install",
      timestamp: Date.now(),
      metadata: { isWhitelisted: true },
    });

    // Completes after 20s (normal slow package install)
    vi.advanceTimersByTime(20000);
    timer.handleEvent({
      agent: "antigravity",
      type: "completed",
      command: "npm install",
      timestamp: Date.now(),
    });

    expect(timer.isPending).toBe(false);

    // Advance past 75s — no alert must fire
    vi.advanceTimersByTime(60000);
    expect(onStallAlert).not.toHaveBeenCalled();
    expect(timer.hasFired).toBe(false);
  });

  it("handles concurrent sessions without state cross-talk", () => {
    const onStallAlert = vi.fn();
    const timer = new StallAlertTimer({
      stallAlertSeconds: 35,
      onStallAlert,
    });

    const sessionAEvent: AgentEvent = {
      agent: "claude-code",
      sessionId: "session-A",
      type: "permission_required",
      command: "rm -rf ./build",
      timestamp: Date.now(),
    };

    // 1. Session A requests permission (timer A starts)
    timer.handleEvent(sessionAEvent);
    expect(timer.checkPending("session-A")).toBe(true);
    expect(timer.activeSessionCount).toBe(1);

    // 2. 10s later, Session B emits a "completed" event
    vi.advanceTimersByTime(10000);
    timer.handleEvent({
      agent: "antigravity",
      sessionId: "session-B",
      type: "completed",
      command: "git status",
      timestamp: Date.now(),
    });

    // Session A MUST still be pending (not cancelled by Session B)
    expect(timer.checkPending("session-A")).toBe(true);
    expect(timer.activeSessionCount).toBe(1);

    // 3. Advance another 25s (total 35s since Session A started) — Session A MUST fire!
    vi.advanceTimersByTime(25000);
    expect(onStallAlert).toHaveBeenCalledOnce();
    expect(onStallAlert).toHaveBeenCalledWith(sessionAEvent, expect.any(Number));
    expect(timer.checkHasFired("session-A")).toBe(true);

    // 4. Session A resolves (approved) — cancels only Session A
    timer.handleEvent({
      agent: "claude-code",
      sessionId: "session-A",
      type: "working",
      command: "rm -rf ./build",
      timestamp: Date.now(),
    });
    expect(timer.checkPending("session-A")).toBe(false);
    expect(timer.activeSessionCount).toBe(0);
  });
});
