#!/usr/bin/env node
// @ts-nocheck
import { codexHookWarningCheck } from '../core/codex-compat/codex-hook-warning-detector.js';

const report = await codexHookWarningCheck(process.cwd());
console.log(JSON.stringify({
  schema: 'sks.hooks-trust-warning-zero.v1',
  ok: report.ok,
  warnings_count: report.warnings_count,
  issues_by_category: report.issues_by_category,
  trust_warning_section: report.config?.dual_representation || null
}, null, 2));
if (!report.ok) process.exitCode = 1;
