import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { AgentEvent, EventQueryOptions, EventStore, RiskLevel } from "../core/types.js";

export function getDefaultDbPath(): string {
  return join(homedir(), ".apl", "events.db");
}

export class SqliteEventStore implements EventStore {
  private db: DatabaseSync;

  constructor(dbPath: string = getDefaultDbPath()) {
    if (dbPath !== ":memory:") {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent TEXT NOT NULL,
        type TEXT NOT NULL,
        command TEXT,
        risk_level TEXT,
        session_id TEXT,
        timestamp INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_events_risk ON events(risk_level);
      CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent);
    `);
  }

  async save(event: AgentEvent): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO events (agent, type, command, risk_level, session_id, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.agent,
      event.type,
      event.command ?? null,
      event.riskLevel ?? null,
      event.sessionId ?? null,
      event.timestamp,
      event.metadata ? JSON.stringify(event.metadata) : null,
    );
  }

  async query(options: EventQueryOptions = {}): Promise<AgentEvent[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.agent) {
      conditions.push("agent = ?");
      params.push(options.agent);
    }

    if (options.riskLevel) {
      conditions.push("risk_level = ?");
      params.push(options.riskLevel);
    }

    if (options.since) {
      conditions.push("timestamp >= ?");
      params.push(options.since);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = options.limit ?? 20;

    const sql = `
      SELECT agent, type, command, risk_level, session_id, timestamp, metadata
      FROM events
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Array<{
      agent: string;
      type: string;
      command: string | null;
      risk_level: string | null;
      session_id: string | null;
      timestamp: number;
      metadata: string | null;
    }>;

    return rows.map((row) => ({
      agent: row.agent,
      type: row.type as AgentEvent["type"],
      command: row.command ?? undefined,
      riskLevel: (row.risk_level as RiskLevel) ?? undefined,
      sessionId: row.session_id ?? undefined,
      timestamp: row.timestamp,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    }));
  }

  close(): void {
    this.db.close();
  }
}
