import { PACKAGE_VERSION, nowIso } from '../fsx.mjs';

export const COMPLETION_PROOF_SCHEMA = 'sks.completion-proof.v1';
export const COMPLETION_PROOF_STATUSES = Object.freeze([
  'verified',
  'verified_partial',
  'blocked',
  'not_verified',
  'failed'
]);

export function emptyCompletionProof(overrides = {}) {
  return {
    schema: COMPLETION_PROOF_SCHEMA,
    version: PACKAGE_VERSION,
    generated_at: nowIso(),
    mission_id: null,
    route: null,
    status: 'not_verified',
    summary: {
      files_changed: 0,
      commands_run: 0,
      tests_passed: 0,
      tests_failed: 0,
      manual_review_required: true
    },
    evidence: {
      commands: [],
      files: [],
      db_safety: null,
      codex_app: null,
      computer_use: null,
      image_voxels: null,
      scouts: null,
      triwiki: null
    },
    claims: [],
    unverified: [],
    blockers: [],
    next_human_actions: [],
    ...overrides
  };
}
