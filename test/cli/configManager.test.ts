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
});
