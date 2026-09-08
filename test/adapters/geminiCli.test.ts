import { describe, it, expect } from "vitest";
import { parseGeminiCliPayload, mapGeminiCliEvent } from "../../src/adapters/geminiCli.js";

describe("parseGeminiCliPayload", () => {
  it("parses BeforeTool payload", () => {
    const line = JSON.stringify({
      agent: "gemini-cli",
      event: "BeforeTool",
      session_id: "gemini-sess-1",
      tool_name: "bash",
      tool_input: { command: "git reset --hard" },
      cwd: "/Users/dev/app",
    });

    const result = parseGeminiCliPayload(line);
    expect(result).not.toBeNull();
    expect(result!.event).toBe("BeforeTool");
  });

  it("parses Notification payload", () => {
    const line = JSON.stringify({
      agent: "gemini-cli",
      event: "Notification",
      session_id: "gemini-sess-2",
      message: "Needs confirmation for script",
    });

    const result = parseGeminiCliPayload(line);
    expect(result).not.toBeNull();
    expect(result!.event).toBe("Notification");
  });

  it("returns null for non-gemini payloads without matching event", () => {
    const line = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
    });

    expect(parseGeminiCliPayload(line)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseGeminiCliPayload("invalid")).toBeNull();
    expect(parseGeminiCliPayload("")).toBeNull();
  });
});

describe("mapGeminiCliEvent", () => {
  it("maps BeforeTool to working event with high risk classification", () => {
    const payload = {
      agent: "gemini-cli" as const,
      event: "BeforeTool" as const,
      session_id: "gem-1",
      tool_name: "bash",
      tool_input: { command: "rm -rf /" },
      cwd: "/projects/repo",
    };

    const event = mapGeminiCliEvent(payload);

    expect(event.agent).toBe("gemini-cli");
    expect(event.type).toBe("working");
    expect(event.command).toBe("rm -rf /");
    expect(event.riskLevel).toBe("high");
    expect(event.sessionId).toBe("gem-1");
  });

  it("maps BeforeTool with safe command to low risk", () => {
    const payload = {
      agent: "gemini-cli" as const,
      event: "BeforeTool" as const,
      tool_input: { command: "git status" },
    };

    const event = mapGeminiCliEvent(payload);

    expect(event.riskLevel).toBe("low");
    expect(event.type).toBe("working");
  });

  it("maps Notification to permission_required event", () => {
    const payload = {
      agent: "gemini-cli" as const,
      event: "Notification" as const,
      message: "Please authorize action",
      type: "permission",
    };

    const event = mapGeminiCliEvent(payload);

    expect(event.agent).toBe("gemini-cli");
    expect(event.type).toBe("permission_required");
    expect(event.metadata).toEqual(
      expect.objectContaining({
        message: "Please authorize action",
        notificationType: "permission",
      }),
    );
  });
});
