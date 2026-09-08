import { WebSocketServer, WebSocket } from "ws";
import { createServer, type Server as HttpServer } from "node:http";
import type { AgentEvent } from "../core/types.js";

export const DEFAULT_WS_PORT = 48123;
export const DEFAULT_WS_HOST = "127.0.0.1";

export type AplWsServerMessage =
  | {
      type: "init";
      active: boolean;
      pendingEvent: AgentEvent | null;
      soundEnabled: boolean;
      version: string;
    }
  | {
      type: "event";
      event: AgentEvent;
    }
  | {
      type: "stall";
      level: number;
      seconds: number;
      sound: string;
    }
  | {
      type: "state";
      active: boolean;
      pendingEvent: AgentEvent | null;
    }
  | {
      type: "shutdown_ack";
    }
  | {
      type: "pong";
    };

export type AplClientMessage =
  | {
      type: "shutdown";
    }
  | {
      type: "test_sound";
      tier?: string;
    }
  | {
      type: "ping";
    };

export interface AplWebSocketServerOptions {
  port?: number;
  host?: string;
  getActiveState?: () => { active: boolean; pendingEvent: AgentEvent | null };
}

export class AplWebSocketServer {
  private httpServer: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private messageListeners: Array<(msg: AplClientMessage, ws: WebSocket) => void> = [];
  private port: number = DEFAULT_WS_PORT;
  private host: string = DEFAULT_WS_HOST;
  private getActiveState?: () => { active: boolean; pendingEvent: AgentEvent | null };

  constructor(options?: AplWebSocketServerOptions) {
    this.port = options?.port ?? DEFAULT_WS_PORT;
    this.host = options?.host ?? DEFAULT_WS_HOST;
    this.getActiveState = options?.getActiveState;
  }

  async start(): Promise<number> {
    if (this.httpServer) {
      return this.port;
    }

    return new Promise<number>((resolve, reject) => {
      // Strictly bind to 127.0.0.1 for local-first loopback security
      this.httpServer = createServer((req, res) => {
        if (req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", service: "defcon-daemon" }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on("connection", (ws) => {
        this.clients.add(ws);

        // Send initial state snapshot upon connection
        const state = this.getActiveState
          ? this.getActiveState()
          : { active: true, pendingEvent: null };
        const initMsg: AplWsServerMessage = {
          type: "init",
          active: state.active,
          pendingEvent: state.pendingEvent,
          soundEnabled: true,
          version: "0.1.0",
        };
        this.sendTo(ws, initMsg);

        ws.on("message", (data) => {
          try {
            const raw = data.toString("utf-8");
            const parsed = JSON.parse(raw) as AplClientMessage;

            if (parsed && typeof parsed.type === "string") {
              if (parsed.type === "ping") {
                this.sendTo(ws, { type: "pong" });
              }

              for (const listener of this.messageListeners) {
                try {
                  listener(parsed, ws);
                } catch (err) {
                  console.error("[ws-server] Error in client message listener:", err);
                }
              }
            }
          } catch {
            // Ignore malformed messages safely
          }
        });

        ws.on("close", () => {
          this.clients.delete(ws);
        });

        ws.on("error", () => {
          this.clients.delete(ws);
        });
      });

      this.httpServer.on("error", (err) => {
        reject(err);
      });

      this.httpServer.listen(this.port, this.host, () => {
        resolve(this.port);
      });
    });
  }

  broadcast(message: AplWsServerMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {
          // Client disconnected
        }
      }
    }
  }

  sendTo(ws: WebSocket, message: AplWsServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch {
        // Socket write error
      }
    }
  }

  onClientMessage(callback: (msg: AplClientMessage, ws: WebSocket) => void): () => void {
    this.messageListeners.push(callback);
    return () => {
      this.messageListeners = this.messageListeners.filter((cb) => cb !== callback);
    };
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getPort(): number {
    return this.port;
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        // Ignore
      }
    }
    this.clients.clear();
    this.messageListeners = [];

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }
  }
}
