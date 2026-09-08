import { Command } from "commander";
import { runSetup } from "../../setup/engine.js";

export function createSetupCommand(): Command {
  const cmd = new Command("setup");

  cmd
    .description(
      "Zero-config setup wizard to auto-configure APL across detected coding agents and IDEs",
    )
    .option("--dry-run", "Preview configuration changes without writing to disk")
    .option("--undo", "Cleanly remove APL hook and MCP configurations, restoring previous settings")
    .action(async (options) => {
      console.log("\n========================================================");
      console.log(
        options.undo
          ? "  🔄 Agent Permission Layer (APL) — Uninstall Wizard"
          : options.dryRun
            ? "  🔍 Agent Permission Layer (APL) — Setup Preview (Dry-Run)"
            : "  ⚡ Agent Permission Layer (APL) — Zero-Config Setup",
      );
      console.log("========================================================\n");

      try {
        const results = await runSetup({
          dryRun: Boolean(options.dryRun),
          undo: Boolean(options.undo),
        });

        for (const res of results) {
          console.log(` ${res.message}`);
          if (options.dryRun && res.diff) {
            console.log(
              "\n" +
                res.diff
                  .split("\n")
                  .map((l) => `    ${l}`)
                  .join("\n") +
                "\n",
            );
          }
        }

        console.log("\n--------------------------------------------------------");
        if (options.undo) {
          console.log("  Setup complete. APL entries have been cleanly removed.");
        } else if (options.dryRun) {
          console.log("  Dry run complete. No files were modified.");
          console.log("  Run `apl setup` (or `defcon setup`) to apply these changes.");
        } else {
          console.log("  Setup complete! Next steps:");
          console.log("   1. Start the monitoring daemon: `defcon start` (or `apl start`)");
          console.log("   2. For IDEs (Cursor/Antigravity/Claude Desktop), restart the app.");
        }
        console.log("--------------------------------------------------------\n");
      } catch (err: any) {
        console.error(`\n❌ Fatal error during setup: ${err.message}\n`);
        process.exit(1);
      }
    });

  return cmd;
}
