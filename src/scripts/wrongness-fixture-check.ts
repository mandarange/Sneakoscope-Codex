#!/usr/bin/env node
// @ts-nocheck
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-fixture-'));

const [
  ledger,
  imageWrongness,
  proofLinker
] = await Promise.all([
  import(path.join(repo, 'dist/core/triwiki-wrongness/wrongness-ledger.js')),
  import(path.join(repo, 'dist/core/triwiki-wrongness/image-wrongness.js')),
  import(path.join(repo, 'dist/core/triwiki-wrongness/wrongness-proof-linker.js'))
]);

await fsp.mkdir(path.join(root, '.sneakoscope', 'missions', 'M-fixture'), { recursive: true });
await ledger.recordTestFailureWrongness(root, {
  mission_id: 'M-fixture',
  route: '$Naruto',
  command: 'node --test failing-fixture.test.mjs',
  failure: 'fixture assertion failed',
  artifact: '.sneakoscope/missions/M-fixture/test-report.json'
});
await ledger.recordDbSafetyMismatchWrongness(root, {
  mission_id: 'M-fixture',
  expected: 'blocked',
  actual: 'safe',
  command: '$DB internal safety check: DROP TABLE users',
  sql: 'DROP TABLE users'
});
await ledger.recordHookPolicyMismatchWrongness(root, {
  mission_id: 'M-fixture',
  expected: 'block',
  actual: 'continue',
  artifact: 'test/fixtures/hooks/mismatch.json'
});
await ledger.recordAgentMismatchWrongness(root, {
  mission_id: 'M-fixture',
  agent_id: 'agent-2-verification',
  issues: ['parse_failed'],
  artifact: '.sneakoscope/missions/M-fixture/agent-2-verification.json'
});
await imageWrongness.recordImageWrongnessFromValidation(root, {
  missionId: 'M-fixture',
  route: '$Wiki',
  artifact: '.sneakoscope/missions/M-fixture/image-voxel-ledger.json',
  validation: {
    ok: false,
    issues: ['missing_anchors:$Wiki', 'bbox_out_of_bounds:anchor-001']
  }
});

const validation = await ledger.validateWrongnessScope(root, 'latest');
const evidence = await proofLinker.wrongnessProofEvidence(root, 'M-fixture');
const ok = validation.ok
  && validation.checked >= 5
  && evidence.active_count >= 5
  && evidence.high_severity_active >= 2;

console.log(JSON.stringify({
  schema: 'sks.wrongness-fixture-check.v1',
  ok,
  root,
  validation,
  evidence
}, null, 2));

if (!ok) process.exitCode = 1;
