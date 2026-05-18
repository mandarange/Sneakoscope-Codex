import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectCodexAppSubagents } from '../../src/core/scouts/engines/scout-engine-detect.mjs';
import { validateCodexAppSubagentCapability } from '../../src/core/scouts/engines/codex-app-subagent-engine.mjs';

test('env flag alone does not make codex-app-subagents available', async () => {
  const oldFlag = process.env.SKS_CODEX_APP_SUBAGENTS;
  const oldFile = process.env.SKS_CODEX_APP_SUBAGENTS_CAPABILITY_FILE;
  process.env.SKS_CODEX_APP_SUBAGENTS = '1';
  delete process.env.SKS_CODEX_APP_SUBAGENTS_CAPABILITY_FILE;
  try {
    const detected = await detectCodexAppSubagents(process.cwd());
    assert.equal(detected.available, false);
    assert.match(detected.reason, /capability_file_missing/);
  } finally {
    if (oldFlag === undefined) delete process.env.SKS_CODEX_APP_SUBAGENTS;
    else process.env.SKS_CODEX_APP_SUBAGENTS = oldFlag;
    if (oldFile === undefined) delete process.env.SKS_CODEX_APP_SUBAGENTS_CAPABILITY_FILE;
    else process.env.SKS_CODEX_APP_SUBAGENTS_CAPABILITY_FILE = oldFile;
  }
});

test('valid capability descriptor makes codex-app-subagents available', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-app-capability-'));
  const file = path.join(dir, 'capability.json');
  await fs.writeFile(file, JSON.stringify({
    schema: 'sks.codex-app-subagents-capability.v1',
    available: true,
    launch_command: ['codex', 'app', 'subagents', 'run'],
    event_schema_version: 'known-local',
    supports_output_files: true
  }), 'utf8');
  const oldFile = process.env.SKS_CODEX_APP_SUBAGENTS_CAPABILITY_FILE;
  process.env.SKS_CODEX_APP_SUBAGENTS_CAPABILITY_FILE = file;
  try {
    const detected = await detectCodexAppSubagents(process.cwd());
    assert.equal(detected.available, true);
  } finally {
    if (oldFile === undefined) delete process.env.SKS_CODEX_APP_SUBAGENTS_CAPABILITY_FILE;
    else process.env.SKS_CODEX_APP_SUBAGENTS_CAPABILITY_FILE = oldFile;
  }
});

test('invalid capability descriptor blocks', () => {
  const validation = validateCodexAppSubagentCapability({ schema: 'wrong', available: true });
  assert.equal(validation.ok, false);
  assert.ok(validation.blockers.includes('capability_schema_invalid'));
  assert.ok(validation.blockers.includes('launch_command_missing'));
});
