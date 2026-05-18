import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMission } from '../../src/core/mission.mjs';
import { runFiveScoutIntake } from '../../src/core/scouts/scout-runner.mjs';

test('codex-exec scout intake parses real engine output files and records job sources', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-real-output-'));
  const fakeCodex = path.join(root, 'fake-codex.mjs');
  await fs.writeFile(fakeCodex, [
    '#!/usr/bin/env node',
    'import fs from "node:fs";',
    'import path from "node:path";',
    'if (process.argv.includes("--version")) { console.log("codex-test 0.0.0"); process.exit(0); }',
    'const outFlag = process.argv.indexOf("--output-last-message");',
    'const outputFile = outFlag >= 0 ? process.argv[outFlag + 1] : null;',
    'const scoutId = path.basename(outputFile || "scout-unknown.codex.md").replace(/\\.codex\\.md$/, "");',
    'const body = {',
    '  schema: "sks.scout-result.v1",',
    '  scout_id: scoutId,',
    '  role: scoutId,',
    '  route: "$Team",',
    '  status: "done",',
    '  read_only: true,',
    '  summary: `real output for ${scoutId}`,',
    '  findings: [{ id: "finding-1", kind: "code", claim: `claim ${scoutId}`, evidence: [], risk: "low" }],',
    '  suggested_tasks: [{ id: "task-1", title: `task ${scoutId}`, files: [], verification: ["node --test"] }],',
    '  blockers: [],',
    '  unverified: []',
    '};',
    'fs.writeFileSync(outputFile, JSON.stringify(body), "utf8");',
    'console.log(JSON.stringify({ wrote: outputFile }));'
  ].join('\n'), 'utf8');
  await fs.chmod(fakeCodex, 0o755);
  const previous = process.env.SKS_CODEX_BIN;
  process.env.SKS_CODEX_BIN = fakeCodex;
  try {
    const { id, dir } = await createMission(root, { mode: 'team', prompt: 'real output fixture' });
    const run = await runFiveScoutIntake(root, {
      missionId: id,
      route: '$Team',
      task: 'real output fixture',
      engine: 'codex-exec-parallel'
    });
    assert.equal(run.ok, true);
    assert.equal(run.engine, 'codex-exec-parallel');
    const scout = JSON.parse(await fs.readFile(path.join(dir, 'scout-1-code-surface.json'), 'utf8'));
    assert.equal(scout.source_policy, 'parsed_scout_output');
    assert.equal(scout.source, 'real_engine_output');
    assert.equal(scout.parsed, true);
    assert.match(scout.source_file, /scout-1-code-surface\.codex\.md$/);
    const consensus = JSON.parse(await fs.readFile(path.join(dir, 'scout-consensus.json'), 'utf8'));
    assert.equal(consensus.source_policy.mode, 'parsed_real_outputs');
    const engineResult = JSON.parse(await fs.readFile(path.join(dir, 'scout-engine-result.json'), 'utf8'));
    assert.equal(engineResult.jobs.length, 5);
    assert.match(engineResult.jobs[0].output_file, /\.codex\.md$/);
    assert.match(engineResult.jobs[0].stdout_file, /\.stdout\.log$/);
    assert.match(engineResult.jobs[0].stderr_file, /\.stderr\.log$/);
  } finally {
    if (previous === undefined) delete process.env.SKS_CODEX_BIN;
    else process.env.SKS_CODEX_BIN = previous;
  }
});
