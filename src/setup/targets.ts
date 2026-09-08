import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import type { SetupTargetId, TargetKind } from "./types.js";

export interface TargetDefinition {
  id: SetupTargetId;
  name: string;
  kind: TargetKind;
  description: string;
  manualStepNote: string;
  detect: (customPath?: string) => boolean;
  getDefaultConfigPath: () => string;
  mergeConfig: (
    existing: any,
    mcpPath: string,
  ) => { updated: any; changed: boolean; alreadyConfigured: boolean };
  undoConfig: (existing: any) => { updated: any; changed: boolean };
}

const APL_HOOK_COMMAND = "cat >> ~/.apl/inbox.jsonl";

function isAplHook(item: any): boolean {
  if (!item || typeof item !== "object") return false;
  if (Array.isArray(item.hooks)) {
    return item.hooks.some(
      (h: any) =>
        h &&
        typeof h.command === "string" &&
        (h.command.includes(".apl/inbox.jsonl") || h.command.includes("inbox.jsonl")),
    );
  }
  return false;
}

function isAplKiroHook(item: any): boolean {
  if (!item || typeof item !== "object") return false;
  if (item.name === "apl-pre-tool-use" || item.name === "apl-notification") return true;
  if (item.action && typeof item.action.command === "string") {
    return (
      item.action.command.includes(".apl/inbox.jsonl") ||
      item.action.command.includes("inbox.jsonl")
    );
  }
  return false;
}

export const TARGET_DEFINITIONS: Record<SetupTargetId, TargetDefinition> = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    kind: "hook",
    description: "Claude Code CLI lifecycle hooks for automated permission interception",
    manualStepNote: "hooks installed, active immediately",
    detect: (customPath?: string) => {
      if (customPath) return existsSync(customPath);
      const claudeDir = join(homedir(), ".claude");
      return existsSync(claudeDir);
    },
    getDefaultConfigPath: () => join(homedir(), ".claude", "settings.json"),
    mergeConfig: (existing = {}) => {
      const root = typeof existing === "object" && existing !== null ? { ...existing } : {};
      const hooks = typeof root.hooks === "object" && root.hooks !== null ? { ...root.hooks } : {};
      root.hooks = hooks;

      const preToolUse: any[] = Array.isArray(hooks.PreToolUse) ? [...hooks.PreToolUse] : [];
      const notification: any[] = Array.isArray(hooks.Notification) ? [...hooks.Notification] : [];

      const hasPreToolUse = preToolUse.some(isAplHook);
      const hasNotification = notification.some(isAplHook);

      if (hasPreToolUse && hasNotification) {
        return { updated: root, changed: false, alreadyConfigured: true };
      }

      if (!hasPreToolUse) {
        preToolUse.push({
          matcher: "Bash",
          hooks: [{ type: "command", command: APL_HOOK_COMMAND }],
        });
      }

      if (!hasNotification) {
        notification.push({
          matcher: "",
          hooks: [{ type: "command", command: APL_HOOK_COMMAND }],
        });
      }

      hooks.PreToolUse = preToolUse;
      hooks.Notification = notification;
      root.hooks = hooks;

      return { updated: root, changed: true, alreadyConfigured: false };
    },
    undoConfig: (existing = {}) => {
      if (typeof existing !== "object" || existing === null) {
        return { updated: existing, changed: false };
      }
      const root = { ...existing };
      if (!root.hooks || typeof root.hooks !== "object") {
        return { updated: root, changed: false };
      }

      const hooks = { ...root.hooks };
      let changed = false;

      if (Array.isArray(hooks.PreToolUse)) {
        const originalLen = hooks.PreToolUse.length;
        hooks.PreToolUse = hooks.PreToolUse.filter((item: any) => !isAplHook(item));
        if (hooks.PreToolUse.length !== originalLen) changed = true;
        if (hooks.PreToolUse.length === 0) delete hooks.PreToolUse;
      }

      if (Array.isArray(hooks.Notification)) {
        const originalLen = hooks.Notification.length;
        hooks.Notification = hooks.Notification.filter((item: any) => !isAplHook(item));
        if (hooks.Notification.length !== originalLen) changed = true;
        if (hooks.Notification.length === 0) delete hooks.Notification;
      }

      if (Object.keys(hooks).length === 0) {
        delete root.hooks;
      } else {
        root.hooks = hooks;
      }

      return { updated: root, changed };
    },
  },

  "gemini-cli": {
    id: "gemini-cli",
    name: "Gemini CLI",
    kind: "hook",
    description: "Gemini CLI shell hook relay for BeforeTool and Notification events",
    manualStepNote: "hooks installed, active immediately",
    detect: (customPath?: string) => {
      if (customPath) return existsSync(customPath);
      const geminiDir = join(homedir(), ".gemini");
      return existsSync(geminiDir);
    },
    getDefaultConfigPath: () => join(homedir(), ".gemini", "hooks.json"),
    mergeConfig: (existing = {}) => {
      const root = typeof existing === "object" && existing !== null ? { ...existing } : {};
      const hooks = typeof root.hooks === "object" && root.hooks !== null ? { ...root.hooks } : {};
      root.hooks = hooks;

      const beforeTool: any[] = Array.isArray(hooks.BeforeTool) ? [...hooks.BeforeTool] : [];
      const notification: any[] = Array.isArray(hooks.Notification) ? [...hooks.Notification] : [];

      const hasBeforeTool = beforeTool.some(isAplHook);
      const hasNotification = notification.some(isAplHook);

      if (hasBeforeTool && hasNotification) {
        return { updated: root, changed: false, alreadyConfigured: true };
      }

      if (!hasBeforeTool) {
        beforeTool.push({
          matcher: "bash",
          hooks: [{ type: "command", command: APL_HOOK_COMMAND }],
        });
      }

      if (!hasNotification) {
        notification.push({
          matcher: "*",
          hooks: [{ type: "command", command: APL_HOOK_COMMAND }],
        });
      }

      hooks.BeforeTool = beforeTool;
      hooks.Notification = notification;
      root.hooks = hooks;

      return { updated: root, changed: true, alreadyConfigured: false };
    },
    undoConfig: (existing = {}) => {
      if (typeof existing !== "object" || existing === null) {
        return { updated: existing, changed: false };
      }
      const root = { ...existing };
      if (!root.hooks || typeof root.hooks !== "object") {
        return { updated: root, changed: false };
      }

      const hooks = { ...root.hooks };
      let changed = false;

      if (Array.isArray(hooks.BeforeTool)) {
        const originalLen = hooks.BeforeTool.length;
        hooks.BeforeTool = hooks.BeforeTool.filter((item: any) => !isAplHook(item));
        if (hooks.BeforeTool.length !== originalLen) changed = true;
        if (hooks.BeforeTool.length === 0) delete hooks.BeforeTool;
      }

      if (Array.isArray(hooks.Notification)) {
        const originalLen = hooks.Notification.length;
        hooks.Notification = hooks.Notification.filter((item: any) => !isAplHook(item));
        if (hooks.Notification.length !== originalLen) changed = true;
        if (hooks.Notification.length === 0) delete hooks.Notification;
      }

      if (Object.keys(hooks).length === 0) {
        delete root.hooks;
      } else {
        root.hooks = hooks;
      }

      return { updated: root, changed };
    },
  },

  cursor: {
    id: "cursor",
    name: "Cursor",
    kind: "mcp",
    description: "Cursor IDE Model Context Protocol server configuration",
    manualStepNote: "MCP config installed, restart Cursor to activate",
    detect: (customPath?: string) => {
      if (customPath) return existsSync(customPath);
      const cursorDir = join(homedir(), ".cursor");
      return existsSync(cursorDir);
    },
    getDefaultConfigPath: () => join(homedir(), ".cursor", "mcp.json"),
    mergeConfig: (existing = {}, mcpPath: string) => {
      const root = typeof existing === "object" && existing !== null ? { ...existing } : {};
      const servers =
        typeof root.mcpServers === "object" && root.mcpServers !== null
          ? { ...root.mcpServers }
          : {};

      const current = servers["agent-permission-layer"];
      if (
        current &&
        current.command === "node" &&
        Array.isArray(current.args) &&
        current.args[0] === mcpPath
      ) {
        return { updated: root, changed: false, alreadyConfigured: true };
      }

      servers["agent-permission-layer"] = {
        command: "node",
        args: [mcpPath],
      };
      root.mcpServers = servers;

      return { updated: root, changed: true, alreadyConfigured: false };
    },
    undoConfig: (existing = {}) => {
      if (typeof existing !== "object" || existing === null) {
        return { updated: existing, changed: false };
      }
      const root = { ...existing };
      if (!root.mcpServers || typeof root.mcpServers !== "object") {
        return { updated: root, changed: false };
      }

      const servers = { ...root.mcpServers };
      if (!("agent-permission-layer" in servers)) {
        return { updated: root, changed: false };
      }

      delete servers["agent-permission-layer"];
      if (Object.keys(servers).length === 0) {
        delete root.mcpServers;
      } else {
        root.mcpServers = servers;
      }

      return { updated: root, changed: true };
    },
  },

  antigravity: {
    id: "antigravity",
    name: "Antigravity",
    kind: "mcp",
    description: "Google Antigravity IDE MCP server integration",
    manualStepNote: "MCP config installed, restart Antigravity to activate",
    detect: (customPath?: string) => {
      if (customPath) return existsSync(customPath);
      const ideDir = join(homedir(), ".gemini", "antigravity-ide");
      const configDir = join(homedir(), ".gemini", "config");
      return existsSync(ideDir) || existsSync(configDir);
    },
    getDefaultConfigPath: () => {
      const configDir = join(homedir(), ".gemini", "config");
      if (existsSync(configDir)) {
        return join(configDir, "mcp_config.json");
      }
      return join(homedir(), ".gemini", "antigravity-ide", "mcp_config.json");
    },
    mergeConfig: (existing = {}, mcpPath: string) => {
      const root = typeof existing === "object" && existing !== null ? { ...existing } : {};
      const servers =
        typeof root.mcpServers === "object" && root.mcpServers !== null
          ? { ...root.mcpServers }
          : {};

      const current = servers["agent-permission-layer"];
      if (
        current &&
        current.command === "node" &&
        Array.isArray(current.args) &&
        current.args[0] === mcpPath
      ) {
        return { updated: root, changed: false, alreadyConfigured: true };
      }

      servers["agent-permission-layer"] = {
        command: "node",
        args: [mcpPath],
      };
      root.mcpServers = servers;

      return { updated: root, changed: true, alreadyConfigured: false };
    },
    undoConfig: (existing = {}) => {
      if (typeof existing !== "object" || existing === null) {
        return { updated: existing, changed: false };
      }
      const root = { ...existing };
      if (!root.mcpServers || typeof root.mcpServers !== "object") {
        return { updated: root, changed: false };
      }

      const servers = { ...root.mcpServers };
      if (!("agent-permission-layer" in servers)) {
        return { updated: root, changed: false };
      }

      delete servers["agent-permission-layer"];
      if (Object.keys(servers).length === 0) {
        delete root.mcpServers;
      } else {
        root.mcpServers = servers;
      }

      return { updated: root, changed: true };
    },
  },

  "claude-desktop": {
    id: "claude-desktop",
    name: "Claude Desktop",
    kind: "mcp",
    description: "Claude Desktop app MCP tool integration",
    manualStepNote: "MCP config installed, restart Claude Desktop to activate",
    detect: (customPath?: string) => {
      if (customPath) return existsSync(customPath);
      const os = platform();
      if (os === "darwin") {
        return existsSync(join(homedir(), "Library", "Application Support", "Claude"));
      } else if (os === "win32") {
        const appData = process.env["APPDATA"] || join(homedir(), "AppData", "Roaming");
        return existsSync(join(appData, "Claude"));
      } else {
        return existsSync(join(homedir(), ".config", "Claude"));
      }
    },
    getDefaultConfigPath: () => {
      const os = platform();
      if (os === "darwin") {
        return join(
          homedir(),
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json",
        );
      } else if (os === "win32") {
        const appData = process.env["APPDATA"] || join(homedir(), "AppData", "Roaming");
        return join(appData, "Claude", "claude_desktop_config.json");
      } else {
        return join(homedir(), ".config", "Claude", "claude_desktop_config.json");
      }
    },
    mergeConfig: (existing = {}, mcpPath: string) => {
      const root = typeof existing === "object" && existing !== null ? { ...existing } : {};
      const servers =
        typeof root.mcpServers === "object" && root.mcpServers !== null
          ? { ...root.mcpServers }
          : {};

      const current = servers["agent-permission-layer"];
      if (
        current &&
        current.command === "node" &&
        Array.isArray(current.args) &&
        current.args[0] === mcpPath
      ) {
        return { updated: root, changed: false, alreadyConfigured: true };
      }

      servers["agent-permission-layer"] = {
        command: "node",
        args: [mcpPath],
      };
      root.mcpServers = servers;

      return { updated: root, changed: true, alreadyConfigured: false };
    },
    undoConfig: (existing = {}) => {
      if (typeof existing !== "object" || existing === null) {
        return { updated: existing, changed: false };
      }
      const root = { ...existing };
      if (!root.mcpServers || typeof root.mcpServers !== "object") {
        return { updated: root, changed: false };
      }

      const servers = { ...root.mcpServers };
      if (!("agent-permission-layer" in servers)) {
        return { updated: root, changed: false };
      }

      delete servers["agent-permission-layer"];
      if (Object.keys(servers).length === 0) {
        delete root.mcpServers;
      } else {
        root.mcpServers = servers;
      }

      return { updated: root, changed: true };
    },
  },

  kiro: {
    id: "kiro",
    name: "Kiro IDE",
    kind: "hook",
    description: "Kiro IDE lifecycle hooks for automated permission interception",
    manualStepNote: "hooks installed, active immediately",
    detect: (customPath?: string) => {
      if (customPath) return existsSync(customPath);
      const kiroHome = join(homedir(), ".kiro");
      const kiroLocal = join(process.cwd(), ".kiro");
      return existsSync(kiroHome) || existsSync(kiroLocal);
    },
    getDefaultConfigPath: () => {
      const kiroLocal = join(process.cwd(), ".kiro");
      if (existsSync(kiroLocal)) {
        return join(kiroLocal, "hooks", "apl-hooks.json");
      }
      return join(homedir(), ".kiro", "hooks", "apl-hooks.json");
    },
    mergeConfig: (existing = {}) => {
      const root = typeof existing === "object" && existing !== null ? { ...existing } : {};
      root.version = root.version || "v1";
      const hooks: any[] = Array.isArray(root.hooks) ? [...root.hooks] : [];

      const hasPreToolUse = hooks.some(
        (h) => isAplKiroHook(h) && (h.trigger === "PreToolUse" || h.name === "apl-pre-tool-use"),
      );
      const hasNotification = hooks.some(
        (h) => isAplKiroHook(h) && (h.trigger === "Notification" || h.name === "apl-notification"),
      );

      if (hasPreToolUse && hasNotification) {
        return { updated: root, changed: false, alreadyConfigured: true };
      }

      if (!hasPreToolUse) {
        hooks.push({
          name: "apl-pre-tool-use",
          trigger: "PreToolUse",
          matcher: "*",
          action: {
            type: "command",
            command: APL_HOOK_COMMAND,
          },
        });
      }

      if (!hasNotification) {
        hooks.push({
          name: "apl-notification",
          trigger: "Notification",
          matcher: "*",
          action: {
            type: "command",
            command: APL_HOOK_COMMAND,
          },
        });
      }

      root.hooks = hooks;
      return { updated: root, changed: true, alreadyConfigured: false };
    },
    undoConfig: (existing = {}) => {
      if (typeof existing !== "object" || existing === null) {
        return { updated: existing, changed: false };
      }
      const root = { ...existing };
      if (!Array.isArray(root.hooks)) {
        return { updated: root, changed: false };
      }

      const originalLen = root.hooks.length;
      const filtered = root.hooks.filter((h: any) => !isAplKiroHook(h));
      const changed = filtered.length !== originalLen;

      root.hooks = filtered;
      return { updated: root, changed };
    },
  },

  cline: {
    id: "cline",
    name: "Cline",
    kind: "mcp",
    description: "Cline (VS Code) autonomous coding agent MCP integration",
    manualStepNote: "MCP config installed, reload VS Code window to activate",
    detect: (customPath?: string) => {
      if (customPath) return existsSync(customPath);
      const cfgPath = getClineDefaultConfigPath();
      const extDir = join(cfgPath, "..", "..");
      return existsSync(cfgPath) || existsSync(extDir);
    },
    getDefaultConfigPath: () => getClineDefaultConfigPath(),
    mergeConfig: (existing = {}, mcpPath: string) => {
      const root = typeof existing === "object" && existing !== null ? { ...existing } : {};
      const servers =
        typeof root.mcpServers === "object" && root.mcpServers !== null
          ? { ...root.mcpServers }
          : {};

      const current = servers["agent-permission-layer"];
      if (
        current &&
        current.command === "node" &&
        Array.isArray(current.args) &&
        current.args[0] === mcpPath
      ) {
        return { updated: root, changed: false, alreadyConfigured: true };
      }

      servers["agent-permission-layer"] = {
        command: "node",
        args: [mcpPath],
      };
      root.mcpServers = servers;

      return { updated: root, changed: true, alreadyConfigured: false };
    },
    undoConfig: (existing = {}) => {
      if (typeof existing !== "object" || existing === null) {
        return { updated: existing, changed: false };
      }
      const root = { ...existing };
      if (!root.mcpServers || typeof root.mcpServers !== "object") {
        return { updated: root, changed: false };
      }

      const servers = { ...root.mcpServers };
      if (!("agent-permission-layer" in servers)) {
        return { updated: root, changed: false };
      }

      delete servers["agent-permission-layer"];
      if (Object.keys(servers).length === 0) {
        delete root.mcpServers;
      } else {
        root.mcpServers = servers;
      }

      return { updated: root, changed: true };
    },
  },
};

export function getClineDefaultConfigPath(): string {
  const os = platform();
  if (os === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json",
    );
  }
  if (os === "win32") {
    const appData = process.env["APPDATA"] || join(homedir(), "AppData", "Roaming");
    return join(
      appData,
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json",
    );
  }
  return join(
    homedir(),
    ".config",
    "Code",
    "User",
    "globalStorage",
    "saoudrizwan.claude-dev",
    "settings",
    "cline_mcp_settings.json",
  );
}
