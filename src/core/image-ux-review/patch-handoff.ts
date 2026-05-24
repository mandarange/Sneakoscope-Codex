import { nowIso } from '../fsx.js';

export interface PatchHandoffTask {
  id: string;
  issue_id: string;
  source_screen_id?: string;
  callout_id?: string;
  candidate_files?: string[];
  expected_visual_delta?: string;
  risk_level?: string;
  requires_human_review?: boolean;
}

export function buildPatchHandoffPrompt(task: PatchHandoffTask, evidence: any = {}) {
  return [
    'Apply a bounded UI patch for the UX-Review issue below.',
    `Issue evidence id: ${task.issue_id}.`,
    task.source_screen_id ? `Source screenshot id: ${task.source_screen_id}.` : '',
    task.callout_id ? `Generated callout id: ${task.callout_id}.` : '',
    evidence.generated_image_id ? `Generated callout evidence: ${evidence.generated_image_id}.` : '',
    evidence.generated_image_sha256 ? `Generated image sha256: ${evidence.generated_image_sha256}.` : '',
    `Candidate files: ${(task.candidate_files || []).join(', ') || '<none provided; inspect first>'}.`,
    `Expected visual delta: ${task.expected_visual_delta || 'targeted visible UI improvement'}.`,
    'Forbidden operations: DB writes, migrations, auth/payment/security weakening, destructive filesystem operations, broad refactors, unrelated fallback implementations.',
    'Output JSON with changed_files, patch_applied, no_op_reason, requires_human_review, command_exit_status, recapture_required.'
  ].filter(Boolean).join('\n');
}

export function patchResultSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['changed_files', 'patch_applied', 'no_op_reason', 'requires_human_review', 'command_exit_status', 'recapture_required'],
    properties: {
      changed_files: { type: 'array', items: { type: 'string' } },
      patch_applied: { type: 'boolean' },
      no_op_reason: { type: ['string', 'null'] },
      requires_human_review: { type: 'boolean' },
      command_exit_status: { type: ['number', 'null'] },
      recapture_required: { type: 'boolean' }
    }
  };
}

export function createPatchHandoff(task: PatchHandoffTask, opts: any = {}) {
  const apply = opts.apply === true;
  const human = task.requires_human_review === true || task.risk_level === 'high' || !(task.candidate_files || []).length;
  const patchApplied = apply && !human && Array.isArray(opts.changedFiles) && opts.changedFiles.length > 0;
  return {
    schema: 'sks.image-ux-patch-handoff.v1',
    created_at: nowIso(),
    task_id: task.id,
    issue_id: task.issue_id,
    mode: apply ? 'apply' : 'dry_run',
    explicit_apply_opt_in: apply,
    prompt: buildPatchHandoffPrompt(task, opts.evidence || {}),
    output_schema: patchResultSchema(),
    result: {
      changed_files: patchApplied ? opts.changedFiles : [],
      patch_applied: patchApplied,
      no_op_reason: patchApplied ? null : human ? 'requires_human_review_or_candidate_files' : 'dry_run_no_patch_applied',
      requires_human_review: human,
      command_exit_status: patchApplied ? 0 : null,
      recapture_required: patchApplied
    },
    passed: patchApplied || (!apply && true),
    blockers: human && apply ? ['patch_handoff_requires_human_review'] : []
  };
}
