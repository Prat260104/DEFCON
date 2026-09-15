import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { sanitizePath } from "../core/pathSanitizer.js";
import type { RiskLevel } from "../core/types.js";

export interface AnalyticsReport {
  period: {
    start: number;
    end: number;
    durationHours: number;
  };
  summary: {
    totalCommands: number;
    uniqueSessions: number;
    activeAgents: string[];
  };
  riskBreakdown: {
    high: { count: number; percentage: number };
    medium: { count: number; percentage: number };
    low: { count: number; percentage: number };
    blacklist: { count: number; percentage: number };
  };
  performance: {
    avgApprovalTimeMs: number | null;
    medianApprovalTimeMs: number | null;
    longestStallMs: number | null;
    longestStallCommand: string | null;
  };
  topCommands: Array<{ command: string; count: number }>;
}

export interface AnalyticsFilters {
  since?: number;
  agent?: string;
  riskLevel?: RiskLevel;
  limit?: number;
}

interface RiskRow {
  risk_level: string | null;
  count: number;
}

interface TopCommandRow {
  command: string;
  count: number;
}

interface ApprovalTimeRow {
  approvalTimeMs: number | null;
  command: string | null;
}

export class AnalyticsEngine {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    if (!existsSync(dbPath)) {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      // Initialize empty database if it doesn't exist
      this.db = new DatabaseSync(dbPath);
      this.initSchema();
    } else {
      this.db = new DatabaseSync(dbPath);
    }
  }

  private initSchema(): void {
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
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    `);
  }

  async generateReport(filters: AnalyticsFilters = {}): Promise<AnalyticsReport> {
    const now = Date.now();
    const since = filters.since ?? now - 24 * 60 * 60 * 1000; // Default: 24 hours

    const totalCommands = this.queryTotalCommands(since, filters.agent, filters.riskLevel);
    const riskBreakdown = this.queryRiskBreakdown(since, filters.agent);
    const activeAgents = this.queryActiveAgents(since, filters.agent);
    const uniqueSessions = this.queryUniqueSessions(since, filters.agent);
    const topCommands = this.queryTopCommands(since, filters.limit ?? 10, filters.agent);
    const approvalTimes = this.queryApprovalTimes(since, filters.agent);

    // Calculate performance metrics
    const performance = this.calculatePerformanceMetrics(approvalTimes);

    return {
      period: {
        start: since,
        end: now,
        durationHours: Math.round(((now - since) / (1000 * 60 * 60)) * 10) / 10,
      },
      summary: {
        totalCommands,
        uniqueSessions,
        activeAgents,
      },
      riskBreakdown,
      performance,
      topCommands: topCommands.map((row) => ({
        command: sanitizePath(row.command),
        count: row.count,
      })),
    };
  }

  private queryTotalCommands(since: number, agent?: string, riskLevel?: RiskLevel): number {
    const conditions: string[] = ["timestamp >= ?"];
    const params: (string | number)[] = [since];

    if (agent) {
      conditions.push("agent = ?");
      params.push(agent);
    }

    if (riskLevel) {
      conditions.push("risk_level = ?");
      params.push(riskLevel);
    }

    const sql = `
      SELECT COUNT(*) as count
      FROM events
      WHERE ${conditions.join(" AND ")}
    `;

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number } | undefined;
    return result?.count ?? 0;
  }

  private queryRiskBreakdown(since: number, agent?: string): AnalyticsReport["riskBreakdown"] {
    const conditions: string[] = ["timestamp >= ?", "type = 'permission_required'"];
    const params: (string | number)[] = [since];

    if (agent) {
      conditions.push("agent = ?");
      params.push(agent);
    }

    const sql = `
      SELECT risk_level, COUNT(*) as count
      FROM events
      WHERE ${conditions.join(" AND ")}
      GROUP BY risk_level
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown as RiskRow[];

    const breakdown = {
      high: { count: 0, percentage: 0 },
      medium: { count: 0, percentage: 0 },
      low: { count: 0, percentage: 0 },
      blacklist: { count: 0, percentage: 0 },
    };

    let total = 0;
    for (const row of rows) {
      const level = row.risk_level as RiskLevel | null;
      if (level === "high" || level === "medium" || level === "low") {
        breakdown[level].count = row.count;
        total += row.count;
      }
    }

    // Calculate percentages
    if (total > 0) {
      breakdown.high.percentage = Math.round((breakdown.high.count / total) * 1000) / 10;
      breakdown.medium.percentage = Math.round((breakdown.medium.count / total) * 1000) / 10;
      breakdown.low.percentage = Math.round((breakdown.low.count / total) * 1000) / 10;
      breakdown.blacklist.percentage = 0;
    }

    return breakdown;
  }

  private queryActiveAgents(since: number, agent?: string): string[] {
    const conditions: string[] = ["timestamp >= ?"];
    const params: (string | number)[] = [since];

    if (agent) {
      conditions.push("agent = ?");
      params.push(agent);
    }

    const sql = `
      SELECT DISTINCT agent
      FROM events
      WHERE ${conditions.join(" AND ")}
      ORDER BY agent
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Array<{ agent: string }>;
    return rows.map((row) => row.agent);
  }

  private queryUniqueSessions(since: number, agent?: string): number {
    const conditions: string[] = ["timestamp >= ?", "session_id IS NOT NULL"];
    const params: (string | number)[] = [since];

    if (agent) {
      conditions.push("agent = ?");
      params.push(agent);
    }

    const sql = `
      SELECT COUNT(DISTINCT session_id) as count
      FROM events
      WHERE ${conditions.join(" AND ")}
    `;

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number } | undefined;
    return result?.count ?? 0;
  }

  private queryTopCommands(since: number, limit: number, agent?: string): TopCommandRow[] {
    const conditions: string[] = ["timestamp >= ?", "command IS NOT NULL"];
    const params: (string | number)[] = [since];

    if (agent) {
      conditions.push("agent = ?");
      params.push(agent);
    }

    const sql = `
      SELECT command, COUNT(*) as count
      FROM events
      WHERE ${conditions.join(" AND ")}
      GROUP BY command
      ORDER BY count DESC
      LIMIT ?
    `;

    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as unknown as TopCommandRow[];
  }

  queryApprovalTimes(since: number, agent?: string): ApprovalTimeRow[] {
    // Build WHERE conditions for the main query
    const conditions: string[] = ["e1.type = 'permission_required'", "e1.timestamp >= ?"];
    const params: (string | number)[] = [since];

    if (agent) {
      conditions.push("e1.agent = ?");
      params.push(agent);
    }

    // Build WHERE conditions for the subquery (must match main query filters)
    const subConditions: string[] = [
      "e_perm.type = 'permission_required'",
      "e_perm.timestamp >= ?",
    ];
    const subParams: (string | number)[] = [since];

    if (agent) {
      subConditions.push("e_perm.agent = ?");
      subParams.push(agent);
    }

    // Query: Find the FIRST completion event after each permission_required
    // Uses subquery to prevent cross-matching when session has multiple pending events
    const sql = `
      SELECT 
        e1.id,
        e1.timestamp as requestTime,
        e2.timestamp as responseTime,
        (e2.timestamp - e1.timestamp) as approvalTimeMs,
        e1.command
      FROM events e1
      LEFT JOIN (
        -- Subquery: for each permission_required, find the FIRST completion after it
        SELECT 
          e_perm.id as permId,
          MIN(e_comp.timestamp) as firstCompletionTime
        FROM events e_perm
        INNER JOIN events e_comp
          ON e_perm.session_id = e_comp.session_id
          AND e_comp.type IN ('completed', 'working')
          AND e_comp.timestamp > e_perm.timestamp
        WHERE ${subConditions.join(" AND ")}
          AND e_perm.session_id IS NOT NULL
        GROUP BY e_perm.id
      ) nearest ON e1.id = nearest.permId
      LEFT JOIN events e2 
        ON e1.session_id = e2.session_id 
        AND e2.timestamp = nearest.firstCompletionTime
        AND e2.type IN ('completed', 'working')
      WHERE ${conditions.join(" AND ")}
      ORDER BY approvalTimeMs DESC
    `;

    // Combine parameters: subquery params first, then main query params
    const allParams = [...subParams, ...params];

    const stmt = this.db.prepare(sql);
    return stmt.all(...allParams) as unknown as ApprovalTimeRow[];
  }

  private calculatePerformanceMetrics(
    approvalTimes: ApprovalTimeRow[],
  ): AnalyticsReport["performance"] {
    // Filter out null approval times (no matching completion found)
    const validTimes = approvalTimes
      .filter((row) => row.approvalTimeMs !== null)
      .map((row) => row.approvalTimeMs as number);

    if (validTimes.length === 0) {
      return {
        avgApprovalTimeMs: null,
        medianApprovalTimeMs: null,
        longestStallMs: null,
        longestStallCommand: null,
      };
    }

    // Calculate average
    const sum = validTimes.reduce((acc, val) => acc + val, 0);
    const avg = Math.round(sum / validTimes.length);

    // Calculate median
    const sorted = [...validTimes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;

    // Find longest stall
    const maxTime = Math.max(...validTimes);
    const longestIndex = approvalTimes.findIndex((row) => row.approvalTimeMs === maxTime);
    const longestStall = longestIndex >= 0 ? approvalTimes[longestIndex] : null;

    return {
      avgApprovalTimeMs: avg,
      medianApprovalTimeMs: median,
      longestStallMs: longestStall?.approvalTimeMs ?? null,
      longestStallCommand: longestStall?.command ? sanitizePath(longestStall.command) : null,
    };
  }

  close(): void {
    this.db.close();
  }
}
