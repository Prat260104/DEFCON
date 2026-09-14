# Agent Permission Layer (APL) -- Future Engineering Roadmap

> **Document Purpose:** Technical specifications and engineering plans for features under active consideration or development. This document contains only planned and in-progress work. For documentation of shipped features, refer to the project README.

---

## Priority Roadmap

The following table lists all planned features in priority order, ranked by impact-to-effort ratio. Items are grouped into implementation phases for organizational clarity.

| Priority | Feature | Phase | Effort | Status |
|---|---|---|---|---|
| 1 | GitHub Actions CI/CD Pipeline | Infrastructure | 2 hours | **Shipped** (Multi-version matrix, 339 tests, Benchmark gate) |
| 2 | Risk Classification Benchmark Harness | Quality Assurance | 3-4 hours | **Shipped** (100% F1, 100% Recall) |
| 3 | CLI Audit Log Viewer (`defcon audit`) | Core CLI | 2-3 hours | **Shipped** (Filters, Relative Time, JSON/CSV RFC 4180) |
| 4 | System Tray Custom Sound Importer & Tier Mapping | Desktop Tray | 2-3 hours | Planned |
| 5 | System Tray Dynamic Stall Timeout Selector | Desktop Tray | 2 hours | Planned |
| 6 | Session Risk Analytics Report (`defcon report`) | Core CLI | 2-3 hours | Planned |
| 7 | OWASP Agentic Security Mapping (`SECURITY.md`) | Documentation | 1-2 hours | Planned |
| 8 | Terminal Demo Recording (asciinema / GIF) | Documentation | 1 hour | Planned |
| 9 | Windsurf IDE MCP Verification | IDE Expansion | 3-4 hours | Planned |
| 10 | JetBrains / WebStorm Plugin Architecture | IDE Expansion | Large | Deferred |
| 11 | Centralized Enterprise Governance | Enterprise | Large | Deferred |

---

## Phase: Infrastructure and Quality

### 1. GitHub Actions CI/CD Pipeline (Shipped)

**Goal:** Automated quality gates on every push and pull request.

**Status:** Completed in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

**Pipeline Capabilities:**
- Automated quality gate running on Node.js 22.x on `ubuntu-latest` (aligned with `node:sqlite` engine requirements).
- Automated code style and formatting gate (`npm run format:check`).
- Static code analysis (`npm run lint`).
- Strict TypeScript verification (`npm run typecheck`).
- Production build validation (`npm run build`).
- Full Vitest test suite execution across all 28 test files and 339 tests (`npm test`).
- Empirical Benchmark & Regression Gate execution (`npm run benchmark`).
- Automated concurrency grouping to cancel stale intermediate workflow runs on fast pushes.
- Real-time status shields embedded in [`README.md`](./README.md).

---

### 2. Risk Classification Benchmark Harness (Shipped)

**Goal:** Measure and report the accuracy of the deterministic risk engine against a labeled ground-truth dataset.

**Status:** Completed and documented in [BENCHMARK.md](./BENCHMARK.md).

**Delivered Capabilities:**
- Ground-truth dataset (`test/benchmark/dataset.json`) with 271 curated real-world agent shell commands across 3 risk tiers + catastrophic blacklist patterns.
- High-resolution benchmark evaluation script (`scripts/benchmark-accuracy.ts`) reporting per-tier Precision, Recall, F1-Score, and sub-microsecond latency. Supports CLI tables, `--json`, and `--markdown`.
- Automated regression gate test (`test/benchmark/benchmark.test.ts`) with hard zero-false-negative safety invariant and ≥ 98% weighted F1 requirement.

**Measured Results:**
```
Dataset: 271 labeled commands
Weighted Macro-F1: 100.0%  |  Accuracy: 100.0%
Blacklist Recall: 100.0% (35/35 catastrophic commands, 0 false negatives)
Median Evaluation Latency (p50): 1.54 µs (0.0015 ms)
```

---

## Phase: Core CLI Enhancements

### 3. CLI Audit Log Viewer (`defcon audit`) (Shipped)

**Goal:** Expose the existing SQLite audit log through a structured CLI interface with filtering and machine-readable export.

**Status:** Completed and tested in `src/cli/commands/audit.ts` and `test/cli/auditCommand.test.ts`.

**Commands:**

```bash
defcon audit                      # Display last 20 intercepted events
defcon audit --risk high          # Filter by risk tier
defcon audit --since 1h           # Events from the last hour
defcon audit --since 24h          # Events from the last 24 hours
defcon audit --adapter claude     # Filter by adapter source
defcon audit --export json        # Output as JSON for pipeline consumption
defcon audit --export csv         # Output as CSV for spreadsheet analysis
```

**Delivered Implementation:**
- New command module at `src/cli/commands/audit.ts` registered with alias `history` for 100% backward compatibility.
- SQL queries against existing SQLite database with filtering on `risk_level`, `since`, `agent`, and `type`.
- Tabular terminal output formatted with colored risk badges (`🔴 HIGH`, `🟡 MED`, `🟢 LOW`, `⚪ UNKN`), agent, event type, and truncated commands.
- Relative duration parsing supporting `m`, `h`, `d`, `w` (e.g. `15m`, `1h`, `24h`, `7d`).
- Structured JSON export (`--export json` / `--json`).
- RFC 4180 compliant CSV export (`--export csv` / `--csv`) properly escaping commas, double quotes, and linebreaks.
- Comprehensive unit, integration, and falsifiable manual CLI tests.

---

## Phase: Native Desktop System Tray Enhancements

### 4. System Tray Custom Sound Importer & Tier Mapping

**Goal:** Enable users to upload their custom audio assets directly through the OS menu bar / system tray companion and map them to specific risk tiers (Low, Medium, High, Stall Alert).

**User Interaction Flow:**
1. User clicks the DEFCON shield icon in the macOS menu bar / Windows system tray.
2. Navigates to `Acoustic Alerts` -> `Upload Custom Sound...` (or `Choose Sound for Tier` -> `[High / Medium / Low / Stall]`).
3. Native OS file picker dialog opens (filtered to `.wav`, `.mp3`, `.aiff`, `.ogg`).
4. The selected audio file is copied into the user's local sound repository (`~/.apl/sounds/<filename>`).
5. The mapping is persisted into `~/.apl/config.json` under `soundMap.<tier>`.
6. A control message is dispatched over the loopback WebSocket (`ws://127.0.0.1:48123`) to the Node.js daemon, triggering `SoundManager.reloadMappings()` in real time without requiring a daemon restart.
7. A confirmation audio preview is automatically triggered to confirm the asset was loaded.

**Technical Architecture:**
- **Tray Companion (`packages/desktop-tray` / Tauri Rust):** Uses `rfd` (Rusty File Dialog) or Tauri native file dialog plugin to prompt the user for an audio file.
- **WebSocket Protocol:** Dispatches `{ "type": "config_update", "key": "soundMap.<tier>", "value": "<assetName>" }` to the Node.js daemon.
- **Daemon Configuration Manager:** Atomically writes to `~/.apl/config.json` and invokes `soundManager.setCustomTierMapping(tier, assetName)`.

---

### 5. System Tray Dynamic Stall Timeout Selector

**Goal:** Allow users to configure their stall alert threshold (e.g. 1 minute / 60 seconds instead of the default 35 seconds) directly from the menu bar system tray, with individual user settings persisted and applied in real time across the entire system.

**User Interaction Flow:**
1. User clicks the DEFCON shield icon in the menu bar.
2. Opens the `Stall Alert Threshold` submenu:
   ```text
   DEFCON: Monitoring Active
   ---------------------------------
   Stall Alert Threshold  ▶  ( ) 20 seconds
                             (•) 35 seconds (Default)
                             ( ) 45 seconds
                             ( ) 60 seconds (1 minute)
                             ( ) 90 seconds (1.5 minutes)
                             ( ) 120 seconds (2 minutes)
                             ---
                             [ Custom Seconds... ]
   Acoustic Alerts        ▶
   Audit Log Viewer...
   ---------------------------------
   Quit DEFCON
   ```
3. Selecting `60 seconds (1 minute)` updates the radio checkmark in the tray menu.
4. The change is instantly written to `~/.apl/config.json` under `stallAlertSeconds: 60`.
5. The daemon's `StallTimer` dynamically updates its in-memory check interval and timeout threshold without dropping or disrupting active agent monitoring sessions.
6. The user receives a brief visual desktop notification: *"Stall alert timeout updated to 60s"*.

**Why this matters:** Different developers work at different cadences. A user running complex multi-step builds or waiting on large model responses might prefer a relaxed 60s or 90s timeout to avoid premature acoustic alerts, while a fast-paced developer wants an aggressive 20s or 35s alert. Exposing this via the system tray companion makes DEFCON adapt seamlessly to every individual user's workflow.

---

### 6. Session Risk Analytics Report (`defcon report`)

**Goal:** Generate a post-session summary from existing audit data to help developers understand their agent interaction patterns.

**Output Example:**

```
Session Report: 2026-09-09 14:00 - 16:30
-----------------------------------------
Total commands intercepted:    47
Risk breakdown:                Low 31 | Medium 12 | High 4
Average approval time:         8.2 seconds
Longest stall duration:        45 seconds (npm run deploy)
Adapters active:               Claude Code, Kiro IDE
Blacklist blocks:              0
```

**Implementation:**
- New command module at `src/cli/commands/report.ts`.
- Aggregation queries against `~/.apl/events.db`.
- Optional `--json` flag for structured output.

---

## Phase: Documentation and Security Posture

### 5. OWASP Agentic Security Mapping (`SECURITY.md`)

**Goal:** Formally map DEFCON's capabilities to the OWASP Top 10 for Agentic Applications (2026 edition), demonstrating alignment with industry security frameworks.

**Coverage Matrix:**

| OWASP ID | Risk Category | DEFCON Coverage |
|---|---|---|
| ASI02 | Tool Misuse and Exploitation | Deterministic risk engine with regex classification and blacklist hard-gating blocks dangerous tool invocations before execution. |
| ASI03 | Identity and Privilege Abuse | Policy engine with configurable whitelist/blacklist hierarchy prevents privilege escalation through credential-accessing commands. |
| ASI05 | Unexpected Code Execution | Pre-execution interception via native lifecycle hooks (Claude Code, Gemini CLI) and MCP tool proxy (Cursor, Cline, Kiro). |
| ASI08 | Cascading Failures | Stall detection with multi-tier acoustic escalation prevents silent agent deadlocks from propagating unnoticed. |
| ASI10 | Rogue Agents | Audit persistence (SQLite) provides forensic traceability for every agent action. Catastrophic command blacklist provides unconditional hard stops. |

**Deliverable:** A `SECURITY.md` file at the repository root documenting the threat model, OWASP alignment, and the local-first privacy guarantees already enforced by the engine.

**Why this matters:** Aligning with OWASP demonstrates awareness of the broader security landscape and positions the project within an established governance framework. Zero lines of application code required.

---

### 6. Terminal Demo Recording

**Goal:** Create a short terminal recording demonstrating the full DEFCON workflow for embedding in the README.

**Recording Flow:**

1. `defcon setup --dry-run` -- Show detected agents and preview output.
2. `defcon start` -- Launch daemon, show tray icon appearing.
3. Agent triggers a high-risk command -- Show stall alert firing with acoustic escalation.
4. `defcon audit --since 1m` -- Show the intercepted event in the audit log.

**Tool:** `asciinema` for terminal recording or screen capture converted to GIF.

**Deliverable:** Embedded recording in the README under the Getting Started section.

---

## Phase: IDE Expansion (Remaining)

### 7. Windsurf IDE MCP Verification

**Goal:** Add Windsurf IDE as a verified MCP setup target.

**Implementation:**
- Add Windsurf detection to `src/setup/targets.ts` with config path `~/.codeium/windsurf/mcp_config.json`.
- Non-destructive `mcpServers.agent-permission-layer` merge with backup and undo support.

**Verification Requirement:**
> Run `defcon setup`, launch a real Windsurf IDE instance, trigger an MCP-gated tool execution through Cascade, and witness permission enforcement and stall alert firing on real hardware.

---

## Phase: Deferred (Low Priority)

The following items are documented for completeness but are not prioritized for near-term implementation.

### 8. JetBrains / WebStorm Plugin Architecture

Architecture blueprint for JetBrains AI Assistant execution hook interception. Would provide status bar risk indicators connected to the daemon event bus. Deferred until JetBrains AI Assistant matures its plugin extensibility API.

### 9. Centralized Enterprise Governance

Enterprise-scale features including GitOps central policy synchronization (corporate blacklists/whitelists via HTTPS) and OpenTelemetry/Syslog audit log forwarding for SOC compliance. Deferred until the project has sufficient adoption to warrant multi-tenant governance.

**Policy Merge Hierarchy (Design Reference):**

1. Enterprise Blacklist (Highest Priority -- Immutable by Developer)
2. Local Developer Blacklist
3. Local Developer Whitelist
4. Enterprise Whitelist
5. Deterministic Risk Engine Fallback

---

## Verification Standards

> [!IMPORTANT]
> All features involving external IDE or agent integration must be verified through real human-witnessed tests on actual hardware before being marked as shipped. Synthetic payload injection, mocked subprocess tests, or simulated environments are not sufficient for verification status upgrades. This standard has been consistently applied to all shipped features including the Antigravity transcript observer, Claude Code hook integration, and VS Code extension.