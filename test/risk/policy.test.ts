import { describe, it, expect } from "vitest";
import { resolvePolicy, DEFAULT_POLICY_CONFIG, type PolicyConfig } from "../../src/risk/policy.js";

describe("resolvePolicy", () => {
  it("immediately blocks blacklisted commands", () => {
    const decision = resolvePolicy("rm -rf /", DEFAULT_POLICY_CONFIG);
    expect(decision.action).toBe("block");
    expect(decision.riskLevel).toBe("high");
    expect(decision.isBlacklisted).toBe(true);
    expect(decision.reason.toLowerCase()).toContain("blacklist");
  });

  it("blocks force push if in blacklist", () => {
    const decision = resolvePolicy("git push --force origin main", DEFAULT_POLICY_CONFIG);
    expect(decision.action).toBe("block");
    expect(decision.isBlacklisted).toBe(true);
  });

  it("immediately auto-approves whitelisted commands", () => {
    const decision = resolvePolicy("git status", DEFAULT_POLICY_CONFIG);
    expect(decision.action).toBe("auto-approve");
    expect(decision.riskLevel).toBe("low");
    expect(decision.isWhitelisted).toBe(true);
    expect(decision.reason).toContain("whitelisted");
  });

  it("auto-approves test runs in whitelist", () => {
    const decision = resolvePolicy("npm test", DEFAULT_POLICY_CONFIG);
    expect(decision.action).toBe("auto-approve");
    expect(decision.isWhitelisted).toBe(true);
  });

  it("falls back to risk engine for unlisted commands", () => {
    const customConfig: PolicyConfig = {
      policies: {
        low: "auto-approve",
        medium: "notify-only",
        high: "notify-and-confirm",
      },
      whitelist: [],
      blacklist: [],
    };

    // npm install is medium risk
    const mediumDecision = resolvePolicy("npm install express", customConfig);
    expect(mediumDecision.action).toBe("notify-only");
    expect(mediumDecision.riskLevel).toBe("medium");
    expect(mediumDecision.isBlacklisted).toBe(false);
    expect(mediumDecision.isWhitelisted).toBe(false);

    // git reset --hard is high risk
    const highDecision = resolvePolicy("git reset --hard", customConfig);
    expect(highDecision.action).toBe("notify-and-confirm");
    expect(highDecision.riskLevel).toBe("high");

    // git log is low risk
    const lowDecision = resolvePolicy("git log -n 5", customConfig);
    expect(lowDecision.action).toBe("auto-approve");
    expect(lowDecision.riskLevel).toBe("low");
  });

  describe("Blacklist bypass resilience & false positive prevention", () => {
    const catastrophicBypassVariants = [
      "rm -rf /",
      "rm -fr /",
      "rm  -rf  /",
      "rm   -fr   /",
      "rm -r -f /",
      "rm -f -r /",
      "sudo rm -rf /",
      "sudo rm -fr /*",
      "rm -rf /*",
      "rm -rf ~",
      "rm -rf ~/*",
      "mkfs.ext4 /dev/sda1",
      "dd if=/dev/zero of=/dev/sda",
      "git push --force origin main",
      "git push -f origin main",
      "git push --force-with-lease origin main",
      "git push origin main --force",
      "git push --force origin master",
      ":(){ :|:& };:",
      'echo "rm -rf /" | sh',
      'echo "rm -rf /" | bash',
      "printf 'rm -rf /' | sh",
      "printf 'rm -rf /' | bash",
    ];

    it.each(catastrophicBypassVariants)("blocks bypass variant: %s", (cmd) => {
      const decision = resolvePolicy(cmd, DEFAULT_POLICY_CONFIG);
      expect(decision.action).toBe("block");
      expect(decision.isBlacklisted).toBe(true);
    });

    const safeOrHarmlessCommands = [
      'echo "rm -rf /"',
      "printf 'rm -rf /\\n'",
      "git push origin feature-branch",
      "git push --force origin feature-branch", // Force push to feature branch is high risk, but NOT blacklisted
      "rm -rf ./build", // Scoped directory removal is NOT root wipe
      "rm -rf ./dist",
      "npm test",
      "git status",
    ];

    it.each(safeOrHarmlessCommands)("does NOT falsely blacklist: %s", (cmd) => {
      const decision = resolvePolicy(cmd, DEFAULT_POLICY_CONFIG);
      expect(decision.isBlacklisted).toBe(false);
      expect(decision.action).not.toBe("block");
    });

    it("classifies chained echo writing destructive command to script as high risk", () => {
      const decision = resolvePolicy(
        'echo "rm -rf /" > script.sh && bash script.sh',
        DEFAULT_POLICY_CONFIG,
      );
      expect(decision.riskLevel).toBe("high");
      expect(decision.action).toBe("notify-and-confirm");
    });
  });

  it("handles custom policy mappings", () => {
    const paranoidConfig: PolicyConfig = {
      policies: {
        low: "notify-only",
        medium: "notify-and-confirm",
        high: "block",
      },
      whitelist: [],
      blacklist: [],
    };

    const decision = resolvePolicy("git diff", paranoidConfig);
    expect(decision.action).toBe("notify-only");
  });

  describe("Single Source of Truth: policies.low configuration", () => {
    it("resolves low-risk command to auto-approve when policies.low is auto-approve", () => {
      const config: PolicyConfig = {
        policies: {
          low: "auto-approve",
          medium: "notify-only",
          high: "notify-and-confirm",
        },
        whitelist: [],
        blacklist: [],
      };

      const decision = resolvePolicy("git diff", config);
      expect(decision.riskLevel).toBe("low");
      expect(decision.action).toBe("auto-approve");
    });

    it("resolves low-risk command to notify-only when policies.low is notify-only", () => {
      const config: PolicyConfig = {
        policies: {
          low: "notify-only",
          medium: "notify-only",
          high: "notify-and-confirm",
        },
        whitelist: [],
        blacklist: [],
      };

      const decision = resolvePolicy("git diff", config);
      expect(decision.riskLevel).toBe("low");
      expect(decision.action).toBe("notify-only");
    });
  });
});
