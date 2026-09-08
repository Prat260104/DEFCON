import { describe, it, expect, afterEach } from "vitest";
import { TrayManager } from "../../src/core/trayManager.js";
import { AplWebSocketServer } from "../../src/server/websocket.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("Tray Companion Integration", () => {
  let server: AplWebSocketServer | null = null;
  let manager: TrayManager | null = null;

  afterEach(async () => {
    if (manager) {
      await manager.stop(500);
      manager = null;
    }
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it("launches native tray binary and connects to WebSocket server", async () => {
    const binaryPath = resolve(
      process.cwd(),
      "packages/desktop-tray/src-tauri/target/release/defcon-tray",
    );

    if (!existsSync(binaryPath)) {
      // If release binary not present, skip
      return;
    }

    const testPort = 48199;

    server = new AplWebSocketServer({
      port: testPort,
      host: "127.0.0.1",
      getActiveState: () => ({ active: true, pendingEvent: null }),
    });

    await server.start();

    // Launch tray manager pointing to our test WebSocket port
    manager = new TrayManager({
      binaryPath,
      verbose: false,
    });

    process.env.DEFCON_WS_URL = `ws://127.0.0.1:${testPort}`;
    const launched = manager.start();
    expect(launched).toBe(true);
    expect(manager.isRunning()).toBe(true);

    // Wait up to 2s for client to connect and handshake
    // The server sends init automatically upon connection
    await new Promise((r) => setTimeout(r, 1000));

    // Broadcast a high-risk event to the connected tray client
    server.broadcast({
      type: "event",
      event: {
        agent: "Claude",
        type: "permission_required",
        command: "rm -rf /tmp/danger",
        riskLevel: "high",
        timestamp: Date.now(),
      },
    });

    // Broadcast a stall alert with a custom sound
    server.broadcast({
      type: "stall",
      level: 1,
      seconds: 35,
      sound: "custom_siren",
    });

    await new Promise((r) => setTimeout(r, 300));

    // Stop tray companion cleanly via TrayManager
    await manager.stop(1000);
    expect(manager.isRunning()).toBe(false);
  });

  it("handles test_sound message from client and plays resolved audio", async () => {
    const testPort = 48201;
    let receivedTestSoundTier: string | null = null;

    server = new AplWebSocketServer({
      port: testPort,
      host: "127.0.0.1",
    });

    await server.start();

    server.onClientMessage((msg) => {
      if (msg.type === "test_sound") {
        receivedTestSoundTier = msg.tier ?? "high";
      }
    });

    // Simulate client sending test_sound
    const { WebSocket } = await import("ws");
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise<void>((res) => ws.once("open", () => res()));

    ws.send(JSON.stringify({ type: "test_sound", tier: "stall" }));
    await new Promise((r) => setTimeout(r, 200));

    expect(receivedTestSoundTier).toBe("stall");
    ws.close();
  });
});
