import { Command } from "commander";
import { existsSync, statSync } from "node:fs";
import { loadConfig, getDefaultInboxPath } from "../configManager.js";

export function createStatusCommand(): Command {
  const cmd = new Command("status");

  cmd
    .description("Display the current status of APL and its monitoring adapters")
    .action(() => {
      const config = loadConfig();
      const inboxPath = config.inboxPath || getDefaultInboxPath();
      const inboxExists = existsSync(inboxPath);

      let inboxSize = 0;
      if (inboxExists) {
        try {
          inboxSize = statSync(inboxPath).size;
        } catch {
          // ignore
        }
      }

      console.log("\n  🛡️  Agent Permission Layer — Status\n");
      console.log(`  Inbox Path:      ${inboxPath} (${inboxExists ? `Active, ${inboxSize} bytes` : "Not created yet"})`);
      console.log(`  Notifications:   ${config.notifications.enabled ? "Enabled 🔔" : "Disabled 🔕"}`);
      console.log(`  Platform:        ${process.platform} (${process.arch})`);
      console.log("\n  Active Adapters:");

      for (const [name, enabled] of Object.entries(config.adapters)) {
        console.log(`    - ${name}: ${enabled ? "🟢 Watching" : "⚪ Disabled"}`);
      }

      console.log("\n  Run `apl start` to begin live monitoring in this terminal.\n");
    });

  return cmd;
}
