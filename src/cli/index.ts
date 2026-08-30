#!/usr/bin/env node

import { Command } from "commander";
import { createStartCommand } from "./commands/start.js";
import { createStopCommand } from "./commands/stop.js";
import { createStatusCommand } from "./commands/status.js";
import { createAgentsCommand } from "./commands/agents.js";
import { createConfigCommand } from "./commands/config.js";
import { createHistoryCommand } from "./commands/history.js";
import { createMcpCommand } from "./commands/mcp.js";

const program = new Command();

program
  .name("apl")
  .description("Agent Permission Layer — Local-first risk classifier & notification daemon for coding agents")
  .version("0.1.0");

program.addCommand(createStartCommand());
program.addCommand(createStopCommand());
program.addCommand(createStatusCommand());
program.addCommand(createAgentsCommand());
program.addCommand(createConfigCommand());
program.addCommand(createHistoryCommand());
program.addCommand(createMcpCommand());

program.parse(process.argv);
