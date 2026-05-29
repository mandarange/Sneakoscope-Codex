#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'codex', 'codex-resume-inventory.js')).href);
const okReport = mod.buildCodexResumeInventory({ cwd: root, workspace: root, root, execSessions: [{ id: 'exec-1', non_interactive: true }] });
const mismatch = mod.buildCodexResumeInventory({ cwd: path.join(root, 'src'), workspace: root, root, execSessions: [{ id: 'exec-2', non_interactive: true }] });
const ok = okReport.non_interactive_exec_session_count === 1 && mismatch.resume_cwd_mismatch === true && mismatch.blockers.includes('resume_cwd_mismatch');
emit({ schema: 'sks.codex-resume-cwd-truth-check.v1', ok, ok_report: okReport, mismatch_report: mismatch });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.codex-resume-cwd-truth-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
