export type SksModelMode =
  | 'gpt-mad'
  | 'classic-naruto'
  | 'unknown';

export interface SksModelModeDecision {
  readonly schema: 'sks.model-mode-decision.v1';
  readonly mode: SksModelMode;
  readonly glm_enabled: false;
  readonly gpt_mad_preserved: boolean;
  readonly reason: string;
  readonly args: readonly string[];
}

export function resolveSksModelMode(args: readonly string[] = []): SksModelModeDecision {
  const normalized = args.map(String);
  const hasGlm = normalized.some((arg) => arg === '--glm' || arg.startsWith('--glm='));
  const hasMad = normalized.includes('--mad') || normalized.includes('--MAD') || normalized.includes('--mad-sks');
  const hasNaruto = normalized.includes('naruto');

  if (hasGlm) {
    return decision('unknown', false, 'glm_mad_removed', normalized);
  }
  if (hasMad) {
    return decision('gpt-mad', true, 'mad_without_--glm', normalized);
  }
  if (hasNaruto) {
    return decision('classic-naruto', true, 'naruto_without_--glm', normalized);
  }
  return decision('unknown', false, 'no_model_mode_flags', normalized);
}

/** @deprecated GLM MAD routes were removed. */
export function assertGlmRoute(args: readonly string[] = []): never {
  void args;
  throw new Error('sks_glm_route_removed:use_codex_app_use_openrouter');
}

export function assertNonGlmMadRoute(args: readonly string[] = []): SksModelModeDecision {
  const resolved = resolveSksModelMode(args);
  if (resolved.mode !== 'gpt-mad') {
    throw new Error(`sks_mad_route_glm_leak:${resolved.mode}`);
  }
  return resolved;
}

function decision(
  mode: SksModelMode,
  gptMadPreserved: boolean,
  reason: string,
  args: readonly string[]
): SksModelModeDecision {
  return {
    schema: 'sks.model-mode-decision.v1',
    mode,
    glm_enabled: false,
    gpt_mad_preserved: gptMadPreserved,
    reason,
    args
  };
}
