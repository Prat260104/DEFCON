import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEventStore } from "../../src/storage/sqliteStore.js";
import type { AgentEvent } from "../../src/core/types.js";

describe("SqliteEventStore", () => {
  let store: SqliteEventStore;

  beforeEach(() => {
    store = new SqliteEventStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("persists and retrieves events in reverse chronological order", async () => {
    const event1: AgentEvent = {
      agent: "claude-code",
      type: "working",
      command: "git status",
      riskLevel: "low",
      timestamp: 1000,
    };

    const event2: AgentEvent = {
      agent: "gemini-cli",
      type: "working",
      command: "rm -rf /",
      riskLevel: "high",
      timestamp: 2000,
    };

    await store.save(event1);
    await store.save(event2);

    const results = await store.query();
    expect(results).toHaveLength(2);
    expect(results[0]?.command).toBe("rm -rf /"); // newest first
    expect(results[0]?.riskLevel).toBe("high");
    expect(results[1]?.command).toBe("git status");
    expect(results[1]?.riskLevel).toBe("low");
  });

  it("filters events by risk level", async () => {
    await store.save({ agent: "claude-code", type: "working", command: "ls", riskLevel: "low", timestamp: 100 });
    await store.save({ agent: "claude-code", type: "working", command: "npm install", riskLevel: "medium", timestamp: 200 });
    await store.save({ agent: "claude-code", type: "working", command: "sudo rm -rf", riskLevel: "high", timestamp: 300 });

    const highRisk = await store.query({ riskLevel: "high" });
    expect(highRisk).toHaveLength(1);
    expect(highRisk[0]?.command).toBe("sudo rm -rf");

    const lowRisk = await store.query({ riskLevel: "low" });
    expect(lowRisk).toHaveLength(1);
    expect(lowRisk[0]?.command).toBe("ls");
  });

  it("filters events by agent", async () => {
    await store.save({ agent: "claude-code", type: "working", command: "npm test", timestamp: 100 });
    await store.save({ agent: "gemini-cli", type: "working", command: "npm test", timestamp: 200 });

    const claudeEvents = await store.query({ agent: "claude-code" });
    expect(claudeEvents).toHaveLength(1);
    expect(claudeEvents[0]?.agent).toBe("claude-code");
  });

  it("respects limit parameter", async () => {
    for (let i = 1; i <= 10; i++) {
      await store.save({
        agent: "claude-code",
        type: "working",
        command: `cmd-${i}`,
        timestamp: 1000 + i,
      });
    }

    const limited = await store.query({ limit: 3 });
    expect(limited).toHaveLength(3);
    expect(limited[0]?.command).toBe("cmd-10");
  });

  it("preserves metadata JSON across persistence", async () => {
    const event: AgentEvent = {
      agent: "claude-code",
      type: "working",
      command: "git push",
      timestamp: Date.now(),
      sessionId: "session-xyz",
      metadata: { cwd: "/my/project", branch: "main" },
    };

    await store.save(event);
    const results = await store.query({ limit: 1 });

    expect(results[0]?.sessionId).toBe("session-xyz");
    expect(results[0]?.metadata).toEqual({ cwd: "/my/project", branch: "main" });
  });
});
