import { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAplMcpServer } from "../../mcp/server.js";

export function createMcpCommand(): Command {
  const cmd = new Command("mcp");

  cmd
    .description("Start the APL Model Context Protocol (MCP) server for IDE chat integration")
    .action(async () => {
      process.stderr.write("[APL MCP] Launching Agent Permission Layer MCP Server over stdio...\n");
      const server = createAplMcpServer();
      const transport = new StdioServerTransport();
      await server.connect(transport);
      process.stderr.write("[APL MCP] MCP Server running and ready for IDE connections.\n");
    });

  return cmd;
}
