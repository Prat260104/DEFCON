import { homedir } from "node:os";
import type { AgentEvent } from "./types.js";

/**
 * Sanitize local filesystem paths to eliminate developer-specific absolute paths
 * (e.g. `/Users/username/...` or `file:///Users/username/...`) in public/user-facing outputs.
 */
export function sanitizePath(input: string | null | undefined): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  const home = homedir();
  let result = input;

  // Handle current user's homedir patterns
  if (home) {
    const fileUriPrefix = `file://${home}`;
    if (result.includes(fileUriPrefix)) {
      result = result.split(fileUriPrefix).join("~");
    }

    const winFileUriPrefix = `file:///${home.replace(/\\/g, "/")}`;
    if (result.includes(winFileUriPrefix)) {
      result = result.split(winFileUriPrefix).join("~");
    }

    if (result.includes(home)) {
      result = result.split(home).join("~");
    }

    const winHome = home.replace(/\\/g, "/");
    if (result.includes(winHome)) {
      result = result.split(winHome).join("~");
    }
  }

  // Strip any lingering file://~ prefixes
  if (result.includes("file://~")) {
    result = result.split("file://~").join("~");
  }

  // Generic fallback for any developer-machine paths (e.g. /Users/prateekrai/...)
  result = result.replace(/file:\/\/\/Users\/[^/\s"']+/g, "~");
  result = result.replace(/\/Users\/[^/\s"']+/g, "~");
  result = result.replace(/file:\/\/\/[A-Za-z]:\/Users\/[^/\s"']+/g, "~");
  result = result.replace(/[A-Za-z]:\\Users\\[^\\/\s"']+/g, "~");

  // Normalize Windows backslashes in tilde-prefixed paths
  if (result.startsWith("~\\")) {
    result = result.replace(/\\/g, "/");
  }

  return result;
}

/**
 * Deeply sanitizes an AgentEvent so that its metadata, transcript paths,
 * or embedded filesystem paths never expose raw user home directories.
 */
export function sanitizeEvent<T extends AgentEvent>(event: T): T {
  if (!event) return event;

  const sanitized: T = { ...event };

  if (sanitized.command && typeof sanitized.command === "string") {
    sanitized.command = sanitizePath(sanitized.command);
  }

  if (sanitized.metadata && typeof sanitized.metadata === "object") {
    const cleanMeta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sanitized.metadata)) {
      if (typeof v === "string") {
        cleanMeta[k] = sanitizePath(v);
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        const nested: Record<string, unknown> = {};
        for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
          nested[nk] = typeof nv === "string" ? sanitizePath(nv) : nv;
        }
        cleanMeta[k] = nested;
      } else {
        cleanMeta[k] = v;
      }
    }
    sanitized.metadata = cleanMeta;
  }

  return sanitized;
}
