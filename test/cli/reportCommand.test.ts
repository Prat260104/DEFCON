import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AnalyticsEngine } from "../../src/storage/analytics.js";

describe("Report Command", () => {
  let tempDir: string;
  let dbPath: string;
  let engine: AnalyticsEngine;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "apl-report-cmd-test-"));
    dbPath = join(tempDir, "events.db");
    engine = new AnalyticsEngine(dbPath);
  });

  afterEach(() => {
    engine.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function insertEvent(event: Record<string, unknown>): void {
    const db = new DatabaseSync(dbPath);
    const stmt = db.prepare(`
      INSERT INTO events (agent, type, command, risk_level, session_id, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.agent ?? "test-agent",
      event.type ?? "permission_required",
      event.command ?? null,
      event.risk_level ?? null,
      event.session_id ?? null,
      event.timestamp as number,
      event.metadata ? JSON.stringify(event.metadata) : null,
    );
    db.close();
  }

  it("generates report for 24h window by default", async () => {
    const now = Date.now();

    insertEvent({ timestamp: now - 1000, type: "permission_required", risk_level: "low" });
    insertEvent({ timestamp: now - 2000, type: "permission_required", risk_level: "medium" });

    const report = await engine.generateReport({ since: now - 86400000 });

    expect(report.summary.totalCommands).toBe(2);
    expect(report.period.durationHours).toBeGreaterThan(0);
  });

  it("outputs valid JSON structure", async () => {
    const now = Date.now();

    insertEvent({ timestamp: now - 1000, type: "permission_required", risk_level: "low" });

    const report = await engine.generateReport({ since: now - 10000 });

    expect(report).toHaveProperty("period");
    expect(report).toHaveProperty("summary");
    expect(report).toHaveProperty("riskBreakdown");
    expect(report).toHaveProperty("performance");
    expect(report).toHaveProperty("topCommands");

    expect(report.period).toHaveProperty("start");
    expect(report.period).toHaveProperty("end");
    expect(report.period).toHaveProperty("durationHours");
  });

  it("handles empty database gracefully", async () => {
    const report = await engine.generateReport({ since: Date.now() - 10000 });

    expect(report.summary.totalCommands).toBe(0);
    expect(report.summary.uniqueSessions).toBe(0);
    expect(report.summary.activeAgents).toHaveLength(0);
  });

  it("sanitizes paths in top commands", async () => {
    const now = Date.now();
    const homeDir = process.env.HOME || "/Users/testuser";

    insertEvent({
      timestamp: now - 1000,
      command: `${homeDir}/secret/project/file.ts`,
      type: "permission_required",
    });

    const report = await engine.generateReport({ since: now - 10000 });

    expect(report.topCommands).toHaveLength(1);
    expect(report.topCommands[0].command).not.toContain(homeDir);
    expect(report.topCommands[0].command).toContain("~/secret/project/file.ts");
  });

  it("respects --limit flag for top commands", async () => {
    const now = Date.now();

    for (let i = 0; i < 20; i++) {
      insertEvent({
        timestamp: now - i * 1000,
        command: `command-${i}`,
      });
    }

    const report = await engine.generateReport({ since: now - 30000, limit: 3 });

    expect(report.topCommands.length).toBeLessThanOrEqual(3);
  });

  it("filters by agent name", async () => {
    const now = Date.now();

    insertEvent({ agent: "claude-code", timestamp: now - 1000 });
    insertEvent({ agent: "kiro", timestamp: now - 2000 });
    insertEvent({ agent: "claude-code", timestamp: now - 3000 });

    const report = await engine.generateReport({
      since: now - 10000,
      agent: "claude-code",
    });

    expect(report.summary.totalCommands).toBe(2);
    expect(report.summary.activeAgents).toEqual(["claude-code"]);
  });

  it("filters by risk level", async () => {
    const now = Date.now();

    insertEvent({ type: "permission_required", risk_level: "high", timestamp: now - 1000 });
    insertEvent({ type: "permission_required", risk_level: "medium", timestamp: now - 2000 });
    insertEvent({ type: "permission_required", risk_level: "high", timestamp: now - 3000 });

    const report = await engine.generateReport({
      since: now - 10000,
      riskLevel: "high",
    });

    expect(report.summary.totalCommands).toBe(2);
  });

  it("sanitizes paths in performance metrics", async () => {
    const now = Date.now();
    const homeDir = process.env.HOME || "/Users/testuser";

    insertEvent({
      type: "permission_required",
      session_id: "sess1",
      command: `${homeDir}/project/deploy.sh`,
      timestamp: now - 20000,
    });
    insertEvent({
      type: "completed",
      session_id: "sess1",
      timestamp: now - 10000,
    });

    const report = await engine.generateReport({ since: now - 30000 });

    expect(report.performance.longestStallCommand).not.toBeNull();
    expect(report.performance.longestStallCommand).not.toContain(homeDir);
    expect(report.performance.longestStallCommand).toContain("~/project/deploy.sh");
  });
});
