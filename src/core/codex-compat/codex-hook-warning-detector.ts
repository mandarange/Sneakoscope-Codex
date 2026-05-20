import path from 'node:path';
import { projectRoot, readJson } from '../fsx.js';
import { recordHookPolicyMismatchWrongness } from '../triwiki-wrongness/wrongness-ledger.js';
import { CODEX_HOOK_EVENTS, type CodexHookEventName, codexHookEventName } from './codex-schema-snapshot.js';
import { validateCodexFixtureOutputs, validateCodexHookOutput } from './codex-hook-schema.js';
import { validateCodexHookSemanticOutput } from './codex-hook-semantic-validator.js';
import {
  codexHookIssuesByCategory,
  codexHookIssueWarningString,
  dedupeCodexHookIssues,
  makeCodexHookIssue,
  type CodexHookIssue,
  type CodexHookIssueCategory
} from './codex-hook-issues.js';
import { validateCodexHookConfigFiles } from './codex-config-policy.js';

const RESERVED_PERMISSION_REQUEST_FIELDS = ['updatedInput', 'updatedPermissions', 'interrupt'];
const LEGACY_TOP_LEVEL_KEYS = ['permissionDecision', 'permissionDecisionReason', 'updatedInput', 'additionalContext', 'hookEventName'];

export async function detectCodexHookOutputWarnings(eventLike: unknown, output: any) {
  const event = codexHookEventName(eventLike) || 'UserPromptSubmit';
  const validation = await validateCodexHookOutput(event, output);
  const semantic = validateCodexHookSemanticOutput(event, output);
  const issues: CodexHookIssue[] = [
    ...validation.structured_issues,
    ...semantic.issues,
    ...snakeCaseKeyIssues(output)
  ];
  for (const key of LEGACY_TOP_LEVEL_KEYS) {
    if (output && typeof output === 'object' && Object.prototype.hasOwnProperty.call(output, key)) {
      issues.push(makeCodexHookIssue('legacy_shape', `legacy_top_level_${key}`, `Legacy top-level hook field is not accepted by SKS: ${key}.`, { path: `$.${key}`, upstream_supported: false, sks_disallowed: true }));
    }
  }
  if (event === 'PermissionRequest') {
    const decision = output?.hookSpecificOutput?.decision || {};
    for (const key of RESERVED_PERMISSION_REQUEST_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(decision, key)) {
        issues.push(makeCodexHookIssue('upstream_semantic_unsupported', `permission_request_reserved_${key}`, `PermissionRequest hook returned unsupported ${key}`, { path: `$.hookSpecificOutput.decision.${key}`, upstream_supported: false, sks_disallowed: true }));
      }
    }
  }
  if (event === 'Stop' && output?.decision === 'block' && !String(output?.reason || '').trim()) {
    issues.push(makeCodexHookIssue('upstream_semantic_unsupported', 'stop_block_without_reason', 'Stop hook returned decision:block without a non-empty reason', { path: '$.reason', upstream_supported: false, sks_disallowed: true }));
  }
  const actualEvent = output?.hookSpecificOutput?.hookEventName;
  if (actualEvent && actualEvent !== event) {
    issues.push(makeCodexHookIssue('upstream_semantic_unsupported', 'hook_event_mismatch', `Hook output event mismatch: expected ${event} but saw ${actualEvent}.`, { path: '$.hookSpecificOutput.hookEventName', upstream_supported: false, sks_disallowed: true }));
  }
  const uniqueIssues = dedupeCodexHookIssues(issues);
  const warnings = uniqueIssues.map(codexHookIssueWarningString);
  return {
    schema: 'sks.codex-hook-warning-detection.v2',
    ok: uniqueIssues.length === 0,
    event,
    semantic,
    issues: uniqueIssues,
    issues_by_category: codexHookIssuesByCategory(uniqueIssues),
    warnings: [...new Set(warnings)]
  };
}

type CodexHookWarningRow = {
  event: CodexHookEventName;
  file: string;
  warnings: string[];
  issues: CodexHookIssue[];
  ok: boolean;
};

export async function codexHookWarningCheck(root?: string, opts: any = {}) {
  root ||= await projectRoot();
  const fixtureValidation = await validateCodexFixtureOutputs(root);
  const rows: CodexHookWarningRow[] = [];
  for (const row of fixtureValidation.outputs || []) {
    const output = await readJson(row.file, {});
    const warning = await detectCodexHookOutputWarnings(row.event, output);
    rows.push({ event: row.event, file: row.file, warnings: warning.warnings, issues: warning.issues, ok: warning.ok });
  }
  const config = await validateCodexHookConfigFiles(root);
  const configIssues = config.issues.map((issue: string) => makeCodexHookIssue('policy_disallowed', 'hook_config_policy', `Codex hook config policy issue: ${issue}`, { upstream_supported: true, sks_disallowed: true }));
  const warnings = [
    ...rows.flatMap((row) => row.warnings.map((warning: string) => `${path.relative(root, row.file)}:${warning}`)),
    ...config.issues
  ];
  const allIssues = [
    ...rows.flatMap((row) => row.issues.map((issue) => ({ ...issue, path: issue.path || path.relative(root, row.file) }))),
    ...configIssues
  ];
  const issuesByCategory = codexHookIssuesByCategory(allIssues);
  let wrongness = null;
  if (warnings.length && opts.recordWrongness !== false) {
    const semanticMismatch = allIssues.some((issue) => issue.category === 'upstream_semantic_unsupported');
    const strictSubsetMismatch = allIssues.some((issue) => issue.category === 'sks_zero_warning_disallowed');
    wrongness = await recordHookPolicyMismatchWrongness(root, {
      artifact: 'test/fixtures/codex-hooks/rust-v0.131.0',
      expected: 'Codex rust-v0.131.0 schema-compatible hook output with warning count 0',
      actual: warnings.join(', '),
      detail: `Codex hook warning check failed; issues_by_category=${JSON.stringify(issuesByCategory)}`,
      route: '$Hooks',
      wrongness_kind: strictSubsetMismatch ? 'hook_strict_subset_misclassified' : semanticMismatch ? 'hook_semantic_mismatch' : 'hook_policy_mismatch'
    }).catch(() => null);
  }
  return {
    schema: 'sks.codex-hook-warning-check.v2',
    ok: warnings.length === 0,
    baseline: 'rust-v0.131.0',
    warnings_count: warnings.length,
    issues_by_category: issuesByCategory,
    issues: allIssues,
    warnings,
    events: CODEX_HOOK_EVENTS.map((event: CodexHookEventName) => ({
      event,
      checked: rows.filter((row) => row.event === event).length,
      ok: rows.filter((row) => row.event === event).every((row) => row.ok),
      warnings: rows.filter((row) => row.event === event).flatMap((row) => row.warnings),
      issues_by_category: codexHookIssuesByCategory(rows.filter((row) => row.event === event).flatMap((row) => row.issues))
    })),
    config,
    wrongness
  };
}

function snakeCaseKeyIssues(value: unknown, pointer = '$'): CodexHookIssue[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => snakeCaseKeyIssues(item, `${pointer}[${index}]`));
  const issues: CodexHookIssue[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (/_/.test(key)) issues.push(makeCodexHookIssue('legacy_shape', 'snake_case', `Snake_case hook key is not accepted by SKS: ${pointer}.${key}.`, { path: `${pointer}.${key}`, upstream_supported: false, sks_disallowed: true }));
    issues.push(...snakeCaseKeyIssues(child, `${pointer}.${key}`));
  }
  return issues;
}
