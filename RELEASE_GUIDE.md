# DEFCON v1.0 Release Guide

## Pre-Release Checklist

Before publishing to NPM, verify the following:

### 1. Version Bump
```bash
# Update version in package.json (currently 0.1.0 → 1.0.0)
npm version major  # 0.1.0 → 1.0.0 (for v1.0 release)
# OR manually edit package.json
```

### 2. Build Verification
```bash
# Clean previous builds
rm -rf dist/

# Full production build
npm run build

# Verify build output
ls -la dist/
ls -la dist/cli/
ls -la dist/mcp/
```

### 3. Pre-Publish Checks
```bash
# Run all quality gates
npm run typecheck
npm run lint
npm run format:check
npm test
npm run benchmark

# Dry-run packaging to see what will be published
npm pack --dry-run

# Creates a tarball to inspect actual package contents
npm pack
tar -tzf agent-permission-layer-1.0.0.tgz
```

### 4. Update Package Metadata

Verify `package.json` contains:
- Correct version (`1.0.0`)
- Complete description
- All keywords for discoverability
- Repository, bugs, homepage URLs
- License information
- Proper `files` array (only ships `dist/`, `README.md`, `LICENSE`)

---

## Publishing to NPM

### First-Time Setup

```bash
# Login to NPM (one-time setup)
npm login

# Verify you're logged in
npm whoami
```

### Publish Command

```bash
# Option 1: Publish with default tag (latest)
npm publish

# Option 2: Publish with specific access level (if scoped package)
npm publish --access public

# Option 3: Dry-run to test without publishing
npm publish --dry-run
```

### Post-Publish Verification

```bash
# Check package on NPM registry
npm view agent-permission-layer

# Install in a test directory to verify
mkdir /tmp/test-apl && cd /tmp/test-apl
npm install -g agent-permission-layer
which defcon
defcon --version
```

---

## End-to-End User Testing Guide

Run these commands as if you're a first-time user to verify everything works.

### Installation Testing

```bash
# 1. Install from NPM (after publishing)
npm install -g agent-permission-layer

# OR install from local tarball (before publishing)
npm install -g ./agent-permission-layer-1.0.0.tgz

# 2. Verify binaries are accessible
which defcon
which apl
which apl-mcp

# 3. Check version
defcon --version
apl --version
```

### Core Functionality Testing

```bash
# Test 1: Help and Documentation
defcon --help
defcon setup --help
defcon audit --help
defcon report --help

# Test 2: Configuration
defcon config
defcon config --set stallAlertSeconds=45

# Test 3: Agent Detection
defcon agents

# Test 4: Setup (Dry-Run First!)
defcon setup --dry-run

# If dry-run looks good:
defcon setup

# Test 5: Audit Log (requires existing data)
defcon audit
defcon audit --risk high
defcon audit --since 1h
defcon audit --json | jq .

# Test 6: Analytics Report (requires existing data)
defcon report
defcon report --since 7d
defcon report --agent kiro
defcon report --json | jq .

# Test 7: Sound Management
defcon sound list
defcon sound test low
defcon sound test medium
defcon sound test high

# Test 8: Status Check
defcon status

# Test 9: Start Daemon (in separate terminal)
defcon start

# Test 10: Stop Daemon (in another terminal)
defcon stop
```

### Integration Testing (With Real Agents)

```bash
# Setup for Claude Code (if installed)
cat ~/.claude/settings.json | jq .hooks

# Setup for Gemini CLI (if installed)
cat ~/gemini-cli-hooks.json

# Setup for Kiro IDE (if installed)
cat ~/.kiro/hooks/apl-hooks.json

# Verify MCP configuration (for Cline/Cursor)
cat ~/.cline/cline_mcp_settings.json | jq .
```

### Data Generation for Testing Reports

```bash
# If you have no audit data, generate some test events:
# Option 1: Run with a real agent and execute some commands
# Option 2: Manually insert test data (for testing only)

# Check if you have audit data
ls -lh ~/.apl/events.db
sqlite3 ~/.apl/events.db "SELECT COUNT(*) FROM events;"

# View sample events
sqlite3 ~/.apl/events.db "SELECT * FROM events LIMIT 5;"
```

### MCP Server Testing

```bash
# Test standalone MCP server
apl-mcp
# Should start MCP server on stdio
# Press Ctrl+C to stop

# Test MCP tools (requires MCP client like Cline)
# 1. Configure in IDE
# 2. Try invoking apl_execute_command or apl_check_permission
```

### Clean Uninstall Test

```bash
# Uninstall package
npm uninstall -g agent-permission-layer

# Verify binaries removed
which defcon  # Should return nothing

# Configuration and data remain at:
ls -la ~/.apl/
```

---

## Rollback Plan

If something goes wrong after publishing:

```bash
# Deprecate a specific version (warns users but keeps it available)
npm deprecate agent-permission-layer@1.0.0 "Use version 1.0.1 instead"

# Unpublish (only works within 72 hours, use sparingly)
npm unpublish agent-permission-layer@1.0.0
```

---

## Post-Release Tasks

### 1. Create GitHub Release

```bash
# Tag the release
git tag -a v1.0.0 -m "Release v1.0.0: Session analytics and OWASP security docs"
git push origin v1.0.0
```

Then on GitHub:
- Go to Releases → Draft a new release
- Select tag `v1.0.0`
- Title: `v1.0.0 - Session Analytics & Security Documentation`
- Description: Paste from CHANGELOG or summarize key features
- Attach tarball if desired: `agent-permission-layer-1.0.0.tgz`

### 2. Update Documentation

- Add NPM installation badge to README.md
- Update installation instructions to use NPM
- Announce on relevant channels

### 3. Monitor Initial Usage

```bash
# Check download stats (after some time)
npm view agent-permission-layer
```

---

## Troubleshooting Common Issues

### Issue: "npm publish" fails with authentication error
**Solution**: Run `npm login` again and verify credentials

### Issue: Package name already taken
**Solution**: Choose a different name or use a scoped package (`@your-org/defcon`)

### Issue: Binary not found after global install
**Solution**: 
- Check npm global bin path: `npm config get prefix`
- Ensure it's in PATH: `echo $PATH`
- Try `npm install -g agent-permission-layer --force`

### Issue: Tests fail during `npm test`
**Solution**: Fix tests before publishing. Run `npm test -- --reporter=verbose` for details

### Issue: TypeScript build errors
**Solution**: Run `npm run typecheck` and fix all type errors before publishing

---

## Quick Reference Commands

```bash
# Complete pre-release flow
npm run typecheck && npm run lint && npm test && npm run benchmark && npm run build

# Version bump
npm version major  # 0.1.0 → 1.0.0

# Publish
npm publish

# Verify
npm view agent-permission-layer

# Test install
npm install -g agent-permission-layer

# Check it works
defcon --version
defcon --help
```
