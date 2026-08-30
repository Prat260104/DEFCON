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
[ Phase 9: Additional IDE & Editor Extensions (Planned — Not Started) ]
  ├── 9A: VS Code Extension (GitHub Copilot / Cline / Continue tool execution status badge)
  ├── 9B: OpenAI Codex CLI Adapter (src/adapters/codex.ts experimental path)
  ├── 9C: JetBrains / WebStorm Plugin (AI Assistant tool execution hooks)
  └── 9D: Windsurf IDE (Codeium) MCP Integration
                           │
                           ▼
[ Phase 10: Desktop Menu Bar / System Tray Companion (Planned — Not Started) ]
  ├── Minimal Native Tray UI (Tauri v2 / Rust + Webview, ~8MB)
  ├── Local Loopback WebSocket Transport (ws://127.0.0.1:48123)
  └── Real-time Event Feed, Status Badges & Policy Toggle Controls
                           │
                           ▼
[ Phase 11: Project-Aware Context Engine (Planned — Not Started) ]
  ├── Local Manifest & Git Branch Inspection (package.json, Dockerfile)
  └── Contextual Risk Tuning (e.g. staging vs prod branch environments)
                           │
                           ▼
[ Phase 12: Agentic-AI Intelligence Layer (Planned — Not Started) ]
  ├── Behavioral Anomaly Scoring (EWMA/z-score on session risk sequences)
  ├── Local LLM Command-Intent Explainer (Ollama, async, non-authoritative)
  ├── Risk-Classification Evaluation Harness (precision/recall/F1 benchmark)
  └── Session Risk Report (read-only analytics)
                           │
                           ▼
[ Phase 13: Centralized Team & Enterprise Governance (Planned — Not Started) ]
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

## Phase 9 Detail: Additional IDE & Editor Extensions (Planned — Not Started)

- **9A — VS Code Extension:** `vscode-agent-permission-layer` in the Marketplace, hooking into GitHub Copilot / Cline / Continue tool execution, with a risk badge in the status bar.
- **9B — OpenAI Codex CLI Adapter:** `src/adapters/codex.ts`, using Codex's experimental `hooks.json` path for full preToolUse interception.
- **9C — JetBrains / WebStorm Plugin:** JetBrains Plugin API for AI Assistant tool execution hooks (far-future, lower priority).
- **9D — Windsurf IDE (Codeium):** MCP config for Windsurf's AI tool execution pipeline.

---

## Phase 10 Detail: Desktop Menu Bar / System Tray Companion (Planned — Not Started)

### 1. The Goal
Provide developers with a lightweight, persistent status indicator in the macOS menu bar / Windows taskbar that displays the live state of the daemon, real-time alerts, and a quick dropdown table of recent audit history.

### 2. Architecture & Tech Stack Evaluation

| Framework | Binary Size | Memory Footprint | Native Look & Feel | Recommendation |
|---|---|---|---|---|
| **Tauri v2 (Rust + Webview)** | **$\approx 8\text{ MB}$** | **$\approx 25\text{ MB}$ RAM** | Native WebKit/WebView2 | **Recommended (Modern, lightweight)** |
| **Electron** | $\approx 85\text{ MB}$ | $\approx 120\text{ MB}$ RAM | Embedded Chromium | Good fallback for pure JS teams |

### 3. Daemon $\leftrightarrow$ UI Transport Architecture
The Tray App is a **pure presentation client** sitting on top of the existing APL daemon. It communicates over local loopback WebSockets (`ws://127.0.0.1:48123`), ensuring zero duplication of the risk engine or SQLite logic.

---

## Phase 11 Detail: Project-Aware Context Engine (Planned — Not Started)

### 1. The Goal
Contextualize command risk based on the local repository manifest and environment.

### 2. Concrete Use Cases
- **Environment Detection:**
  - `git push origin main --force` $\to$ 🔴 **CRITICAL RISK** on production `main` branch.
  - `git push origin feature/test --force` $\to$ 🟡 **MEDIUM RISK** on personal feature branch.
- **Manifest Script Inspection:**
  - When `npm run deploy` is executed, inspect `package.json` $\to$ scripts $\to$ `deploy` to see what underlying shell command will be run (e.g. `aws s3 sync` vs `gh-pages`).

---

## Phase 12 Detail: Agentic-AI Intelligence Layer (Planned — Not Started)

### 1. The Core Principle
This phase adds statistical/ML signal on top of the deterministic engine — never in place of it. Same invariant as the LLM explainer below: **additive and explanatory, never authoritative.** The blacklist and rule-based risk engine remain the sole gatekeepers for blocking/allowing execution.

### 2. 12A — Behavioral Anomaly Scoring (Session-Level)
- Track a rolling profile per agent session: command-category frequency, risk-level distribution, inter-command timing.
- Apply a lightweight statistical method (EWMA / z-score over the session's risk-level sequence — the same technique already used in the Aegis TLARC detection stack) to flag sessions that deviate sharply from that session's own established baseline (e.g. a sudden burst of high-risk commands after a long run of low-risk ones).
- Output: an additive "behavioral anomaly" tag surfaced in notifications and audit logs. Does not change the policy decision.
- Evaluation: validate against a labeled set of real and synthetic agent session logs (see 12C) before enabling by default.

### 3. 12B — Local LLM Command-Intent Explainer
- On a flagged (medium/high/blacklisted) command, asynchronously call a small local model (Llama 3.2 1B / Phi-3 via Ollama or Llama.cpp) to generate a plain-English explanation of what the command does and why it was flagged.
  > *"This command will recursively and forcefully delete the `dist` build directory. All compiled assets and bundle maps inside will be permanently deleted from disk without confirmation."*
- Strictly out of the decision path — the deterministic engine has already acted (notified/blocked) before this runs. Explanation is asynchronously appended to the notification banner and the SQLite audit log.
- Ships with a fallback: if no local model is available, explanation is skipped silently, with no functional degradation.

### 4. 12C — Risk-Classification Evaluation Harness
- Build a labeled benchmark set (target: 300–500 real-world commands spanning low/medium/high/blacklist) with human-assigned ground-truth labels.
- Run the deterministic risk engine against it and report precision / recall / F1 per risk tier — establishes a regression baseline for every future rule change.
- This harness is also the validation gate for 12A (anomaly scoring) before it's trusted enough to surface to users.

### 5. 12D — Session Risk Report
- Post-session summary (per agent run): total commands, risk-tier breakdown, any anomalies flagged, mean time-to-approval.
- Read-only analytics view — reuses the existing SQLite audit log, no new data collection.

### 6. Explicit Non-Goals for this Phase
- No ML model is ever given authority to approve/block a command.
- No cloud LLM calls in the default configuration (the local-first invariant from Phase 1 is preserved).
- 12A/12B/12D depend on 12C's evaluation harness existing first — do not ship anomaly scoring or LLM explanations without a measured accuracy baseline.

### 7. Baseline Reference (already measured, core engine)
The deterministic engine this layer sits on top of is already empirically benchmarked: `classify` p50 = 0.42µs, `resolvePolicy` p50 = 1.50µs, across 2,000 iterations on macOS — see [`scripts/benchmark-latency.ts`](scripts/benchmark-latency.ts). Any future ML/anomaly layer added in 12A must stay strictly out of this critical path so this latency guarantee is never affected.

---

## Phase 13 Detail: Centralized Team & Enterprise Governance (Planned — Not Started)

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