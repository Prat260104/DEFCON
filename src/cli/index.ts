#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createStartCommand } from "./commands/start.js";
import { createStopCommand } from "./commands/stop.js";
import { createStatusCommand } from "./commands/status.js";
import { createAgentsCommand } from "./commands/agents.js";
import { createConfigCommand } from "./commands/config.js";
import { createAuditCommand } from "./commands/audit.js";
import { createReportCommand } from "./commands/report.js";
import { createMcpCommand } from "./commands/mcp.js";
import { createSetupCommand } from "./commands/setup.js";
import { createSoundCommand } from "./commands/sound.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const packageJsonPath = join(__dirname, "../../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const version = packageJson.version;

const program = new Command();

const binName = process.argv[1]?.endsWith("defcon") ? "defcon" : "apl";

program
  .name(binName)
  .description(
    "Agent Permission Layer — Local-first risk classifier & notification daemon for coding agents",
  )
  .version(version);

program.addCommand(createSetupCommand());
program.addCommand(createStartCommand());
program.addCommand(createStopCommand());
program.addCommand(createStatusCommand());
program.addCommand(createAgentsCommand());
program.addCommand(createConfigCommand());
program.addCommand(createAuditCommand());
program.addCommand(createReportCommand());
program.addCommand(createMcpCommand());
program.addCommand(createSoundCommand());

program.parse(process.argv);
