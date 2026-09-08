import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";

export interface TrayManagerOptions {
  binaryPath?: string;
  pidFilePath?: string;
  onTrayExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  verbose?: boolean;
}

export function getDefaultTrayPidFilePath(): string {
  return join(homedir(), ".apl", "tray.pid");
}

export class TrayManager {
  private childProcess: ChildProcess | null = null;
  private isStoppingManually = false;
  private binaryPath: string | null = null;
  private pidFilePath: string;
  private verbose = false;

  constructor(options?: TrayManagerOptions) {
    this.verbose = options?.verbose ?? false;
    this.binaryPath = options?.binaryPath ?? this.resolveTrayBinaryPath();
    this.pidFilePath = options?.pidFilePath ?? getDefaultTrayPidFilePath();

    // Clean up PID file on parent process termination
    process.once("exit", () => this.removePidFile());
  }

  /**
   * Resolve path to the compiled Tauri/Rust tray binary.
   */
  resolveTrayBinaryPath(): string | null {
    const cwd = process.cwd();
    const candidates = [
      // Release build
      resolve(cwd, "packages/desktop-tray/src-tauri/target/release/defcon-tray"),
      // Debug build
      resolve(cwd, "packages/desktop-tray/src-tauri/target/debug/defcon-tray"),
      // Distributed bundle
      resolve(cwd, "dist/tray/defcon-tray"),
      // Global installation
      "/usr/local/bin/defcon-tray",
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
      if (process.platform === "win32" && existsSync(`${candidate}.exe`)) {
        return `${candidate}.exe`;
      }
    }

    return null;
  }

  /**
   * Clean up any stale or orphaned tray companion processes before starting a new one.
   * Checks both the PID file and system process table.
   */
  cleanOrphanedTray(): void {
    // 1. Check PID file
    if (existsSync(this.pidFilePath)) {
      try {
        const content = readFileSync(this.pidFilePath, "utf-8").trim();
        const stalePid = parseInt(content, 10);
        if (!isNaN(stalePid) && stalePid > 0 && stalePid !== process.pid) {
          try {
            process.kill(stalePid, 0); // Check if alive
            if (this.verbose) {
              console.log(`  ⚠️ Terminating orphaned tray companion (PID: ${stalePid})...`);
            }
            process.kill(stalePid, "SIGTERM");
            const start = Date.now();
            while (Date.now() - start < 150) {
              try {
                process.kill(stalePid, 0);
              } catch {
                break;
              }
            }
            try {
              process.kill(stalePid, "SIGKILL");
            } catch {
              // Process already exited
            }
          } catch {
            // Stale PID already dead
          }
        }
      } catch (err) {
        if (this.verbose) {
          console.warn("[trayManager] Error inspecting stale PID file:", err);
        }
      } finally {
        this.removePidFile();
      }
    }

    // 2. Extra safety sweep for any duplicate defcon-tray processes
    if (process.platform === "darwin" || process.platform === "linux") {
      try {
        const stdout = execSync("pgrep -f defcon-tray", {
          stdio: ["pipe", "pipe", "ignore"],
          encoding: "utf-8",
        });
        const currentPid = process.pid;
        const childPid = this.childProcess?.pid;
        const pids = stdout
          .trim()
          .split("\n")
          .map((p) => parseInt(p.trim(), 10))
          .filter((p) => !isNaN(p) && p > 0 && p !== currentPid && p !== childPid);

        for (const orphanPid of pids) {
          try {
            if (this.verbose) {
              console.log(`  ⚠️ Cleaned up stray tray process (PID: ${orphanPid})`);
            }
            process.kill(orphanPid, "SIGTERM");
            setTimeout(() => {
              try {
                process.kill(orphanPid, "SIGKILL");
              } catch {
                // Process already terminated
              }
            }, 100).unref();
          } catch {
            // Process terminated
          }
        }
      } catch {
        // pgrep exits with 1 when no processes match — completely normal
      }
    }
  }

  private writePidFile(pid: number): void {
    try {
      const dir = dirname(this.pidFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.pidFilePath, String(pid), "utf-8");
    } catch (err) {
      if (this.verbose) {
        console.warn("[trayManager] Failed to write PID file:", err);
      }
    }
  }

  private removePidFile(): void {
    try {
      if (existsSync(this.pidFilePath)) {
        unlinkSync(this.pidFilePath);
      }
    } catch {
      // File already removed
    }
  }

  /**
   * Check whether a pre-compiled tray companion binary is available.
   */
  isAvailable(): boolean {
    return this.binaryPath !== null && existsSync(this.binaryPath);
  }

  getBinaryPath(): string | null {
    return this.binaryPath;
  }

  getPidFilePath(): string {
    return this.pidFilePath;
  }

  /**
   * Launch the Tray companion as a managed child process.
   */
  start(onTrayExit?: (code: number | null, signal: NodeJS.Signals | null) => void): boolean {
    if (this.childProcess) {
      return true;
    }

    // Always clean up any existing/orphaned tray processes before spawning
    this.cleanOrphanedTray();

    const bin = this.binaryPath || this.resolveTrayBinaryPath();
    if (!bin || !existsSync(bin)) {
      if (this.verbose) {
        console.log("  ℹ️  Tray companion binary not found. Continuing in terminal-only mode.");
      }
      return false;
    }

    this.isStoppingManually = false;

    try {
      this.childProcess = spawn(bin, [], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false, // Strictly tie child to parent process lifecycle
        env: {
          ...process.env,
          DEFCON_WS_URL: "ws://127.0.0.1:48123",
        },
      });

      if (this.childProcess.pid) {
        this.writePidFile(this.childProcess.pid);
        if (this.verbose) {
          console.log(`  👁️  Tray companion active (PID: ${this.childProcess.pid})`);
        }
      }

      this.childProcess.stdout?.on("data", (data) => {
        if (this.verbose) {
          const text = data.toString().trim();
          if (text) console.log(`[tray] ${text}`);
        }
      });

      this.childProcess.stderr?.on("data", (data) => {
        if (this.verbose) {
          const text = data.toString().trim();
          if (text) console.error(`[tray:err] ${text}`);
        }
      });

      this.childProcess.on("exit", (code, signal) => {
        const wasManual = this.isStoppingManually;
        this.childProcess = null;
        this.removePidFile();

        if (!wasManual && onTrayExit) {
          onTrayExit(code, signal);
        }
      });

      return true;
    } catch (err) {
      console.warn("  ⚠️  Failed to launch tray companion:", err);
      this.childProcess = null;
      this.removePidFile();
      return false;
    }
  }

  /**
   * Gracefully stop the tray companion process (SIGTERM with SIGKILL escalation).
   */
  async stop(timeoutMs = 1000): Promise<void> {
    this.removePidFile();

    if (!this.childProcess) {
      return;
    }

    this.isStoppingManually = true;
    const proc = this.childProcess;

    return new Promise<void>((resolve) => {
      let isDone = false;
      const done = () => {
        if (!isDone) {
          isDone = true;
          this.childProcess = null;
          this.removePidFile();
          resolve();
        }
      };

      proc.once("exit", () => done());

      // 1. Attempt graceful termination
      try {
        proc.kill("SIGTERM");
      } catch {
        done();
        return;
      }

      // 2. Force kill fallback after timeout
      const timer = setTimeout(() => {
        if (!isDone) {
          try {
            proc.kill("SIGKILL");
          } catch {
            // Process may already be dead
          }
          done();
        }
      }, timeoutMs);

      // Ensure timer doesn't hold event loop open
      if (timer.unref) {
        timer.unref();
      }
    });
  }

  isRunning(): boolean {
    return this.childProcess !== null && !this.childProcess.killed;
  }

  getPid(): number | undefined {
    return this.childProcess?.pid;
  }
}
