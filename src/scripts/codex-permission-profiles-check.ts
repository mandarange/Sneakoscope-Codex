#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'codex', 'codex-permission-profiles.js')).href);
const report = await mod.inventoryCodexPermissionProfiles(root, { writeReport: true });
const names = new Set(report.sks_profiles.map((profile) => profile.name));
const deprecatedPolicy = `${'on'}-failure`;
const deprecatedProfiles = report.sks_profiles.filter((profile) => profile.approval_policy === deprecatedPolicy).map((profile) => profile.name);
const productionFiles = [
  'src/core/codex/codex-permission-profiles.ts',
  'src/core/permission-gates.ts',
  'package.json'
];
const deprecatedMatches = [];
for (const rel of productionFiles) {
  const file = path.join(root, rel);
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  if (text.includes(deprecatedPolicy)) deprecatedMatches.push(rel);
}
const ok = ['sks-safe', 'sks-fast', 'sks-mad', 'sks-mad-target-write', 'sks-mad-system'].every((name) => names.has(name))
  && report.codex_config_profile_field === 'codex_config_profile'
  && report.codex_permission_profile_field === 'codex_permission_profile'
  && deprecatedProfiles.length === 0
  && deprecatedMatches.length === 0;
emit({ schema: 'sks.codex-permission-profiles-check.v1', ok, report, deprecated_profiles: deprecatedProfiles, deprecated_matches: deprecatedMatches });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.codex-permission-profiles-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
