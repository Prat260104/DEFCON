import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";

const inboxPath = join(homedir(), ".apl", "inbox.jsonl");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function runDemo() {
  console.log("\n========================================================");
  console.log("  🤖 LIVE CODING AGENT STALL SIMULATION (APL v2)");
  console.log("========================================================");
  console.log("  Agent is refactoring code in background...");
  await new Promise((r) => setTimeout(r, 1200));

  console.log("\n  ⚠️  Agent is BLOCKED requesting permission: `rm -rf /production-database`");
  console.log("  📡 Firing PreToolUse Hook to APL...");

  // 1. Agent emits permission_required to APL
  const payload = {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "rm -rf /production-database" },
  };
  appendFileSync(inboxPath, JSON.stringify(payload) + "\n");

  console.log("\n  ⏳ Timer started (35s stall countdown in daemon).");
  console.log("     - If you approve/reject quickly: ZERO annoying sounds.");
  console.log("     - If you leave your desk: LOUD alarm fires to bring you back!");
  console.log("  --------------------------------------------------------");

  // 2. Prompt user
  rl.question("  👉 [AGENT PROMPT] Approve `rm -rf /production-database`? (y/N): ", (answer) => {
    // Notify resolution to cancel stall timer
    const resolutionPayload = {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "rm -rf /production-database" },
    };
    appendFileSync(inboxPath, JSON.stringify(resolutionPayload) + "\n");

    if (answer.trim().toLowerCase() === "y") {
      console.log("\n  💥 COMMAND APPROVED. Stall timer cancelled silently.\n");
    } else {
      console.log("\n  🛡️  COMMAND REJECTED! Stall timer cancelled silently.\n");
    }
    rl.close();
  });
}

runDemo();
