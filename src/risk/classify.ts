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

const RISK_PRIORITY: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * Splits a compound command on shell operators (`;`, `&&`, `||`)
 * while respecting quotes. Pipe `|` is NOT split — pipe chains
 * are semantically different.
 */
function splitForClassify(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const next = command[i + 1];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
    } else if (!inSingle && !inDouble) {
      if (ch === ";") {
        parts.push(current.trim());
        current = "";
      } else if (ch === "&" && next === "&") {
        parts.push(current.trim());
        current = "";
        i++;
      } else if (ch === "|" && next === "|") {
        parts.push(current.trim());
        current = "";
        i++;
      } else {
        current += ch;
      }
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts.filter((p) => p.length > 0);
}

/**
 * Classify a single (non-compound) command against the rule table.
 */
function classifySingle(command: string): ClassificationResult {
  for (const rule of RULES) {
    if (rule.pattern.test(command)) {
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

const FORK_BOMB_PATTERN = /:\s*\(\)\s*\{.*\}\s*;\s*:/;

/**
 * Classify a command's risk level using the deterministic rule table.
 *
 * - For compound commands (containing `;`, `&&`, `||`), each subcommand
 *   is classified independently and the HIGHEST risk level is returned.
 * - First matching rule wins per subcommand (rules are evaluated in array order).
 * - Unmatched commands default to "medium" — we never silently trust
 *   an unknown command as low-risk.
 * - Classification is pure, deterministic, and has no side effects.
 */
export function classify(command: string): ClassificationResult {
  if (!command || command.trim().length === 0) {
    return { level: "medium", label: "empty command", matched: false };
  }

  const trimmed = command.trim();

  // Pre-split check: fork bombs contain semicolons in their syntax (:(){ :|:& };:)
  // which splitForClassify would break apart into invalid fragments.
  if (FORK_BOMB_PATTERN.test(trimmed)) {
    return {
      level: "high",
      label: "fork bomb pattern",
      matched: true,
    };
  }

  const subcommands = splitForClassify(trimmed);

  // For single commands (the common case), skip the overhead of max-reduction
  if (subcommands.length <= 1) {
    return classifySingle(trimmed);
  }

  // Classify each subcommand, return the highest-risk result
  let highest: ClassificationResult = { level: "low", label: "", matched: false };

  for (const sub of subcommands) {
    const result = classifySingle(sub);
    if (RISK_PRIORITY[result.level] > RISK_PRIORITY[highest.level]) {
      highest = result;
    }
    // Short-circuit: can't get higher than "high"
    if (highest.level === "high") break;
  }

  return highest;
}
