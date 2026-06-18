export type GlmNarutoIsolationMode =
  | 'patch-envelope-only'
  | 'git-worktree'
  | 'blocked';

export interface GlmNarutoIsolationPolicy {
  readonly schema: 'sks.glm-naruto-isolation-policy.v1';
  readonly requested: 'auto' | 'patch-envelope-only' | 'git-worktree';
  readonly selected: GlmNarutoIsolationMode;
  readonly honest: true;
  readonly reason: string;
  readonly blockers: readonly string[];
  readonly fallback_allowed: boolean;
  readonly workers_write_main_workspace: false;
}

export function resolveGlmNarutoIsolationPolicy(input: {
  readonly useWorktree?: boolean;
  readonly patchEnvelopeOnly?: boolean;
  readonly fallbackAllowed?: boolean;
  readonly gitAvailable: boolean;
}): GlmNarutoIsolationPolicy {
  const requested = input.useWorktree ? 'git-worktree' : input.patchEnvelopeOnly ? 'patch-envelope-only' : 'auto';
  if (input.patchEnvelopeOnly || !input.useWorktree) {
    return {
      schema: 'sks.glm-naruto-isolation-policy.v1',
      requested,
      selected: 'patch-envelope-only',
      honest: true,
      reason: input.patchEnvelopeOnly ? 'patch_envelope_only_requested' : 'worktree_not_requested',
      blockers: [],
      fallback_allowed: Boolean(input.fallbackAllowed),
      workers_write_main_workspace: false
    };
  }
  if (input.gitAvailable) {
    return {
      schema: 'sks.glm-naruto-isolation-policy.v1',
      requested,
      selected: 'git-worktree',
      honest: true,
      reason: 'git_worktree_available',
      blockers: [],
      fallback_allowed: Boolean(input.fallbackAllowed),
      workers_write_main_workspace: false
    };
  }
  return {
    schema: 'sks.glm-naruto-isolation-policy.v1',
    requested,
    selected: input.fallbackAllowed ? 'patch-envelope-only' : 'blocked',
    honest: true,
    reason: input.fallbackAllowed ? 'git_worktree_unavailable_fallback_allowed' : 'git_worktree_unavailable',
    blockers: input.fallbackAllowed ? [] : ['glm_naruto_worktree_not_implemented_or_unavailable'],
    fallback_allowed: Boolean(input.fallbackAllowed),
    workers_write_main_workspace: false
  };
}
