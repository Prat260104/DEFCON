import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConfigCommand } from "../../src/cli/commands/config.js";
import { loadConfig, getDefaultConfig } from "../../src/cli/configManager.js";
import * as configManager from "../../src/cli/configManager.js";

describe("CLI Config Command (defcon config)", () => {
  let tempDir: string;
  let testConfigPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "apl-cli-config-test-"));
    testConfigPath = join(tempDir, "config.json");
    writeFileSync(testConfigPath, JSON.stringify(getDefaultConfig(), null, 2));

    vi.spyOn(configManager, "getDefaultConfigPath").mockReturnValue(testConfigPath);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("updates stall.repeatAlertIntervalSeconds via --set", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const cmd = createConfigCommand();
    await cmd.parseAsync(["node", "test", "--set", "stall.repeatAlertIntervalSeconds=45"]);

    const updated = loadConfig(testConfigPath);
    expect(updated.repeatAlertIntervalSeconds).toBe(45);
    expect(updated.stall?.repeatAlertIntervalSeconds).toBe(45);
    expect(logSpy).toHaveBeenCalledWith("Updated stall.repeatAlertIntervalSeconds = 45");
  });

  it("updates stall.maxRepeatAlerts via --set", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const cmd = createConfigCommand();
    await cmd.parseAsync(["node", "test", "--set", "stall.maxRepeatAlerts=2"]);

    const updated = loadConfig(testConfigPath);
    expect(updated.maxRepeatAlerts).toBe(2);
    expect(updated.stall?.maxRepeatAlerts).toBe(2);
    expect(logSpy).toHaveBeenCalledWith("Updated stall.maxRepeatAlerts = 2");
  });

  it("reads stall.repeatAlertIntervalSeconds and stall.maxRepeatAlerts via --get", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const cmd1 = createConfigCommand();
    await cmd1.parseAsync(["node", "test", "--get", "stall.repeatAlertIntervalSeconds"]);
    expect(logSpy).toHaveBeenCalledWith(60);

    const cmd2 = createConfigCommand();
    await cmd2.parseAsync(["node", "test", "--get", "stall.maxRepeatAlerts"]);
    expect(logSpy).toHaveBeenCalledWith(3);
  });
});
