import { Command } from "commander";
import { SqliteEventStore, getDefaultDbPath } from "../../storage/sqliteStore.js";
import type { RiskLevel } from "../../core/types.js";

export function createHistoryCommand(): Command {
  const cmd = new Command("history");

  cmd
    .description("View recent agent activity audit log and permission history")
    .option("-n, --limit <number>", "Number of events to display", "20")
    .option("-r, --risk <level>", "Filter by risk level (low, medium, high)")
    .option("-a, --agent <name>", "Filter by agent name (e.g. claude-code, gemini-cli)")
    .option("--json", "Output results in JSON format")
    .action(async (options) => {
      const store = new SqliteEventStore();

      try {
        const events = await store.query({
          limit: parseInt(options.limit, 10) || 20,
          riskLevel: options.risk as RiskLevel | undefined,
          agent: options.agent as string | undefined,
        });

        if (options.json) {
          console.log(JSON.stringify(events, null, 2));
          return;
        }

        if (events.length === 0) {
          console.log("\n  No events recorded in audit log yet.");
          console.log(`  Database: ${getDefaultDbPath()}`);
          console.log("  Start monitoring with `apl start` to begin recording activity.\n");
          return;
        }

        console.log(`\n  🛡️  APL Event Audit Log (${events.length} events)\n`);
        console.log("  TIME       RISK     AGENT        TYPE                 COMMAND");
        console.log("  ─────────  ───────  ───────────  ───────────────────  ────────────────────────────────");

        for (const event of events) {
          const time = new Date(event.timestamp).toLocaleTimeString();
          const riskBadge =
            event.riskLevel === "high"
              ? "🔴 HIGH "
              : event.riskLevel === "medium"
                ? "🟡 MED  "
                : event.riskLevel === "low"
                  ? "🟢 LOW  "
                  : "⚪ UNKN ";

          const agentPad = event.agent.padEnd(11, " ");
          const typePad = event.type.padEnd(19, " ");
          const cmdDisplay = event.command
            ? event.command.length > 32
              ? `${event.command.slice(0, 29)}...`
              : event.command
            : "—";

          console.log(`  ${time}  ${riskBadge} ${agentPad}  ${typePad}  ${cmdDisplay}`);
        }

        console.log("");
      } finally {
        store.close();
      }
    });

  return cmd;
}
