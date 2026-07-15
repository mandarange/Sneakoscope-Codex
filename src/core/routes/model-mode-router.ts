export type SksModelMode =
  | 'gpt-mad'
  | 'glm-direct'
  | 'glm-naruto'
  | 'classic-naruto'
  | 'unknown';

export interface SksModelModeDecision {
  readonly schema: 'sks.model-mode-decision.v1';
  readonly mode: SksModelMode;
  readonly glm_enabled: boolean;
  readonly gpt_mad_preserved: boolean;
  readonly reason: string;
  readonly args: readonly string[];
}

export function resolveSksModelMode(args: readonly string[] = []): SksModelModeDecision {
  const normalized = args.map(String);
  const hasGlm = normalized.includes('--glm');
  const hasMad = normalized.includes('--mad') || normalized.includes('--MAD') || normalized.includes('--mad-sks');
  const hasNaruto = normalized.includes('naruto');

  if (hasGlm && hasNaruto && !hasMad) {
    return decision('classic-naruto', false, true, 'naruto_command_glm_override_forbidden', normalized);
  }
  if (hasGlm && hasNaruto) {
    return decision('glm-naruto', true, false, 'explicit_--glm_with_naruto', normalized);
  }
  if (hasGlm) {
    return decision('glm-direct', true, false, 'explicit_--glm', normalized);
  }
  if (hasMad) {
    return decision('gpt-mad', false, true, 'mad_without_--glm', normalized);
  }
  if (hasNaruto) {
    return decision('classic-naruto', false, true, 'naruto_without_--glm', normalized);
  }
  return decision('unknown', false, false, 'no_model_mode_flags', normalized);
}

export function assertGlmRoute(args: readonly string[] = []): SksModelModeDecision {
  const resolved = resolveSksModelMode(args);
  if (!resolved.glm_enabled) {
    throw new Error(`sks_glm_route_required:${resolved.mode}`);
  }
  return resolved;
}

export function assertNonGlmMadRoute(args: readonly string[] = []): SksModelModeDecision {
  const resolved = resolveSksModelMode(args);
  if (resolved.glm_enabled || resolved.mode !== 'gpt-mad') {
    throw new Error(`sks_mad_route_glm_leak:${resolved.mode}`);
  }
  return resolved;
}

function decision(
  mode: SksModelMode,
  glmEnabled: boolean,
  gptMadPreserved: boolean,
  reason: string,
  args: readonly string[]
): SksModelModeDecision {
  return {
    schema: 'sks.model-mode-decision.v1',
    mode,
    glm_enabled: glmEnabled,
    gpt_mad_preserved: gptMadPreserved,
    reason,
    args
  };
}
