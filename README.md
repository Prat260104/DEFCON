# Agent Permission Layer (APL / DEFCON)

> A universal alarm that brings you back when your coding agent gets blocked — with configurable delay, custom sound profiles, and deterministic risk classification.

## The Real Problem We Solve

Coding agents (Claude Code, Gemini CLI, Cursor, Kiro, Antigravity) run long autonomous tasks. Two things go wrong today:

1. **The developer isn't looking at the screen.** They've tabbed out or left their desk. The agent sits blocked indefinitely waiting for an Allow/Deny click because nothing loudly interrupts them.
2. **When they do notice, they approve blindly** without registering whether the pending command is harmless (`git status`) or destructive (`rm -rf /`, `git reset --hard`).

APL / DEFCON is a **universal "agent is stuck, come back" alarm** with intelligent risk context.

---

## Core Features

- **Stall-Aware Alert Timer** — Does **not** annoy you if you approve within seconds. Escalates with a loud alarm only if the agent has been blocked for 30–40s (default: 35s, configurable).
- **Recurring Stall Reminders & Multi-Tier Acoustic Escalation (11D)** — Configurable snooze reminder loop (Alert 1 @ 35s → Alert 2 @ +60s → Alert 3 @ +120s) with escalating audio urgency (`Pop`/`Ping` → `Sosumi` → `Basso` / custom stall sound), auto-canceling upon user interaction.
- **VS Code Status Bar & IDE Monitor (10A)** — Real-time status bar monitor (`$(shield) APL: Active`, `$(warning) APL: 🟡 Action Pending`, `$(alert) APL: 🔴 High Risk`) with live file-watching, QuickPick audit viewer, and zero-config Cline MCP setup.
- **Whitelist Safety-Net (75s)** — Whitelisted / auto-approved commands bypass the fast timer. If a whitelisted command is still unresolved after 75s (due to IDE permission changes or config drift), APL alerts you with a drift warning.
- **Custom Sound Profiles & Asset Manager** — Replace default system sounds (`Sosumi`, `Ping`, `Pop`) with any custom `.mp3`, `.wav`, `.aiff`, or `.ogg` audio track. Assign distinct audio cues for `low`, `medium`, `high`, and `stall` alerts. Cross-platform native playback via macOS (`afplay`), Windows (PowerShell `SoundPlayer`), and Linux (`paplay`/`pw-play`/`aplay`).
- **Deterministic Risk Classification** — Sub-millisecond deterministic risk tagging (`low` / `medium` / `high`) added as secondary context to alert notifications (`"Agent waiting 35s — 🔴 HIGH RISK: rm -rf"`).
- **Universal Agent Support** — Works across CLI agents (Claude Code, Gemini CLI) via lifecycle hooks, Chat-GUI IDEs (Antigravity, Kiro) via real-time session transcript streaming, and VS Code / Cline via extension and MCP.
- **Active Blacklist Gating** — Intercepts and blocks catastrophic commands (`rm -rf /`, `mkfs.`, `git push --force origin main`, fork bombs) before execution.
- **Local-First & Private** — Zero cloud dependencies, zero external API calls. Audit history stored in local SQLite (`~/.apl/events.db`).

---

## Supported Agents & Protection Model

There is an architectural distinction between **Terminal CLI agents** and **Chat-GUI IDE agents**:

| Agent                                           | Type                  | Protection Level                   | Technical Mechanism                                                                                                     |
| ----------------------------------------------- | --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Claude Code**                                 | Terminal CLI          | 🟢 **Guaranteed Interception**     | Native `PreToolUse` & `Notification` hooks with `session_id` command correlation                                        |
| **Gemini CLI**                                  | Terminal CLI          | 🟢 **Guaranteed Interception**     | Native `BeforeTool` shell hook intercepts every command before execution                                                |
| **Kiro IDE**                                    | Chat GUI IDE          | ⚡ **Real-Time Stream Observer**   | Watches `~/.kiro/sessions/**/messages.jsonl` for live GUI chat `pending_interaction` approvals + `.kiro/hooks` fallback |
| **Antigravity IDE**                             | Chat GUI IDE          | ⚡ **Real-Time Stream Observer**   | Watches `~/.gemini/antigravity-ide/brain/**/transcript.jsonl` for unresolved `tool_calls`                               |
| **VS Code (`vscode-apl`)**                      | IDE Extension         | 🛡️ **Live Status Bar Monitor**     | Observes local APL daemon event stream in real time; renders dynamic risk badges and QuickPick audit history            |
| **Cline (VS Code)**                             | IDE Extension / Agent | 🟢 **Zero-Config MCP Integration** | Auto-configured via `defcon setup`; non-destructive `cline_mcp_settings.json` merge with backup & undo                  |
| **Antigravity / Cursor / Claude Desktop (MCP)** | Chat GUI IDE          | 🟡 **Best-Effort (Cooperative)**   | Exposes `apl_execute_command` via MCP; intercepts when agent chooses tool                                               |

---

## Quickstart & Usage

### 1. Zero-Config Setup (Recommended)

Auto-detects installed coding agents (Claude Code, Gemini CLI, Cursor, Antigravity, Kiro, Claude Desktop, Cline) and configures them automatically without manual JSON editing:

```bash
# Preview what will be configured
defcon setup --dry-run

# Configure all detected tools
defcon setup

# Start the monitoring daemon
defcon start
```

_(Both `defcon` and `apl` CLI aliases are supported)._

---

### 2. Available CLI Commands

```bash
defcon setup            # Auto-configure hooks and MCP servers for detected agents
defcon setup --dry-run  # Preview changes without modifying files
defcon setup --undo     # Cleanly revert APL configurations from your tools
defcon start            # Start the APL monitoring daemon
defcon status           # View current status of all adapters
defcon agents           # List supported agent adapters
defcon config           # View or modify configuration
defcon sound list       # View active sound profile and imported custom audio assets
defcon sound import     # Import an audio file (.mp3, .wav, .aiff) into ~/.apl/sounds/
defcon sound set-tier   # Assign a custom sound or system sound to a risk tier
defcon sound test       # Preview sound playback for a specific tier or audio file
defcon sound reset      # Reset sound profiles back to system defaults
defcon history          # View recent agent activity audit log
defcon mcp              # Start the Model Context Protocol (MCP) server
npm run demo            # Run an interactive stall & permission simulation
```

---

### 3. Custom Audio & Sound Profiles

APL lets you customize alert sounds per tier or upload your own audio files:

```bash
# 1. View current sound profile and macOS/system sound library
defcon sound list

# 2. Test built-in system alert sounds
defcon sound test --name Basso
defcon sound test --name Hero

# 3. Import a custom audio file and assign to HIGH risk tier
defcon sound import ./assets/loud-siren.mp3 --tier high --name siren

# 4. Assign a sound to the STALL alert (35s blocked alarm)
defcon sound set-tier stall Basso

# 5. Preview the stall alarm audio
defcon sound test --tier stall

# 6. Reset sounds back to defaults
defcon sound reset
```

---

### 4. VS Code Extension & Status Bar Monitor (`vscode-apl`)

A dedicated, lightweight extension package located in [`packages/vscode-apl`](packages/vscode-apl/) gives you persistent, glanceable status-bar visibility into your coding agents' risk levels, pending approvals, and execution history directly inside VS Code:

#### Live Status Bar States:

- `$(shield) APL: Active` — APL daemon is running and monitoring local agents in real time.
- `$(warning) APL: 🟡 Action Pending` — Agent is waiting for developer approval on a medium-risk action.
- `$(alert) APL: 🔴 High Risk` — High-risk command pending developer approval (warning/error background).
- `$(circle-slash) APL: Inactive` — Daemon is stopped; clicking prompts to run `defcon start`.

#### VS Code Command Palette Actions:

- **`APL: Check Daemon Status`** (`apl.checkStatus`) — Displays current daemon health and active pending command details.
- **`APL: Show Recent Audit Logs`** (`apl.showAuditLog`) — Interactive QuickPick viewer of recent agent tool interceptions, risk levels, and timestamps.
- **`APL: Open Configuration`** (`apl.openConfig`) — Opens `~/.apl/config.json` directly in the editor.
- **`APL: Test Audio Alert Preview`** (`apl.testAlert`) — Plays a sample alert audio preview.

#### Build & Install Extension:

```bash
cd packages/vscode-apl
npm install
npm run build
npx vsce package --no-dependencies
code --install-extension defcon-vscode-0.1.0.vsix
```

---

## Manual Configuration (Optional)

If you prefer manual configuration instead of `defcon setup`:

### Claude Code Setup

Add to `~/.claude/settings.json`:

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
      { "matcher": "", "hooks": [{ "type": "command", "command": "cat >> ~/.apl/inbox.jsonl" }] }
    ]
  }
}
```

### Gemini CLI Setup

See `gemini-cli-hooks.json.example` in the repository.

### Kiro IDE Setup

Kiro is automatically monitored via live session stream files in `~/.kiro/sessions/`. Optional workspace hooks can also be placed in `.kiro/hooks/apl-hooks.json`.

### Antigravity / Cursor / Claude Desktop / Cline (MCP Standard)

Add to your MCP configuration file (e.g. `~/.gemini/config/mcp_config.json`, `.cursor/mcp.json`, or Cline's `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "agent-permission-layer": {
      "command": "node",
      "args": ["/path/to/Agents-Permission/dist/mcp/index.js"]
    }
  }
}
```

_(Note: `defcon setup` automatically detects and configures Claude, Cursor, Antigravity, and Cline without manual editing)._

---

## Configuration (`~/.apl/config.json`)

```json
{
  "version": "0.2.0",
  "stallAlertSeconds": 35,
  "whitelistSafetyTimeoutSeconds": 75,
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
      "stall": "~/.apl/sounds/siren.mp3",
      "high": "~/.apl/sounds/siren.mp3"
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

## Risk Levels & Decision Policy

| Level         | Examples                                                        | Default Action                      |
| ------------- | --------------------------------------------------------------- | ----------------------------------- |
| **Low**       | `git status`, `npm test`, `ls`, `cat`                           | Pass-through / Auto-Approve         |
| **Medium**    | `npm install`, `git push`, `docker run`                         | 35s Stall Timer + Audible Alarm     |
| **High**      | `git reset --hard`, `sudo`, `curl \| sh`                        | 35s Stall Timer + Loud Urgent Alarm |
| **Blacklist** | `rm -rf /`, `mkfs.`, `git push --force origin main`, fork bombs | Immediate HARD BLOCK (`deny`)       |

---

## Privacy & Security

- **What it reads:** Hook payloads, session interaction metadata, and MCP tool parameters (command name, tool type, session ID).
- **What it stores:** Local SQLite event audit log only (`~/.apl/events.db`) and custom sound assets in `~/.apl/sounds/`.
- **What it never transmits:** Command output, file contents, credentials, or any telemetry to remote servers.

---

## Documentation & Roadmap

- **[Future Architecture & Roadmap](FUTURE_PLANS.md)** — Specifications for Tauri Native Tray Companion, Recurring Stall Reminders (11D), Local LLM Intent Explanations (13B), and GitOps Enterprise Policies (14).

---

## License

MIT
