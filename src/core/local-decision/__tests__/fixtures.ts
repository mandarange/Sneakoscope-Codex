import type {
  DecisionFieldResult,
  DecisionInput,
  DecisionResult
} from '../types.js'

/**
 * Synthetic policy fixtures. These are not performance data and the model ids
 * below must never be accepted as a deployment preset.
 */
export const FIXTURE_MODEL_ID = 'test-only-model'
export const FIXTURE_MODEL_REVISION = 'test-only-revision'

export function inputFixture(
  patch: Partial<DecisionInput['facts']> = {},
  extra: Partial<Pick<DecisionInput, 'kind' | 'requestId' | 'summary' | 'scope'>> = {}
): DecisionInput {
  return {
    schemaVersion: 1,
    requestId: extra.requestId ?? 'req-fixture-1',
    kind: extra.kind ?? 'planning',
    scope: extra.scope ?? {
      projectDigest: 'project-fixture', missionId: 'mission-fixture',
      workflowRunId: 'run-fixture', snapshotDigest: 'snapshot-fixture'
    },
    summary: extra.summary ?? 'Bounded changes in two independent non-sensitive files.',
    facts: {
      taskProfile: 'parallel-write', gateProfile: 'scoped',
      countSource: 'automatic', baselineAgents: 4,
      baselineEffort: 'high', rolePreferenceExplicit: false,
      highRisk: false, evidenceFresh: true, failedChecks: 0,
      attemptIndex: 0, ...patch
    }
  }
}

export function recoveryInputFixture(patch: Partial<DecisionInput['facts']> = {}): DecisionInput {
  return inputFixture({ failedChecks: 2, attemptIndex: 1, ...patch }, {
    kind: 'recovery',
    requestId: 'req-fixture-recovery-1',
    summary: 'Test suite failed on two node:test files after the implementation slice; environment unchanged.'
  })
}

export function field(values: readonly string[], selected: string, top = 0.95): DecisionFieldResult {
  const other = (1 - top) / (values.length - 1)
  return {
    value: selected,
    choices: values.map((value) => ({
      value, candidateProbability: value === selected ? top : other
    })),
    calibrationStatus: 'uncalibrated', margin: top - other
  }
}

export function okFixture(input: DecisionInput, overrides: Partial<Record<string, DecisionFieldResult>> = {}): DecisionResult {
  const fields = input.kind === 'planning'
    ? {
        workloadClass: field(['mechanical', 'bounded', 'complex', 'unknown'], 'bounded'),
        fanoutAdvice: field(['keep', 'reduce_if_optional', 'abstain'], 'reduce_if_optional'),
        effortAdvice: field(['keep', 'consider_lower', 'consider_higher', 'abstain'], 'consider_lower')
      }
    : {
        failureClass: field(['environment', 'test', 'implementation', 'unknown'], 'test'),
        nextAction: field(['inspect_evidence', 'replan', 'escalate', 'abstain'], 'inspect_evidence')
      }
  return {
    status: 'ok', requestId: input.requestId,
    scope: { ...input.scope }, kind: input.kind,
    fields: { ...fields, ...overrides } as any,
    model: {
      modelId: FIXTURE_MODEL_ID, modelRevision: FIXTURE_MODEL_REVISION,
      engineVersion: 'fixture', tokenizerDigest: 'fixture',
      quantization: 'fixture', implementationOrigin: 'sks'
    },
    timing: { queueMs: 0, inferenceMs: 0, totalMs: 0, coldStart: false },
    compute: {
      inputTokens: null, inputTokenEvidence: null,
      forwardPasses: 1, sharedPrefill: false
    }
  }
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
