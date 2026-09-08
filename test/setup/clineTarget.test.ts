import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runSetup } from "../../src/setup/engine.js";
import { TARGET_DEFINITIONS, getClineDefaultConfigPath } from "../../src/setup/targets.js";

describe("Cline Setup Target (Phase 10A)", () => {
  let tempDir: string;
  let clineConfigPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "apl-cline-setup-test-"));
    clineConfigPath = join(tempDir, "cline_mcp_settings.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("provides valid default config path for Cline", () => {
    const defaultPath = getClineDefaultConfigPath();
    expect(defaultPath).toBeDefined();
    expect(defaultPath.endsWith("cline_mcp_settings.json")).toBe(true);
    expect(defaultPath).toContain("saoudrizwan.claude-dev");
  });

  it("safely merges into existing Cline MCP config preserving unrelated servers and keys", () => {
    const initial = {
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "token-123" },
        },
      },
    };

    const target = TARGET_DEFINITIONS["cline"];
    const mcpPath = "/fake/dist/mcp/index.js";
    const mergeRes = target.mergeConfig(initial, mcpPath);

    expect(mergeRes.changed).toBe(true);
    expect(mergeRes.alreadyConfigured).toBe(false);

    const updated = mergeRes.updated;
    // Preserves other servers untouched
    expect(updated.mcpServers.github).toBeDefined();
    expect(updated.mcpServers.github.command).toBe("npx");
    expect(updated.mcpServers.github.env.GITHUB_TOKEN).toBe("token-123");

    // Injects APL MCP server correctly
    expect(updated.mcpServers["agent-permission-layer"]).toEqual({
      command: "node",
      args: [mcpPath],
    });
  });

  it("is idempotent: re-running mergeConfig on already configured Cline config produces no changes", () => {
    const target = TARGET_DEFINITIONS["cline"];
    const mcpPath = "/fake/dist/mcp/index.js";

    const configured = {
      mcpServers: {
        "agent-permission-layer": {
          command: "node",
          args: [mcpPath],
        },
      },
    };

    const secondMerge = target.mergeConfig(configured, mcpPath);
    expect(secondMerge.changed).toBe(false);
    expect(secondMerge.alreadyConfigured).toBe(true);
  });

  it("undoes config cleanly: removes only agent-permission-layer and preserves other servers", () => {
    const target = TARGET_DEFINITIONS["cline"];
    const withApl = {
      theme: "dark",
      mcpServers: {
        sqlite: { command: "uvx", args: ["mcp-server-sqlite"] },
        "agent-permission-layer": { command: "node", args: ["/path/to/dist/mcp/index.js"] },
      },
    };

    const undoRes = target.undoConfig(withApl);
    expect(undoRes.changed).toBe(true);
    expect(undoRes.updated.theme).toBe("dark");
    expect(undoRes.updated.mcpServers.sqlite).toBeDefined();
    expect("agent-permission-layer" in undoRes.updated.mcpServers).toBe(false);
  });

  it("undoes config cleanly when APL was the only server: cleans up mcpServers object", () => {
    const target = TARGET_DEFINITIONS["cline"];
    const onlyApl = {
      mcpServers: {
        "agent-permission-layer": { command: "node", args: ["/path/to/dist/mcp/index.js"] },
      },
    };

    const undoRes = target.undoConfig(onlyApl);
    expect(undoRes.changed).toBe(true);
    expect(undoRes.updated.mcpServers).toBeUndefined();
  });

  it("integrates with runSetup engine via customPaths", async () => {
    writeFileSync(
      clineConfigPath,
      JSON.stringify(
        {
          mcpServers: {
            memory: { command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
          },
        },
        null,
        2,
      ),
    );

    const results = await runSetup({
      customPaths: {
        cline: clineConfigPath,
      },
    });

    const clineResult = results.find((r) => r.id === "cline");
    expect(clineResult).toBeDefined();
    expect(clineResult?.status).toBe("installed");
    expect(clineResult?.detected).toBe(true);

    const updatedRaw = readFileSync(clineConfigPath, "utf-8");
    const updated = JSON.parse(updatedRaw);
    expect(updated.mcpServers.memory).toBeDefined();
    expect(updated.mcpServers["agent-permission-layer"]).toBeDefined();
  });
});
