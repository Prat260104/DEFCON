import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TARGET_DEFINITIONS } from "../../src/setup/targets.js";

describe("OpenAI Codex Setup Target", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "apl-codex-setup-test-"));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("defines OpenAI Codex target with hook kind", () => {
    const target = TARGET_DEFINITIONS["codex"];
    expect(target).toBeDefined();
    expect(target.id).toBe("codex");
    expect(target.name).toBe("OpenAI Codex");
    expect(target.kind).toBe("hook");
    expect(target.getDefaultConfigPath().endsWith("hooks.json")).toBe(true);
  });

  it("detects when custom path exists", () => {
    const target = TARGET_DEFINITIONS["codex"];
    expect(target.detect(tempDir)).toBe(true);
    expect(target.detect("/nonexistent/path/here")).toBe(false);
  });

  it("merges hook definitions into empty configuration", () => {
    const target = TARGET_DEFINITIONS["codex"];
    const res = target.mergeConfig({});

    expect(res.changed).toBe(true);
    expect(res.alreadyConfigured).toBe(false);
    expect(res.updated.hooks).toBeDefined();
    expect(res.updated.hooks.PreToolUse).toHaveLength(1);
    expect(res.updated.hooks.PermissionRequest).toHaveLength(1);
    expect(res.updated.hooks.PostToolUse).toHaveLength(1);

    const hookCmd = res.updated.hooks.PreToolUse[0].hooks[0].command;
    expect(hookCmd).toContain(".apl/inbox.jsonl");
  });

  it("preserves existing third-party hooks when merging", () => {
    const target = TARGET_DEFINITIONS["codex"];
    const existing = {
      hooks: {
        PreToolUse: [
          {
            matcher: "bash",
            hooks: [{ type: "command", command: "/usr/local/bin/audit-logger.sh" }],
          },
        ],
        SessionStart: [
          {
            matcher: ".*",
            hooks: [{ type: "command", command: "echo start" }],
          },
        ],
      },
    };

    const res = target.mergeConfig(existing);
    expect(res.changed).toBe(true);
    expect(res.updated.hooks.PreToolUse).toHaveLength(2);
    expect(res.updated.hooks.PreToolUse[0].hooks[0].command).toBe(
      "/usr/local/bin/audit-logger.sh",
    );
    expect(res.updated.hooks.SessionStart).toHaveLength(1);
  });

  it("is idempotent when already configured", () => {
    const target = TARGET_DEFINITIONS["codex"];
    const firstMerge = target.mergeConfig({});
    expect(firstMerge.changed).toBe(true);

    const secondMerge = target.mergeConfig(firstMerge.updated);
    expect(secondMerge.changed).toBe(false);
    expect(secondMerge.alreadyConfigured).toBe(true);
  });

  it("safely undos configuration while leaving custom hooks intact", () => {
    const target = TARGET_DEFINITIONS["codex"];
    const initial = {
      hooks: {
        PreToolUse: [
          {
            matcher: "bash",
            hooks: [{ type: "command", command: "/usr/local/bin/custom.sh" }],
          },
          {
            matcher: ".*",
            hooks: [{ type: "command", command: "cat >> ~/.apl/inbox.jsonl" }],
          },
        ],
        PermissionRequest: [
          {
            matcher: ".*",
            hooks: [{ type: "command", command: "cat >> ~/.apl/inbox.jsonl" }],
          },
        ],
      },
    };

    const undoRes = target.undoConfig(initial);
    expect(undoRes.changed).toBe(true);
    expect(undoRes.updated.hooks.PreToolUse).toHaveLength(1);
    expect(undoRes.updated.hooks.PreToolUse[0].hooks[0].command).toBe(
      "/usr/local/bin/custom.sh",
    );
    expect(undoRes.updated.hooks.PermissionRequest).toBeUndefined();
  });
});
