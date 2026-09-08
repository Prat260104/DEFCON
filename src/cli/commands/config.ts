import { Command } from "commander";
import { loadConfig, saveConfig, getDefaultConfigPath } from "../configManager.js";

export function createConfigCommand(): Command {
  const cmd = new Command("config");

  cmd
    .description("View or modify Agent Permission Layer configuration")
    .option("--get <key>", "Get the value of a configuration key")
    .option("--set <key=value>", "Set a configuration key to a value")
    .option("--reset", "Reset configuration to defaults")
    .action((options) => {
      const configPath = getDefaultConfigPath();
      const config = loadConfig(configPath);

      if (options.reset) {
        saveConfig(loadConfig(""), configPath);
        console.log("Configuration reset to defaults at", configPath);
        return;
      }

      if (options.set) {
        const eqIdx = (options.set as string).indexOf("=");
        if (eqIdx === -1) {
          console.error("Invalid format. Use --set key=value");
          process.exit(1);
        }
        const key = (options.set as string).slice(0, eqIdx).trim();
        const val = (options.set as string).slice(eqIdx + 1).trim();

        if (key.startsWith("adapters.")) {
          const adapterName = key.replace("adapters.", "");
          config.adapters[adapterName] = val === "true" || val === "1";
        } else if (key === "notifications.enabled") {
          config.notifications.enabled = val === "true" || val === "1";
        } else if (key === "notifications.customSoundPath") {
          config.notifications.customSoundPath = val || undefined;
        } else if (key === "notifications.builtInSound") {
          config.notifications.builtInSound = val;
        } else if (key.startsWith("notifications.customSounds.")) {
          const tier = key.replace("notifications.customSounds.", "") as
            "low" | "medium" | "high" | "stall";
          if (!config.notifications.customSounds) {
            config.notifications.customSounds = {};
          }
          if (val) {
            config.notifications.customSounds[tier] = val;
          } else {
            delete config.notifications.customSounds[tier];
          }
        } else if (key.startsWith("notifications.sounds.")) {
          const tier = key.replace("notifications.sounds.", "") as "low" | "medium" | "high";
          config.notifications.sounds[tier] = val;
        } else if (key === "stallAlertSeconds" || key === "stall.stallAlertSeconds") {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num > 0) {
            config.stallAlertSeconds = num;
            if (!config.stall) config.stall = {};
            config.stall.stallAlertSeconds = num;
          }
        } else if (
          key === "repeatAlertIntervalSeconds" ||
          key === "stall.repeatAlertIntervalSeconds"
        ) {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num > 0) {
            config.repeatAlertIntervalSeconds = num;
            if (!config.stall) config.stall = {};
            config.stall.repeatAlertIntervalSeconds = num;
          }
        } else if (key === "maxRepeatAlerts" || key === "stall.maxRepeatAlerts") {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num >= 0) {
            config.maxRepeatAlerts = num;
            if (!config.stall) config.stall = {};
            config.stall.maxRepeatAlerts = num;
          }
        } else if (key === "whitelistSafetyTimeoutSeconds") {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num > 0) config.whitelistSafetyTimeoutSeconds = num;
        } else {
          (config as any)[key] = val;
        }

        saveConfig(config, configPath);
        console.log(`Updated ${key} = ${val}`);
        return;
      }

      if (options.get) {
        const key = options.get as string;
        if (key.startsWith("adapters.")) {
          const adapterName = key.replace("adapters.", "");
          console.log(config.adapters[adapterName] ?? false);
        } else if (key.startsWith("notifications.customSounds.")) {
          const tier = key.replace("notifications.customSounds.", "") as
            "low" | "medium" | "high" | "stall";
          console.log(config.notifications.customSounds?.[tier] ?? "");
        } else if (key.startsWith("notifications.sounds.")) {
          const tier = key.replace("notifications.sounds.", "") as "low" | "medium" | "high";
          console.log(config.notifications.sounds[tier] ?? "");
        } else if (key === "notifications.customSoundPath") {
          console.log(config.notifications.customSoundPath ?? "");
        } else if (
          key === "stall.repeatAlertIntervalSeconds" ||
          key === "repeatAlertIntervalSeconds"
        ) {
          console.log(config.repeatAlertIntervalSeconds);
        } else if (key === "stall.maxRepeatAlerts" || key === "maxRepeatAlerts") {
          console.log(config.maxRepeatAlerts);
        } else if (key === "stall.stallAlertSeconds" || key === "stallAlertSeconds") {
          console.log(config.stallAlertSeconds);
        } else {
          const val = (config as unknown as Record<string, unknown>)[key];
          console.log(typeof val === "object" ? JSON.stringify(val, null, 2) : val);
        }
        return;
      }

      // Default: print all config
      console.log(`\nAPL Configuration (${configPath}):\n`);
      console.log(JSON.stringify(config, null, 2));
      console.log("");
    });

  return cmd;
}
