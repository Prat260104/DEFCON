import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";
import { TARGET_DEFINITIONS } from "./targets.js";
import { resolveMcpServerPath } from "./resolver.js";
import { recordManifestEntry, removeManifestEntry } from "./manifest.js";
import type { SetupOptions, TargetResult, SetupTargetId } from "./types.js";

export function formatJsonDiff(original: any, updated: any): string {
  const originalStr = original ? JSON.stringify(original, null, 2) : "{} (empty/new file)";
  const updatedStr = JSON.stringify(updated, null, 2);
  return `--- Original ---\n${originalStr}\n\n+++ Proposed ---\n${updatedStr}`;
}

export async function runSetup(options: SetupOptions = {}): Promise<TargetResult[]> {
  const results: TargetResult[] = [];
  const mcpPath = resolveMcpServerPath();

  const targetKeys = Object.keys(TARGET_DEFINITIONS) as SetupTargetId[];

  for (const id of targetKeys) {
    const def = TARGET_DEFINITIONS[id];
    const customPath = options.customPaths?.[id];
    const isDetected = def.detect(customPath);
    const configPath = customPath || def.getDefaultConfigPath();

    if (!isDetected && !existsSync(configPath)) {
      results.push({
        id,
        name: def.name,
        configPath,
        detected: false,
        status: "skipped_not_detected",
        message: `⚪ ${def.name.padEnd(14)} — not detected, skipped`,
      });
      continue;
    }

    let existingContent = "";
    let existingJson: any = null;
    const fileExists = existsSync(configPath);

    if (fileExists) {
      try {
        existingContent = readFileSync(configPath, "utf-8").trim();
        if (existingContent.length > 0) {
          existingJson = JSON.parse(existingContent);
        } else {
          existingJson = {};
        }
      } catch (err: any) {
        results.push({
          id,
          name: def.name,
          configPath,
          detected: true,
          status: "skipped_parse_error",
          message: `❌ ${def.name.padEnd(14)} — config file failed to parse as valid JSON. Skipping safely.`,
          error: err.message,
        });
        continue;
      }
    } else {
      existingJson = {};
    }

    if (options.undo) {
      if (!fileExists) {
        results.push({
          id,
          name: def.name,
          configPath,
          detected: true,
          status: "not_installed",
          message: `⚪ ${def.name.padEnd(14)} — no config file found to undo`,
        });
        continue;
      }

      const { updated, changed } = def.undoConfig(existingJson);

      if (!changed) {
        results.push({
          id,
          name: def.name,
          configPath,
          detected: true,
          status: "not_installed",
          message: `⚪ ${def.name.padEnd(14)} — no APL configuration found to remove`,
        });
        continue;
      }

      if (options.dryRun) {
        results.push({
          id,
          name: def.name,
          configPath,
          detected: true,
          status: "uninstalled",
          message: `🔍 [DRY-RUN] ${def.name.padEnd(14)} — would remove APL configuration`,
          diff: formatJsonDiff(existingJson, updated),
        });
      } else {
        try {
          const backupPath = `${configPath}.bak`;
          copyFileSync(configPath, backupPath);
          writeFileSync(configPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
          removeManifestEntry(id);

          results.push({
            id,
            name: def.name,
            configPath,
            detected: true,
            status: "uninstalled",
            message: `✅ ${def.name.padEnd(14)} — APL configuration cleanly removed`,
          });
        } catch (writeErr: any) {
          results.push({
            id,
            name: def.name,
            configPath,
            detected: true,
            status: "error",
            message: `❌ ${def.name.padEnd(14)} — failed to write updated config: ${writeErr.message}`,
            error: writeErr.message,
          });
        }
      }
    } else {
      // Setup / Install mode
      const { updated, changed, alreadyConfigured } = def.mergeConfig(existingJson, mcpPath);

      if (alreadyConfigured && !changed) {
        results.push({
          id,
          name: def.name,
          configPath,
          detected: true,
          status: "already_configured",
          message: `✅ ${def.name.padEnd(14)} — already configured (up to date)`,
        });
        continue;
      }

      if (options.dryRun) {
        results.push({
          id,
          name: def.name,
          configPath,
          detected: true,
          status: "installed",
          message: `🔍 [DRY-RUN] ${def.name.padEnd(14)} — would configure (${def.manualStepNote})`,
          diff: formatJsonDiff(existingJson, updated),
        });
      } else {
        try {
          const dir = dirname(configPath);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }

          let backupPath: string | undefined;
          if (fileExists) {
            backupPath = `${configPath}.bak`;
            copyFileSync(configPath, backupPath);
          }

          writeFileSync(configPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");

          recordManifestEntry({
            targetId: id,
            configPath,
            backupPath,
            appliedAt: new Date().toISOString(),
            aplVersion: "0.1.0",
          });

          results.push({
            id,
            name: def.name,
            configPath,
            detected: true,
            status: "installed",
            message: `✅ ${def.name.padEnd(14)} — ${def.manualStepNote}`,
          });
        } catch (writeErr: any) {
          results.push({
            id,
            name: def.name,
            configPath,
            detected: true,
            status: "error",
            message: `❌ ${def.name.padEnd(14)} — failed to write config: ${writeErr.message}`,
            error: writeErr.message,
          });
        }
      }
    }
  }

  return results;
}
