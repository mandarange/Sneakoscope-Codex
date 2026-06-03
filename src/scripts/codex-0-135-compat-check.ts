#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'codex', 'codex-0-135-compat.js')).href);
const evidence = await mod.collectCodex0135LocalEvidence();
const matrix = mod.codex0135Matrix({
  version: evidence.versionText,
  available: evidence.available,
  doctorText: evidence.doctorText,
  permissionsText: evidence.permissionsText,
  execHelp: evidence.execHelp,
  resumeHelp: evidence.resumeHelp,
  requireReal: process.argv.includes('--require-real')
});
const report = { ...matrix, local_evidence: evidence };
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'codex-0.135-compat.json'), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'codex-plugin-inventory.json'), `${JSON.stringify(await collectPluginInventory(), null, 2)}\n`);
emit(report);

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.codex-0.135-compat-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }

async function collectPluginInventory() {
  const codexHome = process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex');
  const candidates = [
    path.join(root, '.codex', 'plugins'),
    path.join(codexHome, 'plugins'),
    path.join(codexHome, 'plugins', 'cache')
  ];
  const entries = [];
  for (const dir of candidates) {
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    for (const name of await fs.readdir(dir).catch(() => [])) {
      if (!name || name.startsWith('.')) continue;
      entries.push({ source: dir, name });
    }
  }
  return {
    schema: 'sks.codex-plugin-inventory.v1',
    generated_at: new Date().toISOString(),
    ok: true,
    state_owner: 'codex_app_server_or_codex_home',
    project_config_policy: 'project .codex/config.toml must not store TUI/plugin runtime state',
    sources_checked: candidates,
    plugins: entries.sort((a, b) => `${a.source}/${a.name}`.localeCompare(`${b.source}/${b.name}`))
  };
}
