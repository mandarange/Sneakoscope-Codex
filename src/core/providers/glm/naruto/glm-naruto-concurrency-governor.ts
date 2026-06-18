import type { GlmNarutoConcurrencyDecision } from './glm-naruto-types.js';
import { GLM_NARUTO_DEFAULTS } from './glm-naruto-types.js';

export interface GovernorInput {
  readonly requestedClones: number;
  readonly activeWorkers: number;
  readonly rateLimited429: number;
  readonly ttftP90Ms: number;
  readonly failureRate: number;
  readonly operatorMax: number;
}

export function decideConcurrency(input: GovernorInput): GlmNarutoConcurrencyDecision {
  const maxClones = Math.min(input.operatorMax || GLM_NARUTO_DEFAULTS.max_clones, GLM_NARUTO_DEFAULTS.max_clones);
  const requested = Math.min(input.requestedClones || GLM_NARUTO_DEFAULTS.default_clones, maxClones);
  const active = input.activeWorkers > 0 ? input.activeWorkers : Math.min(requested, GLM_NARUTO_DEFAULTS.safe_active_start);

  if (input.failureRate > 0.10) {
    return {
      target_active_workers: 0,
      burst_workers: 0,
      backpressure: true,
      reason: 'pause_high_5xx_or_failure_rate'
    };
  }

  if (input.rateLimited429 > 0 || input.ttftP90Ms > 15_000) {
    return {
      target_active_workers: Math.max(1, Math.floor(active * 0.5)),
      burst_workers: 0,
      backpressure: true,
      reason: 'scale_down_high_latency_or_rate_limit'
    };
  }

  if (input.ttftP90Ms < 5_000 && input.rateLimited429 === 0 && input.failureRate < 0.05 && active < requested) {
    const target = Math.min(requested, active + 2);
    return {
      target_active_workers: target,
      burst_workers: Math.min(2, requested - target),
      backpressure: false,
      reason: 'scale_up_low_latency_no_rate_limit'
    };
  }

  return {
    target_active_workers: Math.min(active, requested),
    burst_workers: 0,
    backpressure: false,
    reason: 'steady_state'
  };
}
