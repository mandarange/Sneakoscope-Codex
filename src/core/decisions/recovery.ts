import type { RecoveryCandidate } from './types.js';

export const RECOVERY_CAPABILITY = Object.freeze({
  supported: false,
  reason: 'unsupported_no_sks_handler',
  evidence: [
    'src/core/subagents/official-subagent-preparation.ts::recoverOfficialSubagentPreparationTransaction is deterministic crash recovery, not an ambiguous-failure Choice consumer',
    'src/core/subagents/official-subagent-runner.ts OAuth hint is a deterministic auth/port-conflict path',
    'src/core/triwiki/context-graph/store journal recovery is deterministic store repair',
    'Codex spawn_agent/send_input remain native-host-owned; a saved plan is not dispatch proof'
  ]
});

export type RecoveryHandler = (input: {
  actionId: string;
  diagnostic: string;
  candidate: RecoveryCandidate;
}) => Promise<{ invoked: true; actionId: string; consumptionEvidence: string }>;

const testHandlers = new Map<string, RecoveryHandler>();

export function listProductionRecoveryCandidates(): readonly RecoveryCandidate[] {
  return [];
}

export function setRecoveryTestHandler(actionId: string, handler: RecoveryHandler | null): void {
  if (process.env.SKS_JEV_DECISION_TEST_OVERRIDES !== '1') {
    throw new Error('recovery_test_handler_requires_test_overrides');
  }
  if (!handler) {
    testHandlers.delete(actionId);
    return;
  }
  testHandlers.set(actionId, handler);
}

export async function applyRecoveryEffect(input: {
  actionId: string;
  diagnostic: string;
  candidates: readonly RecoveryCandidate[];
}): Promise<
  | { ok: true; actionId: string; consumptionEvidence: string }
  | { ok: false; reason: 'capability_unavailable' | 'unauthorized' | 'invalid_response' }
> {
  if (process.env.SKS_JEV_DECISION_TEST_OVERRIDES !== '1') {
    return { ok: false, reason: 'capability_unavailable' };
  }
  const candidate = input.candidates.find((row) => row.id === input.actionId);
  if (!candidate) return { ok: false, reason: 'invalid_response' };
  if (!candidate.authorized) return { ok: false, reason: 'unauthorized' };
  const handler = testHandlers.get(candidate.handlerId);
  if (!handler) return { ok: false, reason: 'capability_unavailable' };
  const result = await handler({ actionId: candidate.id, diagnostic: input.diagnostic, candidate });
  return { ok: true, actionId: result.actionId, consumptionEvidence: result.consumptionEvidence };
}
