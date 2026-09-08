import { describe, it, expect, afterEach } from "vitest";
import { TrayManager } from "../../src/core/trayManager.js";
import { resolve } from "node:path";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";

describe("TrayManager (Phase 11)", () => {
  let manager: TrayManager | null = null;
  const dummyScriptPath = resolve(process.cwd(), "test-dummy-tray.sh");

  afterEach(async () => {
    if (manager) {
      await manager.stop(200);
      manager = null;
    }
    if (existsSync(dummyScriptPath)) {
      try {
        unlinkSync(dummyScriptPath);
      } catch {
        // Ignored
      }
    }
  });

  it("handles missing binary gracefully without crashing", () => {
    manager = new TrayManager({ binaryPath: "/nonexistent/path/to/defcon-tray" });
    expect(manager.isAvailable()).toBe(false);
    expect(manager.getBinaryPath()).toBe("/nonexistent/path/to/defcon-tray");

    // Must not throw, just returns false
    const launched = manager.start();
    expect(launched).toBe(false);
    expect(manager.isRunning()).toBe(false);
    expect(manager.getPid()).toBeUndefined();
  });

  it("spawns child process, tracks PID, and stops cleanly", async () => {
    // Create an executable dummy shell script that simulates a long-running tray process
    writeFileSync(dummyScriptPath, "#!/bin/sh\nwhile true; do sleep 1; done\n", { mode: 0o755 });

    manager = new TrayManager({ binaryPath: dummyScriptPath, verbose: false });
    expect(manager.isAvailable()).toBe(true);

    const started = manager.start();

    expect(started).toBe(true);
    expect(manager.isRunning()).toBe(true);
    const pid = manager.getPid();
    expect(typeof pid).toBe("number");
    expect(pid).toBeGreaterThan(0);

    // Stop process (SIGTERM -> SIGKILL)
    await manager.stop(500);
    expect(manager.isRunning()).toBe(false);
    expect(manager.getPid()).toBeUndefined();
  });

  it("fires exit callback when child process terminates externally", async () => {
    // Create a script that exits after 100ms
    writeFileSync(dummyScriptPath, "#!/bin/sh\nsleep 0.1\nexit 42\n", { mode: 0o755 });

    manager = new TrayManager({ binaryPath: dummyScriptPath, verbose: false });

    const exitPromise = new Promise<number | null>((resolve) => {
      manager!.start((code) => {
        resolve(code);
      });
    });

    const exitCode = await exitPromise;
    expect(exitCode).toBe(42);
    expect(manager.isRunning()).toBe(false);
  });

  it("writes PID file on start and removes it on stop", async () => {
    const testPidFile = resolve(process.cwd(), "test-tray.pid");
    writeFileSync(dummyScriptPath, "#!/bin/sh\nwhile true; do sleep 1; done\n", { mode: 0o755 });

    manager = new TrayManager({
      binaryPath: dummyScriptPath,
      pidFilePath: testPidFile,
      verbose: false,
    });

    try {
      expect(existsSync(testPidFile)).toBe(false);
      manager.start();
      expect(existsSync(testPidFile)).toBe(true);

      const pid = manager.getPid();
      expect(pid).toBeDefined();

      await manager.stop(500);
      expect(existsSync(testPidFile)).toBe(false);
    } finally {
      if (existsSync(testPidFile)) unlinkSync(testPidFile);
    }
  });

  it("cleans up orphaned tray process recorded in stale PID file before starting", async () => {
    const testPidFile = resolve(process.cwd(), "test-stale-tray.pid");
    writeFileSync(dummyScriptPath, "#!/bin/sh\nwhile true; do sleep 1; done\n", { mode: 0o755 });

    // Spawn an external orphan process manually
    const { spawn } = await import("node:child_process");
    const orphan = spawn(dummyScriptPath, [], { stdio: "ignore" });
    expect(orphan.pid).toBeDefined();
    writeFileSync(testPidFile, String(orphan.pid), "utf-8");

    // Initialize new manager with this stale PID file
    manager = new TrayManager({
      binaryPath: dummyScriptPath,
      pidFilePath: testPidFile,
      verbose: false,
    });

    // cleanOrphanedTray should kill the orphan and remove the file
    manager.cleanOrphanedTray();
    expect(existsSync(testPidFile)).toBe(false);

    // Allow OS kernel up to 200ms to reap killed process
    let isAlive = true;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 20));
      try {
        process.kill(orphan.pid!, 0);
      } catch {
        isAlive = false;
        break;
      }
    }
    expect(isAlive).toBe(false);
  });
});
