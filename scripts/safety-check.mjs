#!/usr/bin/env node
import { runProcess } from '../dist/core/fsx.js';

const shards = [
  ['node', ['--test', 'test/unit/db-safety.test.mjs', 'test/unit/db-safety-golden.test.mjs']],
  ['node', ['--test', 'test/integration/hooks-replay.test.mjs', 'test/unit/hooks-replay-policy.test.mjs', 'test/unit/hook-command-output.test.mjs']],
  ['node', ['--test', 'test/unit/proof-redaction.test.mjs', 'test/unit/codex-access-token-redaction.test.mjs']]
];

const results = [];
for (const [cmd, args] of shards) {
  const result = await runProcess(cmd, args, {
    cwd: process.cwd(),
    timeoutMs: 60_000,
    maxOutputBytes: 512 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' }
  });
  results.push({ command: [cmd, ...args].join(' '), ok: result.code === 0, code: result.code, stderr_tail: result.stderr.slice(-1000), stdout_tail: result.stdout.slice(-1000) });
}
const ok = results.every((row) => row.ok);
console.log(JSON.stringify({ schema: 'sks.safety-check.v1', ok, results }, null, 2));
if (!ok) process.exitCode = 1;
