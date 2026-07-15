import path from 'node:path';
import { ensureDir, nowIso, readJson, sha256, writeJsonAtomic } from '../../fsx.js';
import { appendMadSksSqlPlaneLedgerEvent } from './ledger.js';
import { withMadSksSqlPlaneLock } from './lock.js';
import type { MadSksSqlPlaneCapabilityV2 } from './capability.js';
import { updateMadSksSqlPlaneCapabilityCounters } from './capability.js';
import type { MadSksSqlPlaneOperationClass } from './policy.js';
import { madSksSqlPlaneRuntimeDir } from './paths.js';

export interface MadSksSqlPlaneOperationV2 {
  schema: 'sks.mad-sks-sql-plane-operation.v2';
  operation_id: string;
  tool_call_id: string;
  mission_id: string;
  cycle_id: string;
  project_ref_hash: string;
  tool_name: string;
  sql_sha256: string | null;
  migration_name: string | null;
  operation_classes: MadSksSqlPlaneOperationClass[];
  state:
    | 'proposed'
    | 'reserved'
    | 'started'
    | 'succeeded'
    | 'failed'
    | 'unknown'
    | 'verifying'
    | 'verified'
    | 'verification_failed'
    | 'rolled_back'
    | 'irreversible';
  attempt: number;
  started_at: string | null;
  finished_at: string | null;
  result_digest: string | null;
  verification_artifact: string | null;
  error_code: string | null;
}

export interface MadSksSqlPlaneReservation {
  operation: MadSksSqlPlaneOperationV2;
  reused: boolean;
  capability: MadSksSqlPlaneCapabilityV2;
}

export async function reserveMadSksSqlPlaneOperation(input: {
  root: string;
  missionId: string;
  capability: MadSksSqlPlaneCapabilityV2;
  toolCallId: string;
  toolName: string;
  sql?: string | null;
  migrationName?: string | null;
  operationClasses: MadSksSqlPlaneOperationClass[];
}): Promise<MadSksSqlPlaneReservation> {
  return withMadSksSqlPlaneLock(input.root, input.missionId, `operation-${safeKey(input.toolCallId)}`, async () => {
    const file = operationFile(input.root, input.missionId, input.toolCallId);
    const existing = await readJson<MadSksSqlPlaneOperationV2 | null>(file, null);
    if (existing?.schema === 'sks.mad-sks-sql-plane-operation.v2') {
      return { operation: existing, reused: true, capability: input.capability };
    }
    const operationId = `mad-sks-sql-plane-op-${sha256(`${input.missionId}:${input.capability.cycle_id}:${input.toolCallId}`).slice(0, 16)}`;
    const operation: MadSksSqlPlaneOperationV2 = {
      schema: 'sks.mad-sks-sql-plane-operation.v2',
      operation_id: operationId,
      tool_call_id: input.toolCallId,
      mission_id: input.missionId,
      cycle_id: input.capability.cycle_id,
      project_ref_hash: sha256(input.capability.project_ref).slice(0, 16),
      tool_name: input.toolName,
      sql_sha256: input.sql ? sha256(input.sql) : null,
      migration_name: input.migrationName || null,
      operation_classes: input.operationClasses,
      state: 'reserved',
      attempt: 1,
      started_at: null,
      finished_at: null,
      result_digest: null,
      verification_artifact: null,
      error_code: null
    };
    await ensureDir(path.dirname(file));
    await writeJsonAtomic(file, operation);
    const capability = await updateMadSksSqlPlaneCapabilityCounters(input.root, input.missionId, {
      attemptsDelta: 1,
      reservedDelta: 1
    });
    await appendMadSksSqlPlaneLedgerEvent(input.root, input.missionId, {
      type: 'db_operation.reserved',
      operation_id: operation.operation_id,
      tool_call_id: operation.tool_call_id,
      cycle_id: operation.cycle_id,
      tool_name: operation.tool_name,
      sql_sha256: operation.sql_sha256,
      operation_classes: operation.operation_classes
    });
    return { operation, reused: false, capability: capability || input.capability };
  });
}

export async function transitionMadSksSqlPlaneOperation(input: {
  root: string;
  missionId: string;
  toolCallId: string;
  state: MadSksSqlPlaneOperationV2['state'];
  result?: unknown;
  errorCode?: string | null;
  verificationArtifact?: string | null;
}) {
  return withMadSksSqlPlaneLock(input.root, input.missionId, `operation-${safeKey(input.toolCallId)}`, async () => {
    const file = operationFile(input.root, input.missionId, input.toolCallId);
    const existing = await readJson<MadSksSqlPlaneOperationV2 | null>(file, null);
    if (!existing) return null;
    const terminalSuccess = input.state === 'succeeded' || input.state === 'verified';
    const terminalFailure = input.state === 'failed' || input.state === 'verification_failed' || input.state === 'unknown';
    const updated: MadSksSqlPlaneOperationV2 = {
      ...existing,
      state: input.state,
      started_at: existing.started_at || (input.state === 'started' ? nowIso() : existing.started_at),
      finished_at: terminalSuccess || terminalFailure ? nowIso() : existing.finished_at,
      result_digest: input.result === undefined ? existing.result_digest : sha256(safeResultDigestInput(input.result)).slice(0, 32),
      verification_artifact: input.verificationArtifact || existing.verification_artifact,
      error_code: input.errorCode || existing.error_code
    };
    await writeJsonAtomic(file, updated);
    if (input.state === 'succeeded') await updateMadSksSqlPlaneCapabilityCounters(input.root, input.missionId, { succeededDelta: 1 });
    if (input.state === 'failed') await updateMadSksSqlPlaneCapabilityCounters(input.root, input.missionId, { failedDelta: 1 });
    await appendMadSksSqlPlaneLedgerEvent(input.root, input.missionId, {
      type: `db_operation.${input.state}`,
      operation_id: updated.operation_id,
      tool_call_id: updated.tool_call_id,
      cycle_id: updated.cycle_id,
      tool_name: updated.tool_name,
      result_digest: updated.result_digest,
      verification_artifact: updated.verification_artifact,
      error_code: updated.error_code
    });
    return updated;
  });
}

export function extractCanonicalToolCallId(payload: any = {}): string | null {
  const candidates = [
    payload.tool_call_id,
    payload.toolCallId,
    payload.call_id,
    payload.callId,
    payload.id,
    payload.request_id,
    payload.requestId,
    payload.tool?.id,
    payload.tool?.call_id,
    payload.metadata?.tool_call_id,
    payload.context?.tool_call_id
  ];
  const found = candidates.find((value) => typeof value === 'string' && value.trim());
  return found ? String(found).trim() : null;
}

export function operationFile(root: string, missionId: string, toolCallId: string): string {
  return path.join(madSksSqlPlaneRuntimeDir(root, missionId), 'operations', `${safeKey(toolCallId)}.json`);
}

function safeKey(value: string): string {
  return sha256(value).slice(0, 24);
}

function safeResultDigestInput(value: unknown): string {
  try {
    return JSON.stringify(redactSensitive(value));
  } catch {
    return String(value);
  }
}

function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return value;
  if (typeof value === 'string') {
    return value.replace(/(access_token|refresh_token|password|apikey|service_role|secret)["'=:\s]+[A-Za-z0-9._~+/=-]+/gi, '$1=<redacted>');
  }
  if (Array.isArray(value)) return value.map((entry) => redactSensitive(entry, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (/token|password|secret|apikey|service_role/i.test(key)) out[key] = '<redacted>';
      else if (/rows|data|records/i.test(key) && Array.isArray(entry)) out[key] = `<redacted:${entry.length}:rows>`;
      else out[key] = redactSensitive(entry, depth + 1);
    }
    return out;
  }
  return value;
}
