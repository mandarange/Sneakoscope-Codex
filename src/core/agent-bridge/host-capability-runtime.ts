import { sha256 } from '../fsx.js';
import { testMcpConnection, type McpHealthOptions } from '../mcp-config/health-check.js';
import { listMcpInventory, type McpInventoryOptions } from '../mcp-config/inventory.js';
import {
  HOST_CAPABILITY_DESCRIPTORS,
  hostCapabilityDigest,
  type HostCapabilityDescriptor
} from './agent-manifest.js';

export const HOST_CAPABILITY_RUNTIME_SCHEMA = 'sks.host-capability-runtime.v1' as const;
export const HOST_CAPABILITY_EVIDENCE_SCHEMA = 'sks.host-capability-evidence.v1' as const;
export const HOST_CAPABILITY_HOOK_RUNTIME_SCHEMA = 'sks.host-capability-hook-runtime.v1' as const;
export const HOST_CAPABILITY_HOOK_OBSERVATIONS_SCHEMA = 'sks.host-capability-hook-observations.v1' as const;
export const HOST_CAPABILITY_HOOK_RUNTIME_FILENAME = 'host-capability-runtime.json';
export const HOST_CAPABILITY_HOOK_OBSERVATIONS_FILENAME = 'host-capability-hook-observations.json';
export const HOST_CAPABILITY_HOOK_EVIDENCE_FILENAME = 'host-capability-evidence.json';
export const HOST_CAPABILITY_MCP_SERVER = 'acas-tools';

const MAX_OBSERVED_TOOL_NAMES = 256;
const MAX_EVENT_LINE_BYTES = 512 * 1024;
const MAX_MCP_TOOL_CALLS = 1024;
const MAX_PRE_TOOL_OBSERVATIONS = 2048;
const MAX_RECEIPT_JSON_STRING_BYTES = 64 * 1024;
const MAX_ARTIFACT_RECEIPTS = 64;
const MAX_ARTIFACT_PATH_CHARS = 512;
const MAX_SEMANTIC_RECEIPT_ITEMS = 10_000;
const SHA256_RECEIPT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const XLSX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPLICIT_DENIAL_PATTERN = /(?:^|[_.:-])(?:slack|center|tenant|lease|connector|outbox|message|upload|send|post)(?:$|[_.:-])/i;

export type HostCapabilityState = 'available' | 'missing' | 'unhealthy' | 'not_requested';
export type HostCapabilityWorkflow =
  | 'datasource_sql_generation'
  | 'datasource_query'
  | 'spreadsheet_create'
  | 'spreadsheet_edit'
  | 'document_render'
  | 'web_capture'
  | 'workspace_files'
  | 'artifact_delivery';

export interface HostCapabilityRequest {
  capability_ids: string[];
  workflows: HostCapabilityWorkflow[];
  tool_names?: string[];
}

export interface HostCapabilityRuntimeEntry {
  id: string;
  requested: boolean;
  state: HostCapabilityState;
  expected_tool_names: string[];
  observed_tool_names: string[];
  allowed_tool_names: string[];
  blockers: string[];
}

export interface HostCapabilityRuntime {
  schema: typeof HOST_CAPABILITY_RUNTIME_SCHEMA;
  ok: boolean;
  server: typeof HOST_CAPABILITY_MCP_SERVER;
  server_present: boolean;
  server_enabled: boolean;
  server_scope: 'project' | null;
  inventory_source: string | null;
  health_status: string;
  requested_capability_ids: string[];
  task_workflows: HostCapabilityWorkflow[];
  requested_tool_names: string[];
  observed_tool_names: string[];
  allowed_tool_names: string[];
  denied_tool_names: string[];
  explicit_denied_tool_names: string[];
  allowlist_digest: string;
  capability_digest: string;
  capabilities: HostCapabilityRuntimeEntry[];
  blockers: string[];
}

export interface HostCapabilityUseReceipt {
  id: string;
  status: 'passed' | 'failed';
  tool_names: string[];
  receipt_sha256: string;
}

export interface HostArtifactReceipt {
  path: string;
  kind: string;
  media_type: string;
  sha256: string;
  bytes: number;
  role: 'deliverable' | 'scratch' | 'temp' | 'log';
}

export interface HostToolCallReceipt {
  server: string;
  tool: string;
  status: 'passed' | 'failed';
  event_sha256: string;
}

interface InternalHostToolCallReceipt extends HostToolCallReceipt {
  index: number;
  raw_hash: string;
  resource_key: string | null;
  semantic_receipt: HostToolSemanticReceipt | null;
}

type HostToolSemanticReceipt =
  | {
      kind: 'datasource_schema';
      datasource_sha256: string;
      schema_snapshot_sha256: string;
    }
  | {
      kind: 'datasource_query';
      datasource_sha256: string;
      schema_snapshot_sha256: string;
      query_sha256: string;
      row_count: number;
      column_count: number;
      truncated: boolean;
      status: 'passed';
    }
  | {
      kind: 'spreadsheet_inspection';
      sheet_names_sha256: string;
      sheet_count: number;
      row_count: number;
      formula_count: number;
      error_cell_count: 0;
    };

interface ObservedHostArtifactReceipt extends HostArtifactReceipt {
  source_tool: string;
  source_hash: string;
  source_index: number;
}

export interface HostCapabilityExecutionEvidence {
  schema: typeof HOST_CAPABILITY_EVIDENCE_SCHEMA;
  ok: boolean;
  runtime: HostCapabilityRuntime;
  tool_calls: HostToolCallReceipt[];
  capabilities_used: HostCapabilityUseReceipt[];
  artifacts: HostArtifactReceipt[];
  blockers: string[];
}

export interface HostCapabilityHookRuntimeBinding {
  schema: typeof HOST_CAPABILITY_HOOK_RUNTIME_SCHEMA;
  mission_id: string;
  workflow_run_id: string;
  session_scope: string;
  runtime: HostCapabilityRuntime;
}

export interface HostCapabilityPreToolObservation {
  tool_use_id_sha256: string;
  tool: string;
  decision: 'allowed' | 'denied';
}

export interface HostCapabilityPostToolObservation {
  sequence: number;
  tool_use_id_sha256: string;
  tool: string;
  status: 'passed' | 'failed';
  event_sha256: string;
  resource_key: string | null;
  semantic_receipt: HostToolSemanticReceipt | null;
  validation_blocker: string | null;
  artifacts: HostArtifactReceipt[];
}

export interface HostCapabilityHookObservations {
  schema: typeof HOST_CAPABILITY_HOOK_OBSERVATIONS_SCHEMA;
  mission_id: string;
  workflow_run_id: string;
  session_scope: string;
  allowlist_digest: string;
  pre_tool_uses: HostCapabilityPreToolObservation[];
  tool_calls: HostCapabilityPostToolObservation[];
  blockers: string[];
}

export interface HostCapabilityRuntimeDependencies {
  inventory?: typeof listMcpInventory;
  health?: typeof testMcpConnection;
  inventoryOptions?: McpInventoryOptions;
  healthOptions?: McpHealthOptions;
}

export function createHostCapabilityHookRuntimeBinding(input: {
  missionId: unknown;
  workflowRunId: unknown;
  sessionScope: unknown;
  runtime: HostCapabilityRuntime;
}): HostCapabilityHookRuntimeBinding {
  const missionId = boundedIdentity(input.missionId);
  const workflowRunId = boundedIdentity(input.workflowRunId);
  const sessionScope = boundedIdentity(input.sessionScope);
  if (!missionId || !workflowRunId || !sessionScope) {
    throw new Error('host_capability_hook_runtime_identity_missing');
  }
  return {
    schema: HOST_CAPABILITY_HOOK_RUNTIME_SCHEMA,
    mission_id: missionId,
    workflow_run_id: workflowRunId,
    session_scope: sessionScope,
    runtime: input.runtime
  };
}

export function normalizeHostCapabilityHookRuntimeBinding(value: unknown): HostCapabilityHookRuntimeBinding | null {
  if (!isRecord(value)
    || value.schema !== HOST_CAPABILITY_HOOK_RUNTIME_SCHEMA
    || !boundedIdentity(value.mission_id)
    || !boundedIdentity(value.workflow_run_id)
    || !boundedIdentity(value.session_scope)
    || !isHostCapabilityRuntime(value.runtime)) return null;
  return value as unknown as HostCapabilityHookRuntimeBinding;
}

export function hostCapabilityHookBindingMatches(
  binding: HostCapabilityHookRuntimeBinding,
  input: { missionId: unknown; workflowRunId: unknown; sessionScope: unknown }
): boolean {
  return binding.mission_id === boundedIdentity(input.missionId)
    && binding.workflow_run_id === boundedIdentity(input.workflowRunId)
    && binding.session_scope === boundedIdentity(input.sessionScope);
}

export function resolveHostCapabilityHookRuntimeBinding(
  value: unknown,
  input: {
    missionId: unknown;
    workflowRunId: unknown;
    sessionScope: unknown;
    request?: HostCapabilityRequest;
  }
): { binding: HostCapabilityHookRuntimeBinding | null; blocker: string } {
  if (!value) return { binding: null, blocker: 'host_capability_hook_runtime_missing' };
  const binding = normalizeHostCapabilityHookRuntimeBinding(value);
  if (!binding) return { binding: null, blocker: 'host_capability_hook_runtime_invalid' };
  if (!hostCapabilityHookBindingMatches(binding, input)) {
    return { binding: null, blocker: 'host_capability_hook_runtime_scope_mismatch' };
  }
  if (input.request && !hostCapabilityRuntimeMatchesRequest(binding.runtime, input.request)) {
    return { binding: null, blocker: 'host_capability_hook_runtime_request_scope_mismatch' };
  }
  return { binding, blocker: '' };
}

export function acasHostToolName(value: unknown): string | null {
  const toolName = String(value || '').trim();
  if (!toolName || toolName.length > 256 || /[\r\n\0]/.test(toolName)) return null;
  const match = toolName.match(/^mcp__(?:acas-tools|acas_tools)__([A-Za-z][A-Za-z0-9_.:-]{0,127})$/);
  return match?.[1] || null;
}

export function sanitizeHostCapabilityPreToolUse(
  runtime: HostCapabilityRuntime,
  payload: unknown
): HostCapabilityPreToolObservation | null {
  if (!isRecord(payload)) return null;
  const tool = acasHostToolName(payload.tool_name);
  const toolUseId = boundedIdentity(payload.tool_use_id);
  if (!tool || !toolUseId) return null;
  const allowed = runtime.ok
    && runtime.allowed_tool_names.includes(tool)
    && !EXPLICIT_DENIAL_PATTERN.test(tool);
  return {
    tool_use_id_sha256: `sha256:${sha256(toolUseId)}`,
    tool,
    decision: allowed ? 'allowed' : 'denied'
  };
}

export function sanitizeHostCapabilityPostToolUse(payload: unknown): HostCapabilityPostToolObservation | null {
  if (!isRecord(payload)) return null;
  const tool = acasHostToolName(payload.tool_name);
  const toolUseId = boundedIdentity(payload.tool_use_id);
  if (!tool || !toolUseId) return null;
  const response = structuredHostToolResponse(payload.tool_response);
  const malformed = !response || Object.keys(response).length === 0;
  const semantic = malformed
    ? { receipt: null, blocker: `host_tool_response_malformed:${tool}` }
    : normalizeHostToolSemanticReceipt(tool, payload.tool_input, response);
  const status = hostToolResponseFailed(payload.tool_response)
    || hostToolResponseFailed(response)
    || malformed
    || Boolean(semantic.blocker)
    ? 'failed'
    : 'passed';
  const artifacts = status === 'passed'
    ? extractArtifactReceipts(payload.tool_response)
    : [];
  const resourceKey = extractToolResourceKey({
    arguments: payload.tool_input,
    result: payload.tool_response
  });
  const toolUseIdSha256 = `sha256:${sha256(toolUseId)}`;
  const eventSha256 = `sha256:${sha256(JSON.stringify({
    server: HOST_CAPABILITY_MCP_SERVER,
    tool,
    status,
    tool_use_id_sha256: toolUseIdSha256,
    resource_key: resourceKey,
    semantic_receipt: semantic.receipt,
    validation_blocker: semantic.blocker,
    artifacts
  }))}`;
  return {
    sequence: 0,
    tool_use_id_sha256: toolUseIdSha256,
    tool,
    status,
    event_sha256: eventSha256,
    resource_key: resourceKey,
    semantic_receipt: semantic.receipt,
    validation_blocker: semantic.blocker,
    artifacts
  };
}

export function mergeHostCapabilityPreToolObservation(input: {
  binding: HostCapabilityHookRuntimeBinding;
  current?: unknown;
  observation: HostCapabilityPreToolObservation;
}): HostCapabilityHookObservations {
  const current = normalizeHostCapabilityHookObservations(input.current, input.binding)
    || emptyHookObservations(input.binding);
  const key = `${input.observation.tool_use_id_sha256}:${input.observation.tool}`;
  const existing = current.pre_tool_uses.find((row) => `${row.tool_use_id_sha256}:${row.tool}` === key);
  const preToolUses: HostCapabilityPreToolObservation[] = existing
    ? current.pre_tool_uses.map((row) => `${row.tool_use_id_sha256}:${row.tool}` === key
        ? {
            ...row,
            decision: row.decision === 'denied' || input.observation.decision === 'denied'
              ? 'denied' as const
              : 'allowed' as const
          }
        : row)
    : [...current.pre_tool_uses, input.observation].slice(-MAX_PRE_TOOL_OBSERVATIONS);
  return { ...current, pre_tool_uses: preToolUses };
}

export function mergeHostCapabilityPostToolObservation(input: {
  binding: HostCapabilityHookRuntimeBinding;
  current?: unknown;
  observation: HostCapabilityPostToolObservation;
}): HostCapabilityHookObservations {
  const current = normalizeHostCapabilityHookObservations(input.current, input.binding)
    || emptyHookObservations(input.binding);
  if (current.tool_calls.some((row) => row.tool_use_id_sha256 === input.observation.tool_use_id_sha256)) {
    return current;
  }
  if (current.tool_calls.length >= MAX_MCP_TOOL_CALLS) {
    return { ...current, blockers: uniqueStrings([...current.blockers, 'host_tool_call_receipts_too_many']) };
  }
  const existingArtifactCount = current.tool_calls.reduce((sum, row) => sum + row.artifacts.length, 0);
  const remainingArtifactSlots = Math.max(0, MAX_ARTIFACT_RECEIPTS - existingArtifactCount);
  const sequence = current.tool_calls.reduce((max, row) => Math.max(max, row.sequence), 0) + 1;
  const observation = {
    ...input.observation,
    sequence,
    artifacts: input.observation.artifacts.slice(0, remainingArtifactSlots)
  };
  return {
    ...current,
    tool_calls: [...current.tool_calls, observation],
    blockers: input.observation.artifacts.length > remainingArtifactSlots
      ? uniqueStrings([...current.blockers, 'host_artifact_receipts_too_many'])
      : current.blockers
  };
}

export function normalizeHostCapabilityHookObservations(
  value: unknown,
  binding: HostCapabilityHookRuntimeBinding
): HostCapabilityHookObservations | null {
  if (!isRecord(value)
    || value.schema !== HOST_CAPABILITY_HOOK_OBSERVATIONS_SCHEMA
    || value.mission_id !== binding.mission_id
    || value.workflow_run_id !== binding.workflow_run_id
    || value.session_scope !== binding.session_scope
    || value.allowlist_digest !== binding.runtime.allowlist_digest
    || !Array.isArray(value.pre_tool_uses)
    || !Array.isArray(value.tool_calls)
    || !Array.isArray(value.blockers)
    || value.pre_tool_uses.length > MAX_PRE_TOOL_OBSERVATIONS
    || value.tool_calls.length > MAX_MCP_TOOL_CALLS
    || value.blockers.length > 16
    || value.blockers.some((blocker) => typeof blocker !== 'string' || blocker.length > 128)) return null;
  const preToolUses = value.pre_tool_uses.map(normalizePreToolObservation).filter(Boolean) as HostCapabilityPreToolObservation[];
  const toolCalls = value.tool_calls.map(normalizePostToolObservation).filter(Boolean) as HostCapabilityPostToolObservation[];
  if (preToolUses.length !== value.pre_tool_uses.length || toolCalls.length !== value.tool_calls.length) return null;
  if (toolCalls.reduce((sum, row) => sum + row.artifacts.length, 0) > MAX_ARTIFACT_RECEIPTS) return null;
  return {
    schema: HOST_CAPABILITY_HOOK_OBSERVATIONS_SCHEMA,
    mission_id: binding.mission_id,
    workflow_run_id: binding.workflow_run_id,
    session_scope: binding.session_scope,
    allowlist_digest: binding.runtime.allowlist_digest,
    pre_tool_uses: preToolUses,
    tool_calls: [...toolCalls].sort((left, right) => left.sequence - right.sequence),
    blockers: uniqueStrings(value.blockers)
  };
}

export function buildHostCapabilityEvidenceFromHookObservations(input: {
  binding: HostCapabilityHookRuntimeBinding;
  observations?: unknown;
}): HostCapabilityExecutionEvidence {
  const observations = normalizeHostCapabilityHookObservations(input.observations, input.binding)
    || emptyHookObservations(input.binding);
  const observationBlockers = [...observations.blockers];
  const preToolUses = new Map(observations.pre_tool_uses.map((row) => [
    `${row.tool_use_id_sha256}:${row.tool}`,
    row
  ]));
  for (const row of observations.tool_calls) {
    const preToolUse = preToolUses.get(`${row.tool_use_id_sha256}:${row.tool}`);
    if (!preToolUse) observationBlockers.push(`host_tool_call_pre_use_missing:${row.tool}`);
    else if (preToolUse.decision !== 'allowed') observationBlockers.push(`host_tool_call_pre_use_denied:${row.tool}`);
    if (row.validation_blocker) observationBlockers.push(row.validation_blocker);
  }
  const calls: InternalHostToolCallReceipt[] = observations.tool_calls.map((row) => ({
    server: HOST_CAPABILITY_MCP_SERVER,
    tool: row.tool,
    status: row.status,
    event_sha256: row.event_sha256,
    raw_hash: row.event_sha256,
    index: row.sequence,
    resource_key: row.resource_key,
    semantic_receipt: row.semantic_receipt
  }));
  const artifacts: ObservedHostArtifactReceipt[] = observations.tool_calls.flatMap((row) => row.artifacts.map((artifact) => ({
    ...artifact,
    source_tool: row.tool,
    source_hash: row.event_sha256,
    source_index: row.sequence
  })));
  return buildExecutionEvidence(input.binding.runtime, calls, artifacts, observationBlockers);
}

export function requestHostCapabilities(goal: unknown): HostCapabilityRequest {
  const text = String(goal || '').normalize('NFKC');
  const capabilityIds = new Set<string>();
  const workflows = new Set<HostCapabilityWorkflow>();
  const toolNames = new Set<string>();
  const requestCapability = (id: string, tools: readonly string[] = []) => {
    capabilityIds.add(id);
    for (const tool of tools) toolNames.add(tool);
  };

  const spreadsheetCreate = matchesIntent(text, [
    /\b(?:create|generate|produce|deliver|make)\b.{0,48}\b(?:xlsx|excel|spreadsheet|workbook)\b/i,
    /\b(?:xlsx|excel|spreadsheet|workbook)\b.{0,48}\b(?:create|generate|produce|deliver|make)\b/i,
    /(?:엑셀|스프레드시트|xlsx).{0,32}(?:생성|작성|만들|납품)/i,
    /(?:생성|작성|만들|납품).{0,32}(?:엑셀|스프레드시트|xlsx)/i
  ]);
  const spreadsheetEdit = matchesIntent(text, [
    /\b(?:edit|update|modify|inspect|populate|fill|append|import)\b.{0,56}\b(?:xlsx|excel|spreadsheet|workbook)\b/i,
    /\b(?:xlsx|excel|spreadsheet|workbook)\b.{0,56}\b(?:edit|update|modify|inspect|populate|fill|append|import)\b/i,
    /(?:엑셀|스프레드시트|xlsx).{0,36}(?:수정|편집|업데이트|검사|점검|입력|채우|반영|추가)/i,
    /(?:수정|편집|업데이트|검사|점검|입력|채우|반영|추가).{0,36}(?:엑셀|스프레드시트|xlsx)/i
  ]);
  const datasourceQuery = matchesIntent(text, [
    /\b(?:query|retrieve|fetch|load|analy[sz]e)\b.{0,56}\b(?:database|datasource|data|rows?)\b/i,
    /\b(?:database|datasource|data|rows?)\b.{0,56}\b(?:query|retrieve|fetch|load|analy[sz]e)\b/i,
    /(?:db|데이터베이스|데이터소스|데이터).{0,36}(?:조회|가져오|검색|분석|질의)/i,
    /(?:조회|가져오|검색|분석|질의).{0,36}(?:db|데이터베이스|데이터소스|데이터)/i
  ]);
  const sqlGeneration = matchesIntent(text, [
    /\b(?:write|generate|draft|prepare)\b.{0,32}\bsql\b/i,
    /\bsql\b.{0,32}\b(?:write|generate|draft|prepare)\b/i,
    /sql.{0,24}(?:작성|생성|초안|준비)/i,
    /(?:작성|생성|초안|준비).{0,24}sql/i
  ]);
  const documentRender = matchesIntent(text, [
    /\b(?:render|generate|create|export|deliver)\b.{0,48}\b(?:pdf|png|document screenshot)\b/i,
    /\b(?:pdf|png|document screenshot)\b.{0,48}\b(?:render|generate|create|export|deliver)\b/i,
    /(?:pdf|png|문서).{0,32}(?:렌더|생성|작성|내보내|납품)/i,
    /(?:렌더|생성|작성|내보내|납품).{0,32}(?:pdf|png|문서)/i
  ]);
  const webCapture = matchesIntent(text, [
    /\b(?:capture|take|create)\b.{0,40}\b(?:url|web|page)\b.{0,24}\bscreenshot\b/i,
    /\b(?:url|web|page)\b.{0,40}\bscreenshot\b/i,
    /(?:url|웹|페이지).{0,32}(?:스크린샷|캡처)/i
  ]);
  const workspaceRead = matchesIntent(text, [
    /\bworkspace\b.{0,48}\b(?:read|open|inspect)\b/i,
    /\b(?:read|open|inspect)\b.{0,48}\bworkspace\b/i,
    /워크스페이스.{0,36}(?:읽|열|검사|점검)/i,
    /(?:읽|열|검사|점검).{0,36}워크스페이스/i
  ]);
  const workspaceFind = matchesIntent(text, [
    /\bworkspace\b.{0,48}\b(?:find|search)\b/i,
    /\b(?:find|search)\b.{0,48}\bworkspace\b/i,
    /워크스페이스.{0,36}(?:찾|검색)/i,
    /(?:찾|검색).{0,36}워크스페이스/i
  ]);
  const workspaceList = matchesIntent(text, [
    /\bworkspace\b.{0,48}\blist\b/i,
    /\blist\b.{0,48}\bworkspace\b/i,
    /워크스페이스.{0,36}목록/i,
    /목록.{0,36}워크스페이스/i
  ]);
  const workspaceWrite = matchesIntent(text, [
    /\bworkspace\b.{0,48}\b(?:write|create|save)\b/i,
    /\b(?:write|create|save)\b.{0,48}\bworkspace\b/i,
    /워크스페이스.{0,36}(?:쓰|작성|생성|저장)/i,
    /(?:쓰|작성|생성|저장).{0,36}워크스페이스/i
  ]);
  const workspaceEdit = matchesIntent(text, [
    /\bworkspace\b.{0,48}\b(?:edit|modify|update)\b/i,
    /\b(?:edit|modify|update)\b.{0,48}\bworkspace\b/i,
    /워크스페이스.{0,36}(?:수정|편집|업데이트)/i,
    /(?:수정|편집|업데이트).{0,36}워크스페이스/i
  ]);
  const workspaceDownload = matchesIntent(text, [
    /\bworkspace\b.{0,48}\bdownload\b/i,
    /\bdownload\b.{0,48}\bworkspace\b/i,
    /워크스페이스.{0,36}다운로드/i,
    /다운로드.{0,36}워크스페이스/i
  ]);

  if (sqlGeneration || datasourceQuery) requestCapability('host.datasource.schema.v1', ['datasource_schema_context']);
  if (sqlGeneration) workflows.add('datasource_sql_generation');
  if (datasourceQuery) {
    requestCapability('host.datasource.query.readonly.v1', ['datasource_query_readonly']);
    workflows.add('datasource_query');
  }
  if (spreadsheetCreate) {
    requestCapability('host.spreadsheet.workbook.v1', ['spreadsheet_create', 'spreadsheet_inspect', 'spreadsheet_update']);
    workflows.add('spreadsheet_create');
  }
  if (spreadsheetEdit) {
    requestCapability('host.spreadsheet.workbook.v1', ['spreadsheet_inspect', 'spreadsheet_update']);
    workflows.add('spreadsheet_edit');
  }
  if (documentRender) {
    const renderTools = [
      ...(/\bpdf\b/i.test(text) ? ['html_to_pdf'] : []),
      ...(/\b(?:png|document screenshot)\b/i.test(text) || /(?:png|문서 스크린샷)/i.test(text) ? ['html_to_screenshot'] : [])
    ];
    requestCapability('host.workspace.files.v1', ['write_file']);
    requestCapability('host.document.render.v1', renderTools.length > 0 ? renderTools : ['html_to_pdf', 'html_to_screenshot']);
    workflows.add('workspace_files');
    workflows.add('document_render');
  }
  if (webCapture) {
    requestCapability('host.web.capture.v1', ['capture_url_screenshot']);
    workflows.add('web_capture');
  }
  const workspaceToolNames = [
    ...(workspaceRead ? ['read_file'] : []),
    ...(workspaceFind ? ['find_workspace_files'] : []),
    ...(workspaceList ? ['list_workspace'] : []),
    ...(workspaceWrite ? ['write_file'] : []),
    ...(workspaceEdit ? ['edit_file'] : []),
    ...(workspaceDownload ? ['download_url_to_workspace'] : [])
  ];
  if (workspaceToolNames.length > 0) {
    requestCapability('host.workspace.files.v1', workspaceToolNames);
    workflows.add('workspace_files');
  }
  if (spreadsheetCreate || spreadsheetEdit || documentRender || webCapture || workspaceWrite || workspaceEdit || workspaceDownload) {
    requestCapability('host.artifact.receipt.v1');
    workflows.add('artifact_delivery');
  }

  return {
    capability_ids: [...capabilityIds].sort(),
    workflows: [...workflows].sort(),
    tool_names: [...toolNames].sort()
  };
}

export async function inspectHostCapabilityRuntime(input: {
  root: string;
  request?: HostCapabilityRequest;
  dependencies?: HostCapabilityRuntimeDependencies;
}): Promise<HostCapabilityRuntime> {
  const request = input.request || { capability_ids: [], workflows: [] };
  const knownIds = new Set(HOST_CAPABILITY_DESCRIPTORS.map((capability) => capability.id));
  const knownToolNames = new Set(HOST_CAPABILITY_DESCRIPTORS.flatMap((capability) => capability.tool_names));
  const requestedCapabilityIds = uniqueStrings(request.capability_ids);
  const requestedToolNames = uniqueStrings(request.tool_names || []);
  const hasExplicitToolScope = Array.isArray(request.tool_names);
  const unknownRequested = requestedCapabilityIds.filter((id) => !knownIds.has(id));
  const unknownRequestedTools = requestedToolNames.filter((name) => !knownToolNames.has(name));
  const requested = new Set(requestedCapabilityIds.filter((id) => knownIds.has(id)));
  const requestedTools = new Set(requestedToolNames.filter((name) => knownToolNames.has(name)));
  const workflows = uniqueWorkflows(request.workflows);
  const requestedDescriptorTools = (descriptor: HostCapabilityDescriptor) => hasExplicitToolScope
    ? descriptor.tool_names.filter((name) => requestedTools.has(name))
    : descriptor.tool_names;
  const boundRequestedTools = new Set(HOST_CAPABILITY_DESCRIPTORS
    .filter((descriptor) => descriptor.executable !== false && requested.has(descriptor.id))
    .flatMap((descriptor) => requestedDescriptorTools(descriptor)));
  const unboundRequestedTools = requestedToolNames.filter((name) => knownToolNames.has(name) && !boundRequestedTools.has(name));
  const inventoryFn = input.dependencies?.inventory || listMcpInventory;
  const healthFn = input.dependencies?.health || testMcpConnection;
  const inventory = await inventoryFn('project', {
    projectRoot: input.root,
    projectTrusted: true,
    ...(input.dependencies?.inventoryOptions || {})
  });
  const server = inventory.servers.find((entry) => entry.name === HOST_CAPABILITY_MCP_SERVER) || null;
  const inventoryBlockers = inventory.ok ? [] : ['host_capability_project_mcp_inventory_unhealthy'];

  if (!server) {
    const capabilities = HOST_CAPABILITY_DESCRIPTORS.map((descriptor) => capabilityRuntimeEntry(
      descriptor,
      requested.has(descriptor.id),
      requested.has(descriptor.id) ? 'missing' : 'not_requested',
      [],
      [],
      requested.has(descriptor.id) ? [`host_capability_missing:${descriptor.id}`] : []
    ));
    const blockers = uniqueStrings([
      ...unknownRequested.map((id) => `host_capability_unknown:${id}`),
      ...unknownRequestedTools.map((name) => `host_capability_tool_unknown:${name}`),
      ...unboundRequestedTools.map((name) => `host_capability_tool_scope_unbound:${name}`),
      ...(requested.size ? inventoryBlockers : []),
      ...capabilities.flatMap((entry) => entry.blockers)
    ]);
    return runtimeResult({
      serverPresent: false,
      serverEnabled: false,
      inventorySource: inventory.source,
      healthStatus: 'missing',
      requestedCapabilityIds,
      workflows,
      requestedToolNames,
      observedToolNames: [],
      allowedToolNames: [],
      capabilities,
      blockers
    });
  }

  if (!server.enabled) {
    const capabilities = HOST_CAPABILITY_DESCRIPTORS.map((descriptor) => capabilityRuntimeEntry(
      descriptor,
      requested.has(descriptor.id),
      requested.has(descriptor.id) ? 'unhealthy' : 'not_requested',
      [],
      [],
      requested.has(descriptor.id) ? [`host_capability_unhealthy:${descriptor.id}:disabled`] : []
    ));
    const blockers = uniqueStrings([
      ...unknownRequested.map((id) => `host_capability_unknown:${id}`),
      ...unknownRequestedTools.map((name) => `host_capability_tool_unknown:${name}`),
      ...unboundRequestedTools.map((name) => `host_capability_tool_scope_unbound:${name}`),
      ...(requested.size ? inventoryBlockers : []),
      ...capabilities.flatMap((entry) => entry.blockers)
    ]);
    return runtimeResult({
      serverPresent: true,
      serverEnabled: false,
      inventorySource: inventory.source,
      healthStatus: 'disabled',
      requestedCapabilityIds,
      workflows,
      requestedToolNames,
      observedToolNames: [],
      allowedToolNames: [],
      capabilities,
      blockers
    });
  }

  const health = await healthFn(HOST_CAPABILITY_MCP_SERVER, 'project', {
    projectRoot: input.root,
    projectTrusted: true,
    ...(input.dependencies?.healthOptions || {})
  });
  const observedToolNames = health.status === 'healthy' && Array.isArray(health.tool_names)
    ? uniqueStrings(health.tool_names).slice(0, MAX_OBSERVED_TOOL_NAMES)
    : [];
  const observed = new Set(observedToolNames);
  const configuredEnabled = Array.isArray(server.enabled_tools) ? new Set(server.enabled_tools) : null;
  const configuredDisabled = new Set(server.disabled_tools || []);
  const configuredAvailable = (name: string) => observed.has(name)
    && (!configuredEnabled || configuredEnabled.has(name))
    && !configuredDisabled.has(name);
  const healthReady = health.status === 'healthy' && Array.isArray(health.tool_names);
  const capabilities = HOST_CAPABILITY_DESCRIPTORS.map((descriptor) => {
    const isRequested = requested.has(descriptor.id);
    const requiredTools = requestedDescriptorTools(descriptor);
    const descriptorTools = descriptor.tool_names.filter(configuredAvailable);
    const available = descriptor.executable === false
      ? descriptorTools.length > 0
      : requiredTools.length > 0 && requiredTools.every(configuredAvailable);
    const state: HostCapabilityState = !healthReady
      ? isRequested ? 'unhealthy' : 'not_requested'
      : available
        ? 'available'
        : isRequested ? 'missing' : 'not_requested';
    const entryBlockers = isRequested
      ? [
          ...(descriptor.executable !== false && requiredTools.length === 0
            ? [`host_capability_tool_scope_empty:${descriptor.id}`]
            : []),
          ...(state !== 'available'
            ? [`host_capability_${state}:${descriptor.id}${state === 'unhealthy' ? `:${health.status}` : ''}`]
            : [])
        ]
      : [];
    return capabilityRuntimeEntry(
      descriptor,
      isRequested,
      state,
      descriptorTools,
      isRequested && descriptor.executable !== false ? requiredTools.filter(configuredAvailable) : [],
      entryBlockers
    );
  });
  const allowedToolNames = uniqueStrings(HOST_CAPABILITY_DESCRIPTORS
    .filter((descriptor) => descriptor.executable !== false && requested.has(descriptor.id))
    .flatMap((descriptor) => requestedDescriptorTools(descriptor).filter(configuredAvailable)));
  const allowed = new Set(allowedToolNames);
  const deniedToolNames = observedToolNames.filter((name) => !allowed.has(name));
  const blockers = uniqueStrings([
    ...unknownRequested.map((id) => `host_capability_unknown:${id}`),
    ...unknownRequestedTools.map((name) => `host_capability_tool_unknown:${name}`),
    ...unboundRequestedTools.map((name) => `host_capability_tool_scope_unbound:${name}`),
    ...(requested.size ? inventoryBlockers : []),
    ...capabilities.flatMap((entry) => entry.blockers)
  ]);
  return runtimeResult({
    serverPresent: true,
    serverEnabled: true,
    inventorySource: inventory.source,
    healthStatus: health.status,
    requestedCapabilityIds,
    workflows,
    requestedToolNames,
    observedToolNames,
    allowedToolNames,
    deniedToolNames,
    capabilities,
    blockers
  });
}

export function hostCapabilityCodexConfigArgs(runtime: HostCapabilityRuntime): string[] {
  if (!runtime.server_present) return [];
  const serverKey = JSON.stringify(runtime.server);
  return [
    '-c', `mcp_servers.${serverKey}.enabled_tools=${tomlStringArray(runtime.allowed_tool_names)}`,
    '-c', `mcp_servers.${serverKey}.disabled_tools=${tomlStringArray(runtime.denied_tool_names)}`
  ];
}

export function createHostCapabilityEventCollector(runtime: HostCapabilityRuntime): {
  push(chunk: string): void;
  finish(fallbackOutput?: string): HostCapabilityExecutionEvidence;
} {
  let buffer = '';
  let parsedEvents = 0;
  let callIndex = 0;
  const internalCalls: InternalHostToolCallReceipt[] = [];
  const observedArtifacts: ObservedHostArtifactReceipt[] = [];
  const blockers: string[] = [];

  const parseLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (Buffer.byteLength(trimmed, 'utf8') > MAX_EVENT_LINE_BYTES) {
      blockers.push('host_tool_event_line_too_large');
      return;
    }
    let event: any;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    parsedEvents += 1;
    const item = event?.type === 'item.completed' ? event.item : null;
    if (!item || item.type !== 'mcp_tool_call') return;
    if (internalCalls.length >= MAX_MCP_TOOL_CALLS) {
      blockers.push('host_tool_call_receipts_too_many');
      return;
    }
    const server = String(item.server || '').trim();
    const tool = String(item.tool || '').trim();
    const declaredStatus = item.status === 'completed' ? 'passed' : item.status === 'failed' ? 'failed' : null;
    const response = structuredHostToolResponse(item.result);
    const malformed = !response || Object.keys(response).length === 0;
    const semantic = malformed
      ? { receipt: null, blocker: `host_tool_response_malformed:${tool}` }
      : normalizeHostToolSemanticReceipt(tool, item.arguments, response);
    const status = declaredStatus === 'passed' && (malformed || semantic.blocker)
      ? 'failed'
      : declaredStatus;
    if (!server || !tool || !status) return;
    callIndex += 1;
    if (server !== runtime.server) return;
    const rawHash = `sha256:${sha256(trimmed)}`;
    internalCalls.push({
      server,
      tool,
      status,
      event_sha256: rawHash,
      raw_hash: rawHash,
      index: callIndex,
      resource_key: extractToolResourceKey(item),
      semantic_receipt: semantic.receipt
    });
    if (semantic.blocker) blockers.push(semantic.blocker);
    if (status === 'passed') {
      for (const artifact of extractArtifactReceipts(item.result?.structured_content ?? item.result?.structuredContent ?? item.result)) {
        observedArtifacts.push({ ...artifact, source_tool: tool, source_hash: rawHash, source_index: callIndex });
      }
    }
  };

  const push = (chunk: string) => {
    buffer += String(chunk || '');
    if (Buffer.byteLength(buffer, 'utf8') > MAX_EVENT_LINE_BYTES * 2 && !buffer.includes('\n')) {
      blockers.push('host_tool_event_buffer_too_large');
      buffer = '';
      return;
    }
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) parseLine(line);
  };

  const finish = (fallbackOutput = '') => {
    if (parsedEvents === 0 && fallbackOutput) push(fallbackOutput);
    if (buffer.trim()) parseLine(buffer);
    buffer = '';
    return buildExecutionEvidence(runtime, internalCalls, observedArtifacts, blockers);
  };

  return { push, finish };
}

export function bindParentSummaryToHostCapabilityEvidence(value: unknown, evidence: HostCapabilityExecutionEvidence): {
  value: unknown;
  blockers: string[];
} {
  const parsed = parseJsonObject(value);
  const hostEvidenceRequired = evidence.runtime.requested_capability_ids.length > 0
    || evidence.tool_calls.length > 0
    || evidence.artifacts.length > 0;
  if (!parsed) {
    return {
      value,
      blockers: hostEvidenceRequired ? ['host_capability_parent_summary_not_structured'] : []
    };
  }
  const blockers: string[] = [...evidence.blockers];
  if (parsed.capabilities_used !== undefined
    && JSON.stringify(parsed.capabilities_used) !== JSON.stringify(evidence.capabilities_used)) {
    blockers.push('host_capability_parent_receipts_mismatch');
  }
  if (parsed.artifacts !== undefined
    && JSON.stringify(parsed.artifacts) !== JSON.stringify(evidence.artifacts)) {
    blockers.push('host_artifact_parent_receipts_mismatch');
  }
  const bindReceipts = hostEvidenceRequired
    || parsed.capabilities_used !== undefined
    || parsed.artifacts !== undefined;
  const mergedBlockers = uniqueStrings([
    ...arrayStrings(parsed.blockers),
    ...blockers
  ]);
  const next = {
    ...parsed,
    ...(bindReceipts ? {
      capabilities_used: evidence.capabilities_used,
      artifacts: evidence.artifacts
    } : {}),
    ...(mergedBlockers.length > 0 ? { blockers: mergedBlockers } : {}),
    ...(parsed.status === 'completed' && mergedBlockers.length > 0 ? { status: 'blocked' } : {})
  };
  return { value: next, blockers: uniqueStrings(blockers) };
}

function buildExecutionEvidence(
  runtime: HostCapabilityRuntime,
  calls: InternalHostToolCallReceipt[],
  artifactRows: ObservedHostArtifactReceipt[],
  initialBlockers: string[]
): HostCapabilityExecutionEvidence {
  const blockers = [...runtime.blockers, ...initialBlockers];
  const requested = new Set(runtime.requested_capability_ids);
  for (const call of calls) {
    if (!runtime.allowed_tool_names.includes(call.tool)) blockers.push(`host_tool_call_not_allowed:${call.tool}`);
    if (EXPLICIT_DENIAL_PATTERN.test(call.tool)) blockers.push(`host_tool_call_explicitly_denied:${call.tool}`);
    if (call.status === 'failed') blockers.push(`host_tool_call_failed:${call.tool}`);
  }
  const dedupedArtifacts = dedupeArtifacts(artifactRows);
  if (dedupedArtifacts.length > MAX_ARTIFACT_RECEIPTS) blockers.push('host_artifact_receipts_too_many');
  const artifacts = dedupedArtifacts.slice(0, MAX_ARTIFACT_RECEIPTS);
  if (requested.size === 0 && calls.length > 0) {
    for (const call of calls) blockers.push(`host_tool_call_not_requested:${call.tool}`);
  }
  const capabilitiesUsed: HostCapabilityUseReceipt[] = [];
  for (const descriptor of HOST_CAPABILITY_DESCRIPTORS) {
    if (!requested.has(descriptor.id)) continue;
    const relevantCalls = calls.filter((call) => descriptor.tool_names.includes(call.tool));
    const capabilityBlockers = validateCapabilityWorkflow(runtime, descriptor, relevantCalls, calls, artifactRows);
    blockers.push(...capabilityBlockers);
    const status = capabilityBlockers.length === 0 && relevantCalls.every((call) => call.status === 'passed')
      ? 'passed'
      : 'failed';
    const artifactSources = descriptor.executable === false
      ? artifactRows.map((artifact) => ({ tool: artifact.source_tool, hash: artifact.source_hash }))
      : [];
    const toolNames = uniqueStrings([
      ...relevantCalls.map((call) => call.tool),
      ...artifactSources.map((source) => source.tool)
    ]);
    const receiptSha256 = `sha256:${sha256(JSON.stringify({
      id: descriptor.id,
      calls: relevantCalls.map((call) => call.raw_hash),
      artifacts: artifactSources.map((source) => source.hash)
    }))}`;
    capabilitiesUsed.push({ id: descriptor.id, status, tool_names: toolNames, receipt_sha256: receiptSha256 });
  }
  const uniqueBlockersValue = uniqueStrings(blockers);
  return {
    schema: HOST_CAPABILITY_EVIDENCE_SCHEMA,
    ok: uniqueBlockersValue.length === 0 && capabilitiesUsed.every((receipt) => receipt.status === 'passed'),
    runtime,
    tool_calls: calls.map(({ server, tool, status, event_sha256 }) => ({ server, tool, status, event_sha256 })),
    capabilities_used: capabilitiesUsed,
    artifacts,
    blockers: uniqueBlockersValue
  };
}

function validateCapabilityWorkflow(
  runtime: HostCapabilityRuntime,
  descriptor: HostCapabilityDescriptor,
  calls: InternalHostToolCallReceipt[],
  allCalls: InternalHostToolCallReceipt[],
  artifacts: ObservedHostArtifactReceipt[]
): string[] {
  const blockers: string[] = [];
  const passed = (tool: string) => calls.filter((call) => call.tool === tool && call.status === 'passed');
  if (descriptor.executable !== false && calls.length === 0) blockers.push(`host_capability_call_missing:${descriptor.id}`);
  if (calls.some((call) => call.status !== 'passed')) blockers.push(`host_capability_call_failed:${descriptor.id}`);
  if (descriptor.id === 'host.datasource.schema.v1' && passed('datasource_schema_context').length === 0) {
    blockers.push('host_capability_schema_call_missing');
  }
  if (descriptor.id === 'host.datasource.query.readonly.v1') {
    const schemaCall = allCalls.find((call) => call.tool === 'datasource_schema_context' && call.status === 'passed') || null;
    const queryCalls = passed('datasource_query_readonly');
    const queryCall = queryCalls[0] || null;
    const schemaIndex = schemaCall?.index ?? -1;
    const queryIndex = queryCall?.index ?? -1;
    if (queryIndex < 0) blockers.push('host_capability_readonly_query_call_missing');
    if (runtime.task_workflows.includes('datasource_query') && queryCalls.length !== 1) {
      blockers.push('host_capability_readonly_query_count_invalid');
    }
    if (runtime.task_workflows.includes('datasource_query') && (schemaIndex < 0 || queryIndex <= schemaIndex)) {
      blockers.push('host_capability_datasource_sequence_invalid');
    }
    const schemaReceipt = schemaCall?.semantic_receipt?.kind === 'datasource_schema'
      ? schemaCall.semantic_receipt
      : null;
    const queryReceipts = queryCalls
      .map((call) => call.semantic_receipt?.kind === 'datasource_query' ? call.semantic_receipt : null);
    if (queryCalls.length > 0 && queryReceipts.some((receipt) => !receipt)) {
      blockers.push('host_capability_readonly_query_receipt_invalid');
    }
    if (schemaCall && !schemaReceipt) blockers.push('host_capability_schema_receipt_invalid');
    if (schemaReceipt && queryReceipts.some((receipt) => receipt
      && schemaReceipt.schema_snapshot_sha256 !== receipt.schema_snapshot_sha256)) {
      blockers.push('host_capability_readonly_query_schema_mismatch');
    }
    if (schemaReceipt && queryReceipts.some((receipt) => receipt
      && schemaReceipt.datasource_sha256 !== receipt.datasource_sha256)) {
      blockers.push('host_capability_readonly_query_datasource_mismatch');
    }
  }
  if (descriptor.id === 'host.spreadsheet.workbook.v1') {
    const creates = passed('spreadsheet_create');
    const updates = passed('spreadsheet_update');
    const inspections = passed('spreadsheet_inspect');
    const create = creates[0]?.index ?? -1;
    const updateIndexes = updates.map((call) => call.index);
    const inspectionIndexes = inspections.map((call) => call.index);
    if (runtime.task_workflows.includes('spreadsheet_create')) {
      if (creates.length !== 1) blockers.push('host_capability_spreadsheet_create_sequence_invalid');
      if (updates.length > 1) blockers.push('host_capability_spreadsheet_create_update_count_invalid');
      const update = updateIndexes[0] ?? -1;
      const inspectedAfterCreate = inspectionIndexes.some((index) => index > create && (update < 0 || index < update));
      const inspectedAfterMutation = update >= 0
        ? inspectionIndexes.some((index) => index > update)
        : inspectionIndexes.some((index) => index > create);
      if (create < 0
        || !inspectedAfterCreate
        || !inspectedAfterMutation
        || (update >= 0 && update <= create)) {
        blockers.push('host_capability_spreadsheet_create_sequence_invalid');
      }
    }
    if (runtime.task_workflows.includes('spreadsheet_edit')) {
      const update = updateIndexes[0] ?? -1;
      if (updates.length !== 1) blockers.push('host_capability_spreadsheet_edit_update_count_invalid');
      if (update < 0
        || !inspectionIndexes.some((index) => index < update)
        || !inspectionIndexes.some((index) => index > update)) {
        blockers.push('host_capability_spreadsheet_edit_sequence_invalid');
      }
    }
    if (runtime.task_workflows.includes('spreadsheet_create') || runtime.task_workflows.includes('spreadsheet_edit')) {
      if (inspections.some((call) => call.semantic_receipt?.kind !== 'spreadsheet_inspection')) {
        blockers.push('host_capability_spreadsheet_inspection_receipt_invalid');
      }
      const passedSpreadsheetCalls = calls.filter((call) => call.status === 'passed');
      const resourceKeys = uniqueStrings(passedSpreadsheetCalls.map((call) => call.resource_key));
      const lastMutation = [...creates, ...updates].sort((left, right) => right.index - left.index)[0] || null;
      if (passedSpreadsheetCalls.some((call) => !call.resource_key)) {
        blockers.push('host_capability_spreadsheet_resource_missing');
      }
      if (resourceKeys.length > 1) blockers.push('host_capability_spreadsheet_resource_mismatch');
      const finalMutationArtifacts = lastMutation
        ? artifacts.filter((artifact) => (
            artifact.source_index === lastMutation.index
            && artifact.source_tool === lastMutation.tool
          ))
        : [];
      if (lastMutation && finalMutationArtifacts.some((artifact) => (
        isSpreadsheetDeliverable(artifact)
        && !artifactMatchesResource(artifact, lastMutation.resource_key)
      ))) {
        blockers.push('host_capability_spreadsheet_resource_mismatch');
      }
      if (!lastMutation || !finalMutationArtifacts.some((artifact) => (
        isSpreadsheetDeliverable(artifact)
        && artifactMatchesResource(artifact, lastMutation.resource_key)
      ))) {
        blockers.push('host_capability_spreadsheet_final_artifact_missing');
      }
    }
  }
  if (descriptor.id === 'host.document.render.v1' && runtime.task_workflows.includes('document_render')) {
    const renderCalls = [...passed('html_to_pdf'), ...passed('html_to_screenshot')].sort((left, right) => left.index - right.index);
    if (renderCalls.length === 0) {
      blockers.push('host_capability_document_render_call_missing');
    } else {
      const sourceWrite = allCalls.find((call) => (
        call.status === 'passed'
        && (call.tool === 'write_file' || call.tool === 'edit_file')
        && call.index < renderCalls[0]!.index
      ));
      if (!sourceWrite) blockers.push('host_capability_document_source_sequence_invalid');
      const finalRender = renderCalls.at(-1)!;
      if (!artifacts.some((artifact) => (
        artifact.source_tool === finalRender.tool
        && artifact.source_index === finalRender.index
        && isDocumentRenderDeliverable(artifact, finalRender.tool)
      ))) {
        blockers.push('host_capability_document_render_artifact_missing');
      }
    }
  }
  if (descriptor.id === 'host.web.capture.v1'
    && runtime.task_workflows.includes('web_capture')
    && passed('capture_url_screenshot').length === 0) {
    blockers.push('host_capability_web_capture_call_missing');
  }
  if (descriptor.id === 'host.artifact.receipt.v1' && artifacts.length === 0) {
    blockers.push('host_capability_artifact_receipt_missing');
  }
  return uniqueStrings(blockers);
}

function extractToolResourceKey(item: unknown): string | null {
  if (!isRecord(item)) return null;
  const queue: Array<{ value: unknown; depth: number }> = [
    { value: item.arguments, depth: 0 },
    { value: item.input, depth: 0 },
    { value: item.result?.structured_content ?? item.result?.structuredContent ?? item.result, depth: 0 }
  ];
  let visited = 0;
  while (queue.length > 0 && visited < 256) {
    const current = queue.shift()!;
    visited += 1;
    if (current.depth > 5 || current.value === null || current.value === undefined) continue;
    if (Array.isArray(current.value)) {
      for (const child of current.value) queue.push({ value: child, depth: current.depth + 1 });
      continue;
    }
    if (!isRecord(current.value)) continue;
    for (const [key, value] of Object.entries(current.value)) {
      if (/^(?:path|file_path|filepath|workbook_path|workbook|source_path|target_path|output_path)$/i.test(key)) {
        const resourcePath = normalizeWorkspaceResourcePath(value);
        if (resourcePath) return `sha256:${sha256(resourcePath)}`;
      }
      queue.push({ value, depth: current.depth + 1 });
    }
  }
  return null;
}

function normalizeWorkspaceResourcePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const original = value.trim();
  if (!original
    || original.length > MAX_ARTIFACT_PATH_CHARS
    || /[\r\n\0\\]/.test(original)
    || original.startsWith('/')
    || /^[a-z]:/i.test(original)) return null;
  const segments = original.split('/');
  if (segments.length === 0 || segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return segments.join('/');
}

function isSpreadsheetDeliverable(artifact: ObservedHostArtifactReceipt): boolean {
  const artifactPath = normalizeWorkspaceResourcePath(artifact.path);
  return artifact.role === 'deliverable'
    && (artifact.kind === 'xlsx' || artifact.kind === 'spreadsheet')
    && artifact.media_type === XLSX_MEDIA_TYPE
    && Boolean(artifactPath && /\.xlsx$/i.test(artifactPath));
}

function artifactMatchesResource(artifact: ObservedHostArtifactReceipt, resourceKey: string | null): boolean {
  const artifactPath = normalizeWorkspaceResourcePath(artifact.path);
  return Boolean(resourceKey && artifactPath && `sha256:${sha256(artifactPath)}` === resourceKey);
}

function isDocumentRenderDeliverable(
  artifact: ObservedHostArtifactReceipt,
  tool: string
): boolean {
  const artifactPath = normalizeWorkspaceResourcePath(artifact.path);
  const pdf = tool === 'html_to_pdf';
  return artifact.role === 'deliverable'
    && artifact.kind === (pdf ? 'pdf' : 'png')
    && artifact.media_type === (pdf ? 'application/pdf' : 'image/png')
    && Boolean(artifactPath && (pdf ? /\.pdf$/i : /\.png$/i).test(artifactPath));
}

function extractArtifactReceipts(value: unknown): HostArtifactReceipt[] {
  const result: HostArtifactReceipt[] = [];
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let visited = 0;
  while (queue.length > 0 && visited < 512) {
    const current = queue.shift()!;
    visited += 1;
    if (current.depth > 6 || current.value === null || current.value === undefined) continue;
    if (typeof current.value === 'string') {
      const text = current.value.trim();
      if (text && Buffer.byteLength(text, 'utf8') <= MAX_RECEIPT_JSON_STRING_BYTES && /^[{[]/.test(text)) {
        try {
          queue.push({ value: JSON.parse(text), depth: current.depth + 1 });
        } catch {}
      }
      continue;
    }
    if (Array.isArray(current.value)) {
      for (const child of current.value) queue.push({ value: child, depth: current.depth + 1 });
      continue;
    }
    if (!isRecord(current.value)) continue;
    const artifact = normalizeArtifactReceipt(current.value);
    if (artifact) result.push(artifact);
    for (const child of Object.values(current.value)) queue.push({ value: child, depth: current.depth + 1 });
  }
  return dedupeArtifacts(result);
}

function normalizeArtifactReceipt(value: Record<string, unknown>): HostArtifactReceipt | null {
  const artifactPath = normalizeWorkspaceResourcePath(value.path) || '';
  const kind = typeof value.kind === 'string' ? value.kind.trim().toLowerCase() : '';
  const mediaType = typeof value.media_type === 'string'
    ? value.media_type.trim().toLowerCase()
    : typeof value.mediaType === 'string' ? value.mediaType.trim().toLowerCase() : '';
  const receiptHash = typeof value.sha256 === 'string' ? value.sha256.trim().toLowerCase() : '';
  const bytes = typeof value.bytes === 'number' && Number.isSafeInteger(value.bytes) && value.bytes > 0 ? value.bytes : 0;
  const role = typeof value.role === 'string' && ['deliverable', 'scratch', 'temp', 'log'].includes(value.role)
    ? value.role as HostArtifactReceipt['role']
    : null;
  if (!artifactPath
    || !kind
    || kind.length > 64
    || !mediaType
    || mediaType.length > 160
    || !SHA256_RECEIPT_PATTERN.test(receiptHash)
    || !bytes
    || !role) return null;
  return { path: artifactPath, kind, media_type: mediaType, sha256: receiptHash, bytes, role };
}

function dedupeArtifacts<T extends HostArtifactReceipt>(values: readonly T[]): HostArtifactReceipt[] {
  const byPath = new Map(values.map((value) => [value.path, {
      path: value.path,
      kind: value.kind,
      media_type: value.media_type,
      sha256: value.sha256,
      bytes: value.bytes,
      role: value.role
    }]));
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function emptyHookObservations(binding: HostCapabilityHookRuntimeBinding): HostCapabilityHookObservations {
  return {
    schema: HOST_CAPABILITY_HOOK_OBSERVATIONS_SCHEMA,
    mission_id: binding.mission_id,
    workflow_run_id: binding.workflow_run_id,
    session_scope: binding.session_scope,
    allowlist_digest: binding.runtime.allowlist_digest,
    pre_tool_uses: [],
    tool_calls: [],
    blockers: []
  };
}

function isPreToolObservation(value: unknown): value is HostCapabilityPreToolObservation {
  return isRecord(value)
    && SHA256_RECEIPT_PATTERN.test(String(value.tool_use_id_sha256 || ''))
    && typeof value.tool === 'string'
    && value.tool.length > 0
    && value.tool.length <= 128
    && (value.decision === 'allowed' || value.decision === 'denied');
}

function normalizePreToolObservation(value: unknown): HostCapabilityPreToolObservation | null {
  if (!isPreToolObservation(value)) return null;
  return {
    tool_use_id_sha256: value.tool_use_id_sha256,
    tool: value.tool,
    decision: value.decision
  };
}

function isPostToolObservation(value: unknown): value is HostCapabilityPostToolObservation {
  if (!isRecord(value)
    || !Number.isSafeInteger(value.sequence)
    || Number(value.sequence) < 1
    || !SHA256_RECEIPT_PATTERN.test(String(value.tool_use_id_sha256 || ''))
    || typeof value.tool !== 'string'
    || value.tool.length === 0
    || value.tool.length > 128
    || (value.status !== 'passed' && value.status !== 'failed')
    || !SHA256_RECEIPT_PATTERN.test(String(value.event_sha256 || ''))
    || (value.resource_key !== null && !SHA256_RECEIPT_PATTERN.test(String(value.resource_key || '')))
    || !isHostToolSemanticReceipt(value.semantic_receipt)
    || (value.validation_blocker !== null
      && (typeof value.validation_blocker !== 'string' || value.validation_blocker.length > 160))
    || !Array.isArray(value.artifacts)) return false;
  return value.artifacts.length <= MAX_ARTIFACT_RECEIPTS
    && value.artifacts.every((artifact) => isRecord(artifact) && normalizeArtifactReceipt(artifact) !== null);
}

function normalizePostToolObservation(value: unknown): HostCapabilityPostToolObservation | null {
  if (!isPostToolObservation(value)) return null;
  const semanticReceipt = normalizeStoredSemanticReceipt(value.semantic_receipt);
  if (value.semantic_receipt !== null && !semanticReceipt) return null;
  return {
    sequence: value.sequence,
    tool_use_id_sha256: value.tool_use_id_sha256,
    tool: value.tool,
    status: value.status,
    event_sha256: value.event_sha256,
    resource_key: value.resource_key,
    semantic_receipt: semanticReceipt,
    validation_blocker: value.validation_blocker,
    artifacts: value.artifacts.map((artifact) => normalizeArtifactReceipt(artifact as unknown as Record<string, unknown>)!)
  };
}

function isHostCapabilityRuntime(value: unknown): value is HostCapabilityRuntime {
  if (!isRecord(value)
    || value.schema !== HOST_CAPABILITY_RUNTIME_SCHEMA
    || typeof value.ok !== 'boolean'
    || value.server !== HOST_CAPABILITY_MCP_SERVER
    || !Array.isArray(value.requested_capability_ids)
    || !Array.isArray(value.task_workflows)
    || !Array.isArray(value.requested_tool_names)
    || !Array.isArray(value.observed_tool_names)
    || !Array.isArray(value.allowed_tool_names)
    || !Array.isArray(value.denied_tool_names)
    || !Array.isArray(value.explicit_denied_tool_names)
    || !Array.isArray(value.capabilities)
    || !Array.isArray(value.blockers)) return false;
  const knownIds = new Set(HOST_CAPABILITY_DESCRIPTORS.map((descriptor) => descriptor.id));
  const knownTools = new Set(HOST_CAPABILITY_DESCRIPTORS.flatMap((descriptor) => descriptor.tool_names));
  const requested = uniqueStrings(value.requested_capability_ids);
  const requestedTools = uniqueStrings(value.requested_tool_names);
  const observed = uniqueStrings(value.observed_tool_names);
  const allowed = uniqueStrings(value.allowed_tool_names);
  const denied = uniqueStrings(value.denied_tool_names);
  const blockers = uniqueStrings(value.blockers);
  if (requested.length !== value.requested_capability_ids.length
    || requested.some((id) => !knownIds.has(id))
    || requestedTools.length !== value.requested_tool_names.length
    || requestedTools.some((tool) => !knownTools.has(tool))
    || observed.length !== value.observed_tool_names.length
    || allowed.length !== value.allowed_tool_names.length
    || allowed.some((tool) => !knownTools.has(tool) || !observed.includes(tool) || EXPLICIT_DENIAL_PATTERN.test(tool))
    || denied.length !== value.denied_tool_names.length
    || JSON.stringify(denied) !== JSON.stringify(observed.filter((tool) => !allowed.includes(tool)))
    || blockers.length !== value.blockers.length
    || value.blockers.some((blocker: unknown) => typeof blocker !== 'string' || blocker.length > 256)
    || value.ok !== (blockers.length === 0)
    || JSON.stringify(uniqueWorkflows(value.task_workflows)) !== JSON.stringify(value.task_workflows)
    || value.capabilities.length !== HOST_CAPABILITY_DESCRIPTORS.length
    || JSON.stringify(value.capabilities.map((entry: any) => entry?.id))
      !== JSON.stringify(HOST_CAPABILITY_DESCRIPTORS.map((descriptor) => descriptor.id))
    || value.capabilities.some((entry) => !isHostCapabilityRuntimeEntry(entry, requested, observed, allowed))
    || typeof value.server_present !== 'boolean'
    || typeof value.server_enabled !== 'boolean'
    || value.server_scope !== (value.server_present ? 'project' : null)
    || (value.inventory_source !== null && !boundedRuntimeText(value.inventory_source, 512))
    || !boundedRuntimeText(value.health_status, 128)) return false;
  const allowedFromEntries = uniqueStrings(value.capabilities.flatMap((entry: any) => entry.allowed_tool_names));
  if (JSON.stringify(allowedFromEntries) !== JSON.stringify(allowed)) return false;
  const explicitDenied = denied.filter((tool) => EXPLICIT_DENIAL_PATTERN.test(tool));
  if (JSON.stringify(explicitDenied) !== JSON.stringify(value.explicit_denied_tool_names)) return false;
  const expectedDigest = hostCapabilityRuntimeDigest(value as unknown as HostCapabilityRuntime);
  return value.allowlist_digest === expectedDigest
    && value.capability_digest === hostCapabilityDigest(HOST_CAPABILITY_DESCRIPTORS);
}

function isHostCapabilityRuntimeEntry(
  value: unknown,
  requested: readonly string[],
  observed: readonly string[],
  allowed: readonly string[]
): boolean {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.requested !== 'boolean'
    || !['available', 'missing', 'unhealthy', 'not_requested'].includes(String(value.state || ''))
    || !Array.isArray(value.expected_tool_names)
    || !Array.isArray(value.observed_tool_names)
    || !Array.isArray(value.allowed_tool_names)
    || !Array.isArray(value.blockers)) return false;
  const descriptor = HOST_CAPABILITY_DESCRIPTORS.find((entry) => entry.id === value.id);
  if (!descriptor) return false;
  const expectedObserved = uniqueStrings(descriptor.tool_names.filter((tool) => observed.includes(tool)));
  const expectedAllowed = descriptor.executable !== false && requested.includes(value.id)
    ? uniqueStrings(descriptor.tool_names.filter((tool) => allowed.includes(tool)))
    : [];
  const entryBlockers = uniqueStrings(value.blockers);
  return value.requested === requested.includes(value.id)
    && JSON.stringify(value.expected_tool_names) === JSON.stringify(descriptor.tool_names)
    && JSON.stringify(value.allowed_tool_names) === JSON.stringify(expectedAllowed)
    && JSON.stringify(value.observed_tool_names) === JSON.stringify(expectedObserved)
    && JSON.stringify(value.blockers) === JSON.stringify(entryBlockers)
    && entryBlockers.every((blocker) => blocker.length <= 256)
    && (requested.includes(value.id) ? value.state !== 'not_requested' : value.state === 'not_requested');
}

function hostCapabilityRuntimeMatchesRequest(
  runtime: HostCapabilityRuntime,
  request: HostCapabilityRequest
): boolean {
  return JSON.stringify(runtime.requested_capability_ids) === JSON.stringify(uniqueStrings(request.capability_ids))
    && JSON.stringify(runtime.task_workflows) === JSON.stringify(uniqueWorkflows(request.workflows))
    && JSON.stringify(runtime.requested_tool_names) === JSON.stringify(uniqueStrings(request.tool_names || []));
}

function hostCapabilityRuntimeDigest(runtime: HostCapabilityRuntime): string {
  return `sha256:${sha256(JSON.stringify({
    server: runtime.server,
    server_present: runtime.server_present,
    server_enabled: runtime.server_enabled,
    server_scope: runtime.server_scope,
    inventory_source: runtime.inventory_source,
    health_status: runtime.health_status,
    requested_capability_ids: runtime.requested_capability_ids,
    task_workflows: runtime.task_workflows,
    requested_tool_names: runtime.requested_tool_names,
    observed_tool_names: runtime.observed_tool_names,
    allowed_tool_names: runtime.allowed_tool_names,
    denied_tool_names: runtime.denied_tool_names,
    explicit_denied_tool_names: runtime.explicit_denied_tool_names,
    capability_digest: runtime.capability_digest,
    capabilities: runtime.capabilities,
    blockers: runtime.blockers,
    ok: runtime.ok
  }))}`;
}

function structuredHostToolResponse(value: unknown): Record<string, any> | null {
  if (!isRecord(value)) return null;
  const nested = value.structured_content ?? value.structuredContent;
  if (nested !== undefined) return parseJsonObject(nested);
  return value;
}

function normalizeHostToolSemanticReceipt(
  tool: string,
  toolInput: unknown,
  response: Record<string, any>
): { receipt: HostToolSemanticReceipt | null; blocker: string | null } {
  if (tool === 'datasource_schema_context') {
    const input = isRecord(toolInput) ? toolInput : {};
    const datasource = boundedIdentity(response.datasource);
    const inputDatasource = boundedIdentity(input.datasource);
    const snapshotId = boundedIdentity(response.schema_snapshot_id);
    return datasource && (!inputDatasource || datasource === inputDatasource) && snapshotId
      ? {
          receipt: {
            kind: 'datasource_schema',
            datasource_sha256: `sha256:${sha256(datasource)}`,
            schema_snapshot_sha256: `sha256:${sha256(snapshotId)}`
          },
          blocker: null
        }
      : {
          receipt: null,
          blocker: datasource && inputDatasource && datasource !== inputDatasource
            ? 'host_capability_schema_datasource_mismatch'
            : 'host_capability_schema_receipt_invalid'
        };
  }
  if (tool === 'datasource_query_readonly') {
    const input = isRecord(toolInput) ? toolInput : {};
    const datasource = boundedIdentity(response.datasource);
    const inputDatasource = boundedIdentity(input.datasource);
    const snapshotId = boundedIdentity(response.schema_snapshot_id);
    const inputSnapshotId = boundedIdentity(input.schema_snapshot_id);
    const query = boundedQueryText(input.query ?? input.sql);
    const querySha256 = typeof response.query_sha256 === 'string'
      ? response.query_sha256.trim().toLowerCase()
      : '';
    const rowCount = nonnegativeSafeInteger(response.row_count);
    const columnCount = nonnegativeSafeInteger(response.column_count);
    const status = String(response.status || '').trim().toLowerCase();
    if (!datasource) {
      return { receipt: null, blocker: 'host_capability_readonly_query_receipt_invalid' };
    }
    if (inputDatasource && datasource !== inputDatasource) {
      return { receipt: null, blocker: 'host_capability_readonly_query_datasource_mismatch' };
    }
    if (!snapshotId || !inputSnapshotId || snapshotId !== inputSnapshotId) {
      return { receipt: null, blocker: 'host_capability_readonly_query_schema_mismatch' };
    }
    if (!query || !SHA256_RECEIPT_PATTERN.test(querySha256)
      || querySha256 !== `sha256:${sha256(query)}`) {
      return { receipt: null, blocker: 'host_capability_readonly_query_hash_mismatch' };
    }
    if (rowCount === null || columnCount === null || typeof response.truncated !== 'boolean' || status !== 'passed') {
      return { receipt: null, blocker: 'host_capability_readonly_query_receipt_invalid' };
    }
    return {
      receipt: {
        kind: 'datasource_query',
        datasource_sha256: `sha256:${sha256(datasource)}`,
        schema_snapshot_sha256: `sha256:${sha256(snapshotId)}`,
        query_sha256: querySha256,
        row_count: rowCount,
        column_count: columnCount,
        truncated: response.truncated,
        status: 'passed'
      },
      blocker: null
    };
  }
  if (tool === 'spreadsheet_inspect') {
    const sheetNames = Array.isArray(response.sheet_names)
      ? response.sheet_names.map((value: unknown) => boundedIdentity(value)).filter(Boolean) as string[]
      : [];
    const rowCountKeys = isRecord(response.row_counts) ? Object.keys(response.row_counts).sort() : [];
    const rowCounts = isRecord(response.row_counts)
      ? Object.values(response.row_counts).map(nonnegativeSafeInteger)
      : [];
    const formulas = Array.isArray(response.formulas) ? response.formulas : null;
    const errorCells = Array.isArray(response.error_cells) ? response.error_cells : null;
    const successful = response.ok === true || response.success === true
      || ['passed', 'success', 'completed'].includes(String(response.status || '').trim().toLowerCase());
    if (!successful
      || sheetNames.length === 0
      || sheetNames.length > 256
      || uniqueStrings(sheetNames).length !== sheetNames.length
      || sheetNames.length !== response.sheet_names.length
      || rowCounts.length !== sheetNames.length
      || JSON.stringify(rowCountKeys) !== JSON.stringify([...sheetNames].sort())
      || rowCounts.some((count) => count === null)
      || formulas === null
      || formulas.length > MAX_SEMANTIC_RECEIPT_ITEMS
      || errorCells === null
      || errorCells.length > MAX_SEMANTIC_RECEIPT_ITEMS) {
      return { receipt: null, blocker: 'host_capability_spreadsheet_inspection_receipt_invalid' };
    }
    if (errorCells.length > 0) {
      return { receipt: null, blocker: 'host_capability_spreadsheet_error_cells_present' };
    }
    const totalRowCount = (rowCounts as number[]).reduce((sum, count) => sum + count, 0);
    if (!Number.isSafeInteger(totalRowCount)) {
      return { receipt: null, blocker: 'host_capability_spreadsheet_inspection_receipt_invalid' };
    }
    return {
      receipt: {
        kind: 'spreadsheet_inspection',
        sheet_names_sha256: `sha256:${sha256(JSON.stringify(sheetNames))}`,
        sheet_count: sheetNames.length,
        row_count: totalRowCount,
        formula_count: formulas.length,
        error_cell_count: 0
      },
      blocker: null
    };
  }
  return { receipt: null, blocker: null };
}

function isHostToolSemanticReceipt(value: unknown): value is HostToolSemanticReceipt | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  if (value.kind === 'datasource_schema') {
    return SHA256_RECEIPT_PATTERN.test(String(value.datasource_sha256 || ''))
      && SHA256_RECEIPT_PATTERN.test(String(value.schema_snapshot_sha256 || ''));
  }
  if (value.kind === 'datasource_query') {
    return SHA256_RECEIPT_PATTERN.test(String(value.datasource_sha256 || ''))
      && SHA256_RECEIPT_PATTERN.test(String(value.schema_snapshot_sha256 || ''))
      && SHA256_RECEIPT_PATTERN.test(String(value.query_sha256 || ''))
      && nonnegativeSafeInteger(value.row_count) !== null
      && nonnegativeSafeInteger(value.column_count) !== null
      && typeof value.truncated === 'boolean'
      && value.status === 'passed';
  }
  if (value.kind === 'spreadsheet_inspection') {
    return SHA256_RECEIPT_PATTERN.test(String(value.sheet_names_sha256 || ''))
      && nonnegativeSafeInteger(value.sheet_count) !== null
      && nonnegativeSafeInteger(value.row_count) !== null
      && nonnegativeSafeInteger(value.formula_count) !== null
      && value.error_cell_count === 0;
  }
  return false;
}

function normalizeStoredSemanticReceipt(value: unknown): HostToolSemanticReceipt | null {
  if (value === null) return null;
  if (!isHostToolSemanticReceipt(value)) return null;
  if (value.kind === 'datasource_schema') {
    return {
      kind: value.kind,
      datasource_sha256: value.datasource_sha256,
      schema_snapshot_sha256: value.schema_snapshot_sha256
    };
  }
  if (value.kind === 'datasource_query') {
    return {
      kind: value.kind,
      datasource_sha256: value.datasource_sha256,
      schema_snapshot_sha256: value.schema_snapshot_sha256,
      query_sha256: value.query_sha256,
      row_count: value.row_count,
      column_count: value.column_count,
      truncated: value.truncated,
      status: 'passed'
    };
  }
  return {
    kind: value.kind,
    sheet_names_sha256: value.sheet_names_sha256,
    sheet_count: value.sheet_count,
    row_count: value.row_count,
    formula_count: value.formula_count,
    error_cell_count: 0
  };
}

function nonnegativeSafeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function boundedRuntimeText(value: unknown, maxLength: number): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= maxLength && !/[\r\n\0]/.test(text) ? text : null;
}

function boundedQueryText(value: unknown): string | null {
  const text = typeof value === 'string' ? value : '';
  return text.trim()
    && Buffer.byteLength(text, 'utf8') <= MAX_RECEIPT_JSON_STRING_BYTES
    && !/[\0]/.test(text)
    ? text
    : null;
}

function hostToolResponseFailed(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.isError === true || value.is_error === true || value.ok === false || value.success === false) return true;
  const status = String(value.status || '').trim().toLowerCase();
  return status === 'failed' || status === 'error';
}

function boundedIdentity(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= 256 && !/[\r\n\0]/.test(text) ? text : null;
}

function runtimeResult(input: {
  serverPresent: boolean;
  serverEnabled: boolean;
  inventorySource: string | null;
  healthStatus: string;
  requestedCapabilityIds: string[];
  workflows: HostCapabilityWorkflow[];
  requestedToolNames: string[];
  observedToolNames: string[];
  allowedToolNames: string[];
  deniedToolNames?: string[];
  capabilities: HostCapabilityRuntimeEntry[];
  blockers: string[];
}): HostCapabilityRuntime {
  const observedToolNames = uniqueStrings(input.observedToolNames).slice(0, MAX_OBSERVED_TOOL_NAMES);
  const allowedToolNames = uniqueStrings(input.allowedToolNames);
  const deniedToolNames = uniqueStrings(input.deniedToolNames || observedToolNames.filter((name) => !allowedToolNames.includes(name)));
  const blockers = uniqueStrings(input.blockers);
  const runtime: HostCapabilityRuntime = {
    schema: HOST_CAPABILITY_RUNTIME_SCHEMA,
    ok: blockers.length === 0,
    server: HOST_CAPABILITY_MCP_SERVER,
    server_present: input.serverPresent,
    server_enabled: input.serverEnabled,
    server_scope: input.serverPresent ? 'project' : null,
    inventory_source: input.inventorySource,
    health_status: input.healthStatus,
    requested_capability_ids: uniqueStrings(input.requestedCapabilityIds),
    task_workflows: uniqueWorkflows(input.workflows),
    requested_tool_names: uniqueStrings(input.requestedToolNames),
    observed_tool_names: observedToolNames,
    allowed_tool_names: allowedToolNames,
    denied_tool_names: deniedToolNames,
    explicit_denied_tool_names: deniedToolNames.filter((name) => EXPLICIT_DENIAL_PATTERN.test(name)),
    allowlist_digest: '',
    capability_digest: hostCapabilityDigest(HOST_CAPABILITY_DESCRIPTORS),
    capabilities: input.capabilities,
    blockers
  };
  runtime.allowlist_digest = hostCapabilityRuntimeDigest(runtime);
  return runtime;
}

function capabilityRuntimeEntry(
  descriptor: HostCapabilityDescriptor,
  requested: boolean,
  state: HostCapabilityState,
  observedToolNames: string[],
  allowedToolNames: string[],
  blockers: string[]
): HostCapabilityRuntimeEntry {
  return {
    id: descriptor.id,
    requested,
    state,
    expected_tool_names: [...descriptor.tool_names],
    observed_tool_names: uniqueStrings(observedToolNames),
    allowed_tool_names: uniqueStrings(allowedToolNames),
    blockers: uniqueStrings(blockers)
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1]?.trim();
  for (const candidate of [trimmed, ...(fenced ? [fenced] : [])]) {
    try {
      const parsed = JSON.parse(candidate);
      if (isRecord(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function matchesIntent(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function tomlStringArray(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].sort();
}

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function uniqueWorkflows(values: readonly unknown[]): HostCapabilityWorkflow[] {
  const valid = new Set<HostCapabilityWorkflow>([
    'datasource_sql_generation',
    'datasource_query',
    'spreadsheet_create',
    'spreadsheet_edit',
    'document_render',
    'web_capture',
    'workspace_files',
    'artifact_delivery'
  ]);
  return uniqueStrings(values).filter((value): value is HostCapabilityWorkflow => valid.has(value as HostCapabilityWorkflow));
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
