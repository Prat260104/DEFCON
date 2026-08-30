import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentEvent } from "../../src/core/types.js";

const execFileMock = vi.fn((_cmd: any, _args: any, cb: any) => {
  if (typeof cb === "function") cb(null, "", "");
  return {} as any;
});

const execMock = vi.fn((_cmd: any, cb: any) => {
  if (typeof cb === "function") cb(null, "", "");
  return {} as any;
});

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
  exec: execMock,
}));

describe("Audio and Notification Command Dispatch Verification", () => {
  beforeEach(() => {
    execFileMock.mockClear();
    execMock.mockClear();
  });

  it("verifies Windows notification executes PowerShell with Toast and SoundPlayer audio script", async () => {
    const { sendWindowsNotification } = await import("../../src/notify/windows.js");
    const event: AgentEvent = {
      agent: "claude-code",
      type: "permission_required",
      command: "npm install express",
      riskLevel: "medium",
      timestamp: Date.now(),
    };

    const result = await sendWindowsNotification(event);
    expect(result).toBe(true);

    // Assert powershell was called
    expect(execFileMock).toHaveBeenCalledWith(
      "powershell",
      expect.arrayContaining(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]),
      expect.any(Function),
    );

    // Assert PowerShell script includes both Toast and SoundPlayer audio playback
    const invokedArgs = execFileMock.mock.calls[0]?.[1] as string[];
    const psCommand = invokedArgs[invokedArgs.length - 1]!;
    expect(psCommand).toContain("ToastNotificationManager");
    expect(psCommand).toContain("System.Media.SoundPlayer");
    expect(psCommand).toContain("System.Media.SystemSounds");
  });

  it("verifies Linux notification dispatches notify-send and triggers paplay/pw-play/aplay audio", async () => {
    const { sendLinuxNotification } = await import("../../src/notify/linux.js");
    const event: AgentEvent = {
      agent: "claude-code",
      type: "permission_required",
      command: "rm -rf /test",
      riskLevel: "high",
      timestamp: Date.now(),
    };

    const result = await sendLinuxNotification(event);
    expect(result).toBe(true);

    // Assert notify-send was executed with critical urgency for high risk
    expect(execFileMock).toHaveBeenCalledWith(
      "notify-send",
      expect.arrayContaining(["-a", "Agent Permission Layer", "-u", "critical"]),
      expect.any(Function),
    );

    // Assert audio playback command (paplay || pw-play || aplay) was invoked
    expect(execMock).toHaveBeenCalledWith(
      expect.stringMatching(/paplay.*pw-play.*aplay/),
      expect.any(Function),
    );
  });

  it("verifies macOS notification triggers afplay and osascript", async () => {
    const { sendMacNotification } = await import("../../src/notify/macos.js");
    const event: AgentEvent = {
      agent: "claude-code",
      type: "permission_required",
      command: "rm -rf /dist",
      riskLevel: "high",
      timestamp: Date.now(),
    };

    const result = await sendMacNotification(event);
    expect(result).toBe(true);

    // Assert osascript notification
    expect(execFileMock).toHaveBeenCalledWith(
      "osascript",
      expect.arrayContaining(["-e"]),
      expect.any(Function),
    );

    // Assert afplay audio invocation
    expect(execFileMock).toHaveBeenCalledWith(
      "afplay",
      expect.arrayContaining([expect.stringContaining(".aiff")]),
      expect.any(Function),
    );
  });
});
