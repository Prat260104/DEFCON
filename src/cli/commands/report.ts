import { Command } from "commander";
import { AnalyticsEngine, type AnalyticsReport } from "../../storage/analytics.js";
import { getDefaultDbPath } from "../../storage/sqliteStore.js";
import { parseDurationToTimestamp } from "./audit.js";
import type { RiskLevel } from "../../core/types.js";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatPercentageBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

function formatTerminalReport(report: AnalyticsReport): void {
  const { period, summary, riskBreakdown, performance, topCommands } = report;

  console.log("\n🛡️  DEFCON Session Risk Analytics Report");
  console.log(
    `Period: ${formatTimestamp(period.start)} — ${formatTimestamp(period.end)} (Last ${period.durationHours}h)`,
  );
  console.log("═".repeat(64));

  // Overview
  console.log("\n📊 Overview");
  console.log(`  Total Commands Intercepted:   ${summary.totalCommands}`);
  console.log(
    `  Active Agents:                 ${summary.activeAgents.length > 0 ? summary.activeAgents.join(", ") : "None"}`,
  );
  console.log(`  Unique Sessions:               ${summary.uniqueSessions}`);

  // Risk Breakdown
  console.log("\n📈 Risk Breakdown");
  const total =
    riskBreakdown.high.count +
    riskBreakdown.medium.count +
    riskBreakdown.low.count +
    riskBreakdown.blacklist.count;

  if (total > 0) {
    console.log(
      `  🔴 High:      ${riskBreakdown.high.count.toString().padStart(2)}  (${riskBreakdown.high.percentage.toFixed(1)}%)   ${formatPercentageBar(riskBreakdown.high.percentage)}`,
    );
    console.log(
      `  🟡 Medium:   ${riskBreakdown.medium.count.toString().padStart(2)}  (${riskBreakdown.medium.percentage.toFixed(1)}%)   ${formatPercentageBar(riskBreakdown.medium.percentage)}`,
    );
    console.log(
      `  🟢 Low:      ${riskBreakdown.low.count.toString().padStart(2)}  (${riskBreakdown.low.percentage.toFixed(1)}%)   ${formatPercentageBar(riskBreakdown.low.percentage)}`,
    );
    console.log(
      `  ⛔ Blacklist:  ${riskBreakdown.blacklist.count.toString().padStart(2)}  (${riskBreakdown.blacklist.percentage.toFixed(1)}%)   ${formatPercentageBar(riskBreakdown.blacklist.percentage)}`,
    );
  } else {
    console.log("  No permission_required events found in this period.");
  }

  // Performance
  console.log("\n⏱️  Performance & Latency");
  if (
    performance.avgApprovalTimeMs !== null &&
    performance.medianApprovalTimeMs !== null &&
    performance.longestStallMs !== null
  ) {
    console.log(`  Average Approval Time:       ${formatDuration(performance.avgApprovalTimeMs)}`);
    console.log(
      `  Median Approval Time (p50):  ${formatDuration(performance.medianApprovalTimeMs)}`,
    );
    console.log(`  Longest Stall Duration:      ${formatDuration(performance.longestStallMs)}`);
    if (performance.longestStallCommand) {
      const cmd =
        performance.longestStallCommand.length > 50
          ? performance.longestStallCommand.slice(0, 47) + "..."
          : performance.longestStallCommand;
      console.log(`  Stall Event:                 "${cmd}"`);
    }
  } else {
    console.log("  N/A (no completed approval events found)");
  }

  // Top Commands
  console.log("\n🔝 Top Intercepted Actions");
  if (topCommands.length > 0) {
    topCommands.forEach((cmd, idx) => {
      const displayCmd = cmd.command.length > 50 ? cmd.command.slice(0, 47) + "..." : cmd.command;
      console.log(
        `  ${(idx + 1).toString().padStart(2)}. ${displayCmd.padEnd(50)} ${cmd.count} events`,
      );
    });
  } else {
    console.log("  No commands recorded in this period.");
  }

  console.log("\n" + "═".repeat(64) + "\n");
}

function formatJsonReport(report: AnalyticsReport): string {
  return JSON.stringify(report, null, 2);
}

export function createReportCommand(): Command {
  const cmd = new Command("report");

  cmd
    .description("Generate session risk analytics report")
    .option("--since <duration>", "Time window (15m, 1h, 24h, 7d)", "24h")
    .option("--agent <name>", "Filter by agent name")
    .option("--risk <level>", "Filter by risk level (low, medium, high)")
    .option("--json", "Output in JSON format")
    .option("-n, --limit <number>", "Limit top commands", "10")
    .action(async (options) => {
      try {
        const dbPath = getDefaultDbPath();
        const engine = new AnalyticsEngine(dbPath);

        // Parse time window
        const since = options.since
          ? parseDurationToTimestamp(options.since)
          : Date.now() - 24 * 60 * 60 * 1000;

        if (since === null) {
          console.error(
            `[report] Invalid duration format: "${options.since}". Use: 15m, 1h, 24h, 7d`,
          );
          process.exit(1);
        }

        // Parse risk level
        let riskLevel: RiskLevel | undefined;
        if (options.risk) {
          const risk = options.risk.toLowerCase();
          if (risk !== "low" && risk !== "medium" && risk !== "high") {
            console.error(`[report] Invalid risk level: "${options.risk}". Use: low, medium, high`);
            process.exit(1);
          }
          riskLevel = risk as RiskLevel;
        }

        // Parse limit
        const limit = parseInt(options.limit, 10);
        if (isNaN(limit) || limit < 1) {
          console.error(`[report] Invalid limit: "${options.limit}". Must be a positive number.`);
          process.exit(1);
        }

        // Generate report
        const report = await engine.generateReport({
          since,
          agent: options.agent,
          riskLevel,
          limit,
        });

        engine.close();

        // Check if database is empty
        if (report.summary.totalCommands === 0) {
          if (options.json) {
            console.log(formatJsonReport(report));
          } else {
            console.log("\n🛡️  DEFCON Session Risk Analytics Report");
            console.log(
              `Period: ${formatTimestamp(report.period.start)} — ${formatTimestamp(report.period.end)}`,
            );
            console.log("═".repeat(64));
            console.log("\nNo events found in the specified time window.");
            console.log("\nRun 'defcon start' to begin monitoring agent activity.\n");
          }
          return;
        }

        // Output report
        if (options.json) {
          console.log(formatJsonReport(report));
        } else {
          formatTerminalReport(report);
        }
      } catch (err) {
        console.error(`[report] Failed to generate analytics:`, err);
        process.exit(1);
      }
    });

  return cmd;
}
