#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'doctor', 'codex-doctor-bridge.js')).href);
const report = await mod.runCodexDoctorBridge({ cwd: root, required: process.argv.includes('--actual-codex') });
const requiredFields = ['available', 'exit_code', 'environment_diagnostics_ok', 'git_diagnostics_ok', 'terminal_diagnostics_ok', 'app_server_diagnostics_ok', 'thread_inventory_ok', 'blockers', 'warnings'];
const ok = requiredFields.every((field) => Object.prototype.hasOwnProperty.call(report, field)) && (!process.argv.includes('--actual-codex') || report.blockers.length === 0);
emit({ schema: 'sks.doctor-codex-doctor-parity-check.v1', ok, report, required_fields: requiredFields });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.doctor-codex-doctor-parity-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
