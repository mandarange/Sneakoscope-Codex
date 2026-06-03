#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { codexHookWarningCheck } from '../core/codex-compat/codex-hook-warning-detector.js';

const report = await codexHookWarningCheck(process.cwd());
const events = new Set((report.events || []).map((row) => row.event));
const bad = /trust|trusu|untrusted|modified|unsupported|skipping prompt|skipping agent|skipping async/i;
const warningText = JSON.stringify([report.warnings || [], report.issues || []]);
const result = {
  schema: 'sks.hooks-runtime-warning-zero-v2.v1',
  ok: report.ok && report.warnings_count === 0 && events.size >= 10 && !bad.test(warningText),
  events: Array.from(events).sort(),
  warnings_count: report.warnings_count,
  official_schema_validation: report.ok,
  semantic_validation: report.ok,
  negative_warning_detection_policy: 'modified_untrusted_fixtures_must_emit_warning',
  report
};
const out = path.join(process.cwd(), '.sneakoscope', 'reports', 'hooks-runtime-warning-zero-1.14.1.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
