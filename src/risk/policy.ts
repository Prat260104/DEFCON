import type { RiskLevel } from "../core/types.js";
import { classify } from "./classify.js";

export type PolicyAction = "auto-approve" | "notify-only" | "notify-and-confirm" | "block";

export interface PolicyConfig {
  policies: {
    low: PolicyAction;
    medium: PolicyAction;
    high: PolicyAction;
  };
  whitelist: string[];
  blacklist: string[];
}

export interface PolicyDecision {
  action: PolicyAction;
  riskLevel: RiskLevel;
  reason: string;
  isBlacklisted: boolean;
  isWhitelisted: boolean;
}

export const DEFAULT_BLACKLIST_PATTERNS: RegExp[] = [
  // 1. Recursive destruction of root, root wildcard, or home directory
  // Matches: rm -rf /, rm -fr /, rm -r -f /, rm --recursive --force /, sudo rm -rf /*, rm -rf ~, rm -rf ~/
  /^(?:sudo\s+)?rm\s+(?:-[a-zA-Z0-9]*[rR][a-zA-Z0-9]*\s+|-[a-zA-Z0-9]*[fF][a-zA-Z0-9]*\s+|--recursive\s+|--force\s+)+(\/|\/\*|~\/?|~\/\*)\s*$/i,

  // 2. Direct filesystem/drive destruction
  /^(?:sudo\s+)?mkfs(?:\.[a-zA-Z0-9_-]+)?\s+/i,
  /^(?:sudo\s+)?dd\s+if=\/dev\/(?:zero|urandom|null)\s+of=\/dev\//i,

  // 3. Destructive force push to protected branches (main / master)
  /^(?:git\s+push)\s+(?:.*?\s+)?(?:--force|-f|--force-with-lease)(?:\s+.*?)*(?:\s+(?:origin\s+)?(?:main|master))(?:\s+.*)?$/i,
  /^(?:git\s+push)\s+(?:.*?\s+)?(?:origin\s+)?(?:main|master)\s+(?:.*?\s+)?(?:--force|-f|--force-with-lease)(?:\s+.*)?$/i,

  // 4. Fork bombs
  /:\(\)\s*\{\s*:\|:&\s*\};\s*:/,

  // 5. Pipe-to-shell execution of catastrophic commands (e.g. echo "rm -rf /" | sh, echo "rm -rf /" | bash)
  /^(?:echo|printf)\s+.*?rm\s+(?:-[a-zA-Z0-9]*[rR][a-zA-Z0-9]*\s+|-[a-zA-Z0-9]*[fF][a-zA-Z0-9]*\s+|--recursive\s+|--force\s+)+(\/|\/\*|~\/?|~\/\*).*?\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/i,
  // Note: Content of piped-to-file scripts (e.g. echo "rm -rf /" > script.sh && bash script.sh)
  // cannot be statically inspected without filesystem reads; this relies on classify() routing
  // to high-risk notify-and-confirm rather than hard-block for indirect script execution.
];

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  policies: {
    low: "auto-approve",
    medium: "notify-only",
    high: "notify-and-confirm",
  },
  whitelist: ["git status", "git log", "npm test", "npm run test", "ls", "pwd"],
  blacklist: [
    "rm -rf /",
    "rm -rf /*",
    "rm -rf ~",
    "git push --force origin main",
    "git push --force origin master",
    "mkfs.",
    ":(){ :|:& };:",
  ],
};

/**
 * Splits a compound command line into subcommands by splitting on
 * shell operators: `;`, `&&`, `||`. Each subcommand is then evaluated
 * independently. Pipe `|` is NOT split — pipe chains are semantically
 * different and are already handled by pipe-to-shell rules.
 */
function splitSubcommands(command: string): string[] {
  // Split on ; && || but not inside quotes
  // Simple heuristic: split on these operators outside of single/double quotes
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
        i++; // skip second &
      } else if (ch === "|" && next === "|") {
        parts.push(current.trim());
        current = "";
        i++; // skip second |
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
 * Checks whether a command matches catastrophic blacklist rules.
 * Handles whitespace normalization, flag permutations, chained command
 * splitting, and ensures commands wrapped in echo/printf are not falsely blocked.
 */
export function isBlacklisted(
  command: string,
  customBlacklist: string[] = DEFAULT_POLICY_CONFIG.blacklist,
): { matched: boolean; reason?: string } {
  const trimmed = command.trim();
  if (!trimmed) return { matched: false };

  // Pre-split check: some patterns (fork bombs) contain semicolons in their
  // own syntax, which the command splitter would break apart. Check the
  // whole command against these patterns first.
  const normalized = trimmed.replace(/\s+/g, " ");
  for (const pattern of DEFAULT_BLACKLIST_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        matched: true,
        reason: `Command matched critical security blacklist pattern (${pattern.source})`,
      };
    }
  }

  // Split compound commands and check each subcommand independently.
  // If ANY subcommand is blacklisted, the whole line is blacklisted.
  const subcommands = splitSubcommands(trimmed);

  for (const sub of subcommands) {
    const result = checkSingleCommandBlacklist(sub, customBlacklist);
    if (result.matched) {
      return result;
    }
  }

  return { matched: false };
}

/**
 * Checks a single (non-compound) command against blacklist rules.
 */
function checkSingleCommandBlacklist(
  command: string,
  customBlacklist: string[],
): { matched: boolean; reason?: string } {
  const trimmed = command.trim();
  if (!trimmed) return { matched: false };

  // Never match commands that merely echo/print strings to stdout without redirection or pipe
  // (e.g. echo "rm -rf /", printf 'rm -rf /\n')
  if (/^(?:echo|printf)\s+(?:['"].*['"]|\S+)\s*$/.test(trimmed)) {
    return { matched: false };
  }

  // Normalize multi-whitespace
  const normalized = trimmed.replace(/\s+/g, " ");

  // 1. Check regex catastrophic patterns
  for (const pattern of DEFAULT_BLACKLIST_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        matched: true,
        reason: `Command matched critical security blacklist pattern (${pattern.source})`,
      };
    }
  }

  // 2. Check exact custom blacklist strings with word boundary / whitespace tolerance
  for (const item of customBlacklist) {
    const itemTrimmed = item.trim();
    if (!itemTrimmed) continue;

    if (normalized === itemTrimmed || normalized.startsWith(`${itemTrimmed} `)) {
      return {
        matched: true,
        reason: `Command matched explicit user blacklist: "${itemTrimmed}"`,
      };
    }
  }

  return { matched: false };
}

/**
 * Checks whether a command matches a string pattern or glob/substring in a list.
 */
function matchesList(command: string, list: string[]): boolean {
  const trimmed = command.trim();
  return list.some((item) => {
    const itemTrimmed = item.trim();
    if (trimmed === itemTrimmed) return true;
    if (trimmed.startsWith(`${itemTrimmed} `) || trimmed.startsWith(`${itemTrimmed}\t`))
      return true;
    return false;
  });
}

/**
 * Evaluate a command against deterministic approval policies.
 *
 * Evaluation Hierarchy:
 * 1. Blacklist Match → Immediate BLOCK
 * 2. Whitelist Match → Immediate AUTO-APPROVE
 * 3. Risk Engine Classification → Mapped to configured Risk Policy
 */
export function resolvePolicy(
  command: string,
  config: PolicyConfig = DEFAULT_POLICY_CONFIG,
): PolicyDecision {
  const trimmed = command.trim();

  // 1. Blacklist check with robust token and regex matching
  const blacklistCheck = isBlacklisted(trimmed, config.blacklist);
  if (blacklistCheck.matched) {
    return {
      action: "block",
      riskLevel: "high",
      reason: blacklistCheck.reason || "Command is blacklisted by security policy",
      isBlacklisted: true,
      isWhitelisted: false,
    };
  }

  // 2. Whitelist check
  if (matchesList(trimmed, config.whitelist)) {
    return {
      action: "auto-approve",
      riskLevel: "low",
      reason: "Command is whitelisted by user policy",
      isBlacklisted: false,
      isWhitelisted: true,
    };
  }

  // 3. Fallback to deterministic risk classification
  const classification = classify(trimmed);
  const action = config.policies[classification.level] || "notify-and-confirm";

  return {
    action,
    riskLevel: classification.level,
    reason: `${classification.label} (classified as ${classification.level} risk)`,
    isBlacklisted: false,
    isWhitelisted: false,
  };
}
