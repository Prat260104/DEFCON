# Agent Permission Layer (DEFCON)

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
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Quick Setup](#quick-setup)
  - [Running the Daemon](#running-the-daemon)
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
| Kiro IDE                | Chat GUI IDE   | Real-Time Stream Observer  | Live session transcript monitoring (`~/.kiro/sessions/**/messages.jsonl`)         |
| Antigravity IDE         | Chat GUI IDE   | Real-Time Stream Observer  | Transcript stream watcher (`~/.gemini/antigravity-ide/brain/**/transcript.jsonl`) |
| VS Code (`vscode-apl`)  | IDE Status Bar | Live Status Monitor        | File-relay stream observer with 10-minute sliding TTL                             |
| Cline (VS Code)         | IDE Agent      | MCP Native Integration     | Automated `cline_mcp_settings.json` configuration merge                           |
| Cursor / Claude Desktop | Chat GUI IDE   | MCP Tool Guard             | `apl_execute_command` execution tool gate                                         |

---

## Getting Started

### Prerequisites

- Node.js version 20.0.0 or higher
- macOS, Linux, or Windows (WSL2 / native)
- Optional: Rust toolchain (version 1.80+) if compiling the desktop tray companion from source

### Installation

Clone the repository, install dependencies, and compile:

```bash
# 1. Clone repository and install dependencies
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
defcon history            # Display recent intercepted command audit entries
defcon mcp                # Start standalone Model Context Protocol server
```

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

Refer to [FUTURE_PLANS.md](FUTURE_PLANS.md) for detailed technical specifications, architecture blueprints, and priority rankings:

- **CI/CD Quality Gates:** GitHub Actions automated pipeline enforcing typecheck, linting, and full 25-suite Vitest test runs on every PR/push.
- **Risk Classification Benchmark Harness:** Quantitative precision/recall measurement against labeled command datasets to establish empirical accuracy baselines.
- **CLI Audit Log Viewer (`defcon audit`):** Direct terminal querying of SQLite audit store with filtering (`--risk`, `--since`) and structured JSON/CSV export.
- **OWASP Agentic Security Mapping:** Formal alignment document (`SECURITY.md`) mapping DEFCON controls to the OWASP Top 10 for Agentic Applications.
- **Session Risk Analytics (`defcon report`):** Post-session activity reporting summarizing total interceptions, stall durations, and risk tier distributions.
- **Extended IDE & Agent Support:** Windsurf IDE MCP verification and OpenAI Codex CLI adapter.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
