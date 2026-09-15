# Security Policy and Architecture

## Table of Contents

1. [Overview](#overview)
2. [Security Model](#security-model)
3. [OWASP Agentic Application Security Alignment](#owasp-agentic-application-security-alignment)
4. [Threat Model](#threat-model)
5. [Privacy Guarantees](#privacy-guarantees)
6. [Reporting Security Vulnerabilities](#reporting-security-vulnerabilities)
7. [Security Best Practices](#security-best-practices)

---

## Overview

The Agent Permission Layer (DEFCON) is designed as a local-first security infrastructure for autonomous AI coding agents. This document outlines the security architecture, threat mitigation strategies, and alignment with industry-standard security frameworks.

### Core Security Principles

DEFCON operates on three foundational security principles:

1. **Local-First Architecture**: All data processing, storage, and decision-making occurs exclusively on the developer's local machine. No data is transmitted to external services or cloud providers.

2. **Deterministic Evaluation**: Risk classification is performed using deterministic pattern matching without reliance on external APIs, language models, or probabilistic systems that could introduce variability or availability dependencies.

3. **Defense in Depth**: Multiple layers of protection work in concert—blacklist enforcement, whitelist bypass controls, risk-based classification, and real-time monitoring—to prevent unauthorized or dangerous command execution.

---

## Security Model

### Architecture Overview

DEFCON implements a multi-layer security architecture that intercepts and evaluates agent commands before execution:

```
Agent Command Request
    ↓
Lifecycle Hook Interception
    ↓
Event Bus (Local IPC)
    ↓
Policy Hierarchy Evaluation:
  1. Enterprise Blacklist (Hard Block)
  2. Local Blacklist (Hard Block)
  3. Whitelist (Bypass with Drift Detection)
  4. Risk Classification Engine
    ↓
Audit Logging (SQLite)
    ↓
User Notification (If Required)
    ↓
Command Execution or Block
```

### Key Security Components

#### 1. Deterministic Risk Classification Engine

The risk classification engine evaluates commands using a deterministic rule-based system implemented in `src/risk/classify.ts` and `src/risk/rules.ts`. This approach ensures:

- Consistent, reproducible risk assessments
- Sub-millisecond evaluation latency (median: 1.54 microseconds)
- Zero dependency on external network services
- No exposure to adversarial ML model attacks

Risk levels are assigned as follows:

- **Low Risk**: Read-only operations with no state modification (e.g., `git status`, `ls`, `cat`)
- **Medium Risk**: State-modifying operations with limited scope (e.g., `npm install`, `git commit`, file edits)
- **High Risk**: Potentially destructive operations requiring explicit approval (e.g., `rm -rf`, `sudo`, database drops)
- **Blacklist**: Unconditionally prohibited commands that pose catastrophic risk (e.g., `rm -rf /`, `mkfs`, fork bombs)

#### 2. Hierarchical Policy Engine

The policy engine implements a strict hierarchy of rules evaluated in the following order:

1. **Enterprise Blacklist**: Organization-level prohibited commands (highest priority)
2. **Local Blacklist**: User-defined prohibited commands
3. **Whitelist**: Approved commands that bypass risk evaluation
4. **Risk-Based Policy**: Dynamically evaluated based on command classification

This hierarchy ensures that security policies cannot be bypassed through configuration manipulation or agent behavior.

#### 3. Pre-Execution Interception

Commands are intercepted before execution through multiple integration mechanisms:

- **Terminal CLI Agents** (Claude Code, Gemini CLI): Native lifecycle hooks inject interception points into the agent's command execution pipeline
- **GUI/IDE Agents** (Kiro IDE, Antigravity): Real-time transcript monitoring detects pending commands before execution
- **MCP-Integrated Agents** (Cursor, Cline): Stdio-based proxy intercepts tool invocation requests

All interception occurs synchronously in the critical execution path, preventing time-of-check-to-time-of-use vulnerabilities.

#### 4. Audit Trail and Forensics

Every intercepted command is recorded in a local SQLite database (`~/.apl/events.db`) with the following information:

- Agent identifier
- Command text
- Risk level
- Timestamp
- Session identifier
- User decision (approved/denied)
- Execution outcome

This audit trail supports:

- Post-incident forensic analysis
- Compliance reporting
- Behavioral pattern analysis
- Anomaly detection

Audit records are stored locally and never transmitted externally, ensuring data sovereignty and privacy.

---

## OWASP Agentic Application Security Alignment

DEFCON's architecture aligns with the OWASP Top 10 for Agentic Applications (2026 Edition), addressing key risks associated with autonomous AI systems.

### ASI02: Tool Misuse and Exploitation

**Risk Description**: Autonomous agents may invoke tools or execute commands in ways that exceed their intended scope, either through misconfiguration, adversarial prompts, or emergent behavior patterns.

**DEFCON Mitigation**:

- **Deterministic Risk Classification**: Every command is evaluated against a comprehensive rule set before execution. Pattern matching identifies potentially dangerous operations (privilege escalation, data destruction, credential access) regardless of the context in which the agent invokes them.

- **Catastrophic Blacklist Enforcement**: A hardcoded blacklist unconditionally blocks commands that pose existential risk to system integrity (`rm -rf /`, `mkfs`, process fork bombs). These commands are rejected immediately without user intervention.

- **Command Chaining Detection**: Compound commands separated by shell operators (`;`, `&&`, `||`) are decomposed and evaluated individually. The highest risk classification among subcommands determines the overall risk level, preventing circumvention through chaining.

**Implementation**: `src/risk/classify.ts`, `src/risk/rules.ts`, `src/risk/policy.ts`

---

### ASI03: Identity and Privilege Abuse

**Risk Description**: Agents may attempt to access credentials, escalate privileges, or impersonate users to gain unauthorized access to systems or data.

**DEFCON Mitigation**:

- **Privilege Escalation Detection**: Commands containing `sudo`, `su`, `doas`, or other privilege escalation mechanisms are automatically classified as high-risk and require explicit user approval.

- **Credential Access Prevention**: File operations targeting known credential stores (`.env`, `.ssh/id_rsa`, `credentials.json`, password managers) trigger high-risk alerts.

- **Multi-Tier Policy Hierarchy**: The policy engine enforces a strict precedence order (Enterprise Blacklist > Local Blacklist > Whitelist > Risk Engine) that cannot be overridden by agent behavior or configuration drift.

- **Whitelist Drift Detection**: Commands that appear on the whitelist but fail to execute within the expected timeframe trigger a dedicated alert, indicating potential configuration tampering or environment changes.

**Implementation**: `src/risk/policy.ts`, `src/core/stallTimer.ts`

---

### ASI05: Unexpected Code Execution

**Risk Description**: Agents may execute code in unexpected contexts, spawn unintended processes, or trigger side effects beyond the user's awareness or consent.

**DEFCON Mitigation**:

- **Pre-Execution Interception**: All commands are captured before execution through native lifecycle hooks or real-time transcript monitoring. This synchronous interception prevents execution without prior evaluation.

- **Eval and Dynamic Execution Detection**: Commands containing `eval`, `exec`, pipe-to-shell patterns (`curl | sh`), or script downloads followed by execution are flagged as high-risk.

- **Shell Context Isolation**: Commands are evaluated with awareness of shell operators, subshells, and command substitution to prevent hidden execution through nested contexts.

**Implementation**: `src/adapters/claudeCode.ts`, `src/adapters/geminiCli.ts`, `src/adapters/antigravityTranscript.ts`, `src/adapters/kiro.ts`, `src/mcp/server.ts`

---

### ASI08: Cascading Failures and Deadlocks

**Risk Description**: Agents may enter indefinite wait states, create runaway execution loops, or trigger cascading failures that propagate silently without user awareness.

**DEFCON Mitigation**:

- **Dynamic Stall Detection**: A configurable timer monitors pending commands that remain unapproved. After a threshold period (default: 35 seconds), acoustic alerts escalate in urgency to prevent indefinite blocking.

- **Multi-Tier Acoustic Escalation**: Alerts progress through three escalation levels (initial, urgent, critical) with increasing volume and frequency to ensure developer awareness regardless of focus state.

- **Session Correlation**: Stall detection is session-aware, automatically canceling timers when the agent proceeds or the user responds. This prevents notification fatigue from false positives.

- **Whitelist Drift Detection**: Commands marked as auto-approved but failing to execute trigger a separate alert indicating potential environment drift or configuration inconsistencies.

**Implementation**: `src/core/stallTimer.ts`, `src/notify/soundManager.ts`

---

### ASI10: Rogue Agents and Traceability

**Risk Description**: Agents may exhibit unexpected or malicious behavior without sufficient logging, making post-incident analysis difficult or impossible.

**DEFCON Mitigation**:

- **Comprehensive Audit Trail**: Every intercepted command, user decision, and execution outcome is recorded in a local SQLite database with millisecond-precision timestamps.

- **Tamper-Resistant Logging**: Audit records are written to an append-only structure with indexed queries for efficient forensic analysis. The database is stored in a known location (`~/.apl/events.db`) that can be backed up or monitored independently.

- **Developer Path Sanitization**: All file paths in audit logs are automatically sanitized to replace home directory references with tilde notation (`~`), preventing accidental exposure of developer-specific directory structures in shared logs or screenshots.

- **Behavioral Pattern Analysis**: The audit database supports rich queries for identifying anomalous patterns, such as sudden increases in high-risk commands, unusual command distributions, or agent-specific behavioral changes.

- **Zero-Cloud Architecture**: All audit data remains on the local machine. No logs, commands, or telemetry are transmitted to external services, ensuring complete data sovereignty.

**Implementation**: `src/storage/sqliteStore.ts`, `src/storage/analytics.ts`, `src/core/pathSanitizer.ts`

---

## Threat Model

### In-Scope Threats

DEFCON is designed to mitigate the following threat scenarios:

#### 1. Accidental Destruction

**Scenario**: An agent misinterprets a user request and executes a destructive command (e.g., deleting production data, force-pushing to the wrong branch).

**Mitigation**: High-risk commands require explicit user approval. Blacklisted commands are blocked unconditionally. Real-time monitoring ensures the user is alerted before execution.

#### 2. Prompt Injection Attacks

**Scenario**: An attacker embeds malicious instructions in data consumed by the agent (documentation, code comments, external APIs), causing the agent to execute unintended commands.

**Mitigation**: Deterministic risk classification evaluates commands based solely on their syntax and semantics, not on the context or rationale provided by the agent. Dangerous patterns are detected regardless of how the agent justifies them.

#### 3. Privilege Escalation

**Scenario**: An agent attempts to execute commands with elevated privileges to bypass system restrictions or access protected resources.

**Mitigation**: All privilege escalation attempts (`sudo`, `su`, `doas`) are flagged as high-risk and require explicit approval. Credential access patterns trigger alerts.

#### 4. Supply Chain Attacks

**Scenario**: A compromised dependency or malicious package causes the agent to execute arbitrary code during installation or build processes.

**Mitigation**: Package installation commands (`npm install`, `pip install`) are classified as medium-risk and monitored. Execution of scripts downloaded from external sources triggers high-risk alerts.

#### 5. Configuration Drift

**Scenario**: Whitelist or policy configurations diverge from the developer's expectations due to manual edits, file corruption, or synchronization issues.

**Mitigation**: Whitelist drift detection alerts the user when approved commands fail to execute promptly, indicating potential environment or configuration changes.

### Out-of-Scope Threats

The following threats are explicitly out of scope for DEFCON:

- **Network-Level Attacks**: DEFCON operates at the command execution layer and does not inspect network traffic or API calls made by agents.

- **Model Jailbreaking**: DEFCON does not attempt to prevent or detect adversarial prompts that manipulate the agent's language model. Mitigation occurs at the command execution layer regardless of the agent's reasoning.

- **Data Exfiltration**: DEFCON does not monitor or prevent agents from reading sensitive files or transmitting data through legitimate network operations. It focuses on preventing destructive or unauthorized command execution.

- **Zero-Day Exploits**: DEFCON relies on pattern-based detection and cannot protect against unknown vulnerabilities in system software or dependencies.

---

## Privacy Guarantees

DEFCON is architected to ensure complete data sovereignty and privacy:

### 1. Zero External Transmission

No data leaves the developer's local machine. Specifically:

- Command text
- File paths
- Agent interactions
- User decisions
- Audit logs
- Configuration settings

All processing, storage, and decision-making occur locally. There are no analytics endpoints, telemetry services, or cloud backends.

### 2. Loopback-Only Networking

All inter-process communication occurs over loopback interfaces bound to `127.0.0.1`. The desktop system tray companion and VS Code extension communicate with the daemon exclusively over local WebSocket connections that cannot be accessed remotely.

### 3. Path Sanitization

Home directory paths are automatically sanitized in all user-facing output:

- Audit logs
- Terminal output
- WebSocket messages
- Desktop notifications
- JSON exports

Paths are normalized to tilde notation (e.g., `/Users/developer/project` becomes `~/project`) to prevent accidental disclosure of system-specific directory structures.

### 4. No Credential Storage

DEFCON does not store, transmit, or process credentials, API keys, or authentication tokens. It operates purely on command syntax and does not require access to sensitive data.

### 5. Subprocess Isolation

The daemon and companion processes execute with the same privileges as the invoking user. No elevated permissions are required or requested. All file operations respect standard filesystem permissions.

---

## Reporting Security Vulnerabilities

We take security vulnerabilities seriously and appreciate responsible disclosure.

### Reporting Process

If you discover a security vulnerability in DEFCON, please report it by:

1. **Email**: Send a detailed report to the maintainer at the email address listed in the repository.
2. **Subject Line**: Use "SECURITY: [Brief Description]" as the subject line.
3. **Details**: Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested mitigation (if known)

### Response Timeline

- **Acknowledgment**: We will acknowledge receipt within 48 hours.
- **Assessment**: We will assess the severity and exploitability within 5 business days.
- **Resolution**: Critical vulnerabilities will be addressed in an emergency patch. Non-critical issues will be resolved in the next scheduled release.
- **Disclosure**: We will coordinate public disclosure with you after a patch is available.

### Scope

The following are considered in-scope for security reports:

- Command injection or bypass of risk classification
- Privilege escalation or unauthorized execution
- Data exfiltration through audit logs or output
- Path traversal or unauthorized file access
- Denial of service through resource exhaustion
- Bypass of blacklist enforcement

The following are considered out-of-scope:

- Vulnerabilities in third-party dependencies (report to the upstream maintainer)
- Social engineering attacks targeting users
- Physical access attacks
- Vulnerabilities requiring pre-existing malware on the system

### Recognition

We maintain a security acknowledgments section in the repository. With your permission, we will credit you for responsible disclosure once a patch is released.

---

## Security Best Practices

### For Users

1. **Keep DEFCON Updated**: Apply updates promptly to receive the latest security fixes and risk classification rules.

2. **Review Blacklist Regularly**: Periodically review your local blacklist (`~/.apl/config.json`) to ensure it reflects your current security requirements.

3. **Monitor Audit Logs**: Use `defcon audit --risk high` to review high-risk commands intercepted by the system. Investigate unexpected patterns.

4. **Limit Whitelist Entries**: Minimize the number of auto-approved commands. Overly permissive whitelists reduce the effectiveness of risk classification.

5. **Verify Agent Sources**: Only use agents from trusted sources. DEFCON cannot protect against malicious agents that bypass its interception mechanisms.

6. **Backup Audit Database**: The audit database (`~/.apl/events.db`) is a valuable forensic resource. Include it in your backup strategy.

### For Developers

1. **Test Risk Classification**: When contributing new risk rules, include test cases in `test/risk/classify.test.ts` and verify accuracy against the benchmark dataset.

2. **Sanitize Paths**: Use the `sanitizePath` utility (`src/core/pathSanitizer.ts`) for all user-facing output to prevent accidental path disclosure.

3. **Avoid External Dependencies**: Maintain the zero-dependency principle for the risk classification engine. All evaluation must occur locally without network calls.

4. **Document Policy Changes**: Changes to the policy hierarchy or blacklist enforcement must be documented in this security policy and reviewed for unintended consequences.

5. **Audit Logging**: All new interception points must include audit logging to maintain traceability.

---

## Conclusion

DEFCON provides a robust, local-first security layer for autonomous AI coding agents. By combining deterministic risk classification, hierarchical policy enforcement, and comprehensive audit trails, it mitigates key risks identified in the OWASP Top 10 for Agentic Applications while maintaining complete data sovereignty and privacy.

For questions or clarifications regarding this security policy, please open an issue in the repository or contact the maintainers directly.

---

**Document Version**: 1.0  
**Last Updated**: September 15, 2026  
**Next Review**: March 15, 2027
