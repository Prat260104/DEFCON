import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateAudioFile,
  sanitizeSoundName,
  importSoundFile,
  listSoundAssets,
  removeSoundAsset,
  resolveSoundForEvent,
  BUILT_IN_MACOS_SOUNDS,
  DEFAULT_RISK_SOUND_MAP,
} from "../../src/notify/soundManager.js";
import { getDefaultConfig, type AplConfig } from "../../src/cli/configManager.js";
import type { AgentEvent } from "../../src/core/types.js";

describe("soundManager", () => {
  let tempDir: string;
  let testAudioFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "apl-sound-test-"));
    testAudioFile = join(tempDir, "custom-alert.mp3");
    writeFileSync(testAudioFile, "RIFF...mock-mp3-audio-data");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("validateAudioFile", () => {
    it("should validate a valid audio file format (.mp3)", () => {
      const res = validateAudioFile(testAudioFile);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("should fail validation if file does not exist", () => {
      const res = validateAudioFile(join(tempDir, "nonexistent.mp3"));
      expect(res.valid).toBe(false);
      expect(res.error).toContain("does not exist");
    });

    it("should fail validation for unsupported extensions (.txt, .exe)", () => {
      const textFile = join(tempDir, "bad.txt");
      writeFileSync(textFile, "hello");
      const res = validateAudioFile(textFile);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Unsupported audio format");
    });
  });

  describe("sanitizeSoundName", () => {
    it("should strip invalid characters and trim spaces", () => {
      expect(sanitizeSoundName("my_alert!#$@.mp3")).toBe("my_alert____.mp3");
      expect(sanitizeSoundName("  clean-name_123  ")).toBe("clean-name_123");
    });
  });

  describe("importSoundFile & listSoundAssets", () => {
    it("should import audio file into target sounds directory and list it", () => {
      const soundsDir = join(tempDir, "sounds");
      const result = importSoundFile(testAudioFile, "siren", soundsDir);

      expect(result.success).toBe(true);
      expect(result.soundName).toBe("siren");
      expect(existsSync(result.destPath!)).toBe(true);

      const listing = listSoundAssets(soundsDir);
      expect(listing.builtIn).toEqual(BUILT_IN_MACOS_SOUNDS);
      expect(listing.custom.length).toBe(1);
      expect(listing.custom[0].name).toBe("siren");
      expect(listing.custom[0].extension).toBe(".mp3");
    });

    it("should remove imported sound asset", () => {
      const soundsDir = join(tempDir, "sounds");
      importSoundFile(testAudioFile, "temp_tone", soundsDir);

      const removeResult = removeSoundAsset("temp_tone", soundsDir);
      expect(removeResult.success).toBe(true);

      const listing = listSoundAssets(soundsDir);
      expect(listing.custom.length).toBe(0);
    });
  });

  describe("resolveSoundForEvent priority hierarchy", () => {
    const baseEvent: AgentEvent = {
      id: "evt-1",
      timestamp: Date.now(),
      agent: "claude-code",
      type: "permission_required",
      riskLevel: "high",
      command: "rm -rf /",
    };

    it("1. Should prioritize stall-specific custom sound if stall alert", () => {
      const stallAudio = join(tempDir, "stall.wav");
      writeFileSync(stallAudio, "audio");

      const config: AplConfig = {
        ...getDefaultConfig(),
        notifications: {
          ...getDefaultConfig().notifications,
          customSounds: {
            stall: stallAudio,
            high: join(tempDir, "high.wav"),
          },
        },
      };

      const stallEvent: AgentEvent = {
        ...baseEvent,
        metadata: { isStallAlert: true },
      };

      const resolved = resolveSoundForEvent(stallEvent, config);
      expect(resolved.soundFilePath).toBe(stallAudio);
      expect(resolved.soundName).toBe("stall");
    });

    it("2. Should prioritize tier-specific custom sound for risk tier", () => {
      const highAudio = join(tempDir, "high.mp3");
      writeFileSync(highAudio, "audio");

      const config: AplConfig = {
        ...getDefaultConfig(),
        notifications: {
          ...getDefaultConfig().notifications,
          customSounds: {
            high: highAudio,
          },
        },
      };

      const resolved = resolveSoundForEvent(baseEvent, config);
      expect(resolved.soundFilePath).toBe(highAudio);
      expect(resolved.soundName).toBe("high");
    });

    it("3. Should prioritize global custom sound if tier custom sound not set", () => {
      const globalAudio = join(tempDir, "global.mp3");
      writeFileSync(globalAudio, "audio");

      const config: AplConfig = {
        ...getDefaultConfig(),
        notifications: {
          ...getDefaultConfig().notifications,
          customSoundPath: globalAudio,
        },
      };

      const resolved = resolveSoundForEvent(baseEvent, config);
      expect(resolved.soundFilePath).toBe(globalAudio);
      expect(resolved.soundName).toBe("global");
    });

    it("4. Should fall back to default sound mapping when no custom sounds configured", () => {
      const config = getDefaultConfig();
      const resolved = resolveSoundForEvent({ ...baseEvent, riskLevel: "low" }, config);
      expect(resolved.soundName).toBe(DEFAULT_RISK_SOUND_MAP.low);
    });

    describe("Multi-Tier Acoustic Escalation (Phase 11D)", () => {
      it("custom stall sound plays consistently across ALL escalation levels (1, 2, and 3+)", () => {
        const customStallAudio = join(tempDir, "siren.mp3");
        writeFileSync(customStallAudio, "audio");

        const config: AplConfig = {
          ...getDefaultConfig(),
          notifications: {
            ...getDefaultConfig().notifications,
            customSounds: {
              stall: customStallAudio,
            },
          },
        };

        // Alert 1 (Level 1)
        const lvl1 = resolveSoundForEvent({
          ...baseEvent,
          riskLevel: "low",
          metadata: { isStallAlert: true, escalationLevel: 1 },
        }, config);
        expect(lvl1.soundName).toBe("siren");
        expect(lvl1.soundFilePath).toBe(customStallAudio);

        // Alert 2 (Level 2)
        const lvl2 = resolveSoundForEvent({
          ...baseEvent,
          riskLevel: "medium",
          metadata: { isStallAlert: true, escalationLevel: 2 },
        }, config);
        expect(lvl2.soundName).toBe("siren");
        expect(lvl2.soundFilePath).toBe(customStallAudio);

        // Alert 3 (Level 3)
        const lvl3 = resolveSoundForEvent({
          ...baseEvent,
          riskLevel: "high",
          metadata: { isStallAlert: true, escalationLevel: 3 },
        }, config);
        expect(lvl3.soundName).toBe("siren");
        expect(lvl3.soundFilePath).toBe(customStallAudio);
      });

      it("falls back to built-in escalating sequence (Pop/Ping -> Sosumi -> Basso) when NO custom stall sound is set", () => {
        const config = getDefaultConfig();

        // Alert 1 (Level 1) - Low risk -> Pop, Medium risk -> Ping, High risk -> Sosumi
        const lvl1Low = resolveSoundForEvent({
          ...baseEvent,
          riskLevel: "low",
          metadata: { isStallAlert: true, escalationLevel: 1 },
        }, config);
        expect(lvl1Low.soundName).toBe("Pop");

        const lvl1Med = resolveSoundForEvent({
          ...baseEvent,
          riskLevel: "medium",
          metadata: { isStallAlert: true, escalationLevel: 1 },
        }, config);
        expect(lvl1Med.soundName).toBe("Ping");

        // Alert 2 (Level 2) - Escalates to Sosumi
        const lvl2 = resolveSoundForEvent({
          ...baseEvent,
          riskLevel: "low",
          metadata: { isStallAlert: true, escalationLevel: 2 },
        }, config);
        expect(lvl2.soundName).toBe("Sosumi");

        // Alert 3 (Level 3) - Escalates to Basso
        const lvl3 = resolveSoundForEvent({
          ...baseEvent,
          riskLevel: "low",
          metadata: { isStallAlert: true, escalationLevel: 3 },
        }, config);
        expect(lvl3.soundName).toBe("Basso");
      });

      it("Alert 1 prioritizes risk-tier custom sound when no custom stall sound is set", () => {
        const customLowAudio = join(tempDir, "custom-low.wav");
        writeFileSync(customLowAudio, "audio");

        const config: AplConfig = {
          ...getDefaultConfig(),
          notifications: {
            ...getDefaultConfig().notifications,
            customSounds: {
              low: customLowAudio,
            },
          },
        };

        const resolved = resolveSoundForEvent({
          ...baseEvent,
          riskLevel: "low",
          metadata: { isStallAlert: true, escalationLevel: 1 },
        }, config);
        expect(resolved.soundName).toBe("custom-low");
        expect(resolved.soundFilePath).toBe(customLowAudio);
      });

      it("allows optional per-level custom override (e.g. stall-level-2)", () => {
        const defaultStallAudio = join(tempDir, "stall-default.mp3");
        const level2Audio = join(tempDir, "stall-lvl2.mp3");
        writeFileSync(defaultStallAudio, "audio");
        writeFileSync(level2Audio, "audio");

        const config: AplConfig = {
          ...getDefaultConfig(),
          notifications: {
            ...getDefaultConfig().notifications,
            customSounds: {
              stall: defaultStallAudio,
              "stall-level-2": level2Audio,
            },
          },
        };

        const lvl1 = resolveSoundForEvent({
          ...baseEvent,
          metadata: { isStallAlert: true, escalationLevel: 1 },
        }, config);
        expect(lvl1.soundName).toBe("stall-default");

        const lvl2 = resolveSoundForEvent({
          ...baseEvent,
          metadata: { isStallAlert: true, escalationLevel: 2 },
        }, config);
        expect(lvl2.soundName).toBe("stall-lvl2");

        const lvl3 = resolveSoundForEvent({
          ...baseEvent,
          metadata: { isStallAlert: true, escalationLevel: 3 },
        }, config);
        expect(lvl3.soundName).toBe("stall-default");
      });
    });
  });
});
