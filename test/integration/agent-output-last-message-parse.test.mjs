import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCodexExecAgent } from '../../dist/core/agents/agent-runner-codex-exec.js';

test('codex exec backend parses output-last-message JSON file', async () => {
  const { root, fakeCodex } = await writeFakeCodex(`#!/usr/bin/env node
import fs from 'node:fs';
const outIndex = process.argv.indexOf('--output-last-message');
const out = outIndex >= 0 ? process.argv[outIndex + 1] : null;
if (!out) process.exit(2);
fs.writeFileSync(out, JSON.stringify({
  schema: 'sks.agent-result.v1',
  status: 'done',
  summary: 'parsed from output-last-message',
  artifacts: [],
  blockers: [],
  writes: [],
  verification: { status: 'passed', checks: [] }
}));
`);
  const result = await runCodexExecAgent(
    { id: 'agent_1', session_id: 'session_1', persona_id: 'persona_1' },
    { id: 'slice_1', description: 'parse fixture' },
    { cwd: root, agentRoot: root, missionId: 'M-output-last-message', dryRun: false, codexBin: fakeCodex }
  );
  assert.equal(result.status, 'done');
  assert.equal(result.backend, 'codex-exec');
  assert.equal(result.summary, 'parsed from output-last-message');
  assert.equal(result.blockers.includes('codex_exec_output_last_message_missing_or_invalid'), false);
  assert.ok(result.verification.checks.includes('codex-exec-output-last-message'));
  assert.ok(result.verification.checks.includes('agent-result-schema'));
  assert.ok(result.artifacts.some((file) => String(file).endsWith(path.join('sessions', 'agent_1', 'agent-result.json'))));
  assert.equal(await fileExists(path.join(root, 'session_1-agent-result.json')), false);
});

test('codex exec backend marks missing output-last-message as verified_partial', async () => {
  const { root, fakeCodex } = await writeFakeCodex(`#!/usr/bin/env node
console.log('no result file written');
`);
  const result = await runCodexExecAgent(
    { id: 'agent_1', session_id: 'session_1', persona_id: 'persona_1' },
    { id: 'slice_1', description: 'missing fixture' },
    { cwd: root, agentRoot: root, missionId: 'M-output-last-message-missing', dryRun: false, codexBin: fakeCodex }
  );
  assert.equal(result.status, 'done');
  assert.equal(result.confidence, 'verified_partial');
  assert.ok(result.blockers.includes('codex_exec_output_last_message_missing_or_invalid'));
  assert.ok(result.unverified.includes('codex-exec stdout fallback; resultFile JSON missing or invalid'));
});

test('codex exec backend marks invalid output-last-message JSON as verified_partial', async () => {
  const { root, fakeCodex } = await writeFakeCodex(`#!/usr/bin/env node
import fs from 'node:fs';
const out = process.argv[process.argv.indexOf('--output-last-message') + 1];
fs.writeFileSync(out, '{not-json');
`);
  const result = await runCodexExecAgent(
    { id: 'agent_1', session_id: 'session_1', persona_id: 'persona_1' },
    { id: 'slice_1', description: 'invalid fixture' },
    { cwd: root, agentRoot: root, missionId: 'M-output-last-message-invalid', dryRun: false, codexBin: fakeCodex }
  );
  assert.equal(result.status, 'done');
  assert.equal(result.confidence, 'verified_partial');
  assert.ok(result.blockers.includes('codex_exec_output_last_message_missing_or_invalid'));
});

test('codex exec backend blocks schema-invalid output-last-message JSON', async () => {
  const { root, fakeCodex } = await writeFakeCodex(`#!/usr/bin/env node
import fs from 'node:fs';
const out = process.argv[process.argv.indexOf('--output-last-message') + 1];
fs.writeFileSync(out, JSON.stringify({
  schema: 'sks.agent-result.v1',
  status: '',
  summary: 'schema invalid',
  artifacts: [],
  blockers: [],
  writes: [],
  verification: { status: 'passed', checks: [] }
}));
`);
  const result = await runCodexExecAgent(
    { id: 'agent_1', session_id: 'session_1', persona_id: 'persona_1' },
    { id: 'slice_1', description: 'schema invalid fixture' },
    { cwd: root, agentRoot: root, missionId: 'M-output-last-message-schema-invalid', dryRun: false, codexBin: fakeCodex }
  );
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('codex_exec_result_schema_invalid'));
  assert.ok(result.blockers.some((blocker) => blocker.startsWith('schema_invalid:')));
});

async function writeFakeCodex(source) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-output-last-message-'));
  const fakeCodex = path.join(root, 'fake-codex.mjs');
  await fs.writeFile(fakeCodex, source, 'utf8');
  await fs.chmod(fakeCodex, 0o755);
  return { root, fakeCodex };
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
