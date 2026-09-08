import { Command } from "commander";
import { existsSync } from "node:fs";
import {
  loadConfig,
  saveConfig,
  getDefaultConfigPath,
  getDefaultSoundsDir,
  type SoundTier,
} from "../configManager.js";
import type { RiskLevel } from "../../core/types.js";
import {
  importSoundFile,
  listSoundAssets,
  removeSoundAsset,
  playAudio,
  validateAudioFile,
  BUILT_IN_MACOS_SOUNDS,
  DEFAULT_RISK_SOUND_MAP,
} from "../../notify/soundManager.js";

const VALID_TIERS: SoundTier[] = ["low", "medium", "high", "stall"];

export function createSoundCommand(): Command {
  const cmd = new Command("sound");

  cmd.description("Manage custom audio alert assets and notification sound profiles");

  // defcon sound list
  cmd
    .command("list")
    .description(
      "List built-in alert sounds, imported custom sound assets, and active sound profiles",
    )
    .action(() => {
      const config = loadConfig();
      const { builtIn, custom } = listSoundAssets();

      console.log("\n=======================================================");
      console.log("       DEFCON / APL ALERT SOUND PROFILE");
      console.log("=======================================================\n");

      console.log("Active Sound Configuration:");
      console.log("---------------------------");
      console.log(`Global Custom Sound : ${config.notifications.customSoundPath || "(none)"}`);
      console.log(
        `Stall Alert Sound   : ${config.notifications.customSounds?.stall || "(default: Sosumi)"}`,
      );
      console.log(
        `Low Risk Sound      : ${config.notifications.customSounds?.low || config.notifications.sounds.low || DEFAULT_RISK_SOUND_MAP.low}`,
      );
      console.log(
        `Medium Risk Sound   : ${config.notifications.customSounds?.medium || config.notifications.sounds.medium || DEFAULT_RISK_SOUND_MAP.medium}`,
      );
      console.log(
        `High Risk Sound     : ${config.notifications.customSounds?.high || config.notifications.sounds.high || DEFAULT_RISK_SOUND_MAP.high}`,
      );
      console.log("");

      console.log(`Custom Assets in ${getDefaultSoundsDir()}:`);
      console.log("-----------------------------------------");
      if (custom.length === 0) {
        console.log(
          "  (No custom audio assets imported yet. Use `defcon sound import <file>` to add one.)",
        );
      } else {
        for (const item of custom) {
          const sizeKb = (item.sizeBytes / 1024).toFixed(1);
          console.log(
            `  • ${item.name.padEnd(20)} [${item.extension.toUpperCase()}] (${sizeKb} KB) -> ${item.path}`,
          );
        }
      }
      console.log("");

      console.log("Built-in System Library (macOS):");
      console.log("--------------------------------");
      console.log(`  ${builtIn.join(", ")}`);
      console.log("");
    });

  // defcon sound import <file>
  cmd
    .command("import <filePath>")
    .description("Import an audio file (.mp3, .wav, .aiff, .ogg, .m4a) into ~/.apl/sounds/")
    .option("-t, --tier <tier>", "Automatically assign to a risk tier (low, medium, high, stall)")
    .option("-n, --name <name>", "Custom alias name for the sound asset")
    .option("--global", "Set as the global fallback custom sound for all alerts")
    .action((filePath: string, options: { tier?: string; name?: string; global?: boolean }) => {
      const result = importSoundFile(filePath, options.name);
      if (!result.success || !result.destPath) {
        console.error(`\n❌ Sound import failed: ${result.error || "Unknown error"}`);
        process.exit(1);
      }

      console.log(`\n✅ Successfully imported sound asset "${result.soundName}"!`);
      console.log(`📁 Stored at: ${result.destPath}`);

      const configPath = getDefaultConfigPath();
      const config = loadConfig(configPath);

      if (options.tier) {
        const tier = options.tier.toLowerCase() as SoundTier;
        if (!VALID_TIERS.includes(tier)) {
          console.warn(`⚠️ Invalid tier "${options.tier}". Valid tiers: ${VALID_TIERS.join(", ")}`);
        } else {
          if (!config.notifications.customSounds) {
            config.notifications.customSounds = {};
          }
          config.notifications.customSounds[tier] = result.destPath;
          saveConfig(config, configPath);
          console.log(`🎯 Assigned "${result.soundName}" to ${tier.toUpperCase()} risk tier.`);
        }
      }

      if (options.global) {
        config.notifications.customSoundPath = result.destPath;
        saveConfig(config, configPath);
        console.log(`🌐 Configured "${result.soundName}" as global custom sound.`);
      }

      console.log("\nRun `defcon sound test` to preview audio.");
    });

  // defcon sound set-tier <tier> <soundNameOrPath>
  cmd
    .command("set-tier <tier> <sound>")
    .description(
      "Assign a custom sound asset or built-in system sound to a risk tier (low, medium, high, stall)",
    )
    .action((tierInput: string, soundInput: string) => {
      const tier = tierInput.toLowerCase() as SoundTier;
      if (!VALID_TIERS.includes(tier)) {
        console.error(`❌ Invalid tier "${tierInput}". Supported tiers: ${VALID_TIERS.join(", ")}`);
        process.exit(1);
      }

      const configPath = getDefaultConfigPath();
      const config = loadConfig(configPath);
      if (!config.notifications.customSounds) {
        config.notifications.customSounds = {};
      }

      // Check if it matches a custom asset in ~/.apl/sounds/
      const { custom } = listSoundAssets();
      const matchedAsset = custom.find(
        (c) =>
          c.name.toLowerCase() === soundInput.toLowerCase() ||
          c.filename.toLowerCase() === soundInput.toLowerCase(),
      );

      if (matchedAsset) {
        config.notifications.customSounds[tier] = matchedAsset.path;
        saveConfig(config, configPath);
        console.log(
          `✅ Set ${tier.toUpperCase()} risk sound to custom asset "${matchedAsset.name}" (${matchedAsset.path}).`,
        );
        return;
      }

      // Check if sound is a direct file path on disk
      if (existsSync(soundInput)) {
        const validation = validateAudioFile(soundInput);
        if (!validation.valid) {
          console.error(`❌ Invalid sound file: ${validation.error}`);
          process.exit(1);
        }
        config.notifications.customSounds[tier] = soundInput;
        saveConfig(config, configPath);
        console.log(`✅ Set ${tier.toUpperCase()} risk sound to file path: ${soundInput}`);
        return;
      }

      // Check if sound is a built-in macOS sound
      const matchedBuiltIn = BUILT_IN_MACOS_SOUNDS.find(
        (b) => b.toLowerCase() === soundInput.toLowerCase(),
      );

      if (matchedBuiltIn) {
        if (tier !== "stall") {
          config.notifications.sounds[tier as RiskLevel] = matchedBuiltIn;
        }
        if (config.notifications.customSounds && config.notifications.customSounds[tier]) {
          delete config.notifications.customSounds[tier];
        }
        saveConfig(config, configPath);
        console.log(
          `✅ Set ${tier.toUpperCase()} risk sound to built-in sound "${matchedBuiltIn}".`,
        );
        return;
      }

      console.error(
        `❌ Could not resolve sound "${soundInput}". Must be a built-in sound name, imported asset name, or valid audio file path.`,
      );
      process.exit(1);
    });

  // defcon sound test
  cmd
    .command("test")
    .description("Play and test an alert sound preview")
    .option("-t, --tier <tier>", "Test sound configured for tier (low, medium, high, stall)")
    .option("-n, --name <name>", "Test a specific built-in or custom sound by name")
    .option("-p, --path <filePath>", "Test playing an audio file directly from disk")
    .action(async (options: { tier?: string; name?: string; path?: string }) => {
      let targetSound = "Sosumi";
      const config = loadConfig();

      if (options.path) {
        targetSound = options.path;
      } else if (options.name) {
        const { custom } = listSoundAssets();
        const matched = custom.find(
          (c) =>
            c.name.toLowerCase() === options.name!.toLowerCase() ||
            c.filename.toLowerCase() === options.name!.toLowerCase(),
        );
        targetSound = matched ? matched.path : options.name;
      } else if (options.tier) {
        const tier = options.tier.toLowerCase() as SoundTier;
        if (!VALID_TIERS.includes(tier)) {
          console.error(
            `❌ Invalid tier "${options.tier}". Valid tiers: ${VALID_TIERS.join(", ")}`,
          );
          process.exit(1);
        }
        if (config.notifications.customSounds?.[tier]) {
          targetSound = config.notifications.customSounds[tier]!;
        } else if (tier === "stall") {
          targetSound = "Sosumi";
        } else {
          targetSound =
            config.notifications.sounds[tier as RiskLevel] ||
            DEFAULT_RISK_SOUND_MAP[tier as RiskLevel];
        }
      } else if (config.notifications.customSoundPath) {
        targetSound = config.notifications.customSoundPath;
      }

      console.log(`🔊 Playing audio preview for "${targetSound}"...`);
      const played = await playAudio(targetSound);
      if (played) {
        console.log("✅ Audio playback complete.");
      } else {
        console.warn("⚠️ Audio playback was skipped or target was not found.");
      }
    });

  // defcon sound reset
  cmd
    .command("reset")
    .description("Reset sound configurations to system defaults")
    .option("-t, --tier <tier>", "Reset sound for a specific tier only")
    .action((options: { tier?: string }) => {
      const configPath = getDefaultConfigPath();
      const config = loadConfig(configPath);

      if (options.tier) {
        const tier = options.tier.toLowerCase() as SoundTier;
        if (!VALID_TIERS.includes(tier)) {
          console.error(
            `❌ Invalid tier "${options.tier}". Valid tiers: ${VALID_TIERS.join(", ")}`,
          );
          process.exit(1);
        }
        if (config.notifications.customSounds && config.notifications.customSounds[tier]) {
          delete config.notifications.customSounds[tier];
        }
        if (tier !== "stall") {
          config.notifications.sounds[tier as RiskLevel] =
            DEFAULT_RISK_SOUND_MAP[tier as RiskLevel];
        }
        saveConfig(config, configPath);
        console.log(`✅ Reset sound profile for ${tier.toUpperCase()} tier to default.`);
      } else {
        config.notifications.customSoundPath = undefined;
        config.notifications.customSounds = undefined;
        config.notifications.sounds = {
          low: DEFAULT_RISK_SOUND_MAP.low,
          medium: DEFAULT_RISK_SOUND_MAP.medium,
          high: DEFAULT_RISK_SOUND_MAP.high,
        };
        config.notifications.builtInSound = "Sosumi";
        saveConfig(config, configPath);
        console.log("✅ Reset all sound configuration to system defaults.");
      }
    });

  // defcon sound remove <soundName>
  cmd
    .command("remove <soundName>")
    .description("Delete an imported custom sound asset from ~/.apl/sounds/")
    .action((soundName: string) => {
      const res = removeSoundAsset(soundName);
      if (!res.success) {
        console.error(`❌ Failed to remove sound: ${res.error}`);
        process.exit(1);
      }

      // Clear any tier referencing this removed asset path
      const configPath = getDefaultConfigPath();
      const config = loadConfig(configPath);
      let modified = false;

      if (
        config.notifications.customSoundPath &&
        config.notifications.customSoundPath.includes(soundName)
      ) {
        config.notifications.customSoundPath = undefined;
        modified = true;
      }

      if (config.notifications.customSounds) {
        for (const tier of VALID_TIERS) {
          if (config.notifications.customSounds[tier]?.includes(soundName)) {
            delete config.notifications.customSounds[tier];
            modified = true;
          }
        }
      }

      if (modified) {
        saveConfig(config, configPath);
      }

      console.log(`✅ Successfully removed custom sound asset "${soundName}".`);
    });

  return cmd;
}
