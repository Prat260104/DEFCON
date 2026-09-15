import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AnalyticsEngine } from "../../src/storage/analytics.js";
import type { AgentEvent } from "../../src/core/types.js";

describe("AnalyticsEngine", () => {
  let tempDir: string;
  let dbPath: string;
  let engine: AnalyticsEngine;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "apl-analytics-test-"));
    dbPath = join(tempDir, "test-events.db");
    engine = new AnalyticsEngine(dbPath);
  });

  afterEach(() => {
    engine.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function insertEvent(event: Partial<AgentEvent> & { timestamp: number }): void {
    const db = new DatabaseSync(dbPath);
    const stmt = db.prepare(`
      INSERT INTO events (agent, type, command, risk_level, session_id, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.agent ?? "test-agent",
      event.type ?? "permission_required",
      event.command ?? null,
      event.riskLevel ?? null,
      event.sessionId ?? null,
      event.timestamp,
      event.metadata ? JSON.stringify(event.metadata) : null,
    );
    db.close();
  }

  it("calculates risk breakdown correctly", async () => {
    const now = Date.now();

    // Insert 5 low, 3 medium, 2 high risk events
    for (let i = 0; i < 5; i++) {
      insertEvent({
        agent: "claude-code",
        type: "permission_required",
        riskLevel: "low",
        timestamp: now - i * 1000,
      });
    }

    for (let i = 0; i < 3; i++) {
      insertEvent({
        agent: "kiro",
        type: "permission_required",
        riskLevel: "medium",
        timestamp: now - (i + 10) * 1000,
      });
    }

    for (let i = 0; i < 2; i++) {
      insertEvent({
        agent: "gemini-cli",
        type: "permission_required",
        riskLevel: "high",
        timestamp: now - (i + 20) * 1000,
      });
    }

    const report = await engine.generateReport({ since: now - 60000 });

    expect(report.riskBreakdown.low.count).toBe(5);
    expect(report.riskBreakdown.medium.count).toBe(3);
    expect(report.riskBreakdown.high.count).toBe(2);
    expect(report.riskBreakdown.blacklist.count).toBe(0);

    // Verify percentages (5+3+2 = 10 total)
    expect(report.riskBreakdown.low.percentage).toBe(50.0);
    expect(report.riskBreakdown.medium.percentage).toBe(30.0);
    expect(report.riskBreakdown.high.percentage).toBe(20.0);
  });

  it("identifies unique agents", async () => {
    const now = Date.now();

    insertEvent({ agent: "claude-code", timestamp: now - 1000 });
    insertEvent({ agent: "kiro", timestamp: now - 2000 });
    insertEvent({ agent: "gemini-cli", timestamp: now - 3000 });
    insertEvent({ agent: "claude-code", timestamp: now - 4000 }); // Duplicate

    const report = await engine.generateReport({ since: now - 10000 });

    expect(report.summary.activeAgents).toHaveLength(3);
    expect(report.summary.activeAgents).toContain("claude-code");
    expect(report.summary.activeAgents).toContain("kiro");
    expect(report.summary.activeAgents).toContain("gemini-cli");
  });

  it("computes approval time statistics", async () => {
    const now = Date.now();

    // Session 1: 10s approval time
    insertEvent({
      type: "permission_required",
      sessionId: "sess1",
      command: "git status",
      timestamp: now - 20000,
    });
    insertEvent({
      type: "completed",
      sessionId: "sess1",
      timestamp: now - 10000,
    });

    // Session 2: 5s approval time
    insertEvent({
      type: "permission_required",
      sessionId: "sess2",
      command: "npm test",
      timestamp: now - 8000,
    });
    insertEvent({
      type: "completed",
      sessionId: "sess2",
      timestamp: now - 3000,
    });

    const report = await engine.generateReport({ since: now - 30000 });

    expect(report.performance.avgApprovalTimeMs).toBe(7500); // (10000 + 5000) / 2
    expect(report.performance.medianApprovalTimeMs).toBe(7500);
    expect(report.performance.longestStallMs).toBe(10000);
    expect(report.performance.longestStallCommand).toBe("git status");
  });

  it("handles missing sessionId gracefully", async () => {
    const now = Date.now();

    // Event without sessionId
    insertEvent({
      type: "permission_required",
      sessionId: null,
      timestamp: now - 1000,
    });

    const report = await engine.generateReport({ since: now - 10000 });

    expect(report.performance.avgApprovalTimeMs).toBeNull();
    expect(report.performance.medianApprovalTimeMs).toBeNull();
    expect(report.performance.longestStallMs).toBeNull();
    expect(report.summary.uniqueSessions).toBe(0);
  });

  it("respects time window filters", async () => {
    const now = Date.now();

    // Old event (outside window)
    insertEvent({
      type: "permission_required",
      riskLevel: "high",
      timestamp: now - 100000,
    });

    // Recent event (inside window)
    insertEvent({
      type: "permission_required",
      riskLevel: "low",
      timestamp: now - 5000,
    });

    const report = await engine.generateReport({ since: now - 10000 });

    expect(report.summary.totalCommands).toBe(1);
    expect(report.riskBreakdown.low.count).toBe(1);
    expect(report.riskBreakdown.high.count).toBe(0);
  });

  it("filters by agent correctly", async () => {
    const now = Date.now();

    insertEvent({ agent: "claude-code", timestamp: now - 1000 });
    insertEvent({ agent: "kiro", timestamp: now - 2000 });
    insertEvent({ agent: "claude-code", timestamp: now - 3000 });

    const report = await engine.generateReport({ since: now - 10000, agent: "claude-code" });

    expect(report.summary.totalCommands).toBe(2);
    expect(report.summary.activeAgents).toHaveLength(1);
    expect(report.summary.activeAgents[0]).toBe("claude-code");
  });

  it("filters by risk level correctly", async () => {
    const now = Date.now();

    insertEvent({ type: "permission_required", riskLevel: "high", timestamp: now - 1000 });
    insertEvent({ type: "permission_required", riskLevel: "medium", timestamp: now - 2000 });
    insertEvent({ type: "permission_required", riskLevel: "high", timestamp: now - 3000 });

    const report = await engine.generateReport({ since: now - 10000, riskLevel: "high" });

    expect(report.summary.totalCommands).toBe(2);
  });

  it("limits top commands correctly", async () => {
    const now = Date.now();

    for (let i = 0; i < 15; i++) {
      insertEvent({ command: `command-${i}`, timestamp: now - i * 1000 });
    }

    const report = await engine.generateReport({ since: now - 20000, limit: 5 });

    expect(report.topCommands).toHaveLength(5);
  });

  // CRITICAL TEST: Query 4 correctness - pairs each permission_required with nearest completion
  it("pairs each permission_required with nearest completion event only", async () => {
    const now = Date.now();

    // Session with 2 sequential permission_required events
    // Event 1: permission_required (t=now-400)
    insertEvent({
      type: "permission_required",
      sessionId: "sessionA",
      command: "first command",
      timestamp: now - 400,
    });

    // Event 2: completed (t=now-350) — pairs with Event 1 (50ms approval)
    insertEvent({
      type: "completed",
      sessionId: "sessionA",
      timestamp: now - 350,
    });

    // Event 3: permission_required (t=now-300)
    insertEvent({
      type: "permission_required",
      sessionId: "sessionA",
      command: "second command",
      timestamp: now - 300,
    });

    // Event 4: completed (t=now-250) — pairs with Event 3 (50ms approval)
    insertEvent({
      type: "completed",
      sessionId: "sessionA",
      timestamp: now - 250,
    });

    const approvalTimes = engine.queryApprovalTimes(now - 1000);

    // Should have exactly 2 approval times
    expect(approvalTimes).toHaveLength(2);

    // Both should be 50ms (not 150ms or negative)
    const times = approvalTimes.map((row) => row.approvalTimeMs).filter((t) => t !== null);
    expect(times).toHaveLength(2);
    expect(times[0]).toBe(50);
    expect(times[1]).toBe(50);

    // Verify commands are correctly paired
    const commands = approvalTimes.map((row) => row.command);
    expect(commands).toContain("first command");
    expect(commands).toContain("second command");
  });

  it("handles empty database gracefully", async () => {
    const report = await engine.generateReport({ since: Date.now() - 10000 });

    expect(report.summary.totalCommands).toBe(0);
    expect(report.summary.uniqueSessions).toBe(0);
    expect(report.summary.activeAgents).toHaveLength(0);
    expect(report.riskBreakdown.low.count).toBe(0);
    expect(report.performance.avgApprovalTimeMs).toBeNull();
  });
});
