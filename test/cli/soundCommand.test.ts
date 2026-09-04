import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSoundCommand } from "../../src/cli/commands/sound.js";
import { loadConfig, saveConfig, getDefaultConfig, type AplConfig } from "../../src/cli/configManager.js";
import * as soundManager from "../../src/notify/soundManager.js";

describe("CLI Sound Command (defcon sound)", () => {
  let tempDir: string;
  let testConfigPath: string;
  let testSoundsDir: string;
  let sampleAudioPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "apl-cli-sound-test-"));
    testConfigPath = join(tempDir, "config.json");
    testSoundsDir = join(tempDir, "sounds");
    sampleAudioPath = join(tempDir, "alert.wav");

    writeFileSync(testConfigPath, JSON.stringify(getDefaultConfig(), null, 2));
    writeFileSync(sampleAudioPath, "RIFF...mock-wav-data");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("should create sound command and register subcommands", () => {
    const cmd = createSoundCommand();
    expect(cmd.name()).toBe("sound");

    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain("list");
    expect(subcommands).toContain("import");
    expect(subcommands).toContain("set-tier");
    expect(subcommands).toContain("test");
    expect(subcommands).toContain("reset");
    expect(subcommands).toContain("remove");
  });

  it("sound import should copy file to custom directory and assign tier if flag passed", () => {
    const importResult = soundManager.importSoundFile(sampleAudioPath, "chime", testSoundsDir);
    expect(importResult.success).toBe(true);
    expect(importResult.soundName).toBe("chime");
    expect(existsSync(importResult.destPath!)).toBe(true);

    const config = loadConfig(testConfigPath);
    config.notifications.customSounds = { high: importResult.destPath };
    saveConfig(config, testConfigPath);

    const updated = loadConfig(testConfigPath);
    expect(updated.notifications.customSounds?.high).toBe(importResult.destPath);
  });

  it("sound set-tier should map built-in sounds or custom assets", () => {
    const config = loadConfig(testConfigPath);
    if (!config.notifications.customSounds) {
      config.notifications.customSounds = {};
    }
    config.notifications.sounds.medium = "Purr";
    saveConfig(config, testConfigPath);

    const updated = loadConfig(testConfigPath);
    expect(updated.notifications.sounds.medium).toBe("Purr");
  });

  it("sound reset should reset all sound configurations to default", () => {
    const config = loadConfig(testConfigPath);
    config.notifications.customSoundPath = "/path/to/custom.mp3";
    config.notifications.customSounds = { stall: "/path/to/stall.wav" };
    config.notifications.sounds.high = "Basso";
    saveConfig(config, testConfigPath);

    // Reset
    const resetConfig: AplConfig = {
      ...config,
      notifications: {
        ...config.notifications,
        customSoundPath: undefined,
        customSounds: undefined,
        sounds: {
          low: "Pop",
          medium: "Ping",
          high: "Sosumi",
        },
      },
    };
    saveConfig(resetConfig, testConfigPath);

    const updated = loadConfig(testConfigPath);
    expect(updated.notifications.customSoundPath).toBeUndefined();
    expect(updated.notifications.customSounds).toBeUndefined();
    expect(updated.notifications.sounds.high).toBe("Sosumi");
  });
});
