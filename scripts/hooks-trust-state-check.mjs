#!/usr/bin/env node
import { codexHookTrustDoctor } from '../dist/core/codex-hooks/codex-hook-trust-doctor.js';

const report = await codexHookTrustDoctor(process.cwd(), { managed: true });
console.log(JSON.stringify({
  schema: 'sks.hooks-trust-state-check.v1',
  ok: report.ok,
  current_hash_count: report.current_hash_count,
  trust: report.trust,
  warnings: report.warnings
}, null, 2));
if (!report.ok) process.exitCode = 1;
