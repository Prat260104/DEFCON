/**
 * Type definitions for the APL / Defcon zero-config setup wizard.
 */

export type SetupTargetId =
  | "claude-code"
  | "gemini-cli"
  | "cursor"
  | "antigravity"
  | "claude-desktop"
  | "kiro"
  | "cline"
  | "codex";

export type TargetKind = "hook" | "mcp";

export type TargetStatus =
  | "installed"
  | "updated"
  | "already_configured"
  | "uninstalled"
  | "not_installed"
  | "skipped_not_detected"
  | "skipped_parse_error"
  | "error";

export interface TargetResult {
  id: SetupTargetId;
  name: string;
  configPath: string;
  detected: boolean;
  status: TargetStatus;
  message: string;
  diff?: string;
  error?: string;
}

export interface SetupOptions {
  dryRun?: boolean;
  undo?: boolean;
  customPaths?: Partial<Record<SetupTargetId, string>>;
}

export interface SetupManifestEntry {
  targetId: SetupTargetId;
  configPath: string;
  backupPath?: string;
  appliedAt: string;
  aplVersion: string;
}

export interface SetupManifest {
  version: string;
  lastUpdated: string;
  entries: SetupManifestEntry[];
}
