import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../../src/risk/classify.js";
import { isBlacklisted } from "../../src/risk/policy.js";

// ─── Load Dataset ─────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const datasetPath = resolve(__dirname, "dataset.json");

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

const dataset: Dataset = JSON.parse(readFileSync(datasetPath, "utf-8"));

// ─── Dataset Integrity ───────────────────────────────────────────────────────
describe("Benchmark Dataset Integrity", () => {
  it("should have valid JSON structure", () => {
    expect(dataset.version).toBe(1);
    expect(dataset.tiers).toEqual(["low", "medium", "high"]);
    expect(dataset.entries).toBeDefined();
    expect(Array.isArray(dataset.entries)).toBe(true);
  });

  it("should have at least 250 entries", () => {
    expect(dataset.entries.length).toBeGreaterThanOrEqual(250);
  });

  it("should have non-empty commands with valid tiers", () => {
    const validTiers = new Set(["low", "medium", "high"]);
    for (const entry of dataset.entries) {
      expect(entry.command.trim().length).toBeGreaterThan(0);
      expect(validTiers.has(entry.expected_tier)).toBe(true);
      expect(typeof entry.expected_blacklisted).toBe("boolean");
      expect(entry.category.length).toBeGreaterThan(0);
    }
  });

  it("should have adequate coverage per tier", () => {
    const counts = { low: 0, medium: 0, high: 0 };
    for (const entry of dataset.entries) {
      counts[entry.expected_tier]++;
    }
    // At least 40 per tier
    expect(counts.low).toBeGreaterThanOrEqual(40);
    expect(counts.medium).toBeGreaterThanOrEqual(40);
    expect(counts.high).toBeGreaterThanOrEqual(40);
  });

  it("should have blacklist-labeled entries", () => {
    const blacklisted = dataset.entries.filter((e) => e.expected_blacklisted);
    expect(blacklisted.length).toBeGreaterThanOrEqual(10);
  });
});

// ─── Blacklist Zero-False-Negative Invariant (HARD REQUIREMENT) ──────────────
describe("Blacklist Safety — Zero False Negatives", () => {
  const blacklistEntries = dataset.entries.filter((e) => e.expected_blacklisted);

  it("should detect every single blacklisted catastrophic command", () => {
    const missed: { command: string; category: string }[] = [];

    for (const entry of blacklistEntries) {
      const result = isBlacklisted(entry.command);
      if (!result.matched) {
        missed.push({ command: entry.command, category: entry.category });
      }
    }

    // This MUST be zero — no catastrophic command can ever slip through
    expect(missed).toEqual([]);
  });

  it("should NOT flag safe echo/printf commands as blacklisted", () => {
    const safeEchoEntries = dataset.entries.filter(
      (e) => !e.expected_blacklisted && e.category === "safe-echo",
    );

    for (const entry of safeEchoEntries) {
      const result = isBlacklisted(entry.command);
      expect(result.matched).toBe(false);
    }
  });
});

// ─── Classification Smoke Test ───────────────────────────────────────────────
describe("Classification Smoke Test", () => {
  it("should classify all dataset entries without throwing", () => {
    for (const entry of dataset.entries) {
      expect(() => classify(entry.command)).not.toThrow();
    }
  });

  it("should return valid risk levels for all entries", () => {
    const validLevels = new Set(["low", "medium", "high"]);
    for (const entry of dataset.entries) {
      const result = classify(entry.command);
      expect(validLevels.has(result.level)).toBe(true);
    }
  });
});

// ─── Accuracy & F1 Regression Gate ──────────────────────────────────────────
describe("Accuracy & F1 Regression Gate", () => {
  it("should maintain at least 98% weighted F1 score (measured baseline: 100%)", () => {
    const tiers: ("low" | "medium" | "high")[] = ["low", "medium", "high"];
    const metrics: Record<string, { tp: number; fp: number; fn: number; total: number }> = {
      low: { tp: 0, fp: 0, fn: 0, total: 0 },
      medium: { tp: 0, fp: 0, fn: 0, total: 0 },
      high: { tp: 0, fp: 0, fn: 0, total: 0 },
    };

    for (const entry of dataset.entries) {
      metrics[entry.expected_tier].total++;
      const result = classify(entry.command);
      if (result.level === entry.expected_tier) {
        metrics[entry.expected_tier].tp++;
      } else {
        metrics[entry.expected_tier].fn++;
        metrics[result.level].fp++;
      }
    }

    let weightedF1Sum = 0;
    for (const tier of tiers) {
      const m = metrics[tier];
      const precision = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0;
      const recall = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      weightedF1Sum += f1 * m.total;
    }

    const weightedF1 = weightedF1Sum / dataset.entries.length;
    // Regression gate: must not fall below 98% of measured performance
    expect(weightedF1).toBeGreaterThanOrEqual(0.98);
  });
});

// ─── Latency Invariant ───────────────────────────────────────────────────────
describe("Evaluation Latency", () => {
  it("should classify each command in under 1 millisecond (1000µs)", () => {
    for (const entry of dataset.entries) {
      const start = process.hrtime.bigint();
      classify(entry.command);
      const end = process.hrtime.bigint();
      const microseconds = Number(end - start) / 1000;

      // Each individual classification must be sub-millisecond
      expect(microseconds).toBeLessThan(1000);
    }
  });
});
