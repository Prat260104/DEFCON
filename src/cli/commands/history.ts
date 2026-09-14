import { Command } from "commander";
import { createAuditCommand } from "./audit.js";

/**
 * Backward compatibility wrapper for the historical `history` CLI command.
 * Points directly to the enhanced audit log viewer.
 */
export function createHistoryCommand(): Command {
  const cmd = createAuditCommand();
  cmd.name("history");
  return cmd;
}
