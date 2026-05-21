import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';

export async function writeDfixCodexHandoffArtifact(dir: string, input: any = {}) {
  const handoff = buildDfixCodexHandoff(input);
  await writeJsonAtomic(path.join(dir, 'dfix-codex-handoff.json'), handoff);
  return handoff;
}

export function buildDfixCodexHandoff(input: any = {}) {
  const unavailable = input.codexAvailable === false;
  return {
    schema: 'sks.dfix-codex-handoff.v1',
    created_at: nowIso(),
    mode: input.apply ? 'apply_requested' : 'dry_run',
    default_dry_run: true,
    apply_requires: ['--apply-codex-patch', '--apply'],
    integration_optional: unavailable,
    blocked: unavailable,
    blockers: unavailable ? ['codex_unavailable'] : [],
    prompt: [
      'Return only a bounded DFix patch result.',
      `Diagnosis: ${input.diagnosis || input.signature?.normalized_message || '<missing>'}`,
      `Root cause: ${input.rootCause || input.selected_root_cause?.summary || '<missing>'}`,
      `Target files: ${input.file || input.signature?.file || '<scout-first>'}`,
      'Required output schema fields: changed_files, patch_applied, diff_summary, verification_commands, rollback_plan, no_op_reason.',
      'Forbidden: broad refactor, DB write, migration, destructive filesystem operation, auth/payment/security weakening, fallback implementation.'
    ].join('\n'),
    output_schema: {
      required: ['changed_files', 'patch_applied', 'diff_summary', 'verification_commands', 'rollback_plan'],
      optional: ['no_op_reason', 'blockers'],
      forbidden_operations: ['broad_refactor', 'db_write', 'migration', 'destructive_filesystem', 'security_weakening', 'fallback_implementation']
    },
    normalized_result_schema: 'sks.dfix-patch-runner-result.v1',
    proof_links: ['dfix-patch-runner-result.json', 'dfix-verification-selection.json', 'dfix-verification.json']
  };
}
