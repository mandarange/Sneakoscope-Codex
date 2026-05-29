#!/usr/bin/env node
// Production regression for the chronic "npm i -g wipes ~/.codex/config.toml" bug.
// Proves ensureGlobalCodexFastModeDuringInstall:
//   1. PRESERVES user-set top-level model/service_tier/model_reasoning_effort on update,
//   2. backs up the prior config before mutating,
//   3. still seeds SKS defaults for a fresh (empty) config,
//   4. NEVER blind-overwrites an unparseable config (backs up + preserves),
//   5. is idempotent (second run is a no-op 'present').
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const helpers = await importDist('cli/install-helpers.js');

const results = [];

// --- Case 1: customized config preserved + backed up on update ---
{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cfg-preserve-'));
  const codexDir = path.join(dir, '.codex');
  await fs.mkdir(codexDir, { recursive: true });
  const cfg = path.join(codexDir, 'config.toml');
  const userConfig = [
    '# my hand-tuned Codex config',
    'model = "gpt-5.1-codex"',
    'service_tier = "standard"',
    'model_reasoning_effort = "high"',
    '',
    '[mcp_servers.custom]',
    'command = "npx"',
    ''
  ].join('\n');
  await fs.writeFile(cfg, userConfig);
  const res = await helpers.ensureGlobalCodexFastModeDuringInstall({ home: dir, configPath: cfg });
  const after = await fs.readFile(cfg, 'utf8');
  const backups = (await fs.readdir(codexDir)).filter((f) => f.startsWith('config.toml.sks-'));
  const ok =
    res.status === 'updated' &&
    /^model = "gpt-5\.1-codex"/m.test(after) &&        // user model preserved
    /^service_tier = "standard"/m.test(after) &&        // user tier preserved
    /^model_reasoning_effort = "high"/m.test(after) &&  // user effort NOT stripped
    /# my hand-tuned Codex config/.test(after) &&       // user comment preserved
    /\[mcp_servers\.custom\]/.test(after) &&            // user table preserved
    /\[profiles\.sks-fast-high\]/.test(after) &&        // SKS-managed table added
    backups.length >= 1 &&                              // backup created
    Boolean(res.backup_path);
  results.push({ case: 'preserves_user_config', ok, status: res.status, backups, model_preserved: /gpt-5\.1-codex/.test(after) });
}

// --- Case 2: fresh/empty config gets SKS defaults ---
{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cfg-fresh-'));
  const cfg = path.join(dir, '.codex', 'config.toml');
  await fs.mkdir(path.dirname(cfg), { recursive: true });
  const res = await helpers.ensureGlobalCodexFastModeDuringInstall({ home: dir, configPath: cfg });
  const after = await fs.readFile(cfg, 'utf8');
  const ok = res.status === 'updated' && /^model = "gpt-5\.5"/m.test(after) && /^service_tier = "fast"/m.test(after) && /\[features\]/.test(after);
  results.push({ case: 'fresh_config_seeds_defaults', ok, status: res.status });
}

// --- Case 3: unparseable config is preserved + backed up, NOT overwritten ---
{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cfg-broken-'));
  const codexDir = path.join(dir, '.codex');
  await fs.mkdir(codexDir, { recursive: true });
  const cfg = path.join(codexDir, 'config.toml');
  const broken = 'model = "gpt-5.5"\n[features\nhooks = true\n'; // malformed table header
  await fs.writeFile(cfg, broken);
  const res = await helpers.ensureGlobalCodexFastModeDuringInstall({ home: dir, configPath: cfg });
  const after = await fs.readFile(cfg, 'utf8');
  const backups = (await fs.readdir(codexDir)).filter((f) => f.includes('.sks-unparseable-'));
  const ok = res.status === 'unparseable_config_preserved' && after === broken && backups.length >= 1 && Boolean(res.backup_path);
  results.push({ case: 'unparseable_preserved_not_clobbered', ok, status: res.status, untouched: after === broken });
}

// --- Case 4: idempotent — second run on a healthy config is a no-op ---
{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cfg-idem-'));
  const cfg = path.join(dir, '.codex', 'config.toml');
  await fs.mkdir(path.dirname(cfg), { recursive: true });
  await helpers.ensureGlobalCodexFastModeDuringInstall({ home: dir, configPath: cfg });
  const second = await helpers.ensureGlobalCodexFastModeDuringInstall({ home: dir, configPath: cfg });
  const ok = second.status === 'present';
  results.push({ case: 'idempotent_second_run_noop', ok, status: second.status });
}

const ok = results.every((r) => r.ok);
if (!ok) {
  console.error(JSON.stringify({ ok: false, message: 'install config-preservation regression failed', results }, null, 2));
  process.exit(1);
}
emitGate('install:update-preserves-config', { cases: results.map((r) => r.case) });
