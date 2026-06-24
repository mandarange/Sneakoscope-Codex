import { extractCanonicalToolCallId, transitionMadDbOperation } from './mad-db-operation-store.js';

export interface MadDbLifecycleHook {
  mission_id: string;
  operation_id: string;
  tool_call_id?: string | null;
  cycle_id?: string | null;
  tool_name?: string | null;
  sql_hash?: string | null;
  mcp_server?: string | null;
  destructive?: boolean;
}

export async function recordPendingMadDbLifecycleHook(_root: string, _missionId: string, hook: MadDbLifecycleHook) {
  return {
    schema: 'sks.mad-db-lifecycle-pending.v2',
    pending_latest_removed: true,
    hook
  };
}

export async function readLatestPendingMadDbLifecycleHook(_root: string, _missionId: string, payload: any = {}): Promise<MadDbLifecycleHook | null> {
  return lifecycleHookFromUnknown(payload);
}

export async function recordMadDbToolResult(input: {
  root: string;
  missionId: string;
  hook: MadDbLifecycleHook;
  ok: boolean;
  rowCount?: number | null;
  error?: string | null;
}) {
  if (!input.hook.tool_call_id) {
    return {
      schema: 'sks.mad-db-tool-result-lifecycle.v2',
      ok: false,
      skipped: true,
      reason: 'tool_call_id_required_for_result_correlation',
      operation_id: input.hook.operation_id
    };
  }
  const operation = await transitionMadDbOperation({
    root: input.root,
    missionId: input.missionId,
    toolCallId: input.hook.tool_call_id,
    state: input.ok ? 'succeeded' : 'failed',
    result: { ok: input.ok, row_count: input.rowCount ?? null },
    errorCode: input.ok ? null : input.error || 'tool_failed'
  });
  return {
    schema: 'sks.mad-db-tool-result-lifecycle.v2',
    ok: Boolean(operation),
    skipped: false,
    operation_id: input.hook.operation_id,
    tool_call_id: input.hook.tool_call_id,
    result_status: input.ok ? 'succeeded' : 'failed',
    operation
  };
}

export async function maybeRecordMadDbToolResultFromToolUse(input: {
  root: string;
  missionId: string;
  toolCallPayload?: any;
  toolResult?: any;
  decision?: any;
}) {
  const payload = input.toolResult ?? input.toolCallPayload ?? {};
  const hook = lifecycleHookFromUnknown(input.decision)
    || lifecycleHookFromUnknown(input.toolCallPayload)
    || lifecycleHookFromUnknown(input.toolResult);
  const toolCallId = extractCanonicalToolCallId(payload) || hook?.tool_call_id || null;
  if (!toolCallId && !hook) return null;
  const ok = !madDbToolUseFailed(payload);
  return recordMadDbToolResult({
    root: input.root,
    missionId: input.missionId,
    hook: hook || {
      mission_id: input.missionId,
      operation_id: `unknown-${toolCallId}`,
      tool_call_id: toolCallId
    },
    ok,
    rowCount: extractRowCount(payload),
    error: ok ? null : extractToolError(payload)
  });
}

export function lifecycleHookFromUnknown(value: any): MadDbLifecycleHook | null {
  const candidate = value?.ledger_result_hook || value?.mad_db?.ledger_result_hook || value;
  const missionId = stringOrNull(candidate?.mission_id || candidate?.missionId);
  const operationId = stringOrNull(candidate?.operation_id || candidate?.operationId);
  if (!missionId || !operationId) return null;
  return {
    mission_id: missionId,
    operation_id: operationId,
    tool_call_id: stringOrNull(candidate?.tool_call_id || candidate?.toolCallId),
    cycle_id: stringOrNull(candidate?.cycle_id || candidate?.cycleId),
    tool_name: stringOrNull(candidate?.tool_name || candidate?.toolName),
    sql_hash: stringOrNull(candidate?.sql_hash || candidate?.sqlHash),
    mcp_server: stringOrNull(candidate?.mcp_server || candidate?.mcpServer),
    destructive: candidate?.destructive === true
  };
}

function madDbToolUseFailed(payload: any = {}) {
  if (payload?.isError === true || payload?.tool_response?.isError === true || payload?.toolResponse?.isError === true || payload?.result?.isError === true) return true;
  const candidates = [
    payload.exit_code,
    payload.exitCode,
    payload.tool_response?.exit_code,
    payload.toolResponse?.exitCode,
    payload.result?.exit_code,
    payload.result?.exitCode
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const n = Number(candidate);
    if (Number.isFinite(n)) return n !== 0;
  }
  if (payload.success === false || payload.tool_response?.success === false || payload.toolResponse?.success === false || payload.result?.success === false) return true;
  if (payload.executed === false) return true;
  return false;
}

function extractRowCount(payload: any = {}) {
  const candidates = [
    payload.row_count,
    payload.rowCount,
    payload.tool_response?.row_count,
    payload.tool_response?.rowCount,
    payload.toolResponse?.rowCount,
    payload.result?.row_count,
    payload.result?.rowCount,
    payload.result?.rows_affected,
    payload.tool_response?.rows_affected
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractToolError(payload: any = {}) {
  if (payload?.result?.isError === true && Array.isArray(payload.result.content)) {
    const text = payload.result.content.map((entry: any) => entry?.text || entry?.message || '').filter(Boolean).join('\n');
    if (text.trim()) return text.trim();
  }
  return String(payload.error || payload.message || payload.stderr || payload.tool_response?.stderr || payload.toolResponse?.stderr || payload.result?.stderr || payload.result?.error || 'tool_failed');
}

function stringOrNull(value: unknown): string | null {
  const text = String(value || '').trim();
  return text ? text : null;
}
