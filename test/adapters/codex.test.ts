import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseCodexPayload,
  mapCodexEvent,
  CodexAdapter,
  codexSessionCommandCache,
} from "../../src/adapters/codex.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("parseCodexPayload", () => {
  it("parses PreToolUse payload with turn_id and tool_input", () => {
    const line = JSON.stringify({
      hook_event_name: "PreToolUse",
      session_id: "codex-sess-1",
      turn_id: "turn-abc",
      cwd: "/Users/dev/project",
      model: "o3",
      permission_mode: "default",
      tool_name: "bash",
      tool_use_id: "call-1",
      tool_input: { command: "git reset --hard HEAD~1" },
    });

    const result = parseCodexPayload(line);
    expect(result).not.toBeNull();
    expect(result!.hook_event_name).toBe("PreToolUse");
    expect((result as any).turn_id).toBe("turn-abc");
    expect((result as any).tool_input.command).toBe("git reset --hard HEAD~1");
  });

  it("parses PermissionRequest payload", () => {
    const line = JSON.stringify({
      hook_event_name: "PermissionRequest",
      session_id: "codex-sess-1",
      turn_id: "turn-abc",
      cwd: "/Users/dev/project",
      model: "o3",
      permission_mode: "default",
      tool_name: "bash",
      tool_input: { command: "rm -rf node_modules" },
    });

    const result = parseCodexPayload(line);
    expect(result).not.toBeNull();
    expect(result!.hook_event_name).toBe("PermissionRequest");
  });

  it("parses PostToolUse payload", () => {
    const line = JSON.stringify({
      hook_event_name: "PostToolUse",
      session_id: "codex-sess-1",
      turn_id: "turn-abc",
      cwd: "/Users/dev/project",
      tool_name: "bash",
      tool_use_id: "call-1",
      tool_response: { exit_code: 0 },
    });

    const result = parseCodexPayload(line);
    expect(result).not.toBeNull();
    expect(result!.hook_event_name).toBe("PostToolUse");
  });

  it("does not hijack standard Claude Code PreToolUse (without codex fields)", () => {
    const line = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls -la" },
    });

    // Without turn_id, model, permission_mode, or agent="codex", should be null
    expect(parseCodexPayload(line)).toBeNull();
  });

  it("parses PreToolUse when explicitly tagged with agent: 'codex'", () => {
    const line = JSON.stringify({
      agent: "codex",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "cargo build" },
    });

    const result = parseCodexPayload(line);
    expect(result).not.toBeNull();
    expect(result!.hook_event_name).toBe("PreToolUse");
  });

  it("returns null for malformed JSON or empty lines", () => {
    expect(parseCodexPayload("")).toBeNull();
    expect(parseCodexPayload("   ")).toBeNull();
    expect(parseCodexPayload("not json")).toBeNull();
    expect(parseCodexPayload("{}")).toBeNull();
  });
});

describe("mapCodexEvent", () => {
  beforeEach(() => {
    codexSessionCommandCache.clear();
  });

  it("maps PreToolUse to permission_required for high risk command requiring approval", () => {
    const payload = {
      hook_event_name: "PreToolUse" as const,
      session_id: "sess-1",
      turn_id: "turn-1",
      cwd: "/workspace",
      tool_name: "bash",
      tool_input: { command: "git push --force origin main" },
      permission_mode: "default",
    };

    const event = mapCodexEvent(payload);
    expect(event.agent).toBe("codex");
    expect(event.type).toBe("permission_required");
    expect(event.command).toBe("git push --force origin main");
    expect(event.riskLevel).toBe("high");
    expect(event.sessionId).toBe("sess-1");
    expect(event.metadata?.["turnId"]).toBe("turn-1");
  });

  it("maps PreToolUse to working for low risk inspection command", () => {
    const payload = {
      hook_event_name: "PreToolUse" as const,
      session_id: "sess-low",
      tool_name: "bash",
      tool_input: { command: "ls -la" },
    };

    const event = mapCodexEvent(payload);
    expect(event.type).toBe("working");
    expect(event.riskLevel).toBe("low");
  });

  it("maps PreToolUse to working when permission mode is bypassPermissions", () => {
    const payload = {
      hook_event_name: "PreToolUse" as const,
      session_id: "sess-bypass",
      tool_name: "bash",
      tool_input: { command: "rm -rf /" },
      permission_mode: "bypassPermissions",
    };

    const event = mapCodexEvent(payload);
    expect(event.type).toBe("working");
  });

  it("maps PermissionRequest to permission_required event", () => {
    const payload = {
      hook_event_name: "PermissionRequest" as const,
      session_id: "sess-1",
      turn_id: "turn-1",
      cwd: "/workspace",
      tool_name: "bash",
      tool_input: { command: "npm install lodash" },
      permission_mode: "default",
    };

    const event = mapCodexEvent(payload);
    expect(event.agent).toBe("codex");
    expect(event.type).toBe("permission_required");
    expect(event.command).toBe("npm install lodash");
    expect(event.riskLevel).toBe("medium");
    expect(event.metadata?.["permissionMode"]).toBe("default");
  });

  it("maps PostToolUse to completed event", () => {
    const payload = {
      hook_event_name: "PostToolUse" as const,
      session_id: "sess-1",
      turn_id: "turn-1",
      tool_name: "bash",
      tool_use_id: "call-99",
      tool_response: { stdout: "ok" },
    };

    const event = mapCodexEvent(payload);
    expect(event.agent).toBe("codex");
    expect(event.type).toBe("completed");
    expect(event.metadata?.["toolUseId"]).toBe("call-99");
  });

  it("retrieves cached command from PreToolUse if PermissionRequest tool_input is empty", () => {
    const prePayload = {
      hook_event_name: "PreToolUse" as const,
      session_id: "sess-cached",
      tool_name: "bash",
      tool_input: { command: "git reset --hard" },
    };
    mapCodexEvent(prePayload);

    const permPayload = {
      hook_event_name: "PermissionRequest" as const,
      session_id: "sess-cached",
      tool_name: "bash",
    };
    const event = mapCodexEvent(permPayload);

    expect(event.type).toBe("permission_required");
    expect(event.command).toBe("git reset --hard");
    expect(event.riskLevel).toBe("high");
  });
});

describe("CodexAdapter lifecycle", () => {
  let tmpDir: string;
  let inboxFile: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "codex-test-"));
    inboxFile = join(tmpDir, "inbox.jsonl");
    writeFileSync(inboxFile, "");
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  });

  it("starts and stops cleanly", async () => {
    const adapter = new CodexAdapter(inboxFile);
    await adapter.start();
    const status = await adapter.getStatus();
    expect(status.running).toBe(true);

    await adapter.stop();
    const stoppedStatus = await adapter.getStatus();
    expect(stoppedStatus.running).toBe(false);
  });
});
