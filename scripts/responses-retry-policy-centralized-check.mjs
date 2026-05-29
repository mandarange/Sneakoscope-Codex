#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'responses-retry-policy.js')).href);
const policy = mod.DEFAULT_RESPONSES_RETRY_POLICY;
const ok = policy.adapters.includes('source-intelligence') && policy.adapters.includes('codex-web') && policy.adapters.includes('mcp')
  && mod.shouldRetryResponsesError({ status: 429, attempt: 1 }) === true
  && mod.shouldRetryResponsesError({ status: 429, attempt: policy.max_attempts }) === false
  && mod.responsesRetryDelayMs(3) > mod.responsesRetryDelayMs(1);
emit({ schema: 'sks.responses-retry-policy-centralized-check.v1', ok, policy });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.responses-retry-policy-centralized-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
