import { describe, it, expect } from "vitest";
import { sanitizeConfig, loadConfig } from "../../src/cli/configManager.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Config Validation & Sanitization", () => {
  it("falls back to default (35s) for invalid string stallAlertSeconds", () => {
    const sanitized = sanitizeConfig({
      stallAlertSeconds: "invalid",
    });
    expect(sanitized.stallAlertSeconds).toBe(35);
  });

  it("falls back to default (35s) for negative stallAlertSeconds", () => {
    const sanitized = sanitizeConfig({
      stallAlertSeconds: -10,
    });
    expect(sanitized.stallAlertSeconds).toBe(35);
  });

  it("falls back to default (35s) for zero stallAlertSeconds", () => {
    const sanitized = sanitizeConfig({
      stallAlertSeconds: 0,
    });
    expect(sanitized.stallAlertSeconds).toBe(35);
  });

  it("accepts valid positive integer stallAlertSeconds", () => {
    const sanitized = sanitizeConfig({
      stallAlertSeconds: 45,
    });
    expect(sanitized.stallAlertSeconds).toBe(45);
  });

  it("loads config file with invalid stall numbers and sanitizes safely", () => {
    const dir = mkdtempSync(join(tmpdir(), "apl-config-test-"));
    const configPath = join(dir, "config.json");

    writeFileSync(
      configPath,
      JSON.stringify({
        stallAlertSeconds: -25,
        whitelistSafetyTimeoutSeconds: "not-a-number",
      }),
      "utf-8",
    );

    const loaded = loadConfig(configPath);
    expect(loaded.stallAlertSeconds).toBe(35);
    expect(loaded.whitelistSafetyTimeoutSeconds).toBe(75);

    rmSync(dir, { recursive: true, force: true });
  });

  it("strips deprecated autoApproveLowRisk from raw config input", () => {
    const sanitized = sanitizeConfig({
      autoApproveLowRisk: false,
      policies: {
        low: "auto-approve",
        medium: "notify-only",
        high: "notify-and-confirm",
      },
    });
    // The deprecated key must not survive sanitization
    expect("autoApproveLowRisk" in sanitized).toBe(false);
    // policies.low is the authoritative source
    expect(sanitized.policies.low).toBe("auto-approve");
  });

  it("policies.low governs low-risk behavior (single source of truth)", () => {
    const autoApproveConfig = sanitizeConfig({
      policies: { low: "auto-approve", medium: "notify-only", high: "notify-and-confirm" },
    });
    expect(autoApproveConfig.policies.low).toBe("auto-approve");

    const notifyConfig = sanitizeConfig({
      policies: { low: "notify-only", medium: "notify-only", high: "notify-and-confirm" },
    });
    expect(notifyConfig.policies.low).toBe("notify-only");
  });

  describe("Recurring Stall Reminders & Snooze Escalation Config", () => {
    it("provides default values for repeatAlertIntervalSeconds (60s) and maxRepeatAlerts (3)", () => {
      const sanitized = sanitizeConfig({});
      expect(sanitized.repeatAlertIntervalSeconds).toBe(60);
      expect(sanitized.maxRepeatAlerts).toBe(3);
      expect(sanitized.stall?.repeatAlertIntervalSeconds).toBe(60);
      expect(sanitized.stall?.maxRepeatAlerts).toBe(3);
    });

    it("falls back to default (60s) for invalid or negative repeatAlertIntervalSeconds", () => {
      expect(sanitizeConfig({ repeatAlertIntervalSeconds: "invalid" }).repeatAlertIntervalSeconds).toBe(60);
      expect(sanitizeConfig({ repeatAlertIntervalSeconds: -15 }).repeatAlertIntervalSeconds).toBe(60);
      expect(sanitizeConfig({ repeatAlertIntervalSeconds: 0 }).repeatAlertIntervalSeconds).toBe(60);
    });

    it("falls back to default (3) for invalid or negative maxRepeatAlerts", () => {
      expect(sanitizeConfig({ maxRepeatAlerts: "invalid" }).maxRepeatAlerts).toBe(3);
      expect(sanitizeConfig({ maxRepeatAlerts: -5 }).maxRepeatAlerts).toBe(3);
    });

    it("accepts 0 for maxRepeatAlerts to disable recurring reminders", () => {
      const sanitized = sanitizeConfig({ maxRepeatAlerts: 0 });
      expect(sanitized.maxRepeatAlerts).toBe(0);
      expect(sanitized.stall?.maxRepeatAlerts).toBe(0);
    });

    it("accepts valid positive numbers for repeatAlertIntervalSeconds and maxRepeatAlerts", () => {
      const sanitized = sanitizeConfig({
        repeatAlertIntervalSeconds: 45,
        maxRepeatAlerts: 5,
      });
      expect(sanitized.repeatAlertIntervalSeconds).toBe(45);
      expect(sanitized.maxRepeatAlerts).toBe(5);
    });

    it("supports nested stall configuration object in raw config", () => {
      const sanitized = sanitizeConfig({
        stall: {
          stallAlertSeconds: 40,
          repeatAlertIntervalSeconds: 90,
          maxRepeatAlerts: 2,
        },
      });
      expect(sanitized.stallAlertSeconds).toBe(40);
      expect(sanitized.repeatAlertIntervalSeconds).toBe(90);
      expect(sanitized.maxRepeatAlerts).toBe(2);
    });
  });
});
