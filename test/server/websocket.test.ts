import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import {
  AplWebSocketServer,
  type AplWsServerMessage,
  type AplClientMessage,
} from "../../src/server/websocket.js";
import type { AgentEvent } from "../../src/core/types.js";

describe("AplWebSocketServer (Phase 11)", () => {
  let server: AplWebSocketServer | null = null;
  const testPort = 48199; // Isolated test port

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it("starts loopback server and serves /health HTTP endpoint", async () => {
    server = new AplWebSocketServer({ port: testPort });
    const boundPort = await server.start();
    expect(boundPort).toBe(testPort);

    const res = await fetch(`http://127.0.0.1:${testPort}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("sends init snapshot to newly connected clients", async () => {
    const mockPending: AgentEvent = {
      agent: "claude-code",
      type: "permission_required",
      command: "rm -rf /test",
      riskLevel: "high",
      timestamp: Date.now(),
    };

    server = new AplWebSocketServer({
      port: testPort,
      getActiveState: () => ({ active: true, pendingEvent: mockPending }),
    });
    await server.start();

    const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
    const initMessage = await new Promise<AplWsServerMessage>((resolve, reject) => {
      client.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as AplWsServerMessage;
        resolve(msg);
      });
      client.on("error", reject);
    });

    expect(initMessage.type).toBe("init");
    if (initMessage.type === "init") {
      expect(initMessage.active).toBe(true);
      expect(initMessage.pendingEvent?.command).toBe("rm -rf /test");
      expect(initMessage.pendingEvent?.riskLevel).toBe("high");
    }

    client.close();
  });

  it("broadcasts live events and state changes to all connected clients", async () => {
    server = new AplWebSocketServer({ port: testPort });
    await server.start();

    const client1 = new WebSocket(`ws://127.0.0.1:${testPort}`);
    const client2 = new WebSocket(`ws://127.0.0.1:${testPort}`);

    await Promise.all([
      new Promise<void>((r) => client1.once("open", () => r())),
      new Promise<void>((r) => client2.once("open", () => r())),
    ]);

    const messages1: AplWsServerMessage[] = [];
    const messages2: AplWsServerMessage[] = [];

    client1.on("message", (data) => messages1.push(JSON.parse(data.toString())));
    client2.on("message", (data) => messages2.push(JSON.parse(data.toString())));

    const testEvent: AgentEvent = {
      agent: "gemini-cli",
      type: "permission_required",
      command: "npm install",
      riskLevel: "medium",
      timestamp: Date.now(),
    };

    server.broadcast({ type: "event", event: testEvent });

    // Wait for message delivery
    await new Promise((r) => setTimeout(r, 50));

    const found1 = messages1.find((m) => m.type === "event");
    const found2 = messages2.find((m) => m.type === "event");

    expect(found1).toBeDefined();
    expect(found2).toBeDefined();
    if (found1?.type === "event") {
      expect(found1.event.command).toBe("npm install");
    }

    client1.close();
    client2.close();
  });

  it("handles shutdown handshake: client sends shutdown -> receives shutdown_ack", async () => {
    server = new AplWebSocketServer({ port: testPort });
    let shutdownHandled = false;

    server.onClientMessage((msg, ws) => {
      if (msg.type === "shutdown") {
        shutdownHandled = true;
        server!.sendTo(ws, { type: "shutdown_ack" });
      }
    });

    await server.start();

    const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise<void>((r) => client.once("open", () => r()));

    const ackPromise = new Promise<AplWsServerMessage>((resolve) => {
      client.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as AplWsServerMessage;
        if (msg.type === "shutdown_ack") {
          resolve(msg);
        }
      });
    });

    // Send shutdown request from client
    const req: AplClientMessage = { type: "shutdown" };
    client.send(JSON.stringify(req));

    const ack = await ackPromise;
    expect(ack.type).toBe("shutdown_ack");
    expect(shutdownHandled).toBe(true);

    client.close();
  });

  it("verifies fail-safe fallback timeout if daemon does not acknowledge shutdown", async () => {
    server = new AplWebSocketServer({ port: testPort });
    // Intentionally do NOT reply with shutdown_ack to test fail-safe path
    server.onClientMessage(() => {});

    await server.start();

    const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise<void>((r) => client.once("open", () => r()));

    // Client-side simulation of the 100ms fail-safe timeout
    let timedOut = false;
    const sendShutdownWithTimeout = (timeoutMs = 150): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        let ackReceived = false;

        client.on("message", (data) => {
          const msg = JSON.parse(data.toString()) as AplWsServerMessage;
          if (msg.type === "shutdown_ack") {
            ackReceived = true;
            resolve(true);
          }
        });

        client.send(JSON.stringify({ type: "shutdown" }));

        setTimeout(() => {
          if (!ackReceived) {
            timedOut = true;
            resolve(false); // Fail-safe triggered!
          }
        }, timeoutMs);
      });
    };

    const acknowledged = await sendShutdownWithTimeout(100);
    expect(acknowledged).toBe(false);
    expect(timedOut).toBe(true); // Fail-safe correctly took over

    client.close();
  });

  it("handles set_stall_timeout and import_sound client messages", async () => {
    server = new AplWebSocketServer({ port: testPort });
    const receivedMessages: AplClientMessage[] = [];

    server.onClientMessage((msg) => {
      receivedMessages.push(msg);
    });

    await server.start();

    const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise<void>((r) => client.once("open", () => r()));

    client.send(JSON.stringify({ type: "set_stall_timeout", seconds: 60 }));
    client.send(
      JSON.stringify({
        type: "import_sound",
        filePath: "/custom/sound.mp3",
        tier: "stall",
      }),
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedMessages).toHaveLength(2);
    expect(receivedMessages[0]).toEqual({ type: "set_stall_timeout", seconds: 60 });
    expect(receivedMessages[1]).toEqual({
      type: "import_sound",
      filePath: "/custom/sound.mp3",
      tier: "stall",
    });

    client.close();
  });

  it("automatically sanitizes paths in outgoing broadcast messages to prevent leaks", async () => {
    server = new AplWebSocketServer({ port: testPort });
    await server.start();

    const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise<void>((r) => client.once("open", () => r()));

    const received: AplWsServerMessage[] = [];
    client.on("message", (data) => {
      received.push(JSON.parse(data.toString()));
    });

    const home = process.env.HOME || "/Users/testuser";
    const leakEvent: AgentEvent = {
      agent: "claude-code",
      type: "permission_required",
      command: `cat ${home}/Desktop/secret.txt`,
      timestamp: Date.now(),
      metadata: {
        transcriptPath: `${home}/.apl/session.jsonl`,
      },
    };

    server.broadcast({ type: "event", event: leakEvent });
    await new Promise((r) => setTimeout(r, 50));

    const eventMsg = received.find((m) => m.type === "event");
    expect(eventMsg).toBeDefined();
    if (eventMsg && eventMsg.type === "event") {
      expect(eventMsg.event.command).not.toContain(home);
      expect(eventMsg.event.command).toBe("cat ~/Desktop/secret.txt");
      expect(eventMsg.event.metadata?.transcriptPath).toBe("~/.apl/session.jsonl");
    }

    client.close();
  });
});
