#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const issues = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function readJson(rel) {
  return JSON.parse(read(rel));
}

function assertIncludes(rel, needle, message = `${rel} missing ${needle}`) {
  if (!read(rel).includes(needle)) issues.push(message);
}

function assertScript(name, expected) {
  const actual = String(pkg.scripts?.[name] || '');
  if (!actual.includes(expected)) issues.push(`package script ${name} must include ${expected}`);
}

const pkg = readJson('package.json');

assertScript('architecture:guard', 'node ./dist/scripts/architecture-guard-check.js');
assertIncludes('src/core/safety/ssot-guard.ts', 'solid_principles');
assertIncludes('src/core/safety/ssot-guard.ts', 'single_responsibility');
assertIncludes('src/core/safety/ssot-guard.ts', 'open_closed');
assertIncludes('src/core/safety/ssot-guard.ts', 'liskov_substitution');
assertIncludes('src/core/safety/ssot-guard.ts', 'interface_segregation');
assertIncludes('src/core/safety/ssot-guard.ts', 'dependency_inversion');
assertIncludes('src/core/pipeline-internals/runtime-core.ts', "'ssot_guard'");
assertIncludes('src/core/pipeline-internals/runtime-core.ts', 'buildSsotGuard');
assertIncludes('src/core/pipeline-internals/runtime-core.ts', 'ssotGuardPolicyText');
assertIncludes('src/core/pipeline-internals/runtime-gates.ts', 'validateSsotGuardArtifact');
assertIncludes('src/core/pipeline-internals/runtime-gates.ts', "'ssot_guard'");
assertIncludes('src/core/commands/team-command.ts', 'SSOT_GUARD_ARTIFACT');
assertIncludes('src/scripts/release-parallel-check.ts', "task('architecture:guard'");
assertIncludes('src/core/release/gate-manifest.ts', "'architecture:guard'");
assertIncludes('src/core/release/gate-manifest.ts', "'architecture:'");
assertIncludes('docs/architecture-ts-rust-boundary.md', '`architecture:guard`');
assertIncludes('docs/architecture-ts-rust-boundary.md', 'SOLID');

const report = {
  schema: 'sks.architecture-guard-check.v1',
  ok: issues.length === 0,
  gate: 'architecture:guard',
  guarantees: ['ssot', 'solid'],
  issues
};

const reportDir = path.join(root, '.sneakoscope', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'architecture-guard.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
