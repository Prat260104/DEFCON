import { Command } from "commander";
import { loadConfig } from "../configManager.js";

export function createAgentsCommand(): Command {
  const cmd = new Command("agents");

  cmd.description("List supported agent adapters and their configuration status").action(() => {
    const config = loadConfig();

    console.log("\n  Agent Permission Layer — Supported Adapters\n");
    console.log("  NAME          STATUS       HOOK TYPE                 FREE?");
    console.log("  ────────────  ───────────  ────────────────────────  ─────");

    const claudeEnabled = config.adapters["claude-code"] ? "Enabled  🟢" : "Disabled ⚪";
    const geminiEnabled = config.adapters["gemini-cli"] ? "Enabled  🟢" : "Disabled ⚪";
    const antigravityEnabled = config.adapters["antigravity"] ? "Enabled  🟢" : "Disabled ⚪";

    console.log(`  claude-code   ${claudeEnabled}  PreToolUse / Notification Yes`);
    console.log(`  gemini-cli    ${geminiEnabled}  BeforeTool / Notification Yes`);
    console.log(`  antigravity   ${antigravityEnabled}  transcript / MCP          Yes`);
    console.log("  cursor        Planned  🔮  extension / MCP           Yes");
    console.log("  codex         Planned  🔮  notify / hooks            Yes");
    console.log("\n  Use `apl config --set adapters.<name>=true` to toggle an adapter.\n");
  });

  return cmd;
}
