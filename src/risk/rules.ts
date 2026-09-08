import type { RiskLevel } from "../core/types.js";

/**
 * Risk classification rule table.
 *
 * Each rule maps a command pattern to a risk level. First match wins.
 * High-risk rules are evaluated first so dangerous flags/patterns (e.g.
 * `git push --force`, `rm -rf`) take precedence over generic patterns.
 *
 * Unmatched commands default to "medium" — we never silently trust an
 * unknown command as low-risk.
 */

export interface RiskRule {
  /** Regex pattern to match against the raw command string. */
  pattern: RegExp;
  /** Risk classification if this pattern matches. */
  level: RiskLevel;
  /** Human-readable label for notification and audit display. */
  label: string;
}

export const RULES: RiskRule[] = [
  // ─── High Risk: Destructive / Elevated / Untrusted (Evaluated First) ────
  {
    pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive|--force)\b/,
    level: "high",
    label: "recursive delete",
  },
  { pattern: /rm\s+-[a-zA-Z]*f[a-zA-Z]*r\b/, level: "high", label: "recursive delete" },
  { pattern: /^git\s+reset\s+--hard\b/, level: "high", label: "hard reset" },
  { pattern: /^git\s+push\s+.*--force/, level: "high", label: "force push" },
  { pattern: /^git\s+clean\s+-[a-zA-Z]*f/, level: "high", label: "git clean force" },
  { pattern: /curl.*\|\s*(sh|bash|zsh)/, level: "high", label: "pipe-to-shell" },
  { pattern: /wget.*\|\s*(sh|bash|zsh)/, level: "high", label: "pipe-to-shell" },
  { pattern: /^sudo\b/, level: "high", label: "elevated privileges" },
  { pattern: /:\s*\(\)\s*\{.*\}\s*;\s*:/, level: "high", label: "fork bomb pattern" },
  { pattern: /^chmod\s+(-R\s+)?777\b/, level: "high", label: "permissive chmod" },
  { pattern: /drop\s+table/i, level: "high", label: "SQL DROP TABLE" },
  { pattern: /drop\s+database/i, level: "high", label: "SQL DROP DATABASE" },
  { pattern: /truncate\s+table/i, level: "high", label: "SQL TRUNCATE" },
  { pattern: />\s*\/dev\/sd[a-z]/, level: "high", label: "disk write" },
  { pattern: /mkfs\b/, level: "high", label: "filesystem format" },
  { pattern: /dd\s+if=/, level: "high", label: "disk dump" },
  { pattern: /^eval\b/, level: "high", label: "eval execution" },
  { pattern: /\bkill\s+-9\b/, level: "high", label: "force kill" },

  // ─── Medium Risk: State-Changing but Reversible ─────────────────────────
  {
    pattern: /^(npm|yarn|pnpm)\s+(install|add|remove|uninstall)\b/,
    level: "medium",
    label: "dependency change",
  },
  { pattern: /^git\s+(push|commit|merge|rebase|pull)\b/, level: "medium", label: "git write" },
  { pattern: /^git\s+checkout\b/, level: "medium", label: "branch switch" },
  { pattern: /^docker\s+(build|run|compose|exec)\b/, level: "medium", label: "container op" },
  { pattern: /^(mv|cp)\b/, level: "medium", label: "file move/copy" },
  { pattern: /^mkdir\b/, level: "medium", label: "directory create" },
  { pattern: /^touch\b/, level: "medium", label: "file create" },
  { pattern: /^(sed|awk)\b/, level: "medium", label: "text transform" },
  { pattern: /^npm\s+publish\b/, level: "medium", label: "package publish" },

  // ─── Low Risk: Read-only / Safe Operations ──────────────────────────────
  {
    pattern: /^git\s+(status|log|diff|branch|show|tag|stash list)\b/,
    level: "low",
    label: "git read",
  },
  { pattern: /^(npm|yarn|pnpm)\s+(test|run\s+test)\b/, level: "low", label: "test run" },
  {
    pattern: /^(ls|cat|pwd|echo|head|tail|wc|file|which|whoami|date|uname)\b/,
    level: "low",
    label: "read-only shell",
  },
  {
    pattern: /^(npm|yarn|pnpm)\s+run\s+(lint|build|typecheck|check|format)\b/,
    level: "low",
    label: "build/lint",
  },
  { pattern: /^(grep|rg|find|fd|ag)\b/, level: "low", label: "search" },
  { pattern: /^(node|tsx|npx)\s+.*--help\b/, level: "low", label: "help lookup" },
  { pattern: /^tree\b/, level: "low", label: "directory listing" },
];
