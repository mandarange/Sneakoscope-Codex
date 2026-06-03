#!/usr/bin/env node
// @ts-nocheck
import { codexHookWarningCheck } from '../core/codex-compat/codex-hook-warning-detector.js';

const report = await codexHookWarningCheck(process.cwd());
const events = new Set((report.events || []).map((row) => row.event));
const ok = report.ok && report.warnings_count === 0 && events.has('SubagentStart') && events.has('SubagentStop');
console.log(JSON.stringify({ schema: 'sks.hooks-runtime-replay-warning-zero.v1', ok, warnings_count: report.warnings_count, events: Array.from(events).sort(), report }, null, 2));
if (!ok) process.exitCode = 1;
