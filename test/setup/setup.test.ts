import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runSetup } from "../../src/setup/engine.js";
import { TARGET_DEFINITIONS } from "../../src/setup/targets.js";
import { resolveMcpServerPath } from "../../src/setup/resolver.js";

describe("APL / Defcon Zero-Config Setup Wizard", () => {
  let tempDir: string;
  let claudeSettingsPath: string;
  let cursorMcpPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "apl-setup-test-"));
    claudeSettingsPath = join(tempDir, "claude-settings.json");
    cursorMcpPath = join(tempDir, "cursor-mcp.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("dynamically resolves MCP server path instead of hardcoding", () => {
    const mcpPath = resolveMcpServerPath();
    expect(mcpPath).toBeDefined();
    expect(mcpPath.endsWith("dist/mcp/index.js")).toBe(true);
  });

  describe("Claude Code Hook Merge & Undo", () => {
    it("safely merges into existing Claude Code settings preserving unrelated keys", () => {
      const initial = {
        theme: "dark",
        apiKey: "sk-test-12345",
        hooks: {
          PreToolUse: [
            {
              matcher: "WriteFile",
              hooks: [{ type: "command", command: "echo audit" }],
            },
          ],
        },
      };

      const mergeRes = TARGET_DEFINITIONS["claude-code"].mergeConfig(initial, "/path/to/mcp");
      expect(mergeRes.changed).toBe(true);
      expect(mergeRes.alreadyConfigured).toBe(false);

      const updated = mergeRes.updated;
      expect(updated.theme).toBe("dark");
      expect(updated.apiKey).toBe("sk-test-12345");
      expect(updated.hooks.PreToolUse.length).toBe(2);
      expect(updated.hooks.PreToolUse[0].matcher).toBe("WriteFile");
      expect(updated.hooks.PreToolUse[1].matcher).toBe("Bash");
      expect(updated.hooks.Notification.length).toBe(1);

      // Verify idempotency
      const secondMerge = TARGET_DEFINITIONS["claude-code"].mergeConfig(updated, "/path/to/mcp");
      expect(secondMerge.changed).toBe(false);
      expect(secondMerge.alreadyConfigured).toBe(true);
      expect(secondMerge.updated.hooks.PreToolUse.length).toBe(2);

      // Verify undo preserves unrelated hooks
      const undoRes = TARGET_DEFINITIONS["claude-code"].undoConfig(updated);
      expect(undoRes.changed).toBe(true);
      expect(undoRes.updated.theme).toBe("dark");
      expect(undoRes.updated.apiKey).toBe("sk-test-12345");
      expect(undoRes.updated.hooks.PreToolUse.length).toBe(1);
      expect(undoRes.updated.hooks.PreToolUse[0].matcher).toBe("WriteFile");
      expect(undoRes.updated.hooks.Notification).toBeUndefined();
    });
  });

  describe("Cursor & MCP Server Merge & Undo", () => {
    it("safely merges APL into mcpServers preserving unrelated MCP servers", () => {
      const initial = {
        mcpServers: {
          "github-tools": {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
          },
        },
        otherSetting: true,
      };

      const mcpPath = "/opt/apl/dist/mcp/index.js";
      const mergeRes = TARGET_DEFINITIONS.cursor.mergeConfig(initial, mcpPath);
      expect(mergeRes.changed).toBe(true);

      const updated = mergeRes.updated;
      expect(updated.otherSetting).toBe(true);
      expect(updated.mcpServers["github-tools"]).toBeDefined();
      expect(updated.mcpServers["agent-permission-layer"]).toEqual({
        command: "node",
        args: [mcpPath],
      });

      // Verify idempotency
      const secondMerge = TARGET_DEFINITIONS.cursor.mergeConfig(updated, mcpPath);
      expect(secondMerge.changed).toBe(false);
      expect(secondMerge.alreadyConfigured).toBe(true);

      // Verify undo cleanly deletes only agent-permission-layer
      const undoRes = TARGET_DEFINITIONS.cursor.undoConfig(updated);
      expect(undoRes.changed).toBe(true);
      expect(undoRes.updated.mcpServers["github-tools"]).toBeDefined();
      expect(undoRes.updated.mcpServers["agent-permission-layer"]).toBeUndefined();
    });
  });

  describe("Kiro IDE Hook Merge & Undo", () => {
    it("safely merges into Kiro hooks config preserving unrelated hooks and undoes cleanly", () => {
      const initial = {
        version: "v1",
        hooks: [
          {
            name: "user-lint-hook",
            trigger: "PostFileSave",
            matcher: "\\.ts$",
            action: { type: "command", command: "npm run lint" },
          },
        ],
      };

      const mergeRes = TARGET_DEFINITIONS.kiro.mergeConfig(initial, "/path/to/mcp");
      expect(mergeRes.changed).toBe(true);
      expect(mergeRes.alreadyConfigured).toBe(false);

      const updated = mergeRes.updated;
      expect(updated.version).toBe("v1");
      expect(updated.hooks.length).toBe(3);
      expect(updated.hooks[0].name).toBe("user-lint-hook");
      expect(updated.hooks[1].name).toBe("apl-pre-tool-use");
      expect(updated.hooks[2].name).toBe("apl-notification");

      // Idempotency
      const secondMerge = TARGET_DEFINITIONS.kiro.mergeConfig(updated, "/path/to/mcp");
      expect(secondMerge.changed).toBe(false);
      expect(secondMerge.alreadyConfigured).toBe(true);

      // Undo
      const undoRes = TARGET_DEFINITIONS.kiro.undoConfig(updated);
      expect(undoRes.changed).toBe(true);
      expect(undoRes.updated.hooks.length).toBe(1);
      expect(undoRes.updated.hooks[0].name).toBe("user-lint-hook");
    });
  });

  describe("End-to-End Wizard Engine Execution", () => {
    it("runs dry-run without writing any files", async () => {
      writeFileSync(claudeSettingsPath, JSON.stringify({ apiKey: "secret" }, null, 2));

      const results = await runSetup({
        dryRun: true,
        customPaths: {
          "claude-code": claudeSettingsPath,
          cursor: cursorMcpPath,
        },
      });

      const claudeResult = results.find((r) => r.id === "claude-code");
      expect(claudeResult?.status).toBe("installed");
      expect(claudeResult?.diff).toContain("Proposed");

      // Verify file on disk was NOT modified
      const currentContent = readFileSync(claudeSettingsPath, "utf-8");
      expect(currentContent).not.toContain("inbox.jsonl");
      expect(existsSync(`${claudeSettingsPath}.bak`)).toBe(false);
    });

    it("executes setup for real, creates backups, preserves existing config, and is idempotent", async () => {
      writeFileSync(claudeSettingsPath, JSON.stringify({ userTheme: "nord", hooks: {} }, null, 2));
      writeFileSync(
        cursorMcpPath,
        JSON.stringify({ mcpServers: { customTool: { command: "custom" } } }, null, 2),
      );

      // 1. First real setup run
      const results = await runSetup({
        customPaths: {
          "claude-code": claudeSettingsPath,
          cursor: cursorMcpPath,
        },
      });

      const claudeRes = results.find((r) => r.id === "claude-code");
      const cursorRes = results.find((r) => r.id === "cursor");
      expect(claudeRes?.status).toBe("installed");
      expect(cursorRes?.status).toBe("installed");

      // Verify backup files exist
      expect(existsSync(`${claudeSettingsPath}.bak`)).toBe(true);
      expect(existsSync(`${cursorMcpPath}.bak`)).toBe(true);

      // Verify merged contents
      const claudeJson = JSON.parse(readFileSync(claudeSettingsPath, "utf-8"));
      expect(claudeJson.userTheme).toBe("nord");
      expect(claudeJson.hooks.PreToolUse).toBeDefined();

      const cursorJson = JSON.parse(readFileSync(cursorMcpPath, "utf-8"));
      expect(cursorJson.mcpServers.customTool).toBeDefined();
      expect(cursorJson.mcpServers["agent-permission-layer"]).toBeDefined();

      // 2. Second setup run (Idempotency test)
      const secondRun = await runSetup({
        customPaths: {
          "claude-code": claudeSettingsPath,
          cursor: cursorMcpPath,
        },
      });

      const secondClaude = secondRun.find((r) => r.id === "claude-code");
      const secondCursor = secondRun.find((r) => r.id === "cursor");
      expect(secondClaude?.status).toBe("already_configured");
      expect(secondCursor?.status).toBe("already_configured");

      // 3. Undo run
      const undoRun = await runSetup({
        undo: true,
        customPaths: {
          "claude-code": claudeSettingsPath,
          cursor: cursorMcpPath,
        },
      });

      const undoClaude = undoRun.find((r) => r.id === "claude-code");
      const undoCursor = undoRun.find((r) => r.id === "cursor");
      expect(undoClaude?.status).toBe("uninstalled");
      expect(undoCursor?.status).toBe("uninstalled");

      const finalClaude = JSON.parse(readFileSync(claudeSettingsPath, "utf-8"));
      expect(finalClaude.userTheme).toBe("nord");
      expect(finalClaude.hooks?.PreToolUse).toBeUndefined();

      const finalCursor = JSON.parse(readFileSync(cursorMcpPath, "utf-8"));
      expect(finalCursor.mcpServers.customTool).toBeDefined();
      expect(finalCursor.mcpServers["agent-permission-layer"]).toBeUndefined();
    });

    it("safely skips files that fail JSON parsing without corrupting them", async () => {
      const malformedJson = "{ unquoted_key: invalid json... ";
      writeFileSync(claudeSettingsPath, malformedJson);

      const results = await runSetup({
        customPaths: {
          "claude-code": claudeSettingsPath,
        },
      });

      const claudeRes = results.find((r) => r.id === "claude-code");
      expect(claudeRes?.status).toBe("skipped_parse_error");
      expect(claudeRes?.message).toContain("failed to parse as valid JSON");

      // Verify file content is completely untouched
      const after = readFileSync(claudeSettingsPath, "utf-8");
      expect(after).toBe(malformedJson);
    });
  });
});
