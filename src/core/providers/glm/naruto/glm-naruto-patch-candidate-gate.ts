import { checkAndApplyGlmPatch } from '../glm-patch-apply.js';
import type { GlmNarutoPatchEnvelope } from './glm-naruto-types.js';
import { parseGlmNarutoPatchCandidate } from './glm-naruto-patch-candidate-parser.js';

export interface GlmNarutoPatchCandidateGateResult {
  readonly schema: 'sks.glm-naruto-patch-candidate-gate.v1';
  readonly ok: boolean;
  readonly worker_id: string;
  readonly shard_id: string;
  readonly patch_id: string;
  readonly extracted_patch: string;
  readonly touched_paths: readonly string[];
  readonly checks: readonly {
    readonly id: string;
    readonly ok: boolean;
    readonly reason?: string;
    readonly ms: number;
  }[];
  readonly blockers: readonly string[];
}

const PROTECTED_PATH = /(^|\/)(\.github|dist|node_modules)(\/|$)/;
const SECRET_PATTERN = /\b(?:Bearer\s+[A-Za-z0-9._~+/-]+|sk-(?:or-)?[A-Za-z0-9_-]{12,}|OPENROUTER_API_KEY|SKS_OPENROUTER_API_KEY)\b/;

export async function evaluateGlmNarutoPatchCandidateGate(input: {
  readonly cwd: string;
  readonly envelope: GlmNarutoPatchEnvelope;
  readonly apply?: boolean;
}): Promise<GlmNarutoPatchCandidateGateResult> {
  const checks: GlmNarutoPatchCandidateGateResult['checks'][number][] = [];
  const parsed = parseGlmNarutoPatchCandidate(input.envelope.patch);
  checks.push(check('candidate_parse', parsed.ok, parsed.blockers.join(',') || undefined));
  checks.push(check('patch_section', Boolean(parsed.patch), parsed.patch ? undefined : 'missing_patch_section'));
  checks.push(check('unified_diff', /^diff --git /m.test(parsed.patch), parsed.patch ? undefined : 'no_diff_git'));

  const blockedPath = parsed.touched_paths.find((file) => PROTECTED_PATH.test(file));
  checks.push(check('protected_path_guard', !blockedPath, blockedPath));

  const secretLeak = SECRET_PATTERN.test(parsed.patch);
  checks.push(check('secret_leakage_guard', !secretLeak, secretLeak ? 'secret_like_content' : undefined));

  if (parsed.ok && !blockedPath && !secretLeak) {
    const applyCheck = await checkAndApplyGlmPatch({
      cwd: input.cwd,
      patch: parsed.patch,
      apply: input.apply === true
    });
    checks.push(check('git_apply_check', applyCheck.ok, applyCheck.ok ? undefined : applyCheck.error.code));
  } else {
    checks.push({ id: 'git_apply_check', ok: false, reason: 'skipped_due_to_prior_blocker', ms: 0 });
  }

  const blockers = checks.filter((row) => !row.ok).map((row) => row.reason || row.id);
  return {
    schema: 'sks.glm-naruto-patch-candidate-gate.v1',
    ok: blockers.length === 0,
    worker_id: input.envelope.worker_id,
    shard_id: input.envelope.shard_id,
    patch_id: input.envelope.patch_sha256,
    extracted_patch: parsed.patch,
    touched_paths: parsed.touched_paths,
    checks,
    blockers
  };
}

function check(id: string, ok: boolean, reason?: string): GlmNarutoPatchCandidateGateResult['checks'][number] {
  return { id, ok, ...(reason ? { reason } : {}), ms: 0 };
}
