#!/usr/bin/env node
// @ts-nocheck
import { detectCodexHookOutputWarnings } from '../core/codex-compat/codex-hook-warning-detector.js';

const cases = [
  {
    name: 'pretooluse_ask',
    event: 'PreToolUse',
    output: { continue: true, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' } },
    category: 'upstream_semantic_unsupported'
  },
  {
    name: 'snake_case',
    event: 'PreToolUse',
    output: { continue: true, permission_decision: 'deny' },
    category: 'legacy_shape'
  },
  {
    name: 'unknown_field',
    event: 'Stop',
    output: { continue: true, unexpected: true },
    category: 'schema_violation'
  },
  {
    name: 'stop_missing_reason',
    event: 'Stop',
    output: { continue: true, decision: 'block' },
    category: 'upstream_semantic_unsupported'
  },
  {
    name: 'permission_allow_message',
    event: 'PermissionRequest',
    output: { continue: true, hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', message: 'ok' } } },
    category: 'sks_zero_warning_disallowed'
  }
];

const results = [];
for (const row of cases) {
  const result = await detectCodexHookOutputWarnings(row.event, row.output);
  const count = result.issues_by_category?.[row.category] || 0;
  results.push({
    name: row.name,
    ok: count > 0,
    expected_category: row.category,
    issues_by_category: result.issues_by_category
  });
}

const ok = results.every((row) => row.ok);
console.log(JSON.stringify({
  schema: 'sks.codex-hook-strict-subset-check.v1',
  ok,
  results
}, null, 2));
if (!ok) process.exitCode = 1;
