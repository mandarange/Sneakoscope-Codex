import path from 'node:path';
import { projectRoot, readJson } from '../fsx.js';
import { recordHookPolicyMismatchWrongness } from '../triwiki-wrongness/wrongness-ledger.js';
import { CODEX_HOOK_EVENTS, type CodexHookEventName, codexHookEventName } from './codex-schema-snapshot.js';
import { validateCodexFixtureOutputs, validateCodexHookOutput } from './codex-hook-schema.js';
import { validateCodexHookSemanticOutput } from './codex-hook-semantic-validator.js';
import { validateCodexHookConfigFiles } from './codex-config-policy.js';

const RESERVED_PERMISSION_REQUEST_FIELDS = ['updatedInput', 'updatedPermissions', 'interrupt'];
const LEGACY_TOP_LEVEL_KEYS = ['permissionDecision', 'permissionDecisionReason', 'updatedInput', 'additionalContext', 'hookEventName'];

export async function detectCodexHookOutputWarnings(eventLike: unknown, output: any) {
  const event = codexHookEventName(eventLike) || 'UserPromptSubmit';
  const validation = await validateCodexHookOutput(event, output);
  const semantic = validateCodexHookSemanticOutput(event, output);
  const warnings = [...validation.issues];
  warnings.push(...semantic.warnings.map((issue) => `semantic_warning:${issue}`));
  warnings.push(...semantic.unsupported.map((issue) => `semantic_unsupported:${issue}`));
  warnings.push(...semantic.fatal.map((issue) => `semantic_fatal:${issue}`));
  warnings.push(...snakeCaseKeyWarnings(output));
  for (const key of LEGACY_TOP_LEVEL_KEYS) {
    if (output && typeof output === 'object' && Object.prototype.hasOwnProperty.call(output, key)) warnings.push(`legacy_top_level:${key}`);
  }
  if (event === 'PermissionRequest') {
    const decision = output?.hookSpecificOutput?.decision || {};
    for (const key of RESERVED_PERMISSION_REQUEST_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(decision, key)) warnings.push(`permission_request_reserved:${key}`);
    }
  }
  if (event === 'Stop' && output?.decision === 'block' && !String(output?.reason || '').trim()) warnings.push('stop_block_without_reason');
  const actualEvent = output?.hookSpecificOutput?.hookEventName;
  if (actualEvent && actualEvent !== event) warnings.push(`hook_event_mismatch:${actualEvent}`);
  return {
    schema: 'sks.codex-hook-warning-detection.v1',
    ok: warnings.length === 0,
    event,
    semantic,
    warnings: [...new Set(warnings)]
  };
}

type CodexHookWarningRow = {
  event: CodexHookEventName;
  file: string;
  warnings: string[];
  ok: boolean;
};

export async function codexHookWarningCheck(root?: string, opts: any = {}) {
  root ||= await projectRoot();
  const fixtureValidation = await validateCodexFixtureOutputs(root);
  const rows: CodexHookWarningRow[] = [];
  for (const row of fixtureValidation.outputs || []) {
    const output = await readJson(row.file, {});
    const warning = await detectCodexHookOutputWarnings(row.event, output);
    rows.push({ event: row.event, file: row.file, warnings: warning.warnings, ok: warning.ok });
  }
  const config = await validateCodexHookConfigFiles(root);
  const warnings = [
    ...rows.flatMap((row) => row.warnings.map((warning: string) => `${path.relative(root, row.file)}:${warning}`)),
    ...config.issues
  ];
  let wrongness = null;
  if (warnings.length && opts.recordWrongness !== false) {
    const semanticMismatch = warnings.some((warning) => /semantic_(?:warning|unsupported|fatal):/.test(warning));
    wrongness = await recordHookPolicyMismatchWrongness(root, {
      artifact: 'test/fixtures/codex-hooks/rust-v0.131.0',
      expected: 'Codex rust-v0.131.0 schema-compatible hook output with warning count 0',
      actual: warnings.join(', '),
      detail: 'Codex hook warning check failed',
      route: '$Hooks',
      wrongness_kind: semanticMismatch ? 'hook_semantic_mismatch' : 'hook_policy_mismatch'
    }).catch(() => null);
  }
  return {
    schema: 'sks.codex-hook-warning-check.v1',
    ok: warnings.length === 0,
    baseline: 'rust-v0.131.0',
    warnings_count: warnings.length,
    warnings,
    events: CODEX_HOOK_EVENTS.map((event: CodexHookEventName) => ({
      event,
      checked: rows.filter((row) => row.event === event).length,
      ok: rows.filter((row) => row.event === event).every((row) => row.ok),
      warnings: rows.filter((row) => row.event === event).flatMap((row) => row.warnings)
    })),
    config,
    wrongness
  };
}

function snakeCaseKeyWarnings(value: unknown, pointer = '$'): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => snakeCaseKeyWarnings(item, `${pointer}[${index}]`));
  const warnings: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (/_/.test(key)) warnings.push(`${pointer}.${key}:snake_case`);
    warnings.push(...snakeCaseKeyWarnings(child, `${pointer}.${key}`));
  }
  return warnings;
}
