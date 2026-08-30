import { describe, it, expect } from "vitest";
import { processAntigravityHook } from "../../src/hooks/antigravity.js";

describe("Antigravity Hook Adapter", () => {
  it("returns 'deny' decision for blacklisted commands (rm -rf /)", () => {
    const input = JSON.stringify({
      toolCall: {
        name: "run_command",
        args: {
          CommandLine: "rm -rf /",
        },
      },
      stepIdx: 1,
    });

    const result = processAntigravityHook(input);
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("BLOCKED BY APL");
  });

  it("returns 'force_ask' for dangerous high-risk operations", () => {
    const input = JSON.stringify({
      toolCall: {
        name: "run_command",
        args: {
          CommandLine: "git reset --hard HEAD~1",
        },
      },
      stepIdx: 2,
    });

    const result = processAntigravityHook(input);
    expect(result.decision).toBe("force_ask");
    expect(result.reason).toContain("HIGH RISK");
  });

  it("returns 'ask' for medium-risk commands like npm install", () => {
    const input = JSON.stringify({
      toolCall: {
        name: "run_command",
        args: {
          CommandLine: "npm install express",
        },
      },
      stepIdx: 3,
    });

    const result = processAntigravityHook(input);
    expect(result.decision).toBe("ask");
    expect(result.reason).toContain("MEDIUM RISK");
  });

  it("returns 'allow' for whitelisted commands (git status)", () => {
    const input = JSON.stringify({
      toolCall: {
        name: "run_command",
        args: {
          CommandLine: "git status",
        },
      },
      stepIdx: 4,
    });

    const result = processAntigravityHook(input);
    expect(result.decision).toBe("allow");
    expect(result.reason).toContain("Auto-approved");
  });

  it("gracefully handles invalid JSON by returning default 'ask'", () => {
    const result = processAntigravityHook("not-valid-json");
    expect(result.decision).toBe("ask");
  });
});
