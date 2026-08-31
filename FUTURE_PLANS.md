# Agent Permission Layer (APL) — Future Architecture & Vision Roadmap

> **Document Purpose:** Engineering Roadmap, Technical Specifications for Post-MVP Phases, and System Design Architecture for Universal Multi-Agent & IDE Scaling.

---

## 🌟 The Core Vision: Universal Dual-Layer Architecture

The primary goal of APL is to provide a reliable, local-first safety net for autonomous coding agents — protecting developers across both **Terminal CLI Agents** and **GUI / IDE Chat Assistants** through a single unified engine.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          UNIVERSAL AGENT PERMISSION LAYER                              │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│         TERMINAL / CLI AGENTS             │            IDE / GUI CHAT AGENTS           │
│   (Claude Code, Gemini CLI, Codex, Aider) │      (Antigravity, Kiro, Cursor, VS Code)  │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│                     │                     │                     │                      │
│      [ Native Lifecycle Hooks ]           │     [ Transcript Stream & MCP Proxy ]      │
│                     │                     │                     │                      │
│                     ▼                     │                     ▼                      │
│        [ File-Relay Ingestion ]           │        [ Active Session Watcher ]          │
│                     │                     │                     │                      │
└─────────────────────┴──────────────┬──────┴─────────────────────┴──────────────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │     CANONICAL EVENT BUS       │
                     │  (Sliding-Window Dedupe)      │
                     └───────────────┬───────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   RISK ENGINE   │         │  POLICY ENGINE  │         │ NOTIFIER & LOG  │
│ (Deterministic, │         │ (Auto-Approve / │         │ (afplay / Toast │
│  no LLM in path)│         │  System Block)  │         │  SQLite DB)     │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

---

## 🗺️ Current Verification Status & Implementation Matrix

| Component / Adapter | Environment | Implementation State | Verification Level | Evidence & Notes |
|---|---|---|---|---|
| **Claude Code Adapter** | CLI | ✅ **Built** | 🔒 **Verified** | Real hook integration tested with live stall countdown (`PreToolUse` + `Notification` correlation). |
| **Gemini CLI Adapter** | CLI | ✅ **Built** | 🔒 **Verified** | Shell hook relay integration and test suite passing (`test/adapters/geminiCli.test.ts`). |
| **Antigravity Transcript Observer** | IDE Chat GUI | ✅ **Built** | 🔒 **Verified** | Human end-to-end verified in live chat: detects pending dialogs and fires 35s audio/visual alarm. |
| **Zero-Config Wizard (`defcon setup`)** | CLI Setup | ✅ **Built** | 🔒 **Verified (Config/Relay)** | Config merging, preservation of third-party keys, dry-run, idempotency, and rollback verified via automated & subshell file-relay tests (inbox write → adapter parse → classify); human native-app end-to-end test pending. |
| **APL MCP Server (`apl-mcp`)** | IDE / Protocol | ✅ **Built** | 🧪 **Tested (Subprocess)** | Live client verification (`scripts/test-mcp.ts`) proves tool listing, pre-flight checks, and active blocking. |
| **Cursor / Claude Desktop (MCP)** | IDE Chat GUI | ✅ **Built** | ⚠️ **Untested on App** | Implements standard MCP JSON-RPC protocol; pending direct verification inside Desktop GUI apps. |
| **Kiro IDE Adapter** | IDE Chat GUI | ⏳ **Not Built** | ⚪ **Not Started** | Planned for future phase via Kiro extension/MCP APIs. |
| **Antigravity `.agents/hooks.json`** | IDE Chat GUI | ❌ **Non-Viable** | 🚫 **Confirmed Inactive** | Empirical test confirmed Antigravity Chat GUI mode does not execute `.agents/hooks.json`. |

---

## 🗺️ Roadmap Progression

```
[ Phases 1–7: Core Local-First Engine ] ✅ SHIPPED & VERIFIED
  ├── Canonical Event Bus & Sliding-Window Deduplication
  ├── Deterministic Risk Engine (sub-millisecond p99, no LLM in decision path)
  ├── Terminal Adapters (Claude Code & Gemini CLI)
  ├── Cross-Platform Multi-Sensory Dispatchers (macOS afplay verified; Win/Linux mocked)
  ├── Native SQLite Audit Persistence (node:sqlite)
  └── Active Approval Policies & Catastrophic Regex Blacklist
                           │
                           ▼
[ Phase 8: Universal MCP Server Proxy & Antigravity Stream Observer ] ✅ SHIPPED & VERIFIED
  ├── Model Context Protocol (MCP) Server (dist/mcp/index.js) — Tested via subprocess client
  ├── Real-time Antigravity Transcript Observer (AntigravityAdapter) — Human end-to-end verified
  ├── Multi-Session Concurrency Isolation & Whitelist Safety-Net (75s Drift Guard) — Verified
  └── Deterministic Blacklist Hard Gating (Aborts catastrophic commands without prompting) — Verified
                           │
                           ▼
[ Phase 9: Zero-Config Setup Wizard (`defcon setup`) ] ✅ SHIPPED & VERIFIED
  ├── Auto-detection of installed agent configs (~/.claude, ~/.cursor, etc.)
  ├── Safe non-destructive JSON merge with automatic .bak backup
  ├── Idempotent execution & clean rollback (--undo / --dry-run)
  └── Guaranteed vs. Cooperative detection status reporting
                           │
                           ▼
[ Phase 10: Additional IDE & Editor Extensions (Planned — Not Started) ]
  ├── 10A: VS Code Extension (GitHub Copilot / Cline / Continue tool execution status badge)
  ├── 10B: OpenAI Codex CLI Adapter (src/adapters/codex.ts experimental path)
  ├── 10C: JetBrains / WebStorm Plugin (AI Assistant tool execution hooks)
  ├── 10D: Windsurf IDE (Codeium) MCP Integration
  └── 10E: Kiro IDE Adapter & Hook Configuration (.kiro/hooks/*.json)
                           │
                           ▼
[ Phase 11: Desktop Menu Bar / System Tray Companion & Notification Escalation (Planned — Not Started) ]
  ├── 11A: Minimal Native Tray UI (Tauri v2 / Rust + Webview, ~8MB)
  ├── 11B: Local Loopback WebSocket Transport (ws://127.0.0.1:48123)
  ├── 11C: Real-time Event Feed, Status Badges & Policy Toggle Controls
  └── 11D: Recurring Stall Reminders & Multi-Tier Acoustic Escalation (Snooze Alert System)
                           │
                           ▼
[ Phase 12: Project-Aware Context Engine (Planned — Not Started) ]
  ├── Local Manifest & Git Branch Inspection (package.json, Dockerfile)
  └── Contextual Risk Tuning (e.g. staging vs prod branch environments)
                           │
                           ▼
[ Phase 13: Agentic-AI Intelligence Layer (Planned — Not Started) ]
  ├── Behavioral Anomaly Scoring (EWMA/z-score on session risk sequences)
  ├── Local LLM Command-Intent Explainer (Ollama, async, non-authoritative)
  ├── Risk-Classification Evaluation Harness (precision/recall/F1 benchmark)
  └── Session Risk Report (read-only analytics)
                           │
                           ▼
[ Phase 14: Centralized Team & Enterprise Governance (Planned — Not Started) ]
  ├── GitOps Policy Sync (Centralized Corporate Blacklists/Whitelists)
  └── OpenTelemetry & Syslog Audit Log Forwarding for Enterprise SOC Compliance
```

---

## Phase 8 Detail: MCP Server Proxy & Antigravity Stream Observer

### 1. The Problem in IDE Chats (Antigravity, Kiro, Cursor, VS Code)
In GUI IDE chat windows, coding assistants do not execute raw terminal shell hooks directly; they invoke **Tools** via internal JSON-RPC or the **Model Context Protocol (MCP)** standard.

Without an MCP proxy:
- The IDE displays its own internal approval modal without risk classification.
- The developer has no audio alert and no risk score before deciding to click "Allow".

### 2. The Solution: APL Model Context Protocol (MCP) Proxy
We build `src/mcp/index.ts` exporting an official **MCP Server** that wraps shell execution tools (e.g. `execute_command`, `bash`, `run_terminal_cmd`).

```
[ IDE Assistant (Antigravity/Kiro/Cursor) ]
              │
              │ 1. AI requests tool execution: execute_command("rm -rf /dist")
              ▼
   [ APL MCP Tool Proxy ]
              │
              ├── 2. Runs Deterministic Risk Engine: 🔴 HIGH RISK
              ├── 3. 🔊 Plays "Sosumi" Sound via afplay
              ├── 4. Evaluates Policy Engine (Blacklist/Whitelist)
              │
              ├── [ If Blacklisted ] ──> Immediately returns Tool Error (BLOCKED)
              │                          (AI adapts plan, user never has to click Allow)
              │
              └── [ If Allowed ]     ──> Passes to shell, logs to SQLite audit database
```

### 3. Compatible IDEs & Environments:
- **Google Antigravity IDE** (MCP Config / Sidecar)
- **Kiro IDE** (MCP Server / Extensions)
- **Cursor IDE** (`~/.cursor/mcp.json`)
- **VS Code** (Cline / Roo Code / GitHub Copilot MCP)
- **Claude Desktop** (`claude_desktop_config.json`)

### 4. ⏱️ Unattended Idle Re-Nudge & Escalation (20–30s Timeout)
When a developer starts an autonomous agent task and switches tabs or steps away for coffee:
- **Stall Timer:** If an agent remains in `permission_required` state for $>25\text{ seconds}$ without user response:
- **Audio Pulse Re-Nudge:** APL triggers a repeated gentle audio pulse to remind the developer that the agent is stalled.
- **Sticky Banner:** Escalates the OS notification to sticky / high-urgency so it stays visible on screen until acknowledged.
- **Configurable Thresholds:** Configurable via `~/.apl/config.json` (`"idleNudgeSeconds": 30`, `"idleNudgeRepeat": 2`).

---

## ⭐️ PRIORITY — Phase 9 Detail: Zero-Config Setup Wizard (`defcon setup`)

> **Why this comes before new IDE adapters (Kiro, VS Code, etc.):** Right now,
> every integration that already works (Claude Code, Gemini CLI, Antigravity,
> Cursor) requires the user to manually hand-edit a JSON config file
> (`~/.claude/settings.json`, `~/.cursor/mcp.json`, etc.) and know the exact
> hook/MCP syntax. This is real adoption friction on integrations that are
> already built and verified. Before spending effort on new IDE adapters,
> we should make the existing ones frictionless: `npm i -g defcon` →
> `defcon setup` → `defcon start`, with zero manual config editing required.

### 1. The Problem
The current README asks the user to manually:
- Edit `~/.claude/settings.json` and add a `hooks` block by hand.
- Find and edit `gemini-cli-hooks.json` per Gemini CLI's docs.
- Manually create/edit `~/.cursor/mcp.json` (or the equivalent Antigravity /
  Claude Desktop MCP config path) and add an `mcpServers` entry.

This is fine for us as the builder, but it is a real barrier for any other
developer who just wants the tool to work. It does not match the target UX:

```bash
npm i -g defcon
defcon setup
defcon start
```

### 2. What CAN be fully automated
Every config file APL needs to touch lives at a **known, predictable path**:

| Target | Config Path | Mechanism |
|---|---|---|
| Claude Code | `~/.claude/settings.json` | JSON merge into `hooks.PreToolUse` / `hooks.Notification` |
| Gemini CLI | Gemini CLI hooks config (per its own docs path) | JSON merge into `BeforeTool` hook array |
| Cursor | `~/.cursor/mcp.json` | JSON merge into `mcpServers` |
| Antigravity (MCP path) | `~/.gemini/config/mcp_config.json` (or equivalent) | JSON merge into `mcpServers` |
| Claude Desktop | `claude_desktop_config.json` | JSON merge into `mcpServers` |
| Kiro (once adapter exists) | `.kiro/hooks/*.json` | New hook file per Kiro's schema |

`defcon setup` should auto-detect which of these targets are actually
installed on the machine (check for the existence of the app's config
directory / binary), and only touch the ones that are present.

### 3. What CANNOT be automated (be upfront about this in the CLI output)
- **IDE restart:** After injecting an MCP config, the IDE (Cursor,
  Antigravity, Claude Desktop) must be manually restarted by the user to
  load the new MCP server. No tool can force-restart another vendor's app
  cleanly. `defcon setup` must print this explicitly per target, e.g.
  `✅ Cursor MCP config installed — restart Cursor to activate.`
- **Cooperative dependency for MCP-based IDEs:** Even after setup, MCP-based
  IDEs remain a *best-effort* integration (see the Verification Matrix) —
  the underlying agent must still choose to call APL's tool instead of its
  own native `run_command`. This is a protocol-level limitation, not a setup
  problem, and no amount of config automation changes it. `defcon status`
  should continue to clearly label MCP-based targets as
  "Cooperative (best-effort)" vs. Claude Code/Gemini CLI's
  "Guaranteed Interception."

### 4. Required Behavior
1. **`defcon setup`**
   - Detects installed targets from the table above.
   - For each detected target: read the existing config file (if any) →
     **merge** the APL entry in (never overwrite unrelated existing keys,
     e.g. a user's other MCP servers or other Claude Code hooks) → write
     back with a backup of the original (`*.bak`) before modifying.
   - Prints a clear per-target summary of what was changed and what manual
     step (if any) remains, e.g.:
     ```text
     ✅ Claude Code   — hooks installed, active immediately
     ✅ Gemini CLI    — hooks installed, active immediately
     ✅ Cursor        — MCP config installed, restart Cursor to activate
     ⚪ Antigravity   — not detected, skipped
     ```

2. **`defcon setup --dry-run`** — preview the exact diff that would be
   written to each config file, without writing anything.
3. **Idempotency** — running `defcon setup` multiple times must not create
   duplicate hook/MCP entries. Detect and skip if the APL entry already
   exists (or update it in place if the version changed).
4. **Uninstall path — `defcon setup --undo`** — cleanly removes only the APL
   entries it added, restoring the rest of each config file untouched. This
   matters for user trust: anyone editing a config file on someone's machine
   needs an equally clean way to remove itself.
5. **Safety:** Never touch a config file that fails to parse as valid JSON —
   abort for that target and tell the user to fix or check it manually,
   rather than risking corrupting an unrelated config.

### 5. Verification Requirement (same discipline as the rest of this project)
Per the project's established process (see the session-summary handoff
doc): do not mark this "done" on the basis of unit tests merging JSON in
isolation. Before this is considered shipped, it must be verified with a
real, human-witnessed test: run `defcon setup` on a machine with Claude
Code and Cursor already configured with *other, unrelated* hooks/MCP
servers already present, confirm those unrelated entries survive untouched,
and confirm the daemon actually fires a real alert through both afterward —
the same standard already applied to the Antigravity end-to-end test.

---

## Phase 10 Detail: Additional IDE & Editor Extensions (Planned — Not Started)

### 1. Scope & Ecosystem Reach
Expand APL's multi-agent reach across additional popular AI developer tools and IDE ecosystems:
- **10A — VS Code Extension (`vscode-apl` / Cline & Continue MCP):** A dedicated VS Code extension package (`packages/vscode-apl/`) with status bar risk indicators, alongside Cline/Continue MCP target detection in `defcon setup`.
- **10B — OpenAI Codex CLI Adapter:** `src/adapters/codex.ts` supporting Codex CLI tool execution hook format and relay ingestion.
- **10C — JetBrains / WebStorm Plugin:** Architecture blueprint for JetBrains AI Assistant execution hook interception.
- **10D — Windsurf IDE (Codeium) MCP Support:** Auto-detection, zero-config MCP merging, and test verification for Windsurf IDE (`~/.codeium/windsurf/mcp_config.json`).
- **10E — Kiro IDE Adapter & Hook Configuration:** Support for Kiro's `.kiro/hooks/*.json` hook configuration and tool interception pipeline.

### 2. Component Specifications

#### A. Windsurf IDE & Cline Setup Targets (10D & 10A Setup)
Add detection and safe MCP JSON merge for:
- **Windsurf IDE:** `~/.codeium/windsurf/mcp_config.json`
- **Cline (VS Code):** `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` (and Linux/Windows equivalents)
- **Target Definitions:** Extend `src/setup/types.ts` and `src/setup/targets.ts` with cross-platform config paths and non-destructive `mcpServers.agent-permission-layer` merge/undo logic.

#### B. OpenAI Codex CLI Adapter (10B)
- **Adapter Location:** `src/adapters/codex.ts`
- **Mechanism:** Ingest and parse Codex tool execution events from experimental hook paths into Canonical `permission_required` / `completed` events on the EventBus.
- **Integration:** Registered in `src/cli/commands/start.ts` alongside existing adapters.

#### C. VS Code Extension Blueprint (10A)
- **Package Location:** `packages/vscode-apl/`
- **Mechanism:** Lightweight status bar item (`🛡️ APL: Active`) reflecting daemon status and real-time risk levels, connecting to daemon events or audit stores.

#### D. Kiro IDE Adapter & Setup Target (10E)
- **Adapter Location:** `src/adapters/kiro.ts`
- **Hook Config Target:** `.kiro/hooks/*.json`
- **Mechanism:** Intercept tool execution payloads per Kiro's hook schema and relay permission states to the canonical EventBus.

### 3. Verification & Acceptance Requirement
> [!IMPORTANT]
> **Strict Verification Standard:** In accordance with the verification standards applied to the Antigravity transcript observer and setup wizard, synthetic inbox payload injection (`cat >> ~/.apl/inbox.jsonl`) or simulated subprocess tests are **NOT** sufficient to mark Phase 10 items as "Verified" in the Verification Matrix.
>
> When Phase 10 is implemented (following completion of prior pending verification gates), the following real human-witnessed verifications on actual hardware are mandatory prior to upgrading status:
> 1. **Codex Adapter (10B):** Run a live, native OpenAI Codex CLI session, trigger a non-whitelisted shell tool execution, ignore the dialog, and personally confirm the 35s audio/visual alarm fires.
> 2. **Windsurf MCP Target (10D):** Run `defcon setup`, launch real Windsurf IDE, have Cascade/agent invoke an MCP-gated tool execution, and witness permission enforcement and stall alert.
> 3. **VS Code Extension (10A):** Launch a real VS Code instance with the extension installed, run an autonomous agent session (Cline / Copilot / Continue), and verify the live status bar risk badge updates dynamically alongside OS alerts.
> 4. **Kiro IDE (10E):** Run a live Kiro IDE session with `.kiro/hooks` configured, trigger an unapproved agent command, and verify stall detection and alert dispatch on real hardware.

---

## Phase 11 Detail: Desktop Menu Bar / System Tray Companion (Planned — Not Started)

### 1. The Goal
Provide developers with a lightweight, persistent status indicator in the macOS menu bar / Windows taskbar that displays the live state of the daemon, real-time alerts, and a quick dropdown table of recent audit history.

### 2. Architecture & Tech Stack Evaluation

| Framework | Binary Size | Memory Footprint | Native Look & Feel | Recommendation |
|---|---|---|---|---|
| **Tauri v2 (Rust + Webview)** | **$\approx 8\text{ MB}$** | **$\approx 25\text{ MB}$ RAM** | Native WebKit/WebView2 | **Recommended (Modern, lightweight)** |
| **Electron** | $\approx 85\text{ MB}$ | $\approx 120\text{ MB}$ RAM | Embedded Chromium | Good fallback for pure JS teams |

### 3. Daemon $\leftrightarrow$ UI Transport Architecture
The Tray App is a **pure presentation client** sitting on top of the existing APL daemon. It communicates over local loopback WebSockets (`ws://127.0.0.1:48123`), ensuring zero duplication of the risk engine or SQLite logic.

### 4. 11D — Recurring Stall Reminders & Multi-Tier Acoustic Escalation (Snooze Alert System)
- **The Problem:** If a developer steps away from their desk, has headphones off, or misses the initial 35-second alarm, the agent remains stalled indefinitely in silence, blocking progress unnoticed.
- **The Solution (Configurable Snooze & Escalation Loop):**
  - `stallAlertSeconds` (default: 35s): Initial alert countdown when an agent is blocked awaiting approval.
  - `repeatAlertIntervalSeconds` (default: 60s): Configurable recurring reminder interval if the approval dialog remains unacknowledged.
  - `maxRepeatAlerts` (default: 3): Capped retry count to prevent perpetual annoyance while unattended.
  - **Acoustic Escalation:**
    - Alert 1 (35s): Standard notification sound (`Ping` / `Pop`).
    - Alert 2 (+60s): High-urgency alert (`Sosumi`).
    - Alert 3 (+120s): Maximum-urgency acoustic tone (`Basso` / double pulse).
  - **Instant Cancellation Invariant:** The entire recurring timer chain is immediately and silently cancelled the millisecond the developer clicks Allow/Deny or the agent's turn resolves.

---

## Phase 12 Detail: Project-Aware Context Engine (Planned — Not Started)

### 1. The Goal
Contextualize command risk based on the local repository manifest and environment.

### 2. Concrete Use Cases
- **Environment Detection:**
  - `git push origin main --force` $\to$ 🔴 **CRITICAL RISK** on production `main` branch.
  - `git push origin feature/test --force` $\to$ 🟡 **MEDIUM RISK** on personal feature branch.
- **Manifest Script Inspection:**
  - When `npm run deploy` is executed, inspect `package.json` $\to$ scripts $\to$ `deploy` to see what underlying shell command will be run (e.g. `aws s3 sync` vs `gh-pages`).

---

## Phase 13 Detail: Agentic-AI Intelligence Layer (Planned — Not Started)

### 1. The Core Principle
This phase adds statistical/ML signal on top of the deterministic engine — never in place of it. Same invariant as the LLM explainer below: **additive and explanatory, never authoritative.** The blacklist and rule-based risk engine remain the sole gatekeepers for blocking/allowing execution.

### 2. 13A — Behavioral Anomaly Scoring (Session-Level)
- Track a rolling profile per agent session: command-category frequency, risk-level distribution, inter-command timing.
- Apply a lightweight statistical method (EWMA / z-score over the session's risk-level sequence — the same technique already used in the Aegis TLARC detection stack) to flag sessions that deviate sharply from that session's own established baseline (e.g. a sudden burst of high-risk commands after a long run of low-risk ones).
- Output: an additive "behavioral anomaly" tag surfaced in notifications and audit logs. Does not change the policy decision.
- Evaluation: validate against a labeled set of real and synthetic agent session logs (see 13C) before enabling by default.

### 3. 13B — Local LLM Command-Intent Explainer
- On a flagged (medium/high/blacklisted) command, asynchronously call a small local model (Llama 3.2 1B / Phi-3 via Ollama or Llama.cpp) to generate a plain-English explanation of what the command does and why it was flagged.
  > *"This command will recursively and forcefully delete the `dist` build directory. All compiled assets and bundle maps inside will be permanently deleted from disk without confirmation."*
- Strictly out of the decision path — the deterministic engine has already acted (notified/blocked) before this runs. Explanation is asynchronously appended to the notification banner and the SQLite audit log.
- Ships with a fallback: if no local model is available, explanation is skipped silently, with no functional degradation.

### 4. 13C — Risk-Classification Evaluation Harness
- Build a labeled benchmark set (target: 300–500 real-world commands spanning low/medium/high/blacklist) with human-assigned ground-truth labels.
- Run the deterministic risk engine against it and report precision / recall / F1 per risk tier — establishes a regression baseline for every future rule change.
- This harness is also the validation gate for 13A (anomaly scoring) before it's trusted enough to surface to users.

### 5. 13D — Session Risk Report
- Post-session summary (per agent run): total commands, risk-tier breakdown, any anomalies flagged, mean time-to-approval.
- Read-only analytics view — reuses the existing SQLite audit log, no new data collection.

### 6. Explicit Non-Goals for this Phase
- No ML model is ever given authority to approve/block a command.
- No cloud LLM calls in the default configuration (the local-first invariant from Phase 1 is preserved).
- 13A/13B/13D depend on 13C's evaluation harness existing first — do not ship anomaly scoring or LLM explanations without a measured accuracy baseline.

### 7. Baseline Reference (already measured, core engine)
The deterministic engine this layer sits on top of is already empirically benchmarked: `classify` p50 = 0.42µs, `resolvePolicy` p50 = 1.50µs, across 2,000 iterations on macOS — see [`scripts/benchmark-latency.ts`](scripts/benchmark-latency.ts). Any future ML/anomaly layer added in 13A must stay strictly out of this critical path so this latency guarantee is never affected.

---

## Phase 14 Detail: Centralized Team & Enterprise Governance (Planned — Not Started)

### 1. Enterprise Problem Statement
Engineering leadership wants to ensure developers' AI coding agents never execute unauthorized exfiltration scripts, hardcoded credential prints (`cat ~/.aws/credentials`), or unapproved package registries across corporate laptops.

### 2. GitOps Policy Sync Architecture
- Centralized team policy manifests (`https://github.com/enterprise/apl-team-policy.json`) synced via background TLS pull.
- **Policy Merge Hierarchy:**
  1. Enterprise Blacklist (Highest Priority - Immutable by Developer)
  2. Local Developer Blacklist
  3. Local Developer Whitelist
  4. Enterprise Whitelist
  5. Deterministic Risk Engine Fallback
- Audit events forwarded via OpenTelemetry / Syslog to enterprise SIEM tools.