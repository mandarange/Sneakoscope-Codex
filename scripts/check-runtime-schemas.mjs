#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

const root = process.cwd();
const tsc = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'tsconfig.json', '--noEmit'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe'
});

const issues = [];
if (tsc.status !== 0) issues.push(`typecheck:${tsc.stderr || tsc.stdout}`.trim());

let validatorsOk = false;
try {
  const proof = await import(pathToFileURL(path.join(root, 'dist', 'core', 'proof', 'proof-schema.js')));
  const evidence = await import(pathToFileURL(path.join(root, 'dist', 'core', 'evidence', 'evidence-schema.js')));
  const voxel = await import(pathToFileURL(path.join(root, 'dist', 'core', 'wiki-image', 'image-voxel-schema.js')));
  validatorsOk = proof.isCompletionProof({
    schema: 'sks.completion-proof.v1',
    mission_id: null,
    route: '$Team',
    status: 'verified_partial',
    evidence: {},
    claims: [],
    unverified: [],
    blockers: []
  }) && evidence.isEvidenceRecord({
    schema: 'sks.evidence.v1',
    id: 'EV-TEST',
    mission_id: null,
    kind: 'test',
    source: 'real',
    path: null,
    sha256: null,
    freshness: 'fresh',
    trust: 'high',
    redacted: true,
    issues: []
  }) && voxel.isImageVoxelLedger({
    schema: 'sks.image-voxel-ledger.v1',
    images: [],
    anchors: [],
    relations: []
  });
} catch (err) {
  issues.push(`validator_import:${err.message}`);
}
if (!validatorsOk) issues.push('validator_smoke_failed');

const codexSchemaDir = path.join(root, 'schemas', 'codex');
for (const file of [
  'ux-review-callout-extraction.schema.json',
  'image-ux-issue-ledger.schema.json',
  'completion-proof.schema.json',
  'wrongness-record.schema.json',
  'agent-result.schema.json',
  'computer-use-live-evidence.schema.json',
  'ppt-slide-issue-ledger.schema.json',
  'dfix-diagnosis.schema.json',
  'dfix-patch-plan.schema.json',
  'dfix-verification.schema.json',
  'all-feature-completion.schema.json',
  'non-recursive-pipeline-report.schema.json'
]) {
  const full = path.join(codexSchemaDir, file);
  if (!fs.existsSync(full)) {
    issues.push(`codex_schema_missing:${file}`);
    continue;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (parsed.type !== 'object') issues.push(`codex_schema_root_type:${file}`);
  } catch (err) {
    issues.push(`codex_schema_invalid_json:${file}:${err.message}`);
  }
}

const result = { schema: 'sks.runtime-schema-check.v1', ok: issues.length === 0, validators_ok: validatorsOk, issues };
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
