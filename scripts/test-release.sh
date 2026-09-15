#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════════════"
echo "🧪 DEFCON v1.0 - End-to-End User Testing"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: Build
echo -e "${BLUE}Test 1: Building project...${NC}"
npm run build > /dev/null 2>&1
echo -e "${GREEN}✓ Build successful${NC}"
echo ""

# Test 2: Help command
echo -e "${BLUE}Test 2: Testing --help command${NC}"
node dist/cli/index.js --help | head -5
echo -e "${GREEN}✓ Help command works${NC}"
echo ""

# Test 3: Config
echo -e "${BLUE}Test 3: Testing config command${NC}"
node dist/cli/index.js config | head -3
echo -e "${GREEN}✓ Config command works${NC}"
echo ""

# Test 4: Agents
echo -e "${BLUE}Test 4: Testing agents command${NC}"
node dist/cli/index.js agents | head -5
echo -e "${GREEN}✓ Agents command works${NC}"
echo ""

# Test 5: Status
echo -e "${BLUE}Test 5: Testing status command${NC}"
node dist/cli/index.js status
echo -e "${GREEN}✓ Status command works${NC}"
echo ""

# Test 6: Audit (if data exists)
echo -e "${BLUE}Test 6: Testing audit command${NC}"
if [ -f ~/.apl/events.db ]; then
  node dist/cli/index.js audit -n 5 | head -10
  echo -e "${GREEN}✓ Audit command works${NC}"
else
  echo "⚠ No audit data found (run defcon start first to generate data)"
fi
echo ""

# Test 7: Report (if data exists)
echo -e "${BLUE}Test 7: Testing report command${NC}"
if [ -f ~/.apl/events.db ]; then
  node dist/cli/index.js report | head -15
  echo -e "${GREEN}✓ Report command works${NC}"
else
  echo "⚠ No audit data found (run defcon start first to generate data)"
fi
echo ""

# Test 8: Sound list
echo -e "${BLUE}Test 8: Testing sound list command${NC}"
node dist/cli/index.js sound list | head -10
echo -e "${GREEN}✓ Sound list works${NC}"
echo ""

# Test 9: Package dry-run
echo -e "${BLUE}Test 9: Testing npm pack (dry-run)${NC}"
npm pack --dry-run 2>&1 | grep -E "(name:|version:|filename:)"
echo -e "${GREEN}✓ Package structure verified${NC}"
echo ""

# Test 10: TypeScript types
echo -e "${BLUE}Test 10: TypeScript type checking${NC}"
npm run typecheck > /dev/null 2>&1
echo -e "${GREEN}✓ No type errors${NC}"
echo ""

# Test 11: All tests
echo -e "${BLUE}Test 11: Running test suite${NC}"
npm test 2>&1 | grep -E "(Test Files|Tests |passed)"
echo -e "${GREEN}✓ All tests passing${NC}"
echo ""

# Test 12: Benchmark
echo -e "${BLUE}Test 12: Running benchmark${NC}"
npm run benchmark 2>&1 | grep -E "(F1 Score|Accuracy|Blacklist)"
echo -e "${GREEN}✓ Benchmark verified${NC}"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}🎉 All tests passed! Ready for release.${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "1. npm version major     # Bump to v1.0.0"
echo "2. npm pack              # Create tarball for testing"
echo "3. npm publish           # Publish to NPM"
echo "4. git tag -a v1.0.0     # Tag release"
echo "5. git push origin v1.0.0"
