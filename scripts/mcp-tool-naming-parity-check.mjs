#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mcp', 'mcp-tool-name-normalizer.js')).href);
const report = mod.normalizeMcpToolInventory([{ server: 'github', name: 'search issues' }, { server: 'github', name: 'search_issues' }]);
const ok = report.ok && report.collision_count === 1 && report.normalized.every((row) => row.normalized_name.includes('github'));
emit({ schema: 'sks.mcp-tool-naming-parity-check.v1', ok, report });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.mcp-tool-naming-parity-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
