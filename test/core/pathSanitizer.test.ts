import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { sanitizePath, sanitizeEvent } from "../../src/core/pathSanitizer.js";
import type { AgentEvent } from "../../src/core/types.js";

describe("pathSanitizer", () => {
  const home = homedir();

  describe("sanitizePath", () => {
    it("returns empty string for null, undefined or empty input", () => {
      expect(sanitizePath(null)).toBe("");
      expect(sanitizePath(undefined)).toBe("");
      expect(sanitizePath("")).toBe("");
    });

    it("replaces home directory path with ~", () => {
      const input = `${home}/Desktop/Agents-Permission/src/core/types.ts`;
      const expected = "~/Desktop/Agents-Permission/src/core/types.ts";
      expect(sanitizePath(input)).toBe(expected);
    });

    it("replaces file:// URI prefix with ~/ instead of leaving file:// URI", () => {
      const input = `file://${home}/Desktop/Agents-Permission/test/mcp/mcpServer.test.ts`;
      const expected = "~/Desktop/Agents-Permission/test/mcp/mcpServer.test.ts";
      expect(sanitizePath(input)).toBe(expected);
    });

    it("REGRESSION TEST: sanitizes exact original leaked path: file:///Users/prateekrai/Desktop/Agents", () => {
      const leakedPath = "file:///Users/prateekrai/Desktop/Agents";
      const sanitized = sanitizePath(leakedPath);
      expect(sanitized).toBe("~/Desktop/Agents");
      expect(sanitized).not.toContain("file:///Users/");
      expect(sanitized).not.toContain("/Users/prateekrai");
    });

    it("REGRESSION TEST: sanitizes exact original repository path with subfiles", () => {
      const leakedRepoPath = "file:///Users/prateekrai/Desktop/Agents-Permission/src/core/types.ts";
      const sanitized = sanitizePath(leakedRepoPath);
      expect(sanitized).toBe("~/Desktop/Agents-Permission/src/core/types.ts");
      expect(sanitized).not.toContain("file:///Users/");
      expect(sanitized).not.toContain("/Users/prateekrai");
    });

    it("sanitizes Windows absolute paths C:\\Users\\... to ~", () => {
      const winPath = "C:\\Users\\prateekrai\\Desktop\\Agents-Permission\\file.txt";
      const sanitized = sanitizePath(winPath);
      expect(sanitized).toBe("~/Desktop/Agents-Permission/file.txt");
    });

    it("sanitizes generic /Users/<user>/ paths even if different from current homedir", () => {
      const otherUserPath = "/Users/otherdev/project/file.ts";
      const sanitized = sanitizePath(otherUserPath);
      expect(sanitized).toBe("~/project/file.ts");
    });

    it("leaves paths without home directory unchanged", () => {
      expect(sanitizePath("/etc/nginx/nginx.conf")).toBe("/etc/nginx/nginx.conf");
      expect(sanitizePath("npm test")).toBe("npm test");
    });
  });

  describe("sanitizeEvent", () => {
    it("sanitizes command and metadata fields within an AgentEvent", () => {
      const rawEvent: AgentEvent = {
        agent: "claude-code",
        type: "permission_required",
        command: `cat ${home}/secrets/.env`,
        riskLevel: "high",
        timestamp: 1234567890,
        metadata: {
          transcriptPath: `${home}/.gemini/logs/transcript.jsonl`,
          nested: {
            configPath: `file://${home}/.config/settings.json`,
            count: 42,
          },
        },
      };

      const sanitized = sanitizeEvent(rawEvent);

      expect(sanitized.command).toBe("cat ~/secrets/.env");
      expect(sanitized.metadata?.transcriptPath).toBe("~/.gemini/logs/transcript.jsonl");
      const nested = sanitized.metadata?.nested as Record<string, unknown>;
      expect(nested.configPath).toBe("~/.config/settings.json");
      expect(nested.count).toBe(42);
      expect(sanitized.timestamp).toBe(1234567890);
    });

    it("handles events with no metadata or command gracefully", () => {
      const rawEvent: AgentEvent = {
        agent: "antigravity",
        type: "idle",
        timestamp: 12345,
      };

      const sanitized = sanitizeEvent(rawEvent);
      expect(sanitized).toEqual(rawEvent);
    });
  });
});
