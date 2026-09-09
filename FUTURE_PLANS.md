# Agent Permission Layer (APL) -- Future Engineering Roadmap

> **Document Purpose:** Technical specifications and engineering plans for features under active consideration or development. This document contains only planned and in-progress work. For documentation of shipped features, refer to the project README.

---

## Priority Roadmap

The following table lists all planned features in priority order, ranked by impact-to-effort ratio. Items are grouped into implementation phases for organizational clarity.

| Priority | Feature | Phase | Effort | Status |
|---|---|---|---|---|
| 1 | GitHub Actions CI/CD Pipeline | Infrastructure | 2 hours | Planned |
| 2 | Risk Classification Benchmark Harness | Quality Assurance | 3-4 hours | Planned |
| 3 | CLI Audit Log Viewer (`defcon audit`) | Core CLI | 2-3 hours | Planned |
| 4 | Session Risk Analytics Report (`defcon report`) | Core CLI | 2-3 hours | Planned |
| 5 | OWASP Agentic Security Mapping (`SECURITY.md`) | Documentation | 1-2 hours | Planned |
| 6 | Terminal Demo Recording (asciinema / GIF) | Documentation | 1 hour | Planned |
| 7 | Windsurf IDE MCP Verification | IDE Expansion | 3-4 hours | Planned |
| 8 | JetBrains / WebStorm Plugin Architecture | IDE Expansion | Large | Deferred |
| 9 | Centralized Enterprise Governance | Enterprise | Large | Deferred |

---

## Phase: Infrastructure and Quality

### 1. GitHub Actions CI/CD Pipeline

**Goal:** Automated quality gates on every push and pull request.

**Pipeline Stages:**

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - npm install
      - npm run typecheck    # TypeScript strict mode verification
      - npm run lint         # ESLint rule enforcement
      - npm run test         # Vitest unit and integration suite (25 test files)
```

**Deliverables:**
- `.github/workflows/ci.yml` workflow definition.
- README badge showing pipeline status.
- Branch protection rule recommendation (require passing CI before merge).

**Why this matters:** Every production-quality open-source project has CI. A green badge on the repository landing page is the first signal of engineering discipline that reviewers and recruiters look for.

---

### 2. Risk Classification Benchmark Harness

**Goal:** Measure and report the accuracy of the deterministic risk engine against a labeled ground-truth dataset.

**Implementation:**

- Create `test/benchmark/commands.json` containing 300-500 commands with human-assigned risk labels spanning all four tiers (low, medium, high, blacklist).
- Build `scripts/benchmark-accuracy.ts` that runs the existing `classify()` function against every entry and computes precision, recall, and F1 score per risk tier.
- Output a structured report suitable for inclusion in documentation.

**Example dataset entries:**

```json
[
  { "command": "ls -la", "expected": "low" },
  { "command": "npm install express", "expected": "medium" },
  { "command": "rm -rf /", "expected": "high" },
  { "command": ":(){ :|:& };:", "expected": "high" }
]
```

**Example output:**

```
Risk Engine Accuracy Report
---------------------------
Tier       Precision   Recall   F1       Count
low        96.2%       93.8%    95.0%    120
medium     91.5%       89.3%    90.4%    140
high       97.1%       95.6%    96.3%    100
blacklist  100.0%      100.0%   100.0%   40
---------------------------
Overall weighted F1: 94.2%
```

**Why this matters:** Quantitative accuracy metrics on the core classification engine demonstrate measurement-driven engineering. This is a unique differentiator -- very few developer tool projects include empirical accuracy baselines.

**Dependencies:** None. Uses existing `classify()` function. No new runtime dependencies.

---

## Phase: Core CLI Enhancements

### 3. CLI Audit Log Viewer (`defcon audit`)

**Goal:** Expose the existing SQLite audit log through a structured CLI interface with filtering and machine-readable export.

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

**Implementation:**
- New command module at `src/cli/commands/audit.ts`.
- SQL queries against existing `~/.apl/events.db` (no schema changes required).
- Tabular output using formatted columns for terminal display.
- Structured JSON/CSV export for CI/CD pipeline integration and automated reporting.

**Why this matters:** Machine-readable output is an industry expectation for CLI tools used in automated workflows. The audit data already exists -- this feature surfaces it without any new data collection.

---

### 4. Session Risk Analytics Report (`defcon report`)

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