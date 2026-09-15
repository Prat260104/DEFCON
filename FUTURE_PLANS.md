# DEFCON (Agent Permission Layer) -- Engineering Roadmap & Phase History

> **Document Purpose:** Engineering changelog of shipped architectural phases and technical roadmap for future engineering deliverables.

---

## Active Priority Roadmap

The following table lists the prioritized features on our active roadmap:

| Priority | Feature | Category | Target Output | Status |
|---|---|---|---|---|
| 1 | **Session Risk Analytics Report (`defcon report`)** | Core CLI | Aggregation queries, statistical summaries (approval time, longest stalls), `--json` | **COMPLETE** ✓ |
| 2 | **OWASP Agentic Security Mapping (`SECURITY.md`)** | Documentation & Governance | Formal alignment matrix with OWASP Top 10 for Agentic Applications (2026 Edition) | **COMPLETE** ✓ |
| 3 | **Terminal Demo Recording** | Documentation | Embedded interactive terminal recording / GIF showcasing full lifecycle | Backlog |

**Note**: Priorities 1 and 2 completed as of September 15, 2026. The project is now feature-complete for v1.0 release.

---

## Active Roadmap Specifications

### 1. Session Risk Analytics Report (`defcon report` / `apl report`)

**Goal:** Generate an actionable post-session analytical summary directly from the SQLite audit database (`~/.apl/events.db`) to help developers understand their agent interaction patterns, bottleneck stalls, and overall safety profile.

**CLI Invocation:**
```bash
defcon report                 # Summary of today's agent sessions
defcon report --since 24h     # Aggregated metrics across last 24 hours
defcon report --since 7d      # Weekly executive security report
defcon report --agent kiro    # Metrics isolated to a single agent
defcon report --json          # Machine-readable output for CI/auditing pipelines
```

**Terminal Output Preview:**
```text
  🛡️  DEFCON Session Risk Analytics Report
  Period: 2026-09-14 10:00:00 — 2026-09-14 20:30:00 (Last 24 hours)
  ──────────────────────────────────────────────────────────────────
  Total Commands Intercepted:   47
  Active Agents:                 Claude Code, Kiro IDE, Antigravity

  Risk Breakdown:
    🔴 High:      4  (8.5%)
    🟡 Medium:   12  (25.5%)
    🟢 Low:      31  (66.0%)
    ⛔ Blacklist:  0  (0.0%)

  Performance & Latency:
    Average Approval Time:       8.2s
    Median Approval Time (p50):  4.1s
    Longest Stall Duration:      58.4s ("npm run deploy:prod")

  Top Intercepted Actions:
    1. tool:call_mcp_tool        18 events
    2. git push origin main       4 events
    3. npm test                   3 events
  ──────────────────────────────────────────────────────────────────
```

**Technical Architecture:**
- New CLI command module at `src/cli/commands/report.ts` registered with aliases in `src/cli/index.ts`.
- Efficient SQL aggregations (COUNT, AVG, MAX, PERCENTILE / groupings) against existing `events` table in SQLite.
- Fully sanitized paths via `sanitizePath` to prevent any developer home directory leaks.
- Unit and integration tests in `test/cli/reportCommand.test.ts`.

---

### 2. OWASP Agentic Security Mapping (`SECURITY.md`)

**Goal:** Formally map DEFCON's architecture and capabilities to the **OWASP Top 10 for Agentic Applications (2026 Edition)**, demonstrating alignment with enterprise and industry-standard security frameworks.

**Coverage Matrix to Document:**

| OWASP ID | Risk Category | DEFCON Architectural Enforcement |
|---|---|---|
| **ASI02** | Tool Misuse and Exploitation | Deterministic risk classification engine with regex-based risk categorization and catastrophic blacklist hard-gating (`rm -rf /`, `mkfs`, raw forkbombs) blocks malicious or erroneous tool invocations prior to execution. |
| **ASI03** | Identity and Privilege Abuse | Multi-tier policy engine with configurable hierarchy (Enterprise Blacklist > Local Blacklist > Whitelist > Risk Engine) prevents privilege escalation and unauthorized credential access. |
| **ASI05** | Unexpected Code Execution | Pre-execution interception via native lifecycle hooks (Claude Code, Gemini CLI, Antigravity) and stdio MCP proxy gating (Cursor, Cline, Kiro IDE). |
| **ASI08** | Cascading Failures & Deadlocks | Dynamic stall detection timer with multi-tier acoustic escalation prevents silent agent deadlocks, hung terminal sessions, or runaway execution loops from propagating unnoticed. |
| **ASI10** | Rogue Agents & Traceability | Zero-cloud, local-first SQLite forensic audit trail (`~/.apl/events.db`) with tamper-resistant command interception records, event timestamps, risk levels, and automated developer path sanitization (`~` masking). |

**Deliverable:** A formal `SECURITY.md` file at the repository root detailing the threat model, OWASP alignment matrix, reporting guidelines, and local privacy guarantees.

---

## Architectural Phase History (Shipped from Inception)

A complete chronological record of all architectural phases built and shipped:

### Phase 1: Core Daemon & Event Bus Architecture
- Event-driven architecture with centralized `EventBus` (`src/core/eventBus.ts`).
- Local filesystem IPC inbox (`~/.apl/inbox.jsonl`) for non-blocking asynchronous event handoff.
- Local SQLite storage engine (`src/storage/sqliteStore.ts`) supporting fast writes and indexed querying.

### Phase 2: Deterministic Risk Classification Engine
- Sub-microsecond regex pattern matcher (`src/risk/rules.ts`, `src/risk/classify.ts`) classifying commands into `HIGH`, `MEDIUM`, `LOW`, and `UNKNOWN`.
- Catastrophic blacklist hard-stop safety guard with unconditional blocking.
- Configurable whitelist and blacklist policy overrides (`src/risk/policy.ts`).

### Phase 3: Acoustic Escalation & Notification Subsystem
- Multi-tier acoustic notification engine (`src/notify/soundManager.ts`, `src/notify/macos.ts`).
- Native macOS sound asset integration with fallback audio synthesize scripts.
- Volume normalization, platform-agnostic sound playback, and terminal visual alerts.

### Phase 4: Stall & Idle Detection Timers
- Non-blocking session stall alert timer (`src/core/stallTimer.ts`) detecting unapproved pending agent actions.
- Idle timeout monitoring (`src/core/idleTimer.ts`) detecting abandoned sessions.
- In-memory session deduplication (`src/core/dedupe.ts`) preventing notification storms.

### Phase 5: Agent Lifecycle Adapters
- **Claude Code Adapter** (`src/adapters/claudeCode.ts`): Pre-command interception hooks via `.claude/settings.json`.
- **Gemini CLI Adapter** (`src/adapters/geminiCli.ts`): Terminal integration and lifecycle monitoring.
- **Antigravity Transcript Observer** (`src/adapters/antigravityTranscript.ts`): Continuous real-time streaming parser for `.gemini/antigravity-ide/brain/**/transcript.jsonl`.
- **Kiro IDE Live GUI Watcher** (`src/adapters/kiro.ts`): Session watcher parsing `.kiro/sessions/**/messages.jsonl`.
- **OpenAI Codex Adapter** (`src/adapters/codex.ts`): CLI hook interception and workspace file observer.

### Phase 6: Model Context Protocol (MCP) Tool Proxy
- Universal stdio-based MCP Server (`src/mcp/index.ts`, `src/mcp/server.ts`).
- Exported tools: `apl_check_permission` and `apl_execute_command`.
- Standardized tool inspection and approval gating for IDEs supporting MCP (Cursor, Cline, Windsurf, Claude Desktop).

### Phase 7: Automated Setup & Config Engine (`defcon setup`)
- Interactive and automated multi-agent configuration engine (`src/setup/engine.ts`, `src/setup/targets.ts`).
- Non-destructive configuration merge with automated `.bak` backups and undo capability (`--undo`).
- Zero-config auto-detection across all installed agent CLIs and IDEs.

### Phase 8: VS Code / Cursor Status Bar Extension
- Dedicated companion extension (`packages/vscode-apl`).
- Live DEFCON status icon in the status bar with real-time risk color indicators.
- Quick-action menu for viewing pending approvals, testing alerts, and inspecting audit logs.

### Phase 9: Empirical Benchmark & Regression Suite
- Ground-truth dataset with 271 real-world agent shell commands across all tiers (`test/benchmark/dataset.json`).
- Benchmark evaluation suite (`scripts/benchmark-accuracy.ts`) measuring Precision, Recall, Macro-F1, and p50/p95/p99 evaluation latency.
- Strict CI regression gate test (`test/benchmark/benchmark.test.ts`) guaranteeing 100% blacklist recall and zero false negatives.

### Phase 10: CI/CD Quality Pipeline
- GitHub Actions workflow (`.github/workflows/ci.yml`) testing on Node.js 22.x on `ubuntu-latest`.
- Automated format checking, linting, typechecking, full Vitest test execution (30 suites, 370 tests), and benchmark verification.

### Phase 11: CLI Audit Log Viewer (`defcon audit`)
- High-performance forensic query command (`src/cli/commands/audit.ts`) with alias `history`.
- Filtering by risk tier (`--risk`), time duration (`--since 15m/1h/24h/7d`), agent source (`--agent`), and event type (`--type`).
- Formatted ANSI terminal table, machine-readable JSON (`--export json`), and RFC 4180 compliant CSV export (`--export csv`).

### Phase 12: Desktop Tray Companion & Live Control (Tauri / Rust)
- Native lightweight desktop menu bar / system tray companion (`packages/desktop-tray/src-tauri/src/main.rs`).
- Dynamic loopback WebSocket server (`src/server/websocket.ts`, `ws://127.0.0.1:48123`) streaming real-time events and bidirectional control messages.
- **Dynamic Stall Timeout Adjustment**: Real-time stall threshold updates (20s, 35s, 45s, 60s, 90s, 120s) with in-memory live rescheduling.
- **Custom Sound Importer**: Native OS file picker (`rfd`) allowing custom `.mp3`, `.wav`, `.aiff`, `.ogg` audio assets for each tier, copied to `~/.apl/sounds/` with instant WebSocket notification.

### Phase 13: Local Privacy & Path Sanitization Engine
- Dedicated path sanitizer utility (`src/core/pathSanitizer.ts`).
- Automatic masking of developer-specific home paths (`/Users/<username>/...`, `file:///Users/<username>/...`, Windows paths) to portable `~` representations.
- Deep sanitization across WebSocket broadcasts, AgentEvents, macOS desktop notifications, and terminal audit logs.