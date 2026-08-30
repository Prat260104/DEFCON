import { describe, it, expect } from "vitest";
import { formatNotification } from "../../src/notify/macos.js";
import type { AgentEvent } from "../../src/core/types.js";

describe("formatNotification", () => {
  it("formats high-risk command notification with Sosumi sound", () => {
    const event: AgentEvent = {
      agent: "claude-code",
      type: "working",
      command: "rm -rf /",
      riskLevel: "high",
      timestamp: Date.now(),
    };

    const notif = formatNotification(event);
    expect(notif.title).toBe("APL: claude-code");
    expect(notif.subtitle).toContain("HIGH RISK");
    expect(notif.body).toBe("rm -rf /");
    expect(notif.sound).toBe("Sosumi");
  });

  it("formats low-risk command notification with Pop sound", () => {
    const event: AgentEvent = {
      agent: "claude-code",
      type: "working",
      command: "git status",
      riskLevel: "low",
      timestamp: Date.now(),
    };

    const notif = formatNotification(event);
    expect(notif.title).toBe("APL: claude-code");
    expect(notif.subtitle).toContain("LOW RISK");
    expect(notif.body).toBe("git status");
    expect(notif.sound).toBe("Pop");
  });

  it("formats permission_required without command properly", () => {
    const event: AgentEvent = {
      agent: "gemini-cli",
      type: "permission_required",
      riskLevel: "medium",
      timestamp: Date.now(),
    };

    const notif = formatNotification(event);
    expect(notif.title).toBe("APL: gemini-cli");
    expect(notif.subtitle).toContain("MEDIUM RISK");
    expect(notif.body).toContain("waiting for approval");
    expect(notif.sound).toBe("Ping");
  });

  it("truncates very long commands with ellipsis", () => {
    const longCommand = "curl https://example.com/very/long/path/with/lots/of/parameters/and/tokens/that/exceeds/the/standard/notification/length/limit/and/more/tokens/and/arguments.sh";
    const event: AgentEvent = {
      agent: "claude-code",
      type: "working",
      command: longCommand,
      riskLevel: "high",
      timestamp: Date.now(),
    };

    const notif = formatNotification(event);
    expect(notif.body.length).toBeLessThanOrEqual(120);
    expect(notif.body.endsWith("...")).toBe(true);
  });
});
