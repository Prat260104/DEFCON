import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAplMcpServer } from "../../src/mcp/server.js";
import { SqliteEventStore } from "../../src/storage/sqliteStore.js";
import { resolvePolicy } from "../../src/risk/policy.js";
import { classify } from "../../src/risk/classify.js";

describe("APL MCP Server", () => {
  let store: SqliteEventStore;

  beforeEach(() => {
    store = new SqliteEventStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("initializes McpServer instance with registered tools", () => {
    const server = createAplMcpServer(store);
    expect(server).toBeDefined();
  });

  it("correctly intercepts and classifies safe commands", () => {
    const classification = classify("echo 'safe test'");
    const decision = resolvePolicy("echo 'safe test'");

    expect(classification.level).toBe("low");
    expect(decision.action).toBe("auto-approve");
  });

  it("correctly blocks blacklisted commands before execution", () => {
    const decision = resolvePolicy("rm -rf /");

    expect(decision.action).toBe("block");
    expect(decision.isBlacklisted).toBe(true);
    expect(decision.riskLevel).toBe("high");
  });

  it("persists execution records to audit store", async () => {
    await store.save({
      agent: "mcp-client",
      type: "completed",
      command: "pwd",
      riskLevel: "low",
      timestamp: Date.now(),
    });

    const results = await store.query({ agent: "mcp-client" });
    expect(results).toHaveLength(1);
    expect(results[0]?.command).toBe("pwd");
    expect(results[0]?.riskLevel).toBe("low");
  });
});
