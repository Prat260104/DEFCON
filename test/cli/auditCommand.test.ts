import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createAuditCommand,
  parseDurationToTimestamp,
  escapeCsvCell,
  formatEventsAsCsv,
} from "../../src/cli/commands/audit.js";
import { createHistoryCommand } from "../../src/cli/commands/history.js";
import { SqliteEventStore } from "../../src/storage/sqliteStore.js";
import type { AgentEvent } from "../../src/core/types.js";

describe("Audit CLI Command & Utilities", () => {
  describe("parseDurationToTimestamp", () => {
    const fixedNow = 1700000000000;

    it("parses minute units correctly", () => {
      expect(parseDurationToTimestamp("15m", fixedNow)).toBe(fixedNow - 15 * 60 * 1000);
      expect(parseDurationToTimestamp("30 mins", fixedNow)).toBe(fixedNow - 30 * 60 * 1000);
    });

    it("parses hour units correctly", () => {
      expect(parseDurationToTimestamp("1h", fixedNow)).toBe(fixedNow - 3600 * 1000);
      expect(parseDurationToTimestamp("24 hours", fixedNow)).toBe(fixedNow - 24 * 3600 * 1000);
    });

    it("parses day and week units correctly", () => {
      expect(parseDurationToTimestamp("7d", fixedNow)).toBe(fixedNow - 7 * 86400 * 1000);
      expect(parseDurationToTimestamp("2 weeks", fixedNow)).toBe(fixedNow - 14 * 86400 * 1000);
    });

    it("parses pure digits as hours", () => {
      expect(parseDurationToTimestamp("2", fixedNow)).toBe(fixedNow - 2 * 3600 * 1000);
    });

    it("returns null for invalid strings", () => {
      expect(parseDurationToTimestamp("invalid_unit", fixedNow)).toBeNull();
    });
  });

  describe("CSV RFC 4180 Escaping", () => {
    it("escapes cells with commas and quotes correctly", () => {
      expect(escapeCsvCell("simple")).toBe("simple");
      expect(escapeCsvCell("cmd, with, comma")).toBe('"cmd, with, comma"');
      expect(escapeCsvCell('cmd "with" quotes')).toBe('"cmd ""with"" quotes"');
      expect(escapeCsvCell('complex: "quoted, and comma"')).toBe(
        '"complex: ""quoted, and comma"""',
      );
      expect(escapeCsvCell(null)).toBe("");
    });

    it("formats events into valid CSV text", () => {
      const sampleEvents: AgentEvent[] = [
        {
          agent: "claude-code",
          type: "permission_required",
          command: 'echo "hello, world"',
          riskLevel: "high",
          sessionId: "sess-1",
          timestamp: 1700000000000,
        },
      ];

      const csv = formatEventsAsCsv(sampleEvents);
      expect(csv).toContain("timestamp,time,agent,type,risk_level,command,session_id");
      expect(csv).toContain('"echo ""hello, world"""');
    });
  });

  describe("defcon audit execution against SQLite store", () => {
    let tempDir: string;
    let testDbPath: string;
    let store: SqliteEventStore;

    beforeEach(async () => {
      tempDir = mkdtempSync(join(tmpdir(), "apl-audit-test-"));
      testDbPath = join(tempDir, "events.db");
      store = new SqliteEventStore(testDbPath);

      const now = Date.now();

      // Seed test events
      await store.save({
        agent: "claude-code",
        type: "working",
        command: "git status",
        riskLevel: "low",
        timestamp: now - 10 * 60 * 1000, // 10 mins ago
      });

      await store.save({
        agent: "claude-code",
        type: "permission_required",
        command: "npm install express",
        riskLevel: "medium",
        timestamp: now - 30 * 60 * 1000, // 30 mins ago
      });

      await store.save({
        agent: "gemini-cli",
        type: "permission_required",
        command: "rm -rf /",
        riskLevel: "high",
        timestamp: now - 45 * 60 * 1000, // 45 mins ago
      });

      await store.save({
        agent: "cline",
        type: "permission_required",
        command: "sudo dd if=/dev/zero of=/dev/sda",
        riskLevel: "high",
        timestamp: now - 3 * 3600 * 1000, // 3 hours ago
      });

      await store.save({
        agent: "claude-code",
        type: "completed",
        command: "cargo check",
        riskLevel: "low",
        timestamp: now - 4 * 3600 * 1000, // 4 hours ago
      });
    });

    afterEach(() => {
      store.close();
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
      vi.restoreAllMocks();
    });

    it("displays tabular events with risk badges", async () => {
      const logs: string[] = [];
      vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

      const cmd = createAuditCommand();
      await cmd.parseAsync(["node", "test", "--db", testDbPath]);

      const output = logs.join("\n");
      expect(output).toContain("DEFCON Audit Log");
      expect(output).toContain("🔴 HIGH ");
      expect(output).toContain("🟡 MED  ");
      expect(output).toContain("🟢 LOW  ");
      expect(output).toContain("rm -rf /");
      expect(output).toContain("git status");
    });

    it("filters strictly by --risk high", async () => {
      const logs: string[] = [];
      vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

      const cmd = createAuditCommand();
      await cmd.parseAsync(["node", "test", "--db", testDbPath, "--risk", "high"]);

      const output = logs.join("\n");
      expect(output).toContain("rm -rf /");
      expect(output).toContain("sudo dd if=/dev/zero");
      expect(output).not.toContain("git status");
      expect(output).not.toContain("npm install express");
      expect(output).toContain("2 events");
    });

    it("filters strictly by --since 1h excluding older events", async () => {
      const logs: string[] = [];
      vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

      const cmd = createAuditCommand();
      await cmd.parseAsync(["node", "test", "--db", testDbPath, "--since", "1h"]);

      const output = logs.join("\n");
      // Events within last hour: git status (10m), npm install (30m), rm -rf / (45m)
      expect(output).toContain("git status");
      expect(output).toContain("npm install express");
      expect(output).toContain("rm -rf /");

      // Events older than 1h (3h, 4h ago) must be excluded
      expect(output).not.toContain("sudo dd if=/dev/zero");
      expect(output).not.toContain("cargo check");
    });

    it("filters by agent / adapter", async () => {
      const logs: string[] = [];
      vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

      const cmd = createAuditCommand();
      await cmd.parseAsync(["node", "test", "--db", testDbPath, "--agent", "gemini-cli"]);

      const output = logs.join("\n");
      expect(output).toContain("gemini-cli");
      expect(output).toContain("rm -rf /");
      expect(output).not.toContain("cline");
      expect(output).not.toContain("npm install express");
    });

    it("filters by event type", async () => {
      const logs: string[] = [];
      vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

      const cmd = createAuditCommand();
      await cmd.parseAsync(["node", "test", "--db", testDbPath, "--type", "completed"]);

      const output = logs.join("\n");
      expect(output).toContain("cargo check");
      expect(output).not.toContain("rm -rf /");
      expect(output).not.toContain("git status");
    });

    it("outputs valid JSON with --json", async () => {
      const logs: string[] = [];
      vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

      const cmd = createAuditCommand();
      await cmd.parseAsync(["node", "test", "--db", testDbPath, "--json"]);

      const output = logs.join("\n");
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(5);
      expect(parsed[0]).toHaveProperty("agent");
      expect(parsed[0]).toHaveProperty("riskLevel");
      expect(parsed[0]).toHaveProperty("timestamp");
    });

    it("outputs properly formatted and escaped CSV with --csv", async () => {
      // Save an event with comma and quotes
      await store.save({
        agent: "claude-code",
        type: "permission_required",
        command: 'echo "hello, world" && git commit -m "feat: added, tested"',
        riskLevel: "medium",
        sessionId: "sess-tricky",
        timestamp: Date.now(),
      });

      const logs: string[] = [];
      vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

      const cmd = createAuditCommand();
      await cmd.parseAsync(["node", "test", "--db", testDbPath, "--csv"]);

      const output = logs.join("\n");
      const lines = output.split("\n");
      expect(lines[0]).toBe("timestamp,time,agent,type,risk_level,command,session_id");

      // Tricky line must have escaped double quotes and preserve internal commas
      const trickyLine = lines.find((l) => l.includes("sess-tricky"));
      expect(trickyLine).toBeDefined();
      expect(trickyLine).toContain('""hello, world""');
      expect(trickyLine).toContain('""feat: added, tested""');
    });

    it("handles empty database gracefully", async () => {
      const emptyDbPath = join(tempDir, "empty.db");
      const emptyStore = new SqliteEventStore(emptyDbPath);
      emptyStore.close();

      const logs: string[] = [];
      vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

      const cmd = createAuditCommand();
      await cmd.parseAsync(["node", "test", "--db", emptyDbPath]);

      const output = logs.join("\n");
      expect(output).toContain("No events recorded matching criteria");
      expect(output).toContain("defcon start");
    });

    it("provides 100% backward compatibility via history command", async () => {
      const auditLogs: string[] = [];
      const historyLogs: string[] = [];

      vi.spyOn(console, "log").mockImplementation((msg) => auditLogs.push(String(msg)));
      const auditCmd = createAuditCommand();
      await auditCmd.parseAsync(["node", "test", "--db", testDbPath, "--json"]);

      vi.spyOn(console, "log").mockImplementation((msg) => historyLogs.push(String(msg)));
      const historyCmd = createHistoryCommand();
      await historyCmd.parseAsync(["node", "test", "--db", testDbPath, "--json"]);

      expect(auditLogs.join("\n")).toEqual(historyLogs.join("\n"));
    });
  });
});
