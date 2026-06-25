import path from 'node:path';
import { exists, nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js';
import type { QaContractV2, QaRunStatus, QaSurfaceSelection } from './qa-types.js';
import {
  QA_ACTION_LEDGER_ARTIFACT,
  QA_CONTRACT_V2_ARTIFACT,
  QA_FINDING_LEDGER_ARTIFACT,
  QA_FIX_LEDGER_ARTIFACT,
  QA_GATE_V2_ARTIFACT,
  QA_OBSERVATION_LEDGER_ARTIFACT,
  QA_REPLAY_LEDGER_ARTIFACT,
  QA_SURFACE_SELECTION_ARTIFACT
} from './qa-types.js';

export interface QaGateV2 {
  readonly schema: 'sks.qa-loop-gate.v2';
  readonly checked_at: string;
  readonly passed: boolean;
  readonly status: QaRunStatus;
  readonly mission_id: string | null;
  readonly selected_surface: string | null;
  readonly ui_required: boolean;
  readonly real_action_count: number;
  readonly observation_count: number;
  readonly finding_count: number;
  readonly unresolved_finding_count: number;
  readonly applied_fix_count: number;
  readonly replay_count: number;
  readonly same_flow_replay_complete: boolean;
  readonly blockers: readonly string[];
  readonly unverified: readonly string[];
  readonly artifacts: {
    readonly contract_v2: string;
    readonly surface_selection: string;
    readonly action_ledger: string;
    readonly observation_ledger: string;
    readonly finding_ledger: string;
    readonly fix_ledger: string;
    readonly replay_ledger: string;
  };
}

export async function evaluateQaGateV2(dir: string): Promise<QaGateV2> {
  const contract = await readJson(path.join(dir, QA_CONTRACT_V2_ARTIFACT), null) as QaContractV2 | null;
  const surface = await readJson(path.join(dir, QA_SURFACE_SELECTION_ARTIFACT), null) as QaSurfaceSelection | null;
  const actions = await readJsonl(path.join(dir, QA_ACTION_LEDGER_ARTIFACT));
  const observations = await readJsonl(path.join(dir, QA_OBSERVATION_LEDGER_ARTIFACT));
  const findings = await readJsonl(path.join(dir, QA_FINDING_LEDGER_ARTIFACT));
  const fixes = await readJsonl(path.join(dir, QA_FIX_LEDGER_ARTIFACT));
  const replays = await readJsonl(path.join(dir, QA_REPLAY_LEDGER_ARTIFACT));

  const blockers: string[] = [];
  const unverified: string[] = [];
  if (!contract) blockers.push('qa_contract_v2_missing');
  if (!surface) blockers.push('qa_surface_selection_missing');

  const uiRequired = contract?.scope?.ui_required === true;
  const findingRecords = findings.filter(isRuntimeRecord);
  const fixRecords = fixes.filter(isRuntimeRecord);
  const replayRecords = replays.filter(isRuntimeRecord);
  const realActions = actions.filter(isRuntimeRecord).filter(isRealRecord);
  const realObservations = observations.filter(isRuntimeRecord).filter(isRealRecord);
  const unresolvedFindings = findingRecords.filter((record) => !['resolved', 'false_positive', 'deferred_nonfixable'].includes(String(record.status || record.data?.status || '')));
  const appliedFixes = fixRecords.filter((record) => ['applied', 'verified'].includes(String(record.status || record.data?.status || '')));
  const completedReplays = replayRecords.filter((record) => ['passed', 'completed', 'verified'].includes(String(record.status || record.data?.status || '')));
  const sameFlowReplayComplete = appliedFixes.length === 0 || appliedFixes.every((fix) => {
    const fixId = String(fix.fix_id || fix.data?.fix_id || fix.item_id || '');
    const journey = String(fix.journey_fingerprint || fix.data?.journey_fingerprint || '');
    return completedReplays.some((replay) => {
      const replayFix = String(replay.fix_id || replay.data?.fix_id || replay.item_id || '');
      const replayJourney = String(replay.journey_fingerprint || replay.data?.journey_fingerprint || '');
      return (!fixId || replayFix === fixId) && (!journey || replayJourney === journey);
    });
  });

  if (uiRequired && realActions.length === 0) blockers.push('ui_required_but_real_action_count_zero');
  if (uiRequired && realObservations.length === 0) blockers.push('ui_required_but_observation_count_zero');
  if (appliedFixes.length > 0 && !sameFlowReplayComplete) blockers.push('applied_fix_without_same_flow_replay');
  if (unresolvedFindings.length > 0) blockers.push('unresolved_findings_remaining');
  if (recordsContainSyntheticAsReal([...actions, ...observations, ...findings, ...fixes, ...replays])) blockers.push('synthetic_or_mock_record_claimed_as_real');
  if (surface?.selected_surface && uiRequired && ['structured_mcp', 'shell_or_api_diagnostic'].includes(surface.selected_surface)) {
    blockers.push('ui_required_without_visual_surface');
  }
  if (surface && surface.visual_surface_required && realActions.length === 0) {
    unverified.push(`${surface.selected_surface}_live_action_evidence_missing`);
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueUnverified = [...new Set(unverified)];
  const passed = uniqueBlockers.length === 0;
  const result: QaGateV2 = {
    schema: 'sks.qa-loop-gate.v2',
    checked_at: nowIso(),
    passed,
    status: passed ? 'passed' : uniqueBlockers.some((item) => item.includes('missing') || item.includes('zero')) ? 'blocked' : 'failed',
    mission_id: contract?.mission_id || surface?.mission_id || null,
    selected_surface: surface?.selected_surface || null,
    ui_required: uiRequired,
    real_action_count: realActions.length,
    observation_count: realObservations.length,
    finding_count: findingRecords.length,
    unresolved_finding_count: unresolvedFindings.length,
    applied_fix_count: appliedFixes.length,
    replay_count: completedReplays.length,
    same_flow_replay_complete: sameFlowReplayComplete,
    blockers: uniqueBlockers,
    unverified: uniqueUnverified,
    artifacts: {
      contract_v2: QA_CONTRACT_V2_ARTIFACT,
      surface_selection: QA_SURFACE_SELECTION_ARTIFACT,
      action_ledger: QA_ACTION_LEDGER_ARTIFACT,
      observation_ledger: QA_OBSERVATION_LEDGER_ARTIFACT,
      finding_ledger: QA_FINDING_LEDGER_ARTIFACT,
      fix_ledger: QA_FIX_LEDGER_ARTIFACT,
      replay_ledger: QA_REPLAY_LEDGER_ARTIFACT
    }
  };
  await writeJsonAtomic(path.join(dir, QA_GATE_V2_ARTIFACT), result);
  return result;
}

async function readJsonl(file: string): Promise<Record<string, any>[]> {
  if (!(await exists(file))) return [];
  const text = await readText(file, '');
  const records: Record<string, any>[] = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object') records.push(value);
    } catch {
      records.push({ schema: 'sks.qa-loop.invalid-jsonl-record', status: 'invalid_json' });
    }
  }
  return records;
}

function isRealRecord(record: Record<string, any>): boolean {
  const status = String(record.status || record.data?.status || '');
  if (status === 'invalid_json') return false;
  if (record.synthetic === true || record.mock === true || record.fixture === true) return false;
  if (record.data?.synthetic === true || record.data?.mock === true || record.data?.fixture === true) return false;
  return ['real', 'passed', 'completed', 'observed', 'captured', 'verified', 'failed'].includes(status)
    || record.real === true
    || record.data?.real === true;
}

function isRuntimeRecord(record: Record<string, any>): boolean {
  const status = String(record.status || record.data?.status || '');
  const kind = String(record.kind || record.data?.kind || '');
  if (status === 'metadata' || kind === 'ledger_initialized') return false;
  if (record.schema === 'sks.qa-loop-ledger-init.v2') return false;
  return status !== 'invalid_json';
}

function recordsContainSyntheticAsReal(records: Record<string, any>[]): boolean {
  return records.some((record) => {
    const synthetic = record.synthetic === true || record.mock === true || record.fixture === true || record.data?.synthetic === true || record.data?.mock === true || record.data?.fixture === true;
    const claimedReal = record.real === true || record.data?.real === true || /real|live/i.test(String(record.status || record.data?.status || ''));
    return synthetic && claimedReal;
  });
}
