import path from 'node:path';
import { writeJsonAtomic } from '../../../fsx.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import type {
  GlmNarutoApplyTransaction,
  GlmNarutoMissionResult,
  GlmNarutoPatchEnvelope,
  GlmNarutoRequirementCoverageSummary,
  GlmNarutoWorkerTrace
} from './glm-naruto-types.js';
import type { GlmNarutoIsolationPolicy } from './glm-naruto-isolation-policy.js';

export interface GlmNarutoFinalSeal {
  readonly schema: 'sks.glm-naruto-final-seal.v1';
  readonly mission_id: string;
  readonly status: 'passed' | 'blocked' | 'failed' | 'partial';
  readonly model_lock: {
    readonly model: typeof GLM_52_OPENROUTER_MODEL;
    readonly gpt_fallback_allowed: false;
    readonly requests_checked: number;
    readonly mismatches: readonly string[];
  };
  readonly isolation: {
    readonly selected: 'patch-envelope-only' | 'git-worktree' | 'blocked';
    readonly workers_write_main_workspace: false;
    readonly violations: readonly string[];
  };
  readonly scheduler: {
    readonly bounded: true;
    readonly max_observed_active_workers: number;
    readonly queue_drained: boolean;
    readonly backpressure_events: number;
  };
  readonly candidates: {
    readonly total: number;
    readonly gate_passed: number;
    readonly verifier_passed: number;
    readonly selected: readonly string[];
  };
  readonly requirement_coverage: {
    readonly required_total: number;
    readonly required_covered: number;
    readonly passed: boolean;
    readonly uncovered_required_requirements: readonly string[];
  };
  readonly apply: {
    readonly attempted: boolean;
    readonly transaction_path: string | null;
    readonly final_status: string | null;
    readonly rollback_attempted: boolean;
    readonly rollback_passed: boolean | null;
  };
  readonly secret_audit: {
    readonly ok: boolean;
    readonly findings: readonly string[];
  };
  readonly stop_gate: {
    readonly path: string;
    readonly passed: boolean;
  };
}

export async function writeGlmNarutoFinalSeal(input: {
  readonly artifactDir: string;
  readonly missionId: string;
  readonly result: GlmNarutoMissionResult;
  readonly envelopes: readonly GlmNarutoPatchEnvelope[];
  readonly traces: readonly GlmNarutoWorkerTrace[];
  readonly isolationPolicy: GlmNarutoIsolationPolicy;
  readonly scheduler: {
    readonly max_observed_active_workers: number;
    readonly queue_drained: boolean;
    readonly backpressure_events: number;
  };
  readonly selectedPatchIds: readonly string[];
  readonly requirementCoverage?: GlmNarutoRequirementCoverageSummary;
  readonly applyTransaction: GlmNarutoApplyTransaction | null;
  readonly secretAudit: { readonly ok: boolean; readonly findings?: readonly string[] };
  readonly stopGatePath: string;
  readonly stopGatePassed: boolean;
}): Promise<{ readonly seal: GlmNarutoFinalSeal; readonly path: string; readonly passed: boolean }> {
  const mismatches = [
    ...input.envelopes.filter((env) => env.model !== GLM_52_OPENROUTER_MODEL || env.gpt_fallback_allowed !== false).map((env) => `envelope:${env.worker_id}`),
    ...input.traces.filter((trace) => trace.model !== GLM_52_OPENROUTER_MODEL).map((trace) => `trace:${trace.worker_id}`)
  ];
  const isolationViolations = input.isolationPolicy.selected === 'blocked' ? input.isolationPolicy.blockers : [];
  const status = finalSealStatus({
    result: input.result,
    secretOk: input.secretAudit.ok,
    mismatches,
    isolationViolations,
    queueDrained: input.scheduler.queue_drained,
    requirementCoveragePassed: input.requirementCoverage?.passed ?? true
  });
  const seal: GlmNarutoFinalSeal = {
    schema: 'sks.glm-naruto-final-seal.v1',
    mission_id: input.missionId,
    status,
    model_lock: {
      model: GLM_52_OPENROUTER_MODEL,
      gpt_fallback_allowed: false,
      requests_checked: input.envelopes.length + input.traces.length,
      mismatches
    },
    isolation: {
      selected: input.isolationPolicy.selected,
      workers_write_main_workspace: false,
      violations: isolationViolations
    },
    scheduler: {
      bounded: true,
      max_observed_active_workers: input.scheduler.max_observed_active_workers,
      queue_drained: input.scheduler.queue_drained,
      backpressure_events: input.scheduler.backpressure_events
    },
    candidates: {
      total: input.envelopes.length,
      gate_passed: input.envelopes.filter((env) => env.status === 'gate_passed').length,
      verifier_passed: input.envelopes.filter((env) => env.verification_passed === true).length,
      selected: input.selectedPatchIds
    },
    requirement_coverage: {
      required_total: input.requirementCoverage?.required_total ?? 0,
      required_covered: input.requirementCoverage?.required_covered ?? 0,
      passed: input.requirementCoverage?.passed ?? true,
      uncovered_required_requirements: input.requirementCoverage?.uncovered_required_requirements ?? []
    },
    apply: {
      attempted: input.applyTransaction !== null,
      transaction_path: input.applyTransaction ? path.join(input.artifactDir, 'apply-transaction.json') : null,
      final_status: input.applyTransaction?.final_status ?? null,
      rollback_attempted: input.applyTransaction?.rollback_attempted ?? false,
      rollback_passed: input.applyTransaction?.rollback_passed ?? null
    },
    secret_audit: {
      ok: input.secretAudit.ok,
      findings: input.secretAudit.findings ?? []
    },
    stop_gate: {
      path: input.stopGatePath,
      passed: input.stopGatePassed
    }
  };
  const out = path.join(input.artifactDir, 'final-seal.json');
  await writeJsonAtomic(out, seal);
  return { seal, path: out, passed: seal.status === 'passed' };
}

function finalSealStatus(input: {
  readonly result: GlmNarutoMissionResult;
  readonly secretOk: boolean;
  readonly mismatches: readonly string[];
  readonly isolationViolations: readonly string[];
  readonly queueDrained: boolean;
  readonly requirementCoveragePassed: boolean;
}): GlmNarutoFinalSeal['status'] {
  if (!input.secretOk || input.mismatches.length > 0 || input.isolationViolations.length > 0 || !input.queueDrained || !input.requirementCoveragePassed) return 'blocked';
  if (input.result.ok) return 'passed';
  if (input.result.status === 'partial_candidates') return 'partial';
  if (input.result.status === 'blocked') return 'blocked';
  return 'failed';
}
