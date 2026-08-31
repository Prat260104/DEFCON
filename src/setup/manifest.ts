import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SetupManifest, SetupManifestEntry, SetupTargetId } from "./types.js";

export function getManifestPath(): string {
  return join(homedir(), ".apl", "setup-manifest.json");
}

export function loadSetupManifest(): SetupManifest {
  const manifestPath = getManifestPath();
  if (!existsSync(manifestPath)) {
    return {
      version: "0.1.0",
      lastUpdated: new Date().toISOString(),
      entries: [],
    };
  }

  try {
    const raw = readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as SetupManifest;
  } catch {
    return {
      version: "0.1.0",
      lastUpdated: new Date().toISOString(),
      entries: [],
    };
  }
}

export function saveSetupManifest(manifest: SetupManifest): void {
  const manifestPath = getManifestPath();
  const dir = join(homedir(), ".apl");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  manifest.lastUpdated = new Date().toISOString();
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

export function recordManifestEntry(entry: SetupManifestEntry): void {
  const manifest = loadSetupManifest();
  const existingIdx = manifest.entries.findIndex((e) => e.targetId === entry.targetId);
  if (existingIdx >= 0) {
    manifest.entries[existingIdx] = entry;
  } else {
    manifest.entries.push(entry);
  }
  saveSetupManifest(manifest);
}

export function removeManifestEntry(targetId: SetupTargetId): void {
  const manifest = loadSetupManifest();
  manifest.entries = manifest.entries.filter((e) => e.targetId !== targetId);
  saveSetupManifest(manifest);
}
