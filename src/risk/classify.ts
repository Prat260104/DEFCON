import type { RiskLevel } from "../core/types.js";
import { RULES } from "./rules.js";

/**
 * Result of risk classification for a command.
 */
export interface ClassificationResult {
  /** The determined risk level. */
  level: RiskLevel;
  /** Human-readable label explaining the classification. */
  label: string;
  /** Whether a rule explicitly matched. If false, the default ("medium") was applied. */
  matched: boolean;
}

/**
 * Classify a command's risk level using the deterministic rule table.
 *
 * - First matching rule wins (rules are evaluated in array order).
 * - Unmatched commands default to "medium" — we never silently trust
 *   an unknown command as low-risk.
 * - Classification is pure, deterministic, and has no side effects.
 */
export function classify(command: string): ClassificationResult {
  if (!command || command.trim().length === 0) {
    return { level: "medium", label: "empty command", matched: false };
  }

  const trimmed = command.trim();

  for (const rule of RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        level: rule.level,
        label: rule.label,
        matched: true,
      };
    }
  }

  return {
    level: "medium",
    label: "unknown command",
    matched: false,
  };
}
