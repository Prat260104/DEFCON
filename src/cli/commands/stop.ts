import { Command } from "commander";

export function createStopCommand(): Command {
  const cmd = new Command("stop");

  cmd
    .description("Stop instructions for the foreground APL daemon")
    .action(() => {
      console.log("\n  APL currently runs as a foreground process.");
      console.log("  To stop a running `apl start` session, press Ctrl+C in that terminal.\n");
    });

  return cmd;
}
