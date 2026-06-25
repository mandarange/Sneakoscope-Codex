import path from 'node:path';
import { appendJsonlBounded, nowIso, writeJsonAtomic } from '../fsx.js';
import { buildQaAuthDataSandboxPolicy, buildQaContractV2, buildQaJourneyGraphV2, type QaContractV2Options, type LegacyQaLoopContract } from './qa-contract-v2.js';
import { selectQaSurfaceForContract } from './qa-surface-router.js';
import { evaluateQaGateV2 } from './qa-gate-v2.js';
import {
  QA_ACTION_LEDGER_ARTIFACT,
  QA_ASSERTION_LEDGER_ARTIFACT,
  QA_AUTH_DATA_POLICY_ARTIFACT,
  QA_CONTRACT_V2_ARTIFACT,
  QA_FINDING_LEDGER_ARTIFACT,
  QA_FIX_LEDGER_ARTIFACT,
  QA_JOURNEY_GRAPH_ARTIFACT,
  QA_OBSERVATION_LEDGER_ARTIFACT,
  QA_REPLAY_LEDGER_ARTIFACT,
  QA_RUNTIME_EVENT_LEDGER_ARTIFACT,
  QA_SURFACE_SELECTION_ARTIFACT
} from './qa-types.js';

export async function initializeQaRuntimeArtifacts(
  dir: string,
  legacyContract: LegacyQaLoopContract,
  options: QaContractV2Options = {}
) {
  const contract = buildQaContractV2(legacyContract, options);
  const surface = selectQaSurfaceForContract(contract);
  const journey = buildQaJourneyGraphV2(contract);
  const authDataPolicy = buildQaAuthDataSandboxPolicy(contract);
  await writeJsonAtomic(path.join(dir, QA_CONTRACT_V2_ARTIFACT), contract);
  await writeJsonAtomic(path.join(dir, QA_SURFACE_SELECTION_ARTIFACT), surface);
  await writeJsonAtomic(path.join(dir, QA_JOURNEY_GRAPH_ARTIFACT), journey);
  await writeJsonAtomic(path.join(dir, QA_AUTH_DATA_POLICY_ARTIFACT), authDataPolicy);
  await appendRuntimeEvent(dir, 'qa-runtime.v2.initialized', {
    selected_surface: surface.selected_surface,
    target_kind: surface.target_kind,
    ui_required: contract.scope.ui_required,
    max_cycles: contract.runtime.max_cycles
  });
  await ensureLedgerPlaceholders(dir);
  const gateV2 = await evaluateQaGateV2(dir);
  return { contract, surface, journey, authDataPolicy, gateV2 };
}

async function appendRuntimeEvent(dir: string, kind: string, data: Record<string, unknown>) {
  await appendJsonlBounded(path.join(dir, QA_RUNTIME_EVENT_LEDGER_ARTIFACT), {
    schema: 'sks.qa-loop-runtime-event.v2',
    ts: nowIso(),
    kind,
    status: 'completed',
    data
  });
}

async function ensureLedgerPlaceholders(dir: string) {
  for (const artifact of [
    QA_ACTION_LEDGER_ARTIFACT,
    QA_OBSERVATION_LEDGER_ARTIFACT,
    QA_ASSERTION_LEDGER_ARTIFACT,
    QA_FINDING_LEDGER_ARTIFACT,
    QA_FIX_LEDGER_ARTIFACT,
    QA_REPLAY_LEDGER_ARTIFACT
  ]) {
    await appendJsonlBounded(path.join(dir, artifact), {
      schema: 'sks.qa-loop-ledger-init.v2',
      ts: nowIso(),
      kind: 'ledger_initialized',
      status: 'metadata',
      real: false
    });
  }
}
