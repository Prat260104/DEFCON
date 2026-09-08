import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { RiskLevel } from "../core/types.js";
import { DEFAULT_POLICY_CONFIG, type PolicyConfig } from "../risk/policy.js";

export type SoundTier = RiskLevel | "stall" | "stall-level-1" | "stall-level-2" | "stall-level-3";

export interface AplConfig {
  version: string;
  stallAlertSeconds: number;
  whitelistSafetyTimeoutSeconds: number;
  repeatAlertIntervalSeconds: number;
  maxRepeatAlerts: number;
  stall?: {
    stallAlertSeconds?: number;
    repeatAlertIntervalSeconds?: number;
    maxRepeatAlerts?: number;
  };
  adapters: {
    "claude-code": boolean;
    "gemini-cli": boolean;
    antigravity: boolean;
    [key: string]: boolean;
  };
  notifications: {
    enabled: boolean;
    customSoundPath?: string;
    customSounds?: Partial<Record<SoundTier, string>>;
    builtInSound?: string;
    sounds: Record<RiskLevel, string>;
  };
  policies: PolicyConfig["policies"];
  whitelist: string[];
  blacklist: string[];
  inboxPath: string;
}

export function getDefaultConfigPath(): string {
  return join(homedir(), ".apl", "config.json");
}

export function getDefaultInboxPath(): string {
  return join(homedir(), ".apl", "inbox.jsonl");
}

export function getDefaultSoundsDir(): string {
  return join(homedir(), ".apl", "sounds");
}

export function getDefaultConfig(): AplConfig {
  return {
    version: "0.2.0",
    stallAlertSeconds: 35,
    whitelistSafetyTimeoutSeconds: 75,
    repeatAlertIntervalSeconds: 60,
    maxRepeatAlerts: 3,
    stall: {
      stallAlertSeconds: 35,
      repeatAlertIntervalSeconds: 60,
      maxRepeatAlerts: 3,
    },
    adapters: {
      "claude-code": true,
      "gemini-cli": true,
      antigravity: true,
      kiro: true,
    },
    notifications: {
      enabled: true,
      builtInSound: "Sosumi",
      sounds: {
        low: "Pop",
        medium: "Ping",
        high: "Sosumi",
      },
    },
    policies: DEFAULT_POLICY_CONFIG.policies,
    whitelist: DEFAULT_POLICY_CONFIG.whitelist,
    blacklist: DEFAULT_POLICY_CONFIG.blacklist,
    inboxPath: getDefaultInboxPath(),
  };
}

export function sanitizeConfig(raw: Record<string, unknown>): AplConfig {
  const defaults = getDefaultConfig();
  const rawStall = (raw["stall"] as Record<string, unknown>) || {};

  // Validate and clamp numeric stall timers (must be integer >= 1)
  const parsedStallSeconds = Number(raw["stallAlertSeconds"] ?? rawStall["stallAlertSeconds"]);
  const stallAlertSeconds =
    !isNaN(parsedStallSeconds) && parsedStallSeconds > 0
      ? Math.floor(parsedStallSeconds)
      : defaults.stallAlertSeconds;

  const parsedWhitelistTimeout = Number(raw["whitelistSafetyTimeoutSeconds"]);
  const whitelistSafetyTimeoutSeconds =
    !isNaN(parsedWhitelistTimeout) && parsedWhitelistTimeout > 0
      ? Math.floor(parsedWhitelistTimeout)
      : defaults.whitelistSafetyTimeoutSeconds;

  const parsedRepeatInterval = Number(
    raw["repeatAlertIntervalSeconds"] ?? rawStall["repeatAlertIntervalSeconds"],
  );
  const repeatAlertIntervalSeconds =
    !isNaN(parsedRepeatInterval) && parsedRepeatInterval > 0
      ? Math.floor(parsedRepeatInterval)
      : defaults.repeatAlertIntervalSeconds;

  const parsedMaxRepeat = Number(raw["maxRepeatAlerts"] ?? rawStall["maxRepeatAlerts"]);
  const maxRepeatAlerts =
    !isNaN(parsedMaxRepeat) && parsedMaxRepeat >= 0
      ? Math.floor(parsedMaxRepeat)
      : defaults.maxRepeatAlerts;

  const rawNotifications = (raw["notifications"] as Record<string, unknown>) || {};
  const rawCustomSounds = (rawNotifications["customSounds"] as Record<string, unknown>) || {};
  const customSounds: Partial<Record<SoundTier, string>> = {};
  for (const tier of [
    "low",
    "medium",
    "high",
    "stall",
    "stall-level-1",
    "stall-level-2",
    "stall-level-3",
  ] as const) {
    if (typeof rawCustomSounds[tier] === "string" && rawCustomSounds[tier]) {
      customSounds[tier] = rawCustomSounds[tier] as string;
    }
  }

  const notifications: AplConfig["notifications"] = {
    enabled:
      typeof rawNotifications["enabled"] === "boolean"
        ? rawNotifications["enabled"]
        : defaults.notifications.enabled,
    customSoundPath:
      typeof rawNotifications["customSoundPath"] === "string"
        ? rawNotifications["customSoundPath"]
        : undefined,
    customSounds: Object.keys(customSounds).length > 0 ? customSounds : undefined,
    builtInSound:
      typeof rawNotifications["builtInSound"] === "string"
        ? rawNotifications["builtInSound"]
        : defaults.notifications.builtInSound,
    sounds: {
      low:
        typeof (rawNotifications["sounds"] as any)?.low === "string"
          ? (rawNotifications["sounds"] as any).low
          : defaults.notifications.sounds.low,
      medium:
        typeof (rawNotifications["sounds"] as any)?.medium === "string"
          ? (rawNotifications["sounds"] as any).medium
          : defaults.notifications.sounds.medium,
      high:
        typeof (rawNotifications["sounds"] as any)?.high === "string"
          ? (rawNotifications["sounds"] as any).high
          : defaults.notifications.sounds.high,
    },
  };

  const whitelist = Array.isArray(raw["whitelist"])
    ? raw["whitelist"].filter((item): item is string => typeof item === "string")
    : defaults.whitelist;

  const blacklist = Array.isArray(raw["blacklist"])
    ? raw["blacklist"].filter((item): item is string => typeof item === "string")
    : defaults.blacklist;

  // Parse policies (only accept known keys with valid string values)
  const rawPolicies = (raw["policies"] as Record<string, unknown>) || {};
  const validPolicyActions = ["auto-approve", "notify-only", "notify-and-confirm", "block"];
  const policies = {
    low:
      typeof rawPolicies["low"] === "string" &&
      validPolicyActions.includes(rawPolicies["low"] as string)
        ? (rawPolicies["low"] as PolicyConfig["policies"]["low"])
        : defaults.policies.low,
    medium:
      typeof rawPolicies["medium"] === "string" &&
      validPolicyActions.includes(rawPolicies["medium"] as string)
        ? (rawPolicies["medium"] as PolicyConfig["policies"]["medium"])
        : defaults.policies.medium,
    high:
      typeof rawPolicies["high"] === "string" &&
      validPolicyActions.includes(rawPolicies["high"] as string)
        ? (rawPolicies["high"] as PolicyConfig["policies"]["high"])
        : defaults.policies.high,
  };

  // Parse adapters (only accept known keys with boolean values)
  const rawAdapters = (raw["adapters"] as Record<string, unknown>) || {};
  const adapters: AplConfig["adapters"] = {
    "claude-code":
      typeof rawAdapters["claude-code"] === "boolean"
        ? rawAdapters["claude-code"]
        : defaults.adapters["claude-code"],
    "gemini-cli":
      typeof rawAdapters["gemini-cli"] === "boolean"
        ? rawAdapters["gemini-cli"]
        : defaults.adapters["gemini-cli"],
    antigravity:
      typeof rawAdapters["antigravity"] === "boolean"
        ? rawAdapters["antigravity"]
        : defaults.adapters["antigravity"],
  };

  // Parse inboxPath
  const inboxPath = typeof raw["inboxPath"] === "string" ? raw["inboxPath"] : defaults.inboxPath;

  // Explicitly construct config from known fields only — unknown keys (e.g.
  // deprecated "autoApproveLowRisk") are intentionally dropped.
  return {
    version: typeof raw["version"] === "string" ? raw["version"] : defaults.version,
    stallAlertSeconds,
    whitelistSafetyTimeoutSeconds,
    repeatAlertIntervalSeconds,
    maxRepeatAlerts,
    stall: {
      stallAlertSeconds,
      repeatAlertIntervalSeconds,
      maxRepeatAlerts,
    },
    adapters,
    notifications,
    policies,
    whitelist,
    blacklist,
    inboxPath,
  };
}

export function loadConfig(configPath: string = getDefaultConfigPath()): AplConfig {
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        return sanitizeConfig(parsed as Record<string, unknown>);
      }
    }
  } catch (err) {
    console.warn(`[config] Failed to load config from ${configPath}, using defaults:`, err);
  }
  return getDefaultConfig();
}

export function saveConfig(config: AplConfig, configPath: string = getDefaultConfigPath()): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}
