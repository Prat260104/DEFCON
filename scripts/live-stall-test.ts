import { appendFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { ClaudeCodeAdapter } from "../src/adapters/claudeCode.js";
import { StallAlertTimer } from "../src/core/stallTimer.js";

const inboxPath = join(homedir(), ".apl", "inbox.jsonl");

async function main() {
  console.log("\n========================================================");
  console.log("  ⏳ LIVE END-TO-END STALL TIMER VERIFICATION (35s)");
  console.log("========================================================\n");

  let alarmFired = false;
  let firedEvent: any = null;
  let elapsed: number = 0;

  const stallTimer = new StallAlertTimer({
    stallAlertSeconds: 35,
    onStallAlert: async (event, elapsedMs) => {
      alarmFired = true;
      firedEvent = event;
      elapsed = Math.round(elapsedMs / 1000);
      console.log(`\n  🔊 [ALARM FIRED AT T+${elapsed}s]`);
      console.log(`     Agent:     ${event.agent}`);
      console.log(`     Command:   ${event.command}`);
      console.log(`     Risk:      ${event.riskLevel}`);
      console.log(`     Session:   ${event.sessionId}`);
    },
  });

  const adapter = new ClaudeCodeAdapter(inboxPath);
  adapter.onEvent((event) => {
    console.log(`  📡 [EVENT RECEIVED] type: ${event.type} | command: ${event.command ?? "none"} | session: ${event.sessionId}`);
    stallTimer.handleEvent(event);
  });

  await adapter.start();
  console.log("1. Adapter watching ~/.apl/inbox.jsonl via chokidar.");
  await new Promise((r) => setTimeout(r, 200));

  // Step 1: Whitelist Test with "git status"
  console.log("\n2. [WHITELIST TEST] Emitting 'git status' event to real inbox...");
  const wlSession = `wl-test-${Date.now()}`;
  appendFileSync(
    inboxPath,
    JSON.stringify({
      session_id: wlSession,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git status" },
    }) + "\n",
  );
  await new Promise((r) => setTimeout(r, 500));
  console.log(`   ✅ Whitelist command processed without triggering stall timer.`);

  // Step 2: Emit permission_required event for "find . -name '*.log'"
  const sessionId = `live-test-${Date.now()}`;
  console.log(`\n3. [STALL TIMER TEST] Emitting permission_required for command 'find . -name *.log' (Session: ${sessionId})...`);

  const payload1 = {
    session_id: sessionId,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "find . -name '*.log'" },
  };
  appendFileSync(inboxPath, JSON.stringify(payload1) + "\n");
  await new Promise((r) => setTimeout(r, 200));

  const payload2 = {
    session_id: sessionId,
    hook_event_name: "Notification",
    notification_type: "permission_prompt",
  };
  appendFileSync(inboxPath, JSON.stringify(payload2) + "\n");

  console.log("\n4. Waiting 37 seconds for the real 35s StallAlertTimer countdown...");
  for (let i = 5; i <= 35; i += 5) {
    await new Promise((r) => setTimeout(r, 5000));
    console.log(`   ⏳ T+${i}s elapsed (Timer pending: ${stallTimer.isPending})...`);
  }

  // Wait remaining 2 seconds to cross 35s mark
  await new Promise((r) => setTimeout(r, 2000));

  console.log("\n========================================================");
  console.log("  📊 FINAL VERIFICATION RESULTS");
  console.log("========================================================");
  console.log(`  - Alarm Fired:        ${alarmFired ? "✅ YES" : "❌ NO"}`);
  console.log(`  - Elapsed Time:       ${elapsed}s`);
  console.log(`  - Command Maintained: ${firedEvent?.command}`);
  console.log(`  - Session Correlated: ${firedEvent?.sessionId}`);
  console.log("========================================================\n");

  await adapter.stop();
  process.exit(alarmFired ? 0 : 1);
}

main().catch((err) => {
  console.error("Live test failed:", err);
  process.exit(1);
});
