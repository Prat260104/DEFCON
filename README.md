# Agent Permission Layer (DEFCON)

[![NPM Version](https://img.shields.io/npm/v/agent-permission-layer)](https://www.npmjs.com/package/agent-permission-layer)
[![NPM Downloads](https://img.shields.io/npm/dm/agent-permission-layer)](https://www.npmjs.com/package/agent-permission-layer)
[![CI](https://github.com/Prat260104/DEFCON/actions/workflows/ci.yml/badge.svg)](https://github.com/Prat260104/DEFCON/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-388%20passed-brightgreen.svg)](https://github.com/Prat260104/DEFCON)
[![Benchmark F1](https://img.shields.io/badge/risk%20engine%20f1-100%25-blue.svg)](./BENCHMARK.md)
[![Recall](https://img.shields.io/badge/blacklist%20recall-100%25-brightgreen.svg)](./BENCHMARK.md)
[![Evaluation Latency](https://img.shields.io/badge/eval%20latency-1.54%C2%B5s-orange.svg)](./BENCHMARK.md)
[![Node Version](https://img.shields.io/badge/node-%3E%3D22.0.0-informational.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Local-first safety infrastructure and real-time stall detection for autonomous AI coding agents.

---

## Table of Contents

- [Executive Overview](#executive-overview)
- [The Problem Space](#the-problem-space)
- [System Architecture](#system-architecture)
- [Core Capabilities](#core-capabilities)
  - [Deterministic Risk Engine](#deterministic-risk-engine)
  - [Stall-Aware Alert Engine and Acoustic Escalation](#stall-aware-alert-engine-and-acoustic-escalation)
  - [Native Desktop System Tray Companion](#native-desktop-system-tray-companion)
  - [IDE Integration: VS Code Extension and Status Bar](#ide-integration-vs-code-extension-and-status-bar)
  - [Custom Sound Profile Manager](#custom-sound-profile-manager)
  - [Zero-Config Setup Engine](#zero-config-setup-engine)
- [Supported Environments and Protection Matrix](#supported-environments-and-protection-matrix)
- [Empirical Benchmarks & Accuracy](#empirical-benchmarks--accuracy)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Quick Setup](#quick-setup)
  - [Running the Daemon](#running-the-daemon)
- [Troubleshooting](#troubleshooting)
- [Command Line Interface](#command-line-interface)
- [Configuration Reference](#configuration-reference)
- [Adapter Integration Specifications](#adapter-integration-specifications)
  - [Terminal CLI Agents](#terminal-cli-agents)
  - [GUI and IDE Assistants](#gui-and-ide-assistants)
  - [Model Context Protocol Server](#model-context-protocol-server)
- [Desktop Tray Companion Architecture](#desktop-tray-companion-architecture)
- [Security and Privacy Model](#security-and-privacy-model)
- [Roadmap](#roadmap)
- [License](#license)

---

## Executive Overview

The Agent Permission Layer (DEFCON) is a lightweight, local-first background service designed to govern autonomous coding agents. It provides deterministic safety boundaries, execution interceptors, and non-blocking acoustic alerts when agents encounter permission barriers or stall while awaiting developer confirmation.

DEFCON bridges the operational gap between developers and autonomous tools such as Claude Code, Gemini CLI, Cline, Kiro IDE, and Antigravity. It ensures that critical actions are audited, dangerous commands are blocked prior to execution, and idle wait times are minimized without requiring cloud dependencies or language-model overhead in the evaluation path.

---

## The Problem Space

Modern software engineering increasingly relies on autonomous agent workflows. During typical operation, developers encounter two fundamental failure modes:

1. **Unattended Execution Stalls:** Agents frequently pause to request confirmation for shell commands, filesystem operations, or package installations. If the developer has switched windows, navigated to another workspace, or stepped away from the terminal, the agent remains blocked indefinitely in silence.
2. **Alert Fatigue and Indiscriminate Approval:** When developers return to a stalled process, they often approve dialogs without evaluating risk level, failing to differentiate between benign inspection tasks (`git status`, `ls`) and destructive state mutations (`git reset --hard`, `rm -rf`, `DROP TABLE`).

DEFCON solves these challenges by combining deterministic pattern classification with a temporal alert engine. It stays completely silent when prompts are handled promptly, escalating only when an agent remains stalled beyond a configurable threshold.

---

## System Architecture

DEFCON operates as a decoupled dual-layer system. A local background daemon coordinates ingestion, risk evaluation, and alerting, while thin presentation clients (the macOS/Windows/Linux system tray companion and VS Code extension) observe runtime status over local loopback interfaces.

```
 +-------------------------------------------------------------------------+
 |                            AGENT INGESTION                              |
 |                                                                         |
 |   [Terminal CLI Agents]                    [IDE / GUI Chat Assistants]  |
 |   Claude Code, Gemini CLI                  Kiro IDE, Antigravity        |
 |             |                                        |                  |
 |     Lifecycle Hooks                          Transcript Stream          |
 |             |                                        |                  |
 |             +-------------------+--------------------+                  |
 |                                 |                                       |
 |                                 v                                       |
 |                   [Central Relay: inbox.jsonl]                          |
 +---------------------------------+---------------------------------------+
                                   |
                                   v
 +-------------------------------------------------------------------------+
 |                         CORE ENGINE (DAEMON)                            |
 |                                                                         |
 |                      Canonical Event Bus                                |
 |                                 |                                       |
 |        +------------------------+-----------------------+               |
 |        |                        |                       |               |
 |        v                        v                       v               |
 |  [Risk Engine]           [Stall Timer]           [SQLite Audit]         |
 |  Deterministic Regex     Multi-Tier Snooze       Local Query Log        |
 |  Sub-millisecond Path    Acoustic Escalation     ~/.apl/events.db       |
 +--------+------------------------+---------------------------------------+
          |                        |
          +-----------+------------+
                      |
                      v
 +-------------------------------------------------------------------------+
 |                       TRANSPORT & PRESENTATION                          |
 |                                                                         |
 |         Loopback WebSocket (ws://127.0.0.1:48123)                       |
 |                        |                                                |
 |            +-----------+-----------+                                    |
 |            |                       |                                    |
 |            v                       v                                    |
 |    [System Tray Companion]   [VS Code Extension]                        |
 |    Tauri v2 / Rust Native    Status Bar Monitor                         |
 |    3-State Risk Icon         Live Audit QuickPick                       |
 +-------------------------------------------------------------------------+
```

---

## Core Capabilities

### Deterministic Risk Engine

Risk evaluation runs synchronously through pure regex heuristics and rule sets without invoking external LLMs. Decisions are made in sub-millisecond time:

- **Low Risk:** Inspection commands (`git status`, `ls`, `pwd`, `cargo check`). Automatically approved or logged with standard low-priority status.
- **Medium Risk:** State changes, network access, or build tool commands (`npm install`, `git push`, `docker build`). Monitored under standard stall escalation.
- **High Risk:** Destructive or credential-sensitive commands (`git reset --hard`, `sudo`, `curl | sh`, secret file modifications). Triggers urgent high-tier acoustic patterns and explicit visual warnings.
- **Blacklist:** Destructive system operations (`rm -rf /`, `mkfs`, fork bombs, branch force-pushes). Blocked unconditionally prior to execution.

### Stall-Aware Alert Engine and Acoustic Escalation

- **Zero-Noise Invariant:** If a developer confirms or denies a command within standard response time (default: 35 seconds), no notification or audio plays.
- **Acoustic Escalation:** When an agent remains blocked awaiting user action, DEFCON triggers sequential escalation alerts:
  - Initial Alert (35s): Configured tier sound (`Ping` or custom low/medium sound).
  - Escalation Level 2 (+60s): High-urgency alert tone (`Sosumi`).
  - Escalation Level 3 (+120s): Maximum-urgency acoustic alert (`Basso` or custom stall sound).
- **Instant Cancellation:** Any resolution event (`completed`, `working`, or user approval) immediately and silently cancels all active timers for that session.
- **Whitelist Drift Detection:** If a whitelisted or auto-approved command fails to proceed after 75 seconds (indicating an IDE configuration mismatch or prompt stall), DEFCON raises a dedicated whitelist drift alarm.

### Native Desktop System Tray Companion

Built with Tauri v2 and Rust, the desktop companion compiles to an ultra-compact (2.4 MB) native binary with zero webview overhead:

- **Unified Process Lifecycle:** Running `defcon start` launches both the terminal daemon and the desktop tray companion under a single managed supervisor.
- **Dynamic Three-State Icon:** Reflects real-time risk status directly in the macOS menu bar and Windows/Linux taskbar:
  - Idle / Active: Green status indicator indicating normal background monitoring.
  - Medium Risk: Amber indicator signaling pending permission requests.
  - High Risk: Red indicator signaling destructive or security-sensitive actions pending review.
- **Graceful Shutdown Handshake:** Quitting the companion sends a structured `shutdown` frame over loopback WebSocket, waits for a `shutdown_ack` acknowledgment from the daemon, and cleans up all processes cleanly without orphaned background jobs.
- **Process Lockfile Management:** Uses `~/.apl/tray.pid` with startup sweep logic to ensure multiple tray instances never run concurrently.

### IDE Integration: VS Code Extension and Status Bar

Located in `packages/vscode-apl`, the extension provides editor-level visibility into agent activity:

- **Status Bar Monitor:** Displays live daemon connectivity, pending tool execution states, and risk tags (`APL: Active`, `APL: Action Pending`, `APL: High Risk`).
- **Command Palette Integration:**
  - `APL: Check Daemon Status` — Inspects daemon connectivity, active session IDs, and current risk level.
  - `APL: Show Recent Audit Logs` — Interactive QuickPick displaying recent tool interceptions and timestamps.
  - `APL: Open Configuration` — Direct navigation to `~/.apl/config.json`.
  - `APL: Test Audio Alert Preview` — Validates local audio playback subsystems.
- **Zero-Config Cline Support:** Merges MCP server configuration into `cline_mcp_settings.json` automatically while preserving existing tool definitions.

### Custom Sound Profile Manager

Developers can configure distinct audio tracks for each risk tier or import custom audio assets (`.mp3`, `.wav`, `.aiff`, `.ogg`):

- Dedicated directory at `~/.apl/sounds/` with automated asset validation and sanitization.
- Native system audio output via `afplay` (macOS), PowerShell `SoundPlayer` (Windows), and `aplay` / `pw-play` (Linux).
- Independent routing for `low`, `medium`, `high`, and `stall` escalation tiers.

### Zero-Config Setup Engine

The `defcon setup` command automatically detects installed coding assistants on the host environment and generates non-destructive hook configurations:

- Preserves existing custom configuration keys, comments, and third-party tools.
- Supports dry-run inspection via `--dry-run`.
- Full reversible uninstallation via `--undo`.

---

## Supported Environments and Protection Matrix

| Environment / Assistant | Interface      | Protection Level           | Technical Mechanism                                                               |
| ----------------------- | -------------- | -------------------------- | --------------------------------------------------------------------------------- |
| Claude Code             | Terminal CLI   | Deterministic Interception | Native `PreToolUse` and `Notification` hooks with session correlation             |
| Gemini CLI              | Terminal CLI   | Deterministic Interception | Native `BeforeTool` shell execution hook                                          |
| OpenAI Codex CLI        | Terminal CLI   | Deterministic Interception | Native `PreToolUse` and `PermissionRequest` hooks via `~/.codex/hooks.json`       |
| Kiro IDE                | Chat GUI IDE   | Real-Time Stream Observer  | Live session transcript monitoring (`~/.kiro/sessions/**/messages.jsonl`)         |
| Antigravity IDE         | Chat GUI IDE   | Real-Time Stream Observer  | Transcript stream watcher (`~/.gemini/antigravity-ide/brain/**/transcript.jsonl`) |
| VS Code (`vscode-apl`)  | IDE Status Bar | Live Status Monitor        | File-relay stream observer with 10-minute sliding TTL                             |
| Cline (VS Code)         | IDE Agent      | MCP Native Integration     | Automated `cline_mcp_settings.json` configuration merge                           |
| Cursor / Claude Desktop | Chat GUI IDE   | MCP Tool Guard             | `apl_execute_command` execution tool gate                                         |

---

## Empirical Benchmarks & Accuracy

DEFCON includes a rigorous, quantitative evaluation harness (`npm run benchmark`) measuring deterministic classification accuracy across a curated ground-truth corpus of **271 labeled commands**. Detailed methodology and latency distributions are documented in [BENCHMARK.md](./BENCHMARK.md).

### Measured Baseline

| Metric | Measured Baseline | Target / Constraint | Status |
|--------|-------------------|---------------------|--------|
| **Weighted Macro-F1** | **100.0%** | ≥ 98.0% regression gate | Pass |
| **Overall Accuracy** | **100.0%** | ≥ 98.0% regression gate | Pass |
| **Blacklist Recall** | **100.0%** (35/35) | 100.0% (Zero false negatives) | Pass (Hard Invariant) |
| **Blacklist False Positives** | **0** | 0 | Pass |
| **Median Latency (p50)** | **1.54 µs** (0.0015 ms) | < 1000 µs (1 ms) | Sub-microsecond |
| **99th Percentile (p99)** | **3.04 µs** | < 1000 µs | Zero agent overhead |

```bash
# Run benchmark locally
npm run benchmark

# Machine-readable JSON output
npm run benchmark -- --json

# Run automated regression gate
npx vitest run test/benchmark/benchmark.test.ts
```

---

## Getting Started

### Prerequisites

- Node.js version 22.0.0 or higher (Active LTS)
- macOS, Linux, or Windows (WSL2 / native)
- Optional: Rust toolchain (version 1.80+) if compiling the desktop tray companion from source

### Installation

**Global Installation (Recommended):**

```bash
npm install -g agent-permission-layer
```

**Or from source:**

```bash
# Clone repository and install dependencies
git clone https://github.com/Prat260104/DEFCON.git
cd DEFCON
npm install

# 2. Build core daemon and CLI
npm run build

# 3. Optional: Compile native desktop system tray companion (requires Rust)
npm run build:tray

# 4. Link CLI globally for system-wide access
npm link
```

Both `defcon` and `apl` binary aliases will now be available in your system path.

> Note: If `npm run build:tray` is omitted or the Rust toolchain is not installed, DEFCON automatically runs in terminal-only mode without errors.

### Quick Setup

Run the automated setup wizard to detect and configure installed assistants:

```bash
# Preview modifications without writing files
defcon setup --dry-run

# Apply configuration
defcon setup
```

### Running the Daemon

Start the foreground monitoring process:

```bash
defcon start
```

This single command launches the event bus, adapter watchers, loopback WebSocket server, and the native desktop system tray companion simultaneously.

---

## Troubleshooting

### Command Not Found After Installation

If you encounter `command not found: defcon` or `command not found: apl` after running `npm install -g agent-permission-layer`, this typically indicates that npm's global binary directory is not in your system PATH.

#### Quick Fix

**Option 1: Add npm bin to PATH (Recommended)**

```bash
# Check your npm global bin path
npm config get prefix

# Add to PATH temporarily (current session)
export PATH="$(npm config get prefix)/bin:$PATH"

# Test the command
defcon --version
```

To make this permanent, add the export line to your shell configuration file:

```bash
# For zsh (macOS default)
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# For bash
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

**Option 2: Reset npm to Default Location**

If you prefer to use the default npm configuration:

```bash
# Uninstall the package
npm uninstall -g agent-permission-layer

# Reset npm prefix to default
npm config delete prefix

# Reinstall
npm install -g agent-permission-layer

# Verify installation
defcon --version
```

#### Verify Installation

After applying the fix, verify that the binaries are accessible:

```bash
# Check binary locations
which defcon
which apl
which apl-mcp

# Test basic commands
defcon --version
defcon status
```

### Other Common Issues

**Issue: Permission Denied During Installation**

If you encounter `EACCES` permission errors:

```bash
# Option 1: Use a version manager (recommended)
# Install nvm: https://github.com/nvm-sh/nvm
# Then reinstall Node.js through nvm

# Option 2: Change npm's default directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

**Issue: Daemon Won't Start**

If `defcon start` fails to launch:

1. Check if port 48123 is already in use:
   ```bash
   lsof -i :48123
   ```

2. Verify Node.js version (requires 22.0.0 or higher):
   ```bash
   node --version
   ```

3. Check for existing processes:
   ```bash
   ps aux | grep defcon
   ```

**Issue: Tray Icon Not Appearing**

The desktop tray companion requires the Rust-compiled binary. If the icon doesn't appear:

1. Verify tray binary exists:
   ```bash
   ls -la $(npm config get prefix)/lib/node_modules/agent-permission-layer/packages/desktop-tray/
   ```

2. Check system tray is enabled (macOS: System Preferences → Control Center → Menu Bar)

3. Terminal-only mode still works without the tray icon

For additional support, please open an issue on [GitHub](https://github.com/Prat260104/DEFCON/issues).

---

## Command Line Interface

```bash
defcon setup              # Auto-configure hooks and MCP configurations
defcon setup --dry-run    # Inspect changes prior to applying
defcon setup --undo       # Remove APL configurations from detected assistants
defcon start              # Launch foreground monitoring daemon and tray companion
defcon stop               # Gracefully stop the running background daemon
defcon status             # Inspect active adapters and daemon state
defcon agents             # List supported agent platforms and detection status
defcon config             # Print active configuration
defcon config --set <k=v> # Update specific configuration values
defcon sound list         # List active audio mappings and available sound assets
defcon sound import <f>   # Import custom audio asset into ~/.apl/sounds/
defcon sound set-tier <t> # Map a sound asset to a tier (low, medium, high, stall)
defcon sound test         # Play audio preview for a specific tier or sound name
defcon sound reset        # Reset all audio mappings to system defaults
defcon audit              # Display recent intercepted command audit entries
defcon audit --risk high  # Filter audit events by risk tier (low, medium, high)
defcon audit --since 1h   # Filter events newer than relative duration (15m, 1h, 24h)
defcon audit --export csv # Export audit trail to RFC 4180 CSV (or --json)
defcon history            # Backward-compatible alias for defcon audit
defcon report             # Generate session risk analytics and statistical summary
defcon report --since 7d  # Aggregate metrics across custom time horizon
defcon report --agent <a> # Filter analytics by specific agent (kiro, antigravity, etc.)
defcon report --risk high # Filter by risk tier (low, medium, high)
defcon report --json      # Machine-readable JSON output for CI/auditing pipelines
defcon mcp                # Start standalone Model Context Protocol server
```

### Inspecting Audit Trails (`defcon audit`)

DEFCON automatically audits all intercepted commands, agent states, timestamps, and deterministic risk tiers into a local SQLite database (`~/.apl/events.db`). You can inspect, filter, and export this audit log directly from your terminal:

```bash
# View recent 20 events with risk badges
defcon audit

# Filter by risk tier (low, medium, high)
defcon audit --risk high

# Filter by relative time horizon (e.g. 15m, 1h, 24h, 7d)
defcon audit --since 1h

# Filter by agent platform (claude-code, gemini-cli, antigravity, cline, kiro)
defcon audit --agent antigravity

# Machine-readable JSON output
defcon audit -n 10 --json

# RFC 4180 CSV export for spreadsheet analysis & reporting
defcon audit --export csv > audit_trail.csv
```

**Terminal Preview:**
```text
  🛡️  DEFCON Audit Log (20 events) [Filtered: agent=antigravity]

  TIME        RISK     AGENT        TYPE                 COMMAND
  ──────────  ───────  ───────────  ───────────────────  ─────────────────────────────────────────────
  06:16:03 PM  🟡 MED   antigravity  permission_required  tool:call_mcp_tool
  06:15:51 PM  ⚪ UNKN  antigravity  completed            —
  06:15:51 PM  🟡 MED   antigravity  permission_required  tool:view_file
  11:58:27 AM  🟡 MED   antigravity  permission_required  "npx vitest run test/benchmark/benchmark.t...
```

### Generating Session Analytics Reports (`defcon report`)

The `defcon report` command provides statistical analysis and aggregated metrics across intercepted agent sessions. This feature enables developers to understand interaction patterns, identify performance bottlenecks, and generate compliance reports for security audits.

```bash
# Basic report (default: last 24 hours)
defcon report

# Custom time window
defcon report --since 7d     # Last 7 days
defcon report --since 30d    # Last 30 days
defcon report --since 1h     # Last hour

# Filter by agent platform
defcon report --agent kiro
defcon report --agent antigravity

# Filter by risk tier
defcon report --risk high
defcon report --risk medium

# Machine-readable JSON for CI pipelines
defcon report --json

# Limit number of top commands shown
defcon report --limit 10
```

**Terminal Preview:**
```text
  🛡️  DEFCON Session Risk Analytics Report

  Period: 09/08/2026, 12:00:00 — 09/15/2026, 12:00:00 (Last 7 days)
  ════════════════════════════════════════════════════════════════

  📊 Overview
  Total Commands Intercepted:   142
  Unique Sessions:               18
  Active Agents:                 3 (kiro, antigravity, claude-code)

  🎯 Risk Distribution
    🔴 High:       8  ( 5.6%)
    🟡 Medium:    45  (31.7%)
    🟢 Low:       89  (62.7%)

  ⏱️  Performance Metrics
    Average Approval Time:      4.8s
    Median Approval Time:       2.1s
    95th Percentile:           12.4s
    Longest Stall:             48.2s

  🏆 Top Commands (by frequency)
    1. tool:call_mcp_tool              28 events
    2. npm test                         12 events
    3. git status                       11 events
    4. tool:view_file                    9 events
    5. git commit -m "..."               8 events

  📈 Per-Agent Breakdown
    kiro:          68 commands (47.9%)
    antigravity:   52 commands (36.6%)
    claude-code:   22 commands (15.5%)
  ════════════════════════════════════════════════════════════════
```

**Use Cases:**

- **Post-Session Analysis**: Understand which commands triggered the most interruptions during a coding session.
- **Performance Optimization**: Identify commands with long approval times that may benefit from whitelisting.
- **Security Auditing**: Generate compliance reports showing risk tier distributions and high-risk command frequency.
- **Team Metrics**: Track agent usage patterns across development teams for workflow optimization.
- **CI/CD Integration**: Export JSON reports for automated security scanning and trend analysis.

**Analytics Engine:**

The report command executes optimized SQL aggregation queries directly against the local SQLite audit database (`~/.apl/events.db`). All metrics are computed locally with no external dependencies, maintaining DEFCON's zero-cloud architecture.

---

## Configuration Reference

Configuration is managed in `~/.apl/config.json`. Below is a fully annotated example:

```json
{
  "version": "0.2.0",
  "stallAlertSeconds": 35,
  "whitelistSafetyTimeoutSeconds": 75,
  "repeatAlertIntervalSeconds": 60,
  "maxRepeatAlerts": 3,
  "adapters": {
    "claude-code": true,
    "gemini-cli": true,
    "antigravity": true,
    "kiro": true
  },
  "notifications": {
    "enabled": true,
    "builtInSound": "Sosumi",
    "customSounds": {
      "stall": "~/.apl/sounds/custom_alarm.mp3",
      "high": "~/.apl/sounds/custom_alarm.mp3"
    },
    "sounds": {
      "low": "Pop",
      "medium": "Ping",
      "high": "Sosumi"
    }
  },
  "policies": {
    "low": "auto-approve",
    "medium": "notify-only",
    "high": "notify-and-confirm"
  },
  "whitelist": ["git status", "git log", "npm test", "npm run test", "ls", "pwd"],
  "blacklist": [
    "rm -rf /",
    "rm -rf /*",
    "rm -rf ~",
    "git push --force origin main",
    "git push --force origin master",
    "mkfs.",
    ":(){ :|:& };:"
  ],
  "inboxPath": "~/.apl/inbox.jsonl"
}
```

---

## Adapter Integration Specifications

### Terminal CLI Agents

#### Claude Code

Claude Code integration hooks into the native configuration file (`~/.claude/settings.json`) using file-relay append operations:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "cat >> ~/.apl/inbox.jsonl" }]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "cat >> ~/.apl/inbox.jsonl" }]
      }
    ]
  }
}
```

#### Gemini CLI

Configured via `gemini-cli-hooks.json` in the active project or user home directory, capturing `BeforeTool` events directly into the central relay inbox.

#### OpenAI Codex CLI

Configured via `~/.codex/hooks.json` using native lifecycle hook execution streaming directly into the central relay inbox:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "cat >> ~/.apl/inbox.jsonl" }]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "cat >> ~/.apl/inbox.jsonl" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "cat >> ~/.apl/inbox.jsonl" }]
      }
    ]
  }
}
```

### GUI and IDE Assistants

#### Kiro IDE

Kiro uses a dual-mode integration. The daemon continuously observes active chat session logs under `~/.kiro/sessions/**/messages.jsonl` for pending interaction states (`pending_interaction`), falling back to `.kiro/hooks/apl-hooks.json` when workspace configurations are present.

#### Antigravity IDE

The Antigravity observer monitors active session transcript files under `~/.gemini/antigravity-ide/brain/**/transcript.jsonl`. When an unresolved tool call is detected without a corresponding outcome within 35 seconds, the stall timer fires.

### Model Context Protocol Server

DEFCON exposes standard MCP tools for environments that support Model Context Protocol (Cline, Cursor, Claude Desktop):

- **Tool Name:** `apl_execute_command`
- **Behavior:** Accepts command and execution directory arguments, evaluates risk against policy, appends to the audit store, and blocks blacklisted execution requests.
- **Tool Name:** `apl_check_permission`
- **Behavior:** Read-only pre-flight risk classification without side effects.

Configuration entry for `mcpServers` (using system-linked binary or repository path):

```json
{
  "mcpServers": {
    "agent-permission-layer": {
      "command": "apl-mcp"
    }
  }
}
```

Or when running from a local checkout:

```json
{
  "mcpServers": {
    "agent-permission-layer": {
      "command": "node",
      "args": ["<path-to-repository>/dist/mcp/index.js"]
    }
  }
}
```

---

## Desktop Tray Companion Architecture

The system tray companion (`packages/desktop-tray`) is implemented as an ultra-compact Tauri v2 application:

- **Zero-Window Design:** Operates with no webview or DOM processes (`frontendDist: null`), minimizing resident memory footprint (~25 MB).
- **State Synchronization:** Subscribes to local loopback WebSocket frames (`ws://127.0.0.1:48123`) emitted by the daemon on every canonical event bus transition.
- **Protocol Schema:**
  - Inbound frames received from daemon: `init`, `state`, `event`, `stall`, `shutdown_ack`, `pong`.
  - Outbound frames sent to daemon: `shutdown`, `test_sound`, `ping`.
- **Shutdown Handshake Protocol:**
  1. User selects "Quit DEFCON" from the system menu.
  2. Companion transmits `{"type": "shutdown"}` over WebSocket.
  3. Daemon acknowledges with `{"type": "shutdown_ack"}` and begins controlled termination.
  4. Companion receives acknowledgment (with a 2.5-second fail-safe timeout) and exits cleanly.

---

## Security and Privacy Model

DEFCON is engineered around strict local-first security guarantees:

1. **Zero External Network Egress:** No telemetry, command payloads, file paths, or credentials ever leave the local machine. All transports bind exclusively to `127.0.0.1`.
2. **Deterministic Evaluation:** Rule enforcement is non-probabilistic. Pattern classification does not rely on cloud API availability or third-party inference models.
3. **Audit Persistence:** Intercepted events are written locally to an SQLite database (`~/.apl/events.db`) and a append-only text stream (`~/.apl/inbox.jsonl`).
4. **Subprocess Isolation:** The daemon and tray companion execute strictly with the permissions of the local invoking user without requiring elevated privileges (`sudo`).

---

## Roadmap

Refer to [FUTURE_PLANS.md](FUTURE_PLANS.md) for detailed technical specifications, architecture blueprints, and priority rankings.

**Completed Features:**

- **CI/CD Quality Gates**: GitHub Actions automated pipeline enforcing typecheck, linting, and full 388-suite Vitest test runs on every PR/push.
- **Risk Classification Benchmark Harness**: Quantitative precision/recall measurement against labeled command datasets achieving 100% F1 score.
- **CLI Audit Log Viewer (`defcon audit`)**: Direct terminal querying of SQLite audit store with filtering by risk, time, and agent, plus structured JSON/CSV export.
- **Session Risk Analytics (`defcon report`)**: Post-session activity reporting with statistical summaries, approval time analysis, risk distributions, and top command frequency metrics.
- **OWASP Agentic Security Mapping**: Formal alignment document ([SECURITY.md](SECURITY.md)) mapping DEFCON controls to the OWASP Top 10 for Agentic Applications.

**In Progress:**

- **Extended IDE & Agent Support**: Windsurf IDE MCP verification.
- **Terminal Demo Recording**: Interactive terminal recording showcasing full lifecycle.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
