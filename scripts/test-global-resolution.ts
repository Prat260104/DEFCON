import { mkdtempSync, rmSync, mkdirSync, cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

async function testGlobalInstallResolution() {
  console.log("========================================================");
  console.log("  📦 TESTING DYNAMIC PATH RESOLUTION UNDER GLOBAL NPM INSTALL");
  console.log("========================================================\n");

  const tempDir = mkdtempSync(join(tmpdir(), "apl-global-test-"));
  const packageDir = join(tempDir, "node_modules", "defcon");
  mkdirSync(packageDir, { recursive: true });

  try {
    // Copy compiled dist/ and package.json to simulate npm global install location
    cpSync(join(process.cwd(), "dist"), join(packageDir, "dist"), { recursive: true });
    cpSync(join(process.cwd(), "package.json"), join(packageDir, "package.json"));

    // Run setup from within the isolated node_modules directory using node
    const testRunner = `
      import { resolveMcpServerPath } from "./dist/setup/resolver.js";
      const resolved = resolveMcpServerPath();
      console.log("Resolved MCP path:", resolved);
      if (!resolved.includes("node_modules/defcon/dist/mcp/index.js")) {
        console.error("FAIL: did not resolve relative to installed package location");
        process.exit(1);
      }
      console.log("PASS: Resolved correctly inside package installation directory.");
    `;

    writeFileSync(join(packageDir, "test-resolve.mjs"), testRunner);

    const output = execSync(`node test-resolve.mjs`, {
      cwd: packageDir,
      encoding: "utf-8",
    });

    console.log(output);
    console.log("✅ Dynamic path resolution verified for global / node_modules installs.");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

testGlobalInstallResolution().catch((err) => {
  console.error("Error testing global install:", err);
  process.exit(1);
});
