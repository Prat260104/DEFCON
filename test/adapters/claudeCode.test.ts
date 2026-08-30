import { describe, it, expect } from "vitest";
import {
  parseClaudeCodePayload,
  mapClaudeCodeEvent,
} from "../../src/adapters/claudeCode.js";

describe("parseClaudeCodePayload", () => {
  it("parses a valid PreToolUse payload", () => {
    const line = JSON.stringify({
      session_id: "abc123",
      cwd: "/Users/dev/myproject",
      hook_event_name: "PreToolUse",
      permission_mode: "default",
      tool_name: "Bash",
      tool_input: { command: "npm test" },
    });

    const result = parseClaudeCodePayload(line);
    expect(result).not.toBeNull();
    expect(result!.hook_event_name).toBe("PreToolUse");
  });

  it("parses a valid Notification payload", () => {
    const line = JSON.stringify({
      session_id: "abc123",
      cwd: "/Users/dev/myproject",
      hook_event_name: "Notification",
    });

    const result = parseClaudeCodePayload(line);
    expect(result).not.toBeNull();
    expect(result!.hook_event_name).toBe("Notification");
  });

  it("returns null for empty string", () => {
    expect(parseClaudeCodePayload("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseClaudeCodePayload("   \n  ")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseClaudeCodePayload("{broken json")).toBeNull();
  });

  it("returns null for JSON without hook_event_name", () => {
    const line = JSON.stringify({ session_id: "abc123", tool_name: "Bash" });
    expect(parseClaudeCodePayload(line)).toBeNull();
  });

  it("returns null for non-object JSON (array)", () => {
    expect(parseClaudeCodePayload("[1, 2, 3]")).toBeNull();
  });

  it("returns null for non-object JSON (primitive)", () => {
    expect(parseClaudeCodePayload('"just a string"')).toBeNull();
  });

  it("handles payload with extra unknown fields", () => {
    const line = JSON.stringify({
      session_id: "abc123",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
      unknown_field: "some value",
    });

    const result = parseClaudeCodePayload(line);
    expect(result).not.toBeNull();
    expect(result!.hook_event_name).toBe("PreToolUse");
  });
});

describe("mapClaudeCodeEvent", () => {
  it("maps PreToolUse Bash payload to working event with command", () => {
    const payload = {
      session_id: "sess-001",
      cwd: "/home/dev/project",
      hook_event_name: "PreToolUse" as const,
      permission_mode: "default",
      tool_name: "Bash",
      tool_input: { command: "npm test" },
    };

    const event = mapClaudeCodeEvent(payload);

    expect(event.agent).toBe("claude-code");
    expect(event.type).toBe("working");
    expect(event.command).toBe("npm test");
    expect(event.riskLevel).toBe("low");
    expect(event.sessionId).toBe("sess-001");
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.metadata).toEqual(
      expect.objectContaining({
        cwd: "/home/dev/project",
        toolName: "Bash",
        permissionMode: "default",
      }),
    );
  });

  it("maps PreToolUse with no command to working event with undefined command", () => {
    const payload = {
      hook_event_name: "PreToolUse" as const,
      tool_name: "Edit",
      tool_input: { file: "index.ts" },
    };

    const event = mapClaudeCodeEvent(payload);

    expect(event.type).toBe("working");
    expect(event.command).toBeUndefined();
  });

  it("maps Notification payload to permission_required event", () => {
    const payload = {
      session_id: "sess-002",
      cwd: "/home/dev/project",
      hook_event_name: "Notification" as const,
      notification_type: "permission_prompt",
    };

    const event = mapClaudeCodeEvent(payload);

    expect(event.agent).toBe("claude-code");
    expect(event.type).toBe("permission_required");
    expect(event.command).toBeUndefined();
    expect(event.sessionId).toBe("sess-002");
    expect(event.metadata).toEqual(
      expect.objectContaining({
        notificationType: "permission_prompt",
      }),
    );
  });

  it("handles missing optional fields gracefully", () => {
    const payload = {
      hook_event_name: "Notification" as const,
    };

    const event = mapClaudeCodeEvent(payload);

    expect(event.agent).toBe("claude-code");
    expect(event.type).toBe("permission_required");
    expect(event.sessionId).toBeUndefined();
    expect(event.metadata).toEqual(
      expect.objectContaining({
        cwd: undefined,
      }),
    );
  });

  it("always sets agent to claude-code", () => {
    const preToolUse = mapClaudeCodeEvent({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
    });
    const notification = mapClaudeCodeEvent({
      hook_event_name: "Notification",
    });

    expect(preToolUse.agent).toBe("claude-code");
    expect(notification.agent).toBe("claude-code");
  });

  it("extracts command from deeply nested tool_input", () => {
    const payload = {
      hook_event_name: "PreToolUse" as const,
      tool_name: "Bash",
      tool_input: {
        command: "git reset --hard HEAD~3",
        extra: { nested: true },
      },
    };

    const event = mapClaudeCodeEvent(payload);
    expect(event.command).toBe("git reset --hard HEAD~3");
  });

  it("correlates and inherits command from previous PreToolUse on Notification permission_prompt", () => {
    const customCache = new Map<string, { command: string; riskLevel?: any; timestamp: number }>();
    const sessionId = "session-12345";

    // 1. PreToolUse arrives with command
    const preToolUsePayload = {
      session_id: sessionId,
      hook_event_name: "PreToolUse" as const,
      tool_name: "Bash",
      tool_input: { command: "rm -rf ./node_modules" },
    };
    const workingEvent = mapClaudeCodeEvent(preToolUsePayload, customCache);
    expect(workingEvent.command).toBe("rm -rf ./node_modules");
    expect(workingEvent.riskLevel).toBe("high");

    // 2. Notification arrives without tool_input / command
    const notificationPayload = {
      session_id: sessionId,
      hook_event_name: "Notification" as const,
      notification_type: "permission_prompt",
    };
    const permissionEvent = mapClaudeCodeEvent(notificationPayload, customCache);

    // Permission event MUST inherit the cached command name and risk level
    expect(permissionEvent.type).toBe("permission_required");
    expect(permissionEvent.command).toBe("rm -rf ./node_modules");
    expect(permissionEvent.riskLevel).toBe("high");
  });
});
