# Agent Permission Layer (APL / DEFCON) — VS Code Extension

Real-time security and stall alerting monitor for autonomous coding agents (Claude Code, Gemini CLI, Cline, Continue, and GitHub Copilot).

## Features

- **Live Status Bar Badge:** Real-time indicator in the VS Code status bar showing current agent execution risk and pending approvals:
  - `$(shield) APL: Active` — Daemon active and monitoring local agents.
  - `$(alert) APL: 🔴 High Risk` — High-risk command pending developer approval.
  - `$(warning) APL: 🟡 Action Pending` — Medium-risk action pending developer approval.
  - `$(circle-slash) APL: Inactive` — Daemon is stopped.
- **Audit Log Inspector:** Instant QuickPick history of recent agent commands, risk classification tiers, and timestamps.
- **Commands:**
  - `APL: Check Daemon Status` (`apl.checkStatus`)
  - `APL: Show Recent Audit Logs` (`apl.showAuditLog`)
  - `APL: Open Configuration` (`apl.openConfig`)
  - `APL: Test Audio Alert Preview` (`apl.testAlert`)

## Requirements

The extension connects to the local APL daemon. Start the daemon with:
```bash
defcon start
# or
npm run dev -- start
```
