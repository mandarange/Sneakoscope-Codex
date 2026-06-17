#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root as repoRoot } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const preflightMod = await import(pathToFileURL(path.join(repoRoot, 'dist', 'core', 'preflight', 'parallel-preflight-engine.js')).href);
const readabilityMod = await import(pathToFileURL(path.join(repoRoot, 'dist', 'core', 'codex', 'codex-config-readability.js')).href);
const initMod = await import(pathToFileURL(path.join(repoRoot, 'dist', 'core', 'init.js')).href);
const fakeCodex = path.join(repoRoot, 'dist', 'scripts', 'fixtures', 'fake-codex-config-loader.js');

// Case 1: an EXISTING but unreadable (EPERM) config MUST still block the launch — the
// fresh-project bootstrap must never mask a genuine permission/EPERM problem.
const epermFixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-preflight-eperm-'));
await fs.mkdir(path.join(epermFixture, '.codex'), { recursive: true });
await fs.mkdir(path.join(epermFixture, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(epermFixture, '.codex', 'config.toml'), 'sandbox_mode = "workspace-write"\n');
const oldEperm = process.env.SKS_FAKE_CODEX_CONFIG_EPERM;
process.env.SKS_FAKE_CODEX_CONFIG_EPERM = '1';
const epermReport = await preflightMod.runCodexLaunchPreflight(epermFixture, {
  fix: false,
  codexBin: fakeCodex,
  tmuxSmoke: false
});
if (oldEperm === undefined) delete process.env.SKS_FAKE_CODEX_CONFIG_EPERM;
else process.env.SKS_FAKE_CODEX_CONFIG_EPERM = oldEperm;
const epermOk = epermReport.ok === false && epermReport.blockers.includes('codex_cli_config_eperm');

// Case 2 (de-noise): a MISSING config must report only the honest missing_config /
// missing_codex_dir blockers, NOT a cascade of macos_acl_ls_le_failed /
// macos_flags_ls_lO_failed / spawned_child_read_failed from running file checks on a
// nonexistent path.
const missingFixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-preflight-missing-'));
const missingReport = await readabilityMod.inspectCodexConfigReadability(missingFixture, { writeReport: false });
const noiseBlockers = ['macos_acl_ls_le_failed', 'macos_flags_ls_lO_failed', 'spawned_child_read_failed', 'config_lstat_failed', 'config_stat_failed'];
const denoiseOk = missingReport.ok === false
  && missingReport.blockers.includes('missing_config')
  && noiseBlockers.every((b) => !missingReport.blockers.includes(b));

// Case 3 (bootstrap recovers): after regenerating the managed config in the same fresh
// project (what `sks --mad` now does automatically), readability must pass with no
// missing/cascade config blocker.
await initMod.initProject(missingFixture, { installScope: 'global', globalCommand: 'sks' });
const afterReport = await readabilityMod.inspectCodexConfigReadability(missingFixture, { writeReport: false });
const bootstrapOk = afterReport.ok === true
  && !afterReport.blockers.includes('missing_config')
  && !afterReport.blockers.includes('missing_codex_dir')
  && noiseBlockers.every((b) => !afterReport.blockers.includes(b));

const ok = epermOk && denoiseOk && bootstrapOk;
console.log(JSON.stringify({
  schema: 'sks.mad-preflight-blocks-unreadable-config-check.v2',
  ok,
  eperm_blocks: { ok: epermOk, blockers: epermReport.blockers },
  missing_config_denoise: { ok: denoiseOk, blockers: missingReport.blockers },
  bootstrap_recovers: { ok: bootstrapOk, blockers: afterReport.blockers }
}, null, 2));
if (!ok) process.exitCode = 1;

function fail(blocker, detail) {
  console.log(JSON.stringify({ schema: 'sks.mad-preflight-blocks-unreadable-config-check.v2', ok: false, blocker, detail }, null, 2));
  process.exit(1);
}
