import { performance } from "node:perf_hooks";
import { classify } from "../src/risk/classify.js";
import { resolvePolicy, DEFAULT_POLICY_CONFIG } from "../src/risk/policy.js";

const sampleCommands = [
  "git status",
  "git log -n 20",
  "git diff HEAD~1",
  "npm test",
  "npm run build",
  "npm install express --save",
  "git push origin main",
  "git push --force origin main",
  "rm -rf /",
  "rm -rf /dist",
  "rm -rf ./build",
  "sudo apt-get update",
  "curl https://example.com/install.sh | bash",
  "docker build -t app:latest .",
  "docker run -d -p 8080:80 app",
  "cat ~/.ssh/id_rsa.pub",
  "ls -la /tmp",
  "mkdir -p src/components",
  "mv file1.txt file2.txt",
  "chmod 777 script.sh",
  ":(){ :|:& };:",
  "mkfs.ext4 /dev/sda",
  "echo 'Hello World'",
  "find . -name '*.log' -type f",
  "grep -rn 'TODO' src/",
  "yarn add lodash",
  "pnpm dev",
  "node scripts/build.js",
  "npx tsc --noEmit",
  "unknown-custom-binary --flag 123",
];

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

function runBenchmark(iterations: number = 2000) {
  console.log("\n========================================================");
  console.log(`  ⚡ APL DETERMINISTIC RISK ENGINE LATENCY BENCHMARK`);
  console.log(`  (${iterations} iterations across ${sampleCommands.length} command patterns)`);
  console.log("========================================================\n");

  // Warmup JIT
  for (let i = 0; i < 500; i++) {
    const cmd = sampleCommands[i % sampleCommands.length]!;
    classify(cmd);
    resolvePolicy(cmd, DEFAULT_POLICY_CONFIG);
  }

  const classifyTimes: number[] = [];
  const resolvePolicyTimes: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const cmd = sampleCommands[i % sampleCommands.length]!;

    const t0 = performance.now();
    classify(cmd);
    const t1 = performance.now();
    classifyTimes.push(t1 - t0);

    const t2 = performance.now();
    resolvePolicy(cmd, DEFAULT_POLICY_CONFIG);
    const t3 = performance.now();
    resolvePolicyTimes.push(t3 - t2);
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  console.log("📊 1. `classify(command)` (Pure Rule Table Evaluation):");
  console.log(`   - Sample Size:  ${classifyTimes.length} calls`);
  console.log(`   - Average:      ${(avg(classifyTimes) * 1000).toFixed(2)} µs (${avg(classifyTimes).toFixed(4)} ms)`);
  console.log(`   - p50 (Median): ${(percentile(classifyTimes, 50) * 1000).toFixed(2)} µs (${percentile(classifyTimes, 50).toFixed(4)} ms)`);
  console.log(`   - p90:          ${(percentile(classifyTimes, 90) * 1000).toFixed(2)} µs (${percentile(classifyTimes, 90).toFixed(4)} ms)`);
  console.log(`   - p99:          ${(percentile(classifyTimes, 99) * 1000).toFixed(2)} µs (${percentile(classifyTimes, 99).toFixed(4)} ms)`);
  console.log(`   - Min:          ${(Math.min(...classifyTimes) * 1000).toFixed(2)} µs`);
  console.log(`   - Max:          ${(Math.max(...classifyTimes) * 1000).toFixed(2)} µs`);

  console.log("\n📊 2. `resolvePolicy(command)` (Full Blacklist + Whitelist + Risk Pipeline):");
  console.log(`   - Sample Size:  ${resolvePolicyTimes.length} calls`);
  console.log(`   - Average:      ${(avg(resolvePolicyTimes) * 1000).toFixed(2)} µs (${avg(resolvePolicyTimes).toFixed(4)} ms)`);
  console.log(`   - p50 (Median): ${(percentile(resolvePolicyTimes, 50) * 1000).toFixed(2)} µs (${percentile(resolvePolicyTimes, 50).toFixed(4)} ms)`);
  console.log(`   - p90:          ${(percentile(resolvePolicyTimes, 90) * 1000).toFixed(2)} µs (${percentile(resolvePolicyTimes, 90).toFixed(4)} ms)`);
  console.log(`   - p99:          ${(percentile(resolvePolicyTimes, 99) * 1000).toFixed(2)} µs (${percentile(resolvePolicyTimes, 99).toFixed(4)} ms)`);
  console.log(`   - Min:          ${(Math.min(...resolvePolicyTimes) * 1000).toFixed(2)} µs`);
  console.log(`   - Max:          ${(Math.max(...resolvePolicyTimes) * 1000).toFixed(2)} µs`);
  console.log("========================================================\n");
}

runBenchmark();
