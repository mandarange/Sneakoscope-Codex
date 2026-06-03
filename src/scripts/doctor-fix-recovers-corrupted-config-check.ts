#!/usr/bin/env node
// @ts-nocheck
// Proves `sks doctor --fix` (via repairCodexConfigEperm) RECOVERS an already-corrupted
// Codex config — both the project config and the global CODEX_HOME config — by hoisting
// machine-local keys that a prior buggy move absorbed into a trailing table back to the
// top of the file, restoring a loadable config.toml. Also proves the structural repair
// is a no-op on a healthy config.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root as repoRoot } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const distUrl = (rel) => pathToFileURL(path.join(repoRoot, 'dist', rel)).href;
const policy = await import(distUrl('core/codex/codex-project-config-policy.js'));
const eperm = await import(distUrl('core/codex/codex-config-eperm-repair.js'));

const results = [];

// Corruption signature: machine-local keys absorbed into the trailing env table.
const corrupted = [
  '[mcp_servers.xai-grok]',
  'command = "npx"',
  '',
  '[mcp_servers.xai-grok.env]',
  'XAI_API_KEY = "xai-123"',
  '# SKS moved machine-local Codex config from .codex/config.toml at 2026-05-29T00:00:00Z',
  'model_provider = "codex-lb"',
  'notify = ["notify-send", "SKS"]',
  ''
].join('\n');

// helper: top-level key index vs first table index
function keyBeforeFirstTable(text, key) {
  const lines = text.split('\n');
  const firstTable = lines.findIndex((l) => /^\s*\[/.test(l));
  const keyIdx = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  return keyIdx >= 0 && firstTable >= 0 && keyIdx < firstTable;
}
function envTableHasMachineKey(text) {
  // model_provider/notify must NOT appear after the env header
  return /\[mcp_servers\.xai-grok\.env\][\s\S]*\b(model_provider|notify)\s*=/.test(text);
}

// --- Case 1: standalone structural repair hoists keys back to root ---
{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-struct-'));
  const cfg = path.join(dir, 'config.toml');
  await fs.writeFile(cfg, corrupted);
  const rep = await policy.repairCodexConfigStructure(cfg, { apply: true });
  const after = await fs.readFile(cfg, 'utf8');
  const ok =
    rep.changed === true &&
    rep.applied === true &&
    rep.hoisted_keys.includes('model_provider') &&
    rep.hoisted_keys.includes('notify') &&
    keyBeforeFirstTable(after, 'model_provider') &&
    keyBeforeFirstTable(after, 'notify') &&
    !envTableHasMachineKey(after) &&
    /XAI_API_KEY = "xai-123"/.test(after) &&
    rep.backup_path &&
    rep.parse_smoke.ok === true;
  results.push({ case: 'structure_repair_hoists_keys', ok, hoisted: rep.hoisted_keys, status: rep.status, after });
}

// --- Case 2: structural repair is a no-op on a healthy config ---
{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-struct-ok-'));
  const cfg = path.join(dir, 'config.toml');
  const healthy = [
    'model_provider = "codex-lb"',
    'notify = ["notify-send", "SKS"]',
    '',
    '[mcp_servers.xai-grok.env]',
    'XAI_API_KEY = "xai-123"',
    '',
    '[profiles.sks-mad-high]',
    'model_provider = "codex-lb"',
    'model_reasoning_effort = "high"',
    ''
  ].join('\n');
  await fs.writeFile(cfg, healthy);
  const rep = await policy.repairCodexConfigStructure(cfg, { apply: true });
  const after = await fs.readFile(cfg, 'utf8');
  // profiles.* model_provider must be preserved inside the profile (NOT hoisted).
  const profileIntact = /\[profiles\.sks-mad-high\][\s\S]*model_provider = "codex-lb"/.test(after);
  const ok = rep.changed === false && rep.status === 'structure_ok' && profileIntact;
  results.push({ case: 'structure_repair_noop_on_healthy', ok, status: rep.status, profile_intact: profileIntact });
}

// --- Case 3: doctor --fix recovers the GLOBAL CODEX_HOME config end-to-end ---
{
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-doctor-fix-'));
  const codexHome = path.join(fixture, 'home', '.codex');
  await fs.mkdir(codexHome, { recursive: true });
  await fs.writeFile(path.join(codexHome, 'config.toml'), corrupted);
  // Project has only a benign config so the project path is healthy.
  await fs.mkdir(path.join(fixture, '.codex'), { recursive: true });
  await fs.writeFile(path.join(fixture, '.codex', 'config.toml'), 'sandbox_mode = "workspace-write"\n');

  const report = await eperm.repairCodexConfigEperm(fixture, {
    fix: true,
    codexHome,
    // no real codex needed; structural repair runs regardless
    actualCodex: false,
    codexProbe: false,
    writeReport: false
  });
  const homeAfter = await fs.readFile(path.join(codexHome, 'config.toml'), 'utf8');
  const homeRepair = (report.structure_repairs || []).find((r) => r.scope === 'codex_home');
  const ok =
    Boolean(homeRepair) &&
    homeRepair.applied === true &&
    homeRepair.hoisted_keys.includes('model_provider') &&
    homeRepair.hoisted_keys.includes('notify') &&
    keyBeforeFirstTable(homeAfter, 'model_provider') &&
    keyBeforeFirstTable(homeAfter, 'notify') &&
    !envTableHasMachineKey(homeAfter);
  results.push({ case: 'doctor_fix_recovers_codex_home', ok, home_repair: homeRepair, home_after: homeAfter });
}

const ok = results.every((r) => r.ok);
console.log(JSON.stringify({ schema: 'sks.doctor-fix-recovers-corrupted-config-check.v1', ok, results }, null, 2));
if (!ok) process.exitCode = 1;

function fail(blocker, detail) {
  console.log(JSON.stringify({ schema: 'sks.doctor-fix-recovers-corrupted-config-check.v1', ok: false, blocker, detail }, null, 2));
  process.exit(1);
}
