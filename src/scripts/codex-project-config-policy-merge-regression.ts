#!/usr/bin/env node
// @ts-nocheck
// Regression coverage for the machine-local config mover (codex-project-config-policy):
//  1. Moved top-level keys (e.g. notify=[...], model_provider) must land BEFORE any
//     [table] header in the user config, otherwise TOML parses them as members of the
//     trailing table (the `invalid type: sequence, expected a string` corruption).
//  2. Splitting the global CODEX_HOME config against itself must be a no-op.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root as repoRoot } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const mod = await import(
  pathToFileURL(path.join(repoRoot, 'dist', 'core', 'codex', 'codex-project-config-policy.js')).href
);

const results = [];

// --- Case 1: trailing table in user config must not capture moved top-level keys ---
{
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-config-merge-'));
  const codexHome = path.join(fixture, 'home', '.codex');
  await fs.mkdir(codexHome, { recursive: true });
  // Pre-existing user config whose last block is an env table requiring string values.
  await fs.writeFile(path.join(codexHome, 'config.toml'), [
    '[mcp_servers.xai-grok]',
    'command = "npx"',
    '',
    '[mcp_servers.xai-grok.env]',
    'XAI_API_KEY = "xai-existing"',
    ''
  ].join('\n'));
  // Project config carrying machine-local top-level keys, including an array (notify).
  await fs.mkdir(path.join(fixture, '.codex'), { recursive: true });
  await fs.writeFile(path.join(fixture, '.codex', 'config.toml'), [
    'model_provider = "codex-lb"',
    'notify = ["notify-send", "SKS"]',
    'sandbox_mode = "workspace-write"',
    ''
  ].join('\n'));

  await mod.splitCodexProjectConfigPolicy(fixture, { apply: true, codexHome, writeReport: false });
  const user = await fs.readFile(path.join(codexHome, 'config.toml'), 'utf8');
  const lines = user.split('\n');
  const firstTableIdx = lines.findIndex((l) => /^\s*\[/.test(l));
  const idxOf = (re) => lines.findIndex((l) => re.test(l));
  const modelIdx = idxOf(/^\s*model_provider\s*=/);
  const notifyIdx = idxOf(/^\s*notify\s*=/);
  const ok =
    modelIdx >= 0 &&
    notifyIdx >= 0 &&
    firstTableIdx >= 0 &&
    modelIdx < firstTableIdx &&
    notifyIdx < firstTableIdx &&
    /XAI_API_KEY = "xai-existing"/.test(user) &&
    // The env table must NOT have absorbed the moved keys.
    /\[mcp_servers\.xai-grok\.env\][\s\S]*$/.test(user);
  results.push({ case: 'moved_keys_before_tables', ok, model_idx: modelIdx, notify_idx: notifyIdx, first_table_idx: firstTableIdx, user });
}

// --- Case 2: splitting CODEX_HOME config against itself is a no-op ---
{
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-config-home-'));
  const codexHome = path.join(fixture, '.codex');
  await fs.mkdir(codexHome, { recursive: true });
  const homeConfig = path.join(codexHome, 'config.toml');
  const homeText = [
    'model_provider = "codex-lb"',
    'notify = ["notify-send", "SKS"]',
    '',
    '[mcp_servers.xai-grok.env]',
    'XAI_API_KEY = "xai-existing"',
    ''
  ].join('\n');
  await fs.writeFile(homeConfig, homeText);
  const report = await mod.splitCodexProjectConfigPolicy(fixture, {
    apply: true,
    codexHome,
    configPath: homeConfig,
    writeReport: false
  });
  const after = await fs.readFile(homeConfig, 'utf8');
  const ok =
    report.changed === false &&
    report.status === 'project_config_is_codex_home_noop' &&
    after === homeText;
  results.push({ case: 'codex_home_self_split_noop', ok, status: report.status, changed: report.changed, unchanged: after === homeText });
}

const ok = results.every((r) => r.ok);
console.log(JSON.stringify({ schema: 'sks.codex-project-config-policy-merge-regression.v1', ok, results }, null, 2));
if (!ok) process.exitCode = 1;

function fail(blocker, detail) {
  console.log(JSON.stringify({ schema: 'sks.codex-project-config-policy-merge-regression.v1', ok: false, blocker, detail }, null, 2));
  process.exit(1);
}
