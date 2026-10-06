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

export function listProductionRecoveryCandidates(): readonly RecoveryCandidate[] {
  return [];
}
