#!/usr/bin/env node
// @ts-nocheck
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: false });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const args = process.argv.slice(2);
const sessionName = readArg(args, '--session') || 'sks-real';
const command = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-command.js')).href);
const result = await command.runZellij(['kill-session', sessionName], { cwd: root, timeoutMs: 5000, optional: true });
emit({ schema: 'sks.zellij-real-session-cleanup-check.v1', ok: result.ok === true || result.exit_code !== 0, session_name: sessionName, result });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-real-session-cleanup-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
function readArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || null : null;
}
