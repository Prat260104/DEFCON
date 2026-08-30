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
        const [key, val] = (options.set as string).split("=");
        if (!key || val === undefined) {
          console.error("Invalid format. Use --set key=value");
          process.exit(1);
        }

        if (key.startsWith("adapters.")) {
          const adapterName = key.replace("adapters.", "");
          config.adapters[adapterName] = val === "true" || val === "1";
        } else if (key === "notifications.enabled") {
          config.notifications.enabled = val === "true" || val === "1";
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
        } else {
          console.log((config as unknown as Record<string, unknown>)[key]);
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
