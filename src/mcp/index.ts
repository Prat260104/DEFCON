#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAplMcpServer } from "./server.js";

/**
 * Main executable entrypoint for APL Model Context Protocol (MCP) Server.
 * Communicates with IDE clients (Antigravity, Kiro, Cursor, Claude Desktop) over stdio.
 */
async function main() {
  process.stderr.write("[APL MCP] Initializing Agent Permission Layer MCP Server...\n");

  const server = createAplMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  process.stderr.write("[APL MCP] Server connected via stdio transport. Guardrails active.\n");
}

main().catch((err) => {
  process.stderr.write(`[APL MCP] Fatal error starting server: ${err}\n`);
  process.exit(1);
});
