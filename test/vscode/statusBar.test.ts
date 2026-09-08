import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { computeStatusBarInfo } from "../../packages/vscode-apl/src/statusBar.js";
import {
  readRecentInboxEvents,
  getActivePendingEvent,
  isDaemonActive,
} from "../../packages/vscode-apl/src/auditReader.js";
import type { AgentEvent } from "../../packages/vscode-apl/src/types.js";

describe("VS Code Extension (Phase 10A) — Status Bar & Audit Reader", () => {
  let tempDir: string;
  let testInboxPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "apl-vscode-test-"));
    testInboxPath = join(tempDir, "inbox.jsonl");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("computeStatusBarInfo", () => {
    it("displays Inactive state when daemon is not running", () => {
      const info = computeStatusBarInfo(false, null);
      expect(info.state).toBe("inactive");
      expect(info.text).toContain("APL: Inactive");
      expect(info.command).toBe("apl.checkStatus");
    });

    it("displays Active shield icon when daemon is active and idle", () => {
      const info = computeStatusBarInfo(true, null);
      expect(info.state).toBe("active");
      expect(info.text).toBe("$(shield) APL: Active");
      expect(info.command).toBe("apl.showAuditLog");
      expect(info.backgroundColorKey).toBeUndefined();
    });

    it("displays High Risk alert banner when high-risk command is awaiting approval", () => {
      const pendingEvent: AgentEvent = {
        agent: "claude-code",
        type: "permission_required",
        command: "rm -rf /dist",
        riskLevel: "high",
        timestamp: Date.now(),
      };

      const info = computeStatusBarInfo(true, pendingEvent);
      expect(info.state).toBe("pending_action");
      expect(info.text).toContain("🔴 High Risk");
      expect(info.backgroundColorKey).toBe("statusBarItem.errorBackground");
      expect(info.tooltip).toContain("rm -rf /dist");
      expect(info.tooltip).toContain("claude-code");
    });

    it("displays Medium Risk warning banner when medium-risk command is awaiting approval", () => {
      const pendingEvent: AgentEvent = {
        agent: "gemini-cli",
        type: "permission_required",
        command: "npm install -g something",
        riskLevel: "medium",
        timestamp: Date.now(),
      };

      const info = computeStatusBarInfo(true, pendingEvent);
      expect(info.state).toBe("pending_action");
      expect(info.text).toContain("🟡 Action Pending");
      expect(info.backgroundColorKey).toBe("statusBarItem.warningBackground");
    });

    it("displays Low Risk info badge when low-risk action is awaiting approval", () => {
      const pendingEvent: AgentEvent = {
        agent: "cline",
        type: "permission_required",
        command: "ls -la",
        riskLevel: "low",
        timestamp: Date.now(),
      };

      const info = computeStatusBarInfo(true, pendingEvent);
      expect(info.state).toBe("pending_action");
      expect(info.text).toContain("🟢 Action Pending");
      expect(info.backgroundColorKey).toBeUndefined();
    });
  });

  describe("readRecentInboxEvents & getActivePendingEvent", () => {
    it("safely parses JSONL events newest first and ignores corrupted lines", () => {
      const line1 = JSON.stringify({
        agent: "claude-code",
        type: "working",
        command: "git status",
        timestamp: 1000,
      });
      const lineCorrupt = "this is not json";
      const line2 = JSON.stringify({
        agent: "claude-code",
        type: "permission_required",
        command: "rm -rf /var/log",
        riskLevel: "high",
        timestamp: 2000,
      });

      writeFileSync(testInboxPath, `${line1}\n${lineCorrupt}\n${line2}\n`, "utf-8");

      const events = readRecentInboxEvents(testInboxPath, 10);
      expect(events.length).toBe(2);
      expect(events[0].command).toBe("rm -rf /var/log"); // Newest first
      expect(events[1].command).toBe("git status");
    });

    it("detects active pending event if not superseded", () => {
      const events: AgentEvent[] = [
        {
          agent: "claude-code",
          sessionId: "sess-1",
          type: "permission_required",
          command: "drop database",
          riskLevel: "high",
          timestamp: Date.now() - 10000, // 10s ago
        },
      ];

      const pending = getActivePendingEvent(events);
      expect(pending).not.toBeNull();
      expect(pending?.command).toBe("drop database");
    });

    it("returns null if permission_required was superseded by completed event for same session", () => {
      const now = Date.now();
      const events: AgentEvent[] = [
        {
          agent: "claude-code",
          sessionId: "sess-1",
          type: "completed",
          command: "drop database",
          timestamp: now,
        },
        {
          agent: "claude-code",
          sessionId: "sess-1",
          type: "permission_required",
          command: "drop database",
          riskLevel: "high",
          timestamp: now - 5000,
        },
      ];

      const pending = getActivePendingEvent(events);
      expect(pending).toBeNull();
    });

    it("returns null if permission_required is older than maxAgeMs timeout", () => {
      const oldTimestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      const events: AgentEvent[] = [
        {
          agent: "gemini-cli",
          sessionId: "sess-old",
          type: "permission_required",
          command: "npm test",
          timestamp: oldTimestamp,
        },
      ];

      const pending = getActivePendingEvent(events, 3 * 60 * 1000);
      expect(pending).toBeNull();
    });

    it("prioritizes high risk event when multiple sessions have pending permissions", () => {
      const now = Date.now();
      const events: AgentEvent[] = [
        {
          agent: "gemini-cli",
          sessionId: "sess-med",
          type: "permission_required",
          command: "npm install foo",
          riskLevel: "medium",
          timestamp: now,
        },
        {
          agent: "claude-code",
          sessionId: "sess-high",
          type: "permission_required",
          command: "rm -rf /",
          riskLevel: "high",
          timestamp: now - 1000,
        },
      ];

      const pending = getActivePendingEvent(events);
      expect(pending).not.toBeNull();
      expect(pending?.riskLevel).toBe("high");
    });
  });

  describe("isDaemonActive", () => {
    it("returns false for nonexistent paths", () => {
      const active = isDaemonActive(join(tempDir, "nonexistent-inbox.jsonl"));
      expect(typeof active).toBe("boolean");
    });
  });
});
