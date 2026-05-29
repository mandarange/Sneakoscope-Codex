#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root as repoRoot } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-config-splitter-'));
const codexHome = path.join(fixture, 'home', '.codex');
const deprecatedPolicy = `${'on'}-failure`;
await fs.mkdir(path.join(fixture, '.codex'), { recursive: true });
await fs.writeFile(path.join(fixture, '.codex', 'config.toml'), [
  '# project comment',
  'profile = "sks-mad-high"',
  `approval_policy = "${deprecatedPolicy}"`,
  'sandbox_mode = "workspace-write"',
  'instructions = """',
  '[not.a.table]',
  'keep this text',
  '"""',
  'project_inline = { keep = true, value = "[literal]" }',
  '',
  '[profiles.sks-mad-high]',
  'model_reasoning_effort = "high"',
  '',
  '[model_providers.codex-lb]',
  'base_url = "https://lb.example.test"',
  ''
].join('\n'));

const mod = await import(pathToFileURL(path.join(repoRoot, 'dist', 'core', 'codex', 'codex-project-config-policy.js')).href);
const report = await mod.splitCodexProjectConfigPolicy(fixture, { apply: true, codexHome });
const project = await fs.readFile(path.join(fixture, '.codex', 'config.toml'), 'utf8');
const user = await fs.readFile(path.join(codexHome, 'config.toml'), 'utf8');
const ok = report.ok === true
  && !/^profile\s*=/m.test(project)
  && !project.includes(deprecatedPolicy)
  && /approval_policy = "on-request"/.test(project)
  && /project_inline = \{ keep = true/.test(project)
  && /\[not\.a\.table\]/.test(project)
  && /^\[model_providers\.codex-lb\]/m.test(user);

console.log(JSON.stringify({ schema: 'sks.codex-project-config-policy-splitter-check.v1', ok, report }, null, 2));
if (!ok) process.exitCode = 1;

function fail(blocker, detail) {
  console.log(JSON.stringify({ schema: 'sks.codex-project-config-policy-splitter-check.v1', ok: false, blocker, detail }, null, 2));
  process.exit(1);
}
