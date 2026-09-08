import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

/**
 * Dynamically resolves the absolute path to the APL MCP server entry point (dist/mcp/index.js)
 * based on where the package is installed on the user's filesystem at runtime.
 */
export function resolveMcpServerPath(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));

    const candidates = [
      // If running from dist/setup/ or dist/cli/
      resolve(currentDir, "../mcp/index.js"),
      resolve(currentDir, "../../dist/mcp/index.js"),
      // If running in development tsx (src/setup/)
      resolve(currentDir, "../../dist/mcp/index.js"),
      resolve(currentDir, "../../../dist/mcp/index.js"),
      resolve(process.cwd(), "dist/mcp/index.js"),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    // Fallback if import.meta.url cannot be parsed
  }

  return resolve(process.cwd(), "dist/mcp/index.js");
}
