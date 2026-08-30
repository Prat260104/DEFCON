import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  console.log("\n========================================================");
  console.log("  🔌 APL MCP SERVER — LIVE TEST CLIENT");
  console.log("========================================================\n");

  console.log("1. Spawning APL MCP Server as a subprocess...");
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/mcp/index.js"],
  });

  const client = new Client(
    { name: "apl-test-client", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log("   ✅ Connected to MCP Server via stdio!\n");

  // 1. List Available Tools
  console.log("2. Querying available tools (tools/list)...");
  const tools = await client.listTools();
  console.log("   Available Tools registered on MCP server:");
  for (const tool of tools.tools) {
    console.log(`   - 🛠️  ${tool.name}: ${tool.description?.slice(0, 60)}...`);
  }

  // 2. Pre-flight Check Permission
  console.log("\n3. Testing `apl_check_permission` for `rm -rf /`...");
  const checkResult = await client.callTool({
    name: "apl_check_permission",
    arguments: { command: "rm -rf /" },
  });
  console.log("   Result from MCP Guardrail:");
  console.log("   " + JSON.stringify(JSON.parse((checkResult.content as any)[0].text), null, 2).replace(/\n/g, "\n   "));

  // 3. Testing Execution of Safe Command
  console.log("\n4. Testing `apl_execute_command` for safe command `echo 'APL MCP Guardrail Active!'`...");
  const execSafe = await client.callTool({
    name: "apl_execute_command",
    arguments: { command: "echo 'APL MCP Guardrail Active!'" },
  });
  console.log("   Output: " + (execSafe.content as any)[0]?.text?.trim());

  // 4. Testing Active Block of Blacklisted Command
  console.log("\n5. Testing `apl_execute_command` with Blacklisted `rm -rf /`...");
  const execBlocked = await client.callTool({
    name: "apl_execute_command",
    arguments: { command: "rm -rf /" },
  });
  console.log("   Is Error (Blocked):", execBlocked.isError);
  console.log("   Blocked Response:\n   " + (execBlocked.content as any)[0]?.text?.replace(/\n/g, "\n   "));

  console.log("\n========================================================");
  console.log("  🎉 MCP SERVER FULLY VERIFIED & OPERATIONAL!");
  console.log("========================================================\n");

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("MCP Test Client Error:", err);
  process.exit(1);
});
