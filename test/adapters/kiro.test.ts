import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseKiroPayload,
  mapKiroEvent,
  checkKiroSessionPending,
  KiroAdapter,
  kiroSessionCommandCache,
} from "../../src/adapters/kiro.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("checkKiroSessionPending (GUI Transcript Observer)", () => {
  const testDir = join(tmpdir(), `apl-kiro-gui-test-${Date.now()}`);
  const messagesPath = join(testDir, "messages.jsonl");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(messagesPath, "");
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignored: cleanup error
    }
  });

  it("detects pending tool approval interaction from real Kiro format", () => {
    const lines =
      [
        JSON.stringify({
          id: "turn-start-1",
          timestamp: new Date().toISOString(),
          payload: { type: "turn_start" },
        }),
        JSON.stringify({
          id: "msg-1",
          timestamp: new Date().toISOString(),
          payload: { type: "assistant", content: "I will run echo find" },
        }),
        JSON.stringify({
          id: "run_command_tooluse_123-pending",
          timestamp: new Date().toISOString(),
          payload: {
            type: "pending_interaction",
            interactionType: "tool_approval",
            toolCallId: "run_command_tooluse_123",
            question: 'echo "find"',
            options: [{ optionId: "accept", name: "Allow" }],
          },
        }),
      ].join("\n") + "\n";

    writeFileSync(messagesPath, lines);

    const result = checkKiroSessionPending(messagesPath);
    expect(result.isPending).toBe(true);
    expect(result.command).toBe('echo "find"');
    expect(result.toolCallId).toBe("run_command_tooluse_123");
  });

  it("returns not pending when tool_result resolves the interaction", () => {
    const lines =
      [
        JSON.stringify({
          id: "run_command_tooluse_123-pending",
          timestamp: new Date().toISOString(),
          payload: {
            type: "pending_interaction",
            interactionType: "tool_approval",
            toolCallId: "run_command_tooluse_123",
            question: 'echo "find"',
          },
        }),
        JSON.stringify({
          id: "run_command_tooluse_123-result",
          timestamp: new Date().toISOString(),
          payload: {
            type: "tool_result",
            toolCallId: "run_command_tooluse_123",
            content: "find",
            success: true,
          },
        }),
      ].join("\n") + "\n";

    writeFileSync(messagesPath, lines);

    const result = checkKiroSessionPending(messagesPath);
    expect(result.isPending).toBe(false);
  });
});

describe("KiroAdapter Live GUI Watcher", () => {
  const testDir = join(tmpdir(), `apl-kiro-watcher-test-${Date.now()}`);
  const sessDir = join(testDir, "mock_ws_hash", "sess_mock_uuid");
  const messagesPath = join(sessDir, "messages.jsonl");

  beforeEach(() => {
    mkdirSync(sessDir, { recursive: true });
    writeFileSync(messagesPath, "");
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignored: cleanup error
    }
  });

  it("watches session messages.jsonl and emits permission_required and completed events", async () => {
    const adapter = new KiroAdapter(undefined, testDir);
    const events: any[] = [];

    adapter.onEvent((event) => {
      events.push(event);
    });

    await adapter.start();

    // 1. Write pending interaction
    const pendingLine =
      JSON.stringify({
        id: "pending-1",
        payload: {
          type: "pending_interaction",
          interactionType: "tool_approval",
          toolCallId: "tool-call-abc",
          question: "git reset --hard HEAD~1",
        },
      }) + "\n";

    writeFileSync(messagesPath, pendingLine);

    // Wait for file change detection
    await new Promise((r) => setTimeout(r, 350));

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].agent).toBe("kiro");
    expect(events[0].type).toBe("permission_required");
    expect(events[0].command).toBe("git reset --hard HEAD~1");
    expect(events[0].riskLevel).toBe("high");

    // 2. Write tool resolution
    const resolvedLines =
      pendingLine +
      JSON.stringify({
        id: "result-1",
        payload: {
          type: "tool_result",
          toolCallId: "tool-call-abc",
          success: true,
        },
      }) +
      "\n";

    writeFileSync(messagesPath, resolvedLines);
    await new Promise((r) => setTimeout(r, 350));

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[1].type).toBe("completed");

    await adapter.stop();
  });
});

describe("parseKiroPayload (Hook Parser Edge Cases)", () => {
  it("parses a valid Kiro PreToolUse payload with explicit agent", () => {
    const line = JSON.stringify({
      agent: "kiro",
      session_id: "kiro-sess-1",
      cwd: "/projects/mock-app",
      hook_event_name: "PreToolUse",
      tool_name: "execute_command",
      tool_input: { command: "npm test" },
    });

    const result = parseKiroPayload(line);
    expect(result).not.toBeNull();
    expect(result!.agent).toBe("kiro");
  });

  it("parses a valid Kiro ToolExecution payload with kiro-ide agent", () => {
    const line = JSON.stringify({
      agent: "kiro-ide",
      session_id: "kiro-sess-2",
      event: "ToolExecution",
      command: "git status",
    });

    const result = parseKiroPayload(line);
    expect(result).not.toBeNull();
    expect(result!.agent).toBe("kiro-ide");
  });

  it("parses a valid Kiro Notification / PermissionRequired payload", () => {
    const line = JSON.stringify({
      agent: "kiro",
      session_id: "kiro-sess-1",
      hook_event_name: "PermissionRequired",
      status: "pending",
    });

    const result = parseKiroPayload(line);
    expect(result).not.toBeNull();
  });

  it("parses a valid Kiro Completed event", () => {
    const line = JSON.stringify({
      agent: "kiro",
      session_id: "kiro-sess-1",
      hook_event_name: "Completed",
      status: "completed",
    });

    const result = parseKiroPayload(line);
    expect(result).not.toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseKiroPayload("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseKiroPayload("   \n  ")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseKiroPayload("{broken json")).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    expect(parseKiroPayload("[1, 2, 3]")).toBeNull();
    expect(parseKiroPayload('"string"')).toBeNull();
  });

  it("returns null for unrelated JSON payloads", () => {
    const line = JSON.stringify({ other_tool: "unrelated", data: 123 });
    expect(parseKiroPayload(line)).toBeNull();
  });
});

describe("mapKiroEvent & Session Correlation", () => {
  beforeEach(() => {
    kiroSessionCommandCache.clear();
  });

  it("maps PreToolUse to working event and sets risk classification", () => {
    const payload = {
      agent: "kiro",
      session_id: "sess-100",
      hook_event_name: "PreToolUse",
      tool_name: "bash",
      tool_input: { command: "git status" },
    };

    const event = mapKiroEvent(payload);
    expect(event.agent).toBe("kiro");
    expect(event.type).toBe("working");
    expect(event.command).toBe("git status");
    expect(event.riskLevel).toBe("low");
  });

  it("classifies high risk commands properly", () => {
    const payload = {
      agent: "kiro",
      session_id: "sess-101",
      hook_event_name: "PreToolUse",
      command: "rm -rf /",
    };

    const event = mapKiroEvent(payload);
    expect(event.riskLevel).toBe("high");
    expect(event.command).toBe("rm -rf /");
  });

  it("correlates session commands between PreToolUse and PermissionRequired events", () => {
    const prePayload = {
      agent: "kiro",
      session_id: "sess-200",
      hook_event_name: "PreToolUse",
      tool_input: { command: "npm install dangerous-pkg" },
    };

    mapKiroEvent(prePayload);

    const notifPayload = {
      agent: "kiro",
      session_id: "sess-200",
      hook_event_name: "PermissionRequired",
      status: "pending",
    };

    const event = mapKiroEvent(notifPayload);
    expect(event.type).toBe("permission_required");
    expect(event.command).toBe("npm install dangerous-pkg");
    expect(event.riskLevel).toBe("medium");
  });

  it("cleans up session cache when Completed event arrives", () => {
    const prePayload = {
      agent: "kiro",
      session_id: "sess-300",
      hook_event_name: "PreToolUse",
      command: "ls -la",
    };

    mapKiroEvent(prePayload);
    expect(kiroSessionCommandCache.has("sess-300")).toBe(true);

    const completedPayload = {
      agent: "kiro",
      session_id: "sess-300",
      hook_event_name: "Completed",
      status: "completed",
    };

    const event = mapKiroEvent(completedPayload);
    expect(event.type).toBe("completed");
    expect(event.command).toBe("ls -la");
    expect(kiroSessionCommandCache.has("sess-300")).toBe(false);
  });
});
