# Agent Permission Layer (APL)

> A universal alarm that brings you back when your coding agent gets blocked — with configurable delay, custom sounds, and risk classification.

## The Real Problem We Solve

Coding agents (Claude Code, Gemini CLI, Cursor, Kiro, Antigravity) run long autonomous tasks. Two things go wrong today:

1. **The developer isn't looking at the screen.** They've tabbed out or left their desk. The agent sits blocked indefinitely waiting for an Allow/Deny click because nothing loudly interrupts them.
2. **When they do notice, they approve blindly** without registering whether the pending command is harmless (`git status`) or destructive (`rm -rf /`, `git reset --hard`).

APL is a **universal "agent is stuck, come back" alarm** with intelligent risk context.

## Core Features

-  **Stall-Aware Alert Timer** — Does **not** annoy you if you approve within seconds. Escalates with a loud alarm only if the agent has been blocked for 30–40s (default: 35s, configurable).
-  **Whitelist Safety-Net (75s)** — Whitelisted / auto-approved commands bypass the fast timer. If a whitelisted command is still unresolved after 75s (due to IDE permission changes or config drift), APL alerts you with a drift warning.
-  **Custom Alert Sounds & Cross-Platform Audio** — Use built-in alert tones (`Sosumi`, `Ping`, `Pop`) or upload custom audio files (mp3/wav/aiff) that play loudly through macOS (`afplay`), Windows (PowerShell `SoundPlayer`), or Linux (`paplay`/`pw-play`/`aplay`). *(macOS: verified on real hardware; Windows/Linux: implemented, mocked test verified, real hardware validation in progress)*.
-  **Deterministic Risk Classification** — Sub-millisecond deterministic risk tagging (`low` / `medium` / `high`) added as secondary context to alert notifications (`"Agent waiting 35s — 🔴 HIGH RISK: rm -rf"`).
-  **Universal Agent Support** — Works across CLI agents (Claude Code, Gemini CLI) via lifecycle hooks, and Chat-GUI IDEs (Antigravity) via real-time transcript streaming and MCP tools.
-  **Active Blacklist Gating** — Intercepts and blocks catastrophic commands (`rm -rf /`, `mkfs.`, `git push --force origin main`, fork bombs) before execution.
-  **Local-First & Private** — Zero cloud dependencies, zero external API calls. Audit history stored in local SQLite (`~/.apl/events.db`).

## Supported Agents & Protection Model

There is an architectural distinction between **Terminal CLI agents** and **Chat-GUI IDE agents**:

| Agent | Type | Protection Level | Technical Mechanism |
|---|---|---|---|
| **Claude Code** | Terminal CLI |  **Guaranteed Interception** | Native `PreToolUse` & `Notification` hooks with `session_id` command correlation |
| **Gemini CLI** | Terminal CLI |  **Guaranteed Interception** | Native `BeforeTool` shell hook intercepts every command before execution |
| **Antigravity IDE** | Chat GUI IDE | ⚡ **Real-Time Stream Observer** | Watches `~/.gemini/antigravity-ide/brain/**/transcript.jsonl` for unresolved `tool_calls` |
| **Antigravity / Cursor / Claude Desktop (MCP)** | Chat GUI IDE |  **Best-Effort (Cooperative)** | Exposes `apl_execute_command` via MCP; intercepts when agent chooses tool |

## Quickstart & Usage

### 1. Zero-Config Setup (Recommended)
Auto-detects installed coding agents (Claude Code, Gemini CLI, Cursor, Antigravity, Claude Desktop) and configures them automatically without manual JSON editing:

```bash
# Preview what will be configured
defcon setup --dry-run

# Configure all detected tools
defcon setup

# Start the monitoring daemon
defcon start
```
*(Both `defcon` and `apl` CLI aliases are supported).*

### 2. Available CLI Commands
```bash
defcon setup            # Auto-configure hooks and MCP servers for detected agents
defcon setup --dry-run  # Preview changes without modifying files
defcon setup --undo     # Cleanly revert APL configurations from your tools
defcon start            # Start the APL monitoring daemon
defcon status           # View current status of all adapters
defcon agents           # List supported agent adapters
defcon config           # View or modify configuration
defcon history          # View recent agent activity audit log
defcon mcp              # Start the Model Context Protocol (MCP) server
npm run demo            # Run an interactive stall & permission simulation
```

## Manual Configuration (Optional)

If you prefer manual configuration instead of `defcon setup`:

### Claude Code Setup
Add to `~/.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "cat >> ~/.apl/inbox.jsonl" }] }
    ],
    "Notification": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "cat >> ~/.apl/inbox.jsonl" }] }
    ]
  }
}
```

### Gemini CLI Setup
See `gemini-cli-hooks.json.example` in the repository.

### Antigravity / Cursor / Claude Desktop (MCP Standard)
Add to your `mcp_config.json` (e.g. `~/.gemini/config/mcp_config.json` or `.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "agent-permission-layer": {
      "command": "node",
      "args": ["/absolute/path/to/Agents-Permission/dist/mcp/index.js"]
    }
  }
}
```

## Configuration (`~/.apl/config.json`)

```json
{
  "version": "0.2.0",
  "stallAlertSeconds": 35,
  "whitelistSafetyTimeoutSeconds": 75,
  "adapters": {
    "claude-code": true,
    "gemini-cli": true,
    "antigravity": true
  },
  "notifications": {
    "enabled": true,
    "builtInSound": "Sosumi",
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
  "whitelist": [
    "git status",
    "git log",
    "npm test",
    "npm run test",
    "ls",
    "pwd"
  ],
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

## Risk Levels & Decision Policy

| Level | Examples | Default Action |
|---|---|---|
| **Low** | `git status`, `npm test`, `ls`, `cat` | Pass-through / Auto-Approve |
| **Medium** | `npm install`, `git push`, `docker run` | 35s Stall Timer + Audible Alarm |
| **High** | `git reset --hard`, `sudo`, `curl \| sh` | 35s Stall Timer + Loud Urgent Alarm |
| **Blacklist** | `rm -rf /`, `mkfs.`, `git push --force origin main`, fork bombs | Immediate HARD BLOCK (`deny`) |

## Privacy & Security

- **What it reads:** Hook payloads & MCP tool parameters (command name, tool type, session ID).
- **What it stores:** Local SQLite event audit log only (`~/.apl/events.db`).
- **What it never transmits:** Command output, file contents, credentials, or any telemetry to remote servers.

## Documentation & Roadmap

- **[Future Architecture & Roadmap](FUTURE_PLANS.md)** — Specifications for Tauri Native Tray Companion, Kiro lifecycle adapter, local LLM explanations, and Scoped RAG context.

## License

MIT
