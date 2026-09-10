#!/usr/bin/env tsx
/**
 * DEFCON Risk Classification Benchmark — Accuracy & Latency Evaluator
 *
 * Measures the deterministic risk engine's real-world classification accuracy
 * against a ground-truth labeled dataset. Reports per-tier Precision, Recall,
 * F1-Score, weighted macro-F1, and sub-microsecond latency distribution.
 *
 * Usage:
 *   npm run benchmark              # Terminal ANSI table
 *   npm run benchmark -- --json    # Machine-readable JSON output
 *   npm run benchmark -- --markdown # Markdown table for docs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../src/risk/classify.js";
import { isBlacklisted } from "../src/risk/policy.js";

// ─── CLI Flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const markdownMode = args.includes("--markdown");

// ─── Types ────────────────────────────────────────────────────────────────────
interface DatasetEntry {
  command: string;
  expected_tier: "low" | "medium" | "high";
  expected_blacklisted: boolean;
  category: string;
}

interface Dataset {
  version: number;
  description: string;
  tiers: string[];
  entries: DatasetEntry[];
}

interface TierMetrics {
  tp: number;
  fp: number;
  fn: number;
  total: number;
  precision: number;
  recall: number;
  f1: number;
}

interface Misclassification {
  command: string;
  expected: string;
  actual: string;
  category: string;
}

interface BlacklistFailure {
  command: string;
  category: string;
  type: "false_negative" | "false_positive";
}

// ─── Load Dataset ─────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const datasetPath = resolve(__dirname, "../test/benchmark/dataset.json");
const dataset: Dataset = JSON.parse(readFileSync(datasetPath, "utf-8"));
const entries = dataset.entries;

// ─── Run Classifications ──────────────────────────────────────────────────────
const tiers = ["low", "medium", "high"] as const;

// Confusion tracking
const confusion: Record<string, Record<string, number>> = {};
for (const t of tiers) {
  confusion[t] = {};
  for (const t2 of tiers) confusion[t][t2] = 0;
}

const misclassifications: Misclassification[] = [];
const blacklistFailures: BlacklistFailure[] = [];

// Accuracy pass
for (const entry of entries) {
  const result = classify(entry.command);
  confusion[entry.expected_tier][result.level]++;

  if (result.level !== entry.expected_tier) {
    misclassifications.push({
      command: entry.command,
      expected: entry.expected_tier,
      actual: result.level,
      category: entry.category,
    });
  }

  // Blacklist check
  const bl = isBlacklisted(entry.command);
  if (entry.expected_blacklisted && !bl.matched) {
    blacklistFailures.push({
      command: entry.command,
      category: entry.category,
      type: "false_negative",
    });
  } else if (!entry.expected_blacklisted && bl.matched) {
    blacklistFailures.push({
      command: entry.command,
      category: entry.category,
      type: "false_positive",
    });
  }
}

// ─── Calculate Per-Tier Metrics ───────────────────────────────────────────────
const metrics: Record<string, TierMetrics> = {};
let totalCorrect = 0;
let totalSamples = 0;

for (const tier of tiers) {
  const tp = confusion[tier][tier];
  let fp = 0;
  let fn = 0;

  for (const other of tiers) {
    if (other !== tier) {
      fp += confusion[other][tier]; // Other expected, but predicted as this tier
      fn += confusion[tier][other]; // This tier expected, but predicted as other
    }
  }

  const total = tp + fn; // Total ground-truth samples for this tier
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = total > 0 ? tp / total : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  metrics[tier] = { tp, fp, fn, total, precision, recall, f1 };
  totalCorrect += tp;
  totalSamples += total;
}

// Weighted Macro-F1 (weighted by tier support count)
const weightedF1 =
  tiers.reduce((sum, t) => sum + metrics[t].f1 * metrics[t].total, 0) / totalSamples;
const accuracy = totalSamples > 0 ? totalCorrect / totalSamples : 0;

// Blacklist metrics
const blacklistEntries = entries.filter((e) => e.expected_blacklisted);
const blacklistFalseNegatives = blacklistFailures.filter((f) => f.type === "false_negative");
const blacklistFalsePositives = blacklistFailures.filter((f) => f.type === "false_positive");
const blacklistRecall =
  blacklistEntries.length > 0
    ? (blacklistEntries.length - blacklistFalseNegatives.length) / blacklistEntries.length
    : 1;

// ─── Latency Benchmark ───────────────────────────────────────────────────────
// Warm-up: run all classifications twice to stabilize JIT
for (let i = 0; i < 2; i++) {
  for (const entry of entries) {
    classify(entry.command);
  }
}

// Timed run: measure each classification individually
const latencies: number[] = [];
for (const entry of entries) {
  const start = process.hrtime.bigint();
  classify(entry.command);
  const end = process.hrtime.bigint();
  latencies.push(Number(end - start) / 1000); // Convert nanoseconds → microseconds
}

latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)];
const p95 = latencies[Math.floor(latencies.length * 0.95)];
const p99 = latencies[Math.floor(latencies.length * 0.99)];
const maxLatency = latencies[latencies.length - 1];
const avgLatency = latencies.reduce((s, l) => s + l, 0) / latencies.length;

// ─── Output ───────────────────────────────────────────────────────────────────
if (jsonMode) {
  const output = {
    dataset: {
      total: entries.length,
      distribution: Object.fromEntries(tiers.map((t) => [t, metrics[t].total])),
    },
    tier_metrics: Object.fromEntries(
      tiers.map((t) => [
        t,
        {
          precision: +metrics[t].precision.toFixed(4),
          recall: +metrics[t].recall.toFixed(4),
          f1: +metrics[t].f1.toFixed(4),
          support: metrics[t].total,
        },
      ]),
    ),
    aggregate: {
      accuracy: +accuracy.toFixed(4),
      weighted_f1: +weightedF1.toFixed(4),
    },
    blacklist: {
      total: blacklistEntries.length,
      recall: +blacklistRecall.toFixed(4),
      false_negatives: blacklistFalseNegatives.length,
      false_positives: blacklistFalsePositives.length,
    },
    latency_us: {
      avg: +avgLatency.toFixed(2),
      p50: +p50.toFixed(2),
      p95: +p95.toFixed(2),
      p99: +p99.toFixed(2),
      max: +maxLatency.toFixed(2),
    },
    misclassifications: misclassifications.length,
    misclassification_details: misclassifications,
    blacklist_failures: blacklistFailures,
  };
  console.log(JSON.stringify(output, null, 2));
} else if (markdownMode) {
  console.log("# DEFCON Risk Classification Benchmark Results\n");
  console.log(`**Dataset:** ${entries.length} labeled commands\n`);
  console.log("## Per-Tier Accuracy\n");
  console.log("| Tier | Support | Precision | Recall | F1-Score |");
  console.log("|------|---------|-----------|--------|----------|");
  for (const t of tiers) {
    const m = metrics[t];
    console.log(
      `| ${t.padEnd(6)} | ${String(m.total).padStart(7)} | ${(m.precision * 100).toFixed(1).padStart(8)}% | ${(m.recall * 100).toFixed(1).padStart(5)}% | ${(m.f1 * 100).toFixed(1).padStart(7)}% |`,
    );
  }
  console.log(
    `\n**Weighted Macro-F1:** ${(weightedF1 * 100).toFixed(1)}%  |  **Accuracy:** ${(accuracy * 100).toFixed(1)}%\n`,
  );
  console.log("## Blacklist Safety Invariant\n");
  console.log(`| Metric | Value |`);
  console.log(`|--------|-------|`);
  console.log(`| Total Blacklisted Commands | ${blacklistEntries.length} |`);
  console.log(`| Recall (Detection Rate) | ${(blacklistRecall * 100).toFixed(1)}% |`);
  console.log(`| False Negatives (Missed) | ${blacklistFalseNegatives.length} |`);
  console.log(`| False Positives (Incorrect) | ${blacklistFalsePositives.length} |`);
  console.log("\n## Evaluation Latency\n");
  console.log("| Percentile | Latency (µs) |");
  console.log("|------------|-------------|");
  console.log(`| p50 | ${p50.toFixed(2)} |`);
  console.log(`| p95 | ${p95.toFixed(2)} |`);
  console.log(`| p99 | ${p99.toFixed(2)} |`);
  console.log(`| max | ${maxLatency.toFixed(2)} |`);
  console.log(`| avg | ${avgLatency.toFixed(2)} |`);

  if (misclassifications.length > 0) {
    console.log("\n## Misclassifications\n");
    console.log("| Command | Expected | Actual | Category |");
    console.log("|---------|----------|--------|----------|");
    for (const m of misclassifications) {
      console.log(
        `| \`${m.command.replace(/\|/g, "\\|")}\` | ${m.expected} | ${m.actual} | ${m.category} |`,
      );
    }
  }

  if (blacklistFailures.length > 0) {
    console.log("\n## Blacklist Failures\n");
    console.log("| Command | Type | Category |");
    console.log("|---------|------|----------|");
    for (const f of blacklistFailures) {
      console.log(`| \`${f.command.replace(/\|/g, "\\|")}\` | ${f.type} | ${f.category} |`);
    }
  }
} else {
  // ─── ANSI Terminal Report ─────────────────────────────────────────────
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";
  const DIM = "\x1b[2m";
  const GREEN = "\x1b[32m";
  const YELLOW = "\x1b[33m";
  const RED = "\x1b[31m";
  const CYAN = "\x1b[36m";
  const MAGENTA = "\x1b[35m";

  const tierColor = (t: string) => (t === "low" ? GREEN : t === "medium" ? YELLOW : RED);

  console.log(
    `\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}`,
  );
  console.log(`${BOLD}${CYAN}  DEFCON Risk Classification Benchmark${RESET}`);
  console.log(
    `${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`,
  );

  console.log(`${DIM}Dataset:${RESET} ${entries.length} labeled commands\n`);

  // Per-tier table
  console.log(`${BOLD}  Tier       Support   Precision   Recall   F1-Score${RESET}`);
  console.log(`${DIM}  ─────────  ───────   ─────────   ──────   ────────${RESET}`);
  for (const t of tiers) {
    const m = metrics[t];
    const c = tierColor(t);
    const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(8);
    console.log(
      `  ${c}${BOLD}${t.toUpperCase().padEnd(9)}${RESET}  ${String(m.total).padStart(7)}   ${pct(m.precision)}   ${pct(m.recall)}   ${pct(m.f1)}`,
    );
  }

  console.log(
    `\n  ${BOLD}Weighted F1:${RESET} ${CYAN}${(weightedF1 * 100).toFixed(1)}%${RESET}   ${BOLD}Accuracy:${RESET} ${CYAN}${(accuracy * 100).toFixed(1)}%${RESET}\n`,
  );

  // Blacklist safety
  const blIcon = blacklistRecall === 1 ? `${GREEN}✓` : `${RED}✗`;
  console.log(`${BOLD}  Blacklist Safety Invariant${RESET}`);
  console.log(`${DIM}  ──────────────────────────${RESET}`);
  console.log(
    `  ${blIcon} Recall: ${(blacklistRecall * 100).toFixed(1)}%${RESET}  (${blacklistEntries.length} catastrophic commands)`,
  );
  console.log(
    `  ${blIcon} False Negatives: ${blacklistFalseNegatives.length}${RESET}  ${DIM}(MUST be 0)${RESET}`,
  );
  console.log(`    False Positives: ${blacklistFalsePositives.length}\n`);

  // Latency
  console.log(`${BOLD}  Evaluation Latency${RESET}`);
  console.log(`${DIM}  ──────────────────${RESET}`);
  console.log(
    `  p50: ${MAGENTA}${p50.toFixed(2)} µs${RESET}   p95: ${MAGENTA}${p95.toFixed(2)} µs${RESET}   p99: ${MAGENTA}${p99.toFixed(2)} µs${RESET}   max: ${MAGENTA}${maxLatency.toFixed(2)} µs${RESET}`,
  );
  console.log(`  avg: ${MAGENTA}${avgLatency.toFixed(2)} µs${RESET}\n`);

  // Misclassifications
  if (misclassifications.length > 0) {
    console.log(`${BOLD}${YELLOW}  ⚠ ${misclassifications.length} Misclassification(s)${RESET}`);
    console.log(`${DIM}  ────────────────────────────${RESET}`);
    for (const m of misclassifications.slice(0, 20)) {
      console.log(
        `  ${DIM}[${m.category}]${RESET} ${RED}${m.expected}${RESET} → ${YELLOW}${m.actual}${RESET}  ${DIM}${m.command}${RESET}`,
      );
    }
    if (misclassifications.length > 20) {
      console.log(`  ${DIM}... and ${misclassifications.length - 20} more${RESET}`);
    }
    console.log();
  }

  // Blacklist failures
  if (blacklistFailures.length > 0) {
    console.log(`${BOLD}${RED}  ✗ ${blacklistFailures.length} Blacklist Failure(s)${RESET}`);
    console.log(`${DIM}  ──────────────────────────${RESET}`);
    for (const f of blacklistFailures) {
      const icon = f.type === "false_negative" ? `${RED}MISSED` : `${YELLOW}FALSE+`;
      console.log(`  ${icon}${RESET}  ${DIM}[${f.category}]${RESET}  ${f.command}`);
    }
    console.log();
  }

  console.log(
    `${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`,
  );
}
