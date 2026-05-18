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
    assert.equal(run.consensus.source_policy.mode, 'blocked_on_parse_failure');
  } finally {
    if (previous === undefined) delete process.env.SKS_CODEX_BIN;
    else process.env.SKS_CODEX_BIN = previous;
  }
});
