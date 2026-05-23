import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMission } from '../../src/core/mission.mjs';
import { runFiveScoutIntake } from '../../src/core/scouts/scout-runner.mjs';

test('real parallel parse failure blocks the scout gate', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-parse-fail-'));
  const fakeCodex = path.join(root, 'fake-codex.mjs');
  await fs.writeFile(fakeCodex, [
    '#!/usr/bin/env node',
    'import fs from "node:fs";',
    'if (process.argv.includes("--version")) { console.log("codex-test 0.0.0"); process.exit(0); }',
    'const outFlag = process.argv.indexOf("--output-last-message");',
    'const outputFile = outFlag >= 0 ? process.argv[outFlag + 1] : null;',
    'fs.writeFileSync(outputFile, "not parseable", "utf8");'
  ].join('\n'), 'utf8');
  await fs.chmod(fakeCodex, 0o755);
  const previous = process.env.SKS_CODEX_BIN;
  process.env.SKS_CODEX_BIN = fakeCodex;
  try {
    const { id } = await createMission(root, { mode: 'team', prompt: 'parse failure fixture' });
    const run = await runFiveScoutIntake(root, {
      missionId: id,
      route: '$Team',
      task: 'parse failure fixture',
      engine: 'codex-exec-parallel',
      requireRealParallel: true
    });
    assert.equal(run.ok, false);
    assert.ok(run.gate.blockers.some((blocker) => blocker.startsWith('scout_output_parse_failed:')));
    assert.equal(run.consensus.status, 'blocked');
    assert.ok(run.consensus.source_policy.rejected_schema_invalid_count > 0);
  } finally {
    if (previous === undefined) delete process.env.SKS_CODEX_BIN;
    else process.env.SKS_CODEX_BIN = previous;
  }
});

test('codex scout network outage records unavailable evidence and falls back without live claims', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-network-fallback-'));
  const fakeCodex = path.join(root, 'fake-codex.mjs');
  await fs.writeFile(fakeCodex, [
    '#!/usr/bin/env node',
    'if (process.argv.includes("--version")) { console.log("codex-test 0.0.0"); process.exit(0); }',
    'if (process.argv.includes("--help")) { console.log("codex exec help --output-last-message"); process.exit(0); }',
    'console.error("stream disconnected before completion: failed to lookup address information: nodename nor servname provided, or not known");',
    'process.exit(1);'
  ].join('\n'), 'utf8');
  await fs.chmod(fakeCodex, 0o755);
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  const previous = process.env.SKS_CODEX_BIN;
  process.env.SKS_CODEX_BIN = fakeCodex;
  try {
    const { id, dir } = await createMission(root, { mode: 'team', prompt: 'network fallback fixture' });
    const run = await runFiveScoutIntake(root, {
      missionId: id,
      route: '$Team',
      task: 'network fallback fixture',
      engine: 'codex-exec-parallel'
    });
    assert.equal(run.ok, true);
    assert.equal(run.effective_engine, 'local-static');
    assert.equal(run.performance.claim_allowed, false);
    const unavailable = JSON.parse(await fs.readFile(path.join(dir, 'scout-engine-unavailable.json'), 'utf8'));
    assert.equal(unavailable.unavailable, true);
    assert.equal(unavailable.failed_jobs.length, 5);
    assert.equal(run.consensus.source_policy.synthetic_static_used, true);
  } finally {
    if (previous === undefined) delete process.env.SKS_CODEX_BIN;
    else process.env.SKS_CODEX_BIN = previous;
  }
});
