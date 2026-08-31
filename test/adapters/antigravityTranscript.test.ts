import { describe, it, expect, vi } from "vitest";
import { checkAntigravityPendingApproval } from "../../src/adapters/antigravityTranscript.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Antigravity Transcript Observer", () => {
  it("detects when an agent has proposed a tool call and is waiting for approval", () => {
    const dir = mkdtempSync(join(tmpdir(), "apl-transcript-test-"));
    const transcriptFile = join(dir, "transcript.jsonl");

    // 1. User sends message
    writeFileSync(
      transcriptFile,
      JSON.stringify({ step_index: 0, type: "USER_INPUT", content: "Run git status" }) + "\n",
    );
    expect(checkAntigravityPendingApproval(transcriptFile).isPending).toBe(false);

    // 2. Model outputs non-whitelisted tool call (waiting for user click in GUI!)
    writeFileSync(
      transcriptFile,
      JSON.stringify({
        step_index: 1,
        type: "PLANNER_RESPONSE",
        tool_calls: [{ name: "run_command", args: { CommandLine: "npm install express" } }],
      }) + "\n",
      { flag: "a" },
    );

    const check = checkAntigravityPendingApproval(transcriptFile);
    expect(check.isPending).toBe(true);
    expect(check.toolName).toBe("run_command");

    // 3. Auto-approved / Whitelisted command (e.g. npm test or slow custom build)
    writeFileSync(
      transcriptFile,
      JSON.stringify({
        step_index: 3,
        type: "PLANNER_RESPONSE",
        tool_calls: [{ name: "run_command", args: { CommandLine: "npm test" } }],
      }) + "\n",
      { flag: "a" },
    );

    // Whitelisted command is detected with isWhitelisted: true for safety-net tracking
    const whitelistedCheck = checkAntigravityPendingApproval(transcriptFile, {
      policies: { low: "auto-approve", medium: "notify-only", high: "notify-and-confirm" },
      whitelist: ["npm test", "git status"],
      blacklist: [],
    });
    expect(whitelistedCheck.isPending).toBe(true);
    expect(whitelistedCheck.isWhitelisted).toBe(true);

    // 4. Tool completes (user clicked allow or it ran)
    writeFileSync(
      transcriptFile,
      JSON.stringify({ step_index: 4, type: "RUN_COMMAND", content: "On branch main" }) + "\n",
      { flag: "a" },
    );
    expect(checkAntigravityPendingApproval(transcriptFile).isPending).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it("silently ignores partial JSON line (SyntaxError) without logging error", () => {
    const dir = mkdtempSync(join(tmpdir(), "apl-syntax-err-"));
    const transcriptFile = join(dir, "transcript.jsonl");

    // Partial JSON line written mid-flush
    writeFileSync(transcriptFile, '{"step_index": 1, "type": "PLANNER_RES\n');

    const check = checkAntigravityPendingApproval(transcriptFile);
    expect(check.isPending).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it("logs non-syntax errors (e.g. read error) rather than swallowing them", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Pass a directory path instead of file path to trigger EISDIR error on readFileSync
    const dir = mkdtempSync(join(tmpdir(), "apl-eacces-err-"));

    const check = checkAntigravityPendingApproval(dir);
    expect(check.isPending).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[antigravityTranscript] Failed to read transcript file:",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("AntigravityAdapter Lifecycle & Real-time Watcher", () => {
    it("dispatches permission_required and completed events from live transcript files", async () => {
      const { AntigravityAdapter } = await import("../../src/adapters/antigravityTranscript.js");
      const { mkdirSync } = await import("node:fs");

      const brainDir = mkdtempSync(join(tmpdir(), "apl-brain-test-"));
      const convId = "conv-live-12345";
      const logsDir = join(brainDir, convId, ".system_generated", "logs");
      mkdirSync(logsDir, { recursive: true });
      const transcriptFile = join(logsDir, "transcript.jsonl");

      const receivedEvents: any[] = [];
      const adapter = new AntigravityAdapter(brainDir);
      adapter.onEvent((event) => receivedEvents.push(event));

      await adapter.start();
      expect((await adapter.getStatus()).running).toBe(true);

      // 1. Agent emits tool proposal (waiting for user click in GUI!)
      writeFileSync(
        transcriptFile,
        JSON.stringify({
          step_index: 0,
          type: "PLANNER_RESPONSE",
          tool_calls: [{ name: "run_command", args: { CommandLine: "find . -type f -name '*.md' | wc -l" } }],
        }) + "\n",
      );

      const waitForCount = async (count: number, timeoutMs = 4000) => {
        const start = Date.now();
        while (receivedEvents.length < count && Date.now() - start < timeoutMs) {
          await new Promise((r) => setTimeout(r, 50));
        }
      };

      await waitForCount(1);

      expect(receivedEvents.length).toBe(1);
      const permEvent = receivedEvents[0];
      expect(permEvent.agent).toBe("antigravity");
      expect(permEvent.sessionId).toBe(convId);
      expect(permEvent.type).toBe("permission_required");
      expect(permEvent.command).toBe("find . -type f -name '*.md' | wc -l");

      // 2. User clicks Allow in GUI -> Result step appended
      writeFileSync(
        transcriptFile,
        JSON.stringify({
          step_index: 1,
          type: "RUN_COMMAND",
          content: "42",
        }) + "\n",
        { flag: "a" },
      );

      await waitForCount(2);

      expect(receivedEvents.length).toBe(2);
      const completedEvent = receivedEvents[1];
      expect(completedEvent.agent).toBe("antigravity");
      expect(completedEvent.sessionId).toBe(convId);
      expect(completedEvent.type).toBe("completed");

      await adapter.stop();
      expect((await adapter.getStatus()).running).toBe(false);

      rmSync(brainDir, { recursive: true, force: true });
    });
  });
});
