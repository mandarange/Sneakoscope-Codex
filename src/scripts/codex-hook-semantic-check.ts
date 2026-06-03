#!/usr/bin/env node
// @ts-nocheck
import { codexHookWarningCheck } from '../core/codex-compat/codex-hook-warning-detector.js';

const result = await codexHookWarningCheck(process.cwd());
console.log(JSON.stringify({
  schema: 'sks.codex-hook-semantic-check.v2',
  ok: result.ok,
  baseline: result.baseline,
  warnings_count: result.warnings_count,
  issues_by_category: result.issues_by_category,
  events: result.events
}, null, 2));
if (!result.ok) process.exitCode = 1;
