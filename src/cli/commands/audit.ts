import { Command } from "commander";
import { SqliteEventStore, getDefaultDbPath } from "../../storage/sqliteStore.js";
import type { AgentEvent, RiskLevel } from "../../core/types.js";
import { sanitizePath, sanitizeEvent } from "../../core/pathSanitizer.js";

export function parseDurationToTimestamp(input: string, now: number = Date.now()): number | null {
  const trimmed = input.trim().toLowerCase();

  // Pure digits: if large timestamp (epoch ms), use directly; otherwise treat as hours
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (num > 100_000_000_000) {
      return num;
    }
    return now - num * 3600 * 1000;
  }

  const match = trimmed.match(
    /^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/,
  );
  if (!match || !match[1] || !match[2]) {
    // Try parsing as ISO date string
    const parsedDate = Date.parse(input);
    if (!isNaN(parsedDate)) {
      return parsedDate;
    }
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (unit.startsWith("m")) {
    return now - value * 60 * 1000;
  }
  if (unit.startsWith("h")) {
    return now - value * 3600 * 1000;
  }
  if (unit.startsWith("d")) {
    return now - value * 86400 * 1000;
  }
  if (unit.startsWith("w")) {
    return now - value * 7 * 86400 * 1000;
  }

  return null;
}

export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatEventsAsCsv(events: AgentEvent[]): string {
  const header = ["timestamp", "time", "agent", "type", "risk_level", "command", "session_id"];
  const rows = events.map((event) => {
    return [
      escapeCsvCell(event.timestamp),
      escapeCsvCell(new Date(event.timestamp).toISOString()),
      escapeCsvCell(event.agent),
      escapeCsvCell(event.type),
      escapeCsvCell(event.riskLevel ?? ""),
      escapeCsvCell(event.command ?? ""),
      escapeCsvCell(event.sessionId ?? ""),
    ].join(",");
  });

  return [header.join(","), ...rows].join("\n");
}

export function createAuditCommand(): Command {
  const cmd = new Command("audit");

  cmd
    .alias("history")
    .description("View recent agent activity audit log and permission history")
    .option("-n, --limit <number>", "Number of events to display", "20")
    .option("-r, --risk <level>", "Filter by risk level (low, medium, high)")
    .option("-a, --agent <name>", "Filter by agent name (e.g. claude-code, gemini-cli)")
    .option("--adapter <name>", "Alias for --agent")
    .option("-s, --since <duration>", "Filter events newer than duration (e.g. 15m, 1h, 24h, 7d)")
    .option(
      "-t, --type <type>",
      "Filter by event type (e.g. permission_required, stalled, completed)",
    )
    .option("--export <format>", "Export output format (json, csv)")
    .option("--json", "Output results in JSON format")
    .option("--csv", "Output results in CSV format")
    .option("--db <path>", "Path to custom SQLite database file")
    .action(async (options) => {
      const dbPath = options.db || getDefaultDbPath();
      const store = new SqliteEventStore(dbPath);

      try {
        const agentFilter = (options.agent || options.adapter) as string | undefined;
        let riskFilter = options.risk ? (options.risk.toLowerCase() as RiskLevel) : undefined;
        if (riskFilter && !["low", "medium", "high"].includes(riskFilter)) {
          riskFilter = undefined;
        }

        let sinceTimestamp: number | undefined;
        if (options.since) {
          const parsed = parseDurationToTimestamp(options.since);
          if (parsed !== null) {
            sinceTimestamp = parsed;
          } else {
            console.error(
              `  ⚠️  Invalid duration format: "${options.since}". Expected e.g. 15m, 1h, 24h, 7d.`,
            );
          }
        }

        const events = await store.query({
          limit: parseInt(options.limit, 10) || 20,
          riskLevel: riskFilter,
          agent: agentFilter,
          type: options.type as AgentEvent["type"] | undefined,
          since: sinceTimestamp,
        });

        const sanitizedEvents = events.map((e) => sanitizeEvent(e));

        const isJson = options.json || options.export?.toLowerCase() === "json";
        const isCsv = options.csv || options.export?.toLowerCase() === "csv";

        if (isJson) {
          console.log(JSON.stringify(sanitizedEvents, null, 2));
          return;
        }

        if (isCsv) {
          console.log(formatEventsAsCsv(sanitizedEvents));
          return;
        }

        if (events.length === 0) {
          console.log("\n  No events recorded matching criteria.");
          console.log(`  Database: ${sanitizePath(dbPath)}`);
          console.log(
            "  Start monitoring with `defcon start` (or `apl start`) to record agent activity.\n",
          );
          return;
        }

        const filterNotes: string[] = [];
        if (riskFilter) filterNotes.push(`risk=${riskFilter}`);
        if (agentFilter) filterNotes.push(`agent=${agentFilter}`);
        if (options.since) filterNotes.push(`since=${options.since}`);
        if (options.type) filterNotes.push(`type=${options.type}`);

        const filterSubtitle =
          filterNotes.length > 0 ? ` [Filtered: ${filterNotes.join(", ")}]` : "";

        console.log(`\n  🛡️  DEFCON Audit Log (${events.length} events)${filterSubtitle}\n`);
        console.log("  TIME       RISK     AGENT        TYPE                 COMMAND");
        console.log(
          "  ─────────  ───────  ───────────  ───────────────────  ─────────────────────────────────────────────",
        );

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
          const cleanCmd = event.command ? event.command.replace(/[\r\n]+/g, " ").trim() : "—";
          const cmdDisplay = cleanCmd.length > 45 ? `${cleanCmd.slice(0, 42)}...` : cleanCmd;

          console.log(`  ${time}  ${riskBadge} ${agentPad}  ${typePad}  ${cmdDisplay}`);
        }

        console.log("");
      } finally {
        store.close();
      }
    });

  return cmd;
}
