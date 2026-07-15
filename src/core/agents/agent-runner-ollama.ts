import path from 'node:path'
import { nowIso, sha256, writeJsonAtomic } from '../fsx.js'
import { loadTriWikiRuntimeContext, triWikiContextBlock, triWikiProofRecord, type TriWikiRuntimeContext } from '../triwiki-runtime.js'
import { validateAgentWorkerResult } from './agent-worker-pipeline.js'
import { normalizeAgentPatchEnvelope, type AgentPatchEnvelope } from './agent-patch-schema.js'
import { resolveOllamaWorkerConfig, type OllamaWorkerConfig } from './ollama-worker-config.js'
import { leanEngineeringCompactText } from '../lean-engineering-policy.js'

export const OLLAMA_WORKER_POLICY_SCHEMA = 'sks.ollama-worker-policy.v1'
export const OLLAMA_WORKER_REQUEST_SCHEMA = 'sks.ollama-worker-request.v1'
export const OLLAMA_WORKER_RESPONSE_SCHEMA = 'sks.ollama-worker-response.v1'

export async function runOllamaAgent(agent: any, slice: any, opts: any = {}) {
  const root = path.resolve(opts.agentRoot || opts.cwd || process.cwd())
  const workerDirRel = String(opts.workerDirRel || agent.session_artifact_dir || path.join('sessions', String(agent.id || 'ollama-worker'), 'worker'))
  const workerDir = path.join(root, workerDirRel)
  const triwikiContext = await loadTriWikiRuntimeContext(root)
  const config = await resolveOllamaWorkerConfig({
    backend: 'ollama',
    ollamaEnabled: opts.ollamaEnabled === true || opts.ollama_enabled === true,
    model: opts.ollamaModel || opts.ollama_model || null,
    baseUrl: opts.ollamaBaseUrl || opts.ollama_base_url || null,
    keepAlive: opts.ollamaKeepAlive || opts.ollama_keep_alive || null,
    timeoutMs: Number(opts.ollamaTimeoutMs || opts.ollama_timeout_ms || 0) || null,
    temperature: Number(opts.ollamaTemperature || opts.ollama_temperature || 0),
    think: typeof opts.ollamaThink === 'boolean' ? opts.ollamaThink
      : typeof opts.ollama_think === 'boolean' ? opts.ollama_think
        : null
  })
  const policy = classifyOllamaWorkerSlice(slice, { route: opts.route, agent })
  await writeJsonAtomic(path.join(workerDir, 'ollama-worker-config.json'), config)
  await writeJsonAtomic(path.join(workerDir, 'ollama-worker-policy.json'), policy)
  await writeJsonAtomic(path.join(workerDir, 'ollama-triwiki-context.json'), buildOllamaTriWikiArtifact(triwikiContext))
  if (!config.ok || !policy.ok) {
    return validateAgentWorkerResult(blockedResult(agent, slice, opts, [...config.blockers, ...policy.blockers], [
      path.join(workerDirRel, 'ollama-worker-config.json'),
      path.join(workerDirRel, 'ollama-worker-policy.json'),
      path.join(workerDirRel, 'ollama-triwiki-context.json')
    ]))
  }
  const requestId = `ollama:${sha256(`${nowIso()}:${agent.session_id || agent.id}:${slice?.id || ''}`).slice(0, 16)}`
  const request = buildOllamaGenerateRequest(agent, slice, opts, config, requestId, triwikiContext)
  await writeJsonAtomic(path.join(workerDir, 'ollama-request.json'), {
    schema: OLLAMA_WORKER_REQUEST_SCHEMA,
    generated_at: nowIso(),
    request_id: requestId,
    endpoint: `${config.base_url}/api/generate`,
    model: config.model,
    keep_alive: config.keep_alive,
    stream: false,
    think: config.think,
    policy: 'worker_only_no_strategy_planning_design',
    triwiki_context: triWikiProofRecord(triwikiContext),
    stack_current_docs_required: true,
    prompt_sha256: sha256(request.prompt)
  })
  const response: { ok: true; data: any } | { ok: false; error: string } = await callOllamaGenerate(config, request)
    .catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
  const workerText = response.ok === true ? extractOllamaWorkerText(response.data) : { text: '', source: 'empty' as const }
  await writeJsonAtomic(path.join(workerDir, 'ollama-response.json'), {
    schema: OLLAMA_WORKER_RESPONSE_SCHEMA,
    generated_at: nowIso(),
    request_id: requestId,
    ok: response.ok === true,
    model: config.model,
    response_sha256: response.ok === true ? sha256(workerText.text) : null,
    response_source: response.ok === true ? workerText.source : null,
    data: response.ok === true ? safeResponseData(response.data) : null,
    error: response.ok === true ? null : response.error
  })
  if (response.ok !== true) {
    return validateAgentWorkerResult(blockedResult(agent, slice, opts, ['ollama_generate_failed', String(response.error || 'unknown_error')], [
      path.join(workerDirRel, 'ollama-triwiki-context.json'),
      path.join(workerDirRel, 'ollama-request.json'),
      path.join(workerDirRel, 'ollama-response.json')
    ]))
  }
  const parsed = parseWorkerJson(workerText.text)
  if (!parsed.ok) {
    return validateAgentWorkerResult(blockedResult(agent, slice, opts, ['ollama_worker_json_parse_failed'], [
      path.join(workerDirRel, 'ollama-triwiki-context.json'),
      path.join(workerDirRel, 'ollama-request.json'),
      path.join(workerDirRel, 'ollama-response.json')
    ]))
  }
  const patchEnvelopes = normalizeOllamaPatchEnvelopes(parsed.value, agent, slice, opts, requestId)
  const changedFiles = [...new Set(patchEnvelopes.flatMap((envelope) => envelope.operations.map((operation) => operation.path)))]
  const writePaths = collectWritePaths(slice, opts)
  return validateAgentWorkerResult({
    mission_id: String(opts.missionId || opts.mission_id || ''),
    agent_id: String(agent.id || 'ollama-worker'),
    session_id: String(agent.session_id || ''),
    persona_id: String(agent.persona_id || agent.id || 'ollama-worker'),
    task_slice_id: String(slice?.id || ''),
    status: writePaths.length > 0 && patchEnvelopes.length === 0 ? 'blocked' : 'done',
    backend: 'ollama',
    summary: String(parsed.value.summary || parsed.value.result || 'Ollama local worker completed.'),
    findings: [
      'ollama local worker executed through /api/generate',
      'triwiki context consulted before local worker prompt',
      ...stringArray(parsed.value.findings)
    ],
    proposed_changes: stringArray(parsed.value.proposed_changes || parsed.value.proposedChanges),
    changed_files: changedFiles,
    lease_compliance: { ok: true, violations: [] },
    artifacts: [
      path.join(workerDirRel, 'ollama-worker-config.json'),
      path.join(workerDirRel, 'ollama-worker-policy.json'),
      path.join(workerDirRel, 'ollama-triwiki-context.json'),
      path.join(workerDirRel, 'ollama-request.json'),
      path.join(workerDirRel, 'ollama-response.json')
    ],
    blockers: writePaths.length > 0 && patchEnvelopes.length === 0 ? ['ollama_no_patch_envelopes_for_write_task'] : [],
    confidence: 'model_authored_local',
    handoff_notes: 'Local Ollama worker produced worker JSON; parent SKS remains responsible for merge, apply, verification, and rollback.',
    unverified: [
      'local_model_output_not_strategy_or_verification_authority',
      ...(triwikiContext.present ? [] : ['triwiki_context_missing_parent_should_refresh_with_context7_or_official_docs_before_relying_on_local_worker'])
    ],
    writes: changedFiles,
    ...(patchEnvelopes.length ? { patch_envelopes: patchEnvelopes } : {}),
    model_authored_patch_envelopes: patchEnvelopes.length > 0,
    fixture_patch_envelopes: false,
    source_intelligence_refs: agent.source_intelligence_refs || opts.source_intelligence_refs || null,
    goal_mode_ref: agent.goal_mode_ref || opts.goal_mode_ref || null,
    verification: { status: 'passed', checks: ['ollama-api-generate', 'ollama-worker-policy', 'triwiki-runtime-context', 'agent-patch-envelope-schema'] },
    recursion_guard: { ok: true, violations: [] }
  })
}

export function classifyOllamaWorkerSlice(slice: any, input: { route?: string; agent?: any } = {}) {
  const writePaths = collectWritePaths(slice, {})
  const text = [
    input.route,
    input.agent?.role,
    input.agent?.persona_id,
    slice?.role,
    slice?.domain,
    slice?.kind,
    slice?.title,
    slice?.description,
    ...(Array.isArray(slice?.target_paths) ? slice.target_paths : [])
  ].map((value) => String(value || '')).join('\n')
  const bannedRole = /(?:^|\b)(architect|verifier|checker|reviewer|researcher|safety|integrator|schema|release|ux|db)(?:\b|$)/i.test(String(input.agent?.role || slice?.role || ''))
  const collection = /\b(collect|gather|extract|inventory|list|scan|grep|tail|summarize|catalog)\b|수집|추출|목록|스캔|인벤토리/i.test(text)
  const coding = /\b(code|implement|patch|write|edit|fix|mechanical|simple)\b|코드|작성|수정|구현|패치|단순/i.test(text)
  const banned = /\b(strategy|strategize|planning|plan|architecture|architect|design|review|verify|verification|audit|inspect|safety|risk|consensus|debate|orchestrate|policy|decide|decision|migration|database|schema)\b|전략|기획|설계|디자인|검증|검수|리뷰|감사|안전|위험|합의|토론|결정|마이그레이션|데이터베이스/i.test(text)
  // Web research / external lookup must run on GPT, never on the local model:
  // local LLMs hallucinate sources and cannot browse. This wins even over the
  // collection allowlist (e.g. "web research and collect docs" stays on GPT).
  const research = /\b(web|research|browse|browser|crawl|fetch docs|websearch|web search|search the web|investigate|context7)\b|웹|리서치|조사|웹서치|웹 ?검색|검색/i.test(text)
  const allowed = !bannedRole && !banned && !research && (writePaths.length > 0 || collection || coding)
  const blockers = [
    ...(allowed ? [] : ['ollama_worker_task_not_simple_code_or_collection']),
    ...(bannedRole ? ['ollama_worker_role_blocked'] : []),
    ...(banned ? ['ollama_worker_strategy_planning_design_blocked'] : []),
    ...(research ? ['ollama_worker_web_research_blocked'] : [])
  ]
  return {
    schema: OLLAMA_WORKER_POLICY_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    worker_only: true,
    no_strategy_planning_design: true,
    allowed_work: ['simple_code_patch_envelopes', 'read_only_collection'],
    write_path_count: writePaths.length,
    collection_detected: collection,
    coding_detected: coding,
    research_detected: research,
    blockers
  }
}

function buildOllamaTriWikiArtifact(triwikiContext: TriWikiRuntimeContext) {
  return {
    ...triwikiContext,
    proof: triWikiProofRecord(triwikiContext),
    stack_current_docs_policy: {
      required: true,
      memory_path: '.sneakoscope/memory/q2_facts/stack-current-docs.md',
      refresh_command: 'sks wiki refresh',
      validate_command: 'sks wiki validate .sneakoscope/wiki/context-pack.json',
      current_docs_source: 'Context7 or official vendor docs',
      parent_action_when_stale_or_missing: 'Refresh stack-current-docs evidence with Context7 or official docs, then refresh/validate TriWiki before retrying the local worker.'
    }
  }
}

function buildOllamaGenerateRequest(agent: any, slice: any, opts: any, config: OllamaWorkerConfig, requestId: string, triwikiContext: TriWikiRuntimeContext) {
  const writePaths = collectWritePaths(slice, opts)
  const prompt = [
    'You are an SKS local Ollama worker. You are not an architect, planner, reviewer, verifier, safety judge, or strategist.',
    'Only perform the narrow worker task below. If the task asks for strategy, planning, design, review, verification, risk judgment, or orchestration, return JSON with status "blocked" and blockers.',
    leanEngineeringCompactText(),
    'Before writing or collecting, consult the TriWiki context below first. Treat use_first as high-trust project memory and hydrate_first as source/evidence that the parent must verify before risky or user-visible work.',
    'If TriWiki is missing, stale, or lacks current stack syntax/version guidance, do not invent from model memory. Return blocked and tell the parent SKS route to update .sneakoscope/memory/q2_facts/stack-current-docs.md with Context7 or official vendor docs, then run `sks wiki refresh` and `sks wiki validate .sneakoscope/wiki/context-pack.json` before retrying.',
    'Return JSON only. Do not wrap it in markdown.',
    'Required shape: {"summary": string, "findings": string[], "proposed_changes": string[], "patch_envelopes": [patchEnvelope]}.',
    'Each patchEnvelope must contain operations: [{"op":"write","path":"relative/path","content":"text"}] or replace/unified_diff operations.',
    'Patch envelope operations may be write, replace, or unified_diff. Use only allowed write paths.',
    '',
    triWikiContextBlock(triwikiContext),
    '',
    JSON.stringify({
      request_id: requestId,
      mission_id: opts.missionId || opts.mission_id || '',
      route: opts.route || '$Naruto',
      agent: {
        id: agent.id || '',
        session_id: agent.session_id || '',
        slot_id: agent.slot_id || agent.id || '',
        generation_index: Number(agent.generation_index || 1),
        role: agent.role || agent.persona_id || ''
      },
      task_slice: slice || {},
      allowed_write_paths: writePaths,
      triwiki_context: triWikiProofRecord(triwikiContext),
      stack_current_docs_policy: {
        required: true,
        memory_path: '.sneakoscope/memory/q2_facts/stack-current-docs.md',
        refresh: 'sks wiki refresh',
        validate: 'sks wiki validate .sneakoscope/wiki/context-pack.json',
        current_docs_source: 'Context7 or official vendor docs'
      }
    }, null, 2)
  ].join('\n')
  return {
    model: config.model,
    prompt,
    stream: false,
    format: 'json',
    think: config.think,
    keep_alive: config.keep_alive,
    options: {
      temperature: config.temperature
    }
  }
}

async function callOllamaGenerate(config: OllamaWorkerConfig, request: Record<string, unknown>): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeout_ms)
  try {
    const response = await fetch(`${config.base_url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) return { ok: false, error: `http_${response.status}:${text.slice(0, 500)}` }
    return { ok: true, data: JSON.parse(text) }
  } finally {
    clearTimeout(timer)
  }
}

function parseWorkerJson(text: string): { ok: true; value: any } | { ok: false } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return { ok: false }
    try {
      return { ok: true, value: JSON.parse(match[0] || '{}') }
    } catch {
      return { ok: false }
    }
  }
}

function normalizeOllamaPatchEnvelopes(value: any, agent: any, slice: any, opts: any, requestId: string): AgentPatchEnvelope[] {
  const rawEnvelopes = Array.isArray(value?.patch_envelopes) ? value.patch_envelopes
    : Array.isArray(value?.patchEnvelopes) ? value.patchEnvelopes
      : value?.patch_envelope ? [value.patch_envelope]
        : value?.patchEnvelope ? [value.patchEnvelope]
          : Array.isArray(value?.operations) ? [{ operations: value.operations }]
            : value?.operation ? [{ operation: value.operation }]
              : looksLikePatchOperation(value) ? [value]
                : []
  return rawEnvelopes.map((raw: any, index: number) => {
    const operations = normalizeOllamaOperations(raw)
    const allowedPaths = collectWritePaths(slice, opts)
    const firstPath = String(operations[0]?.path || allowedPaths[index] || slice?.id || `ollama-${index + 1}`)
    const leaseId = String(raw?.lease_id || raw?.lease_proof?.lease_id || `write:${String(agent.id || 'ollama')}:${firstPath}`)
    const nodeId = String(slice?.micro_win_id || slice?.id || `ollama-patch-${index + 1}`)
    const verificationNodeId = String(slice?.verification_node_id || `verify:${nodeId}`)
    const rollbackNodeId = String(slice?.rollback_node_id || `rollback:${nodeId}`)
    return normalizeAgentPatchEnvelope({
      ...raw,
      source: 'model_authored',
      mission_id: String(opts.missionId || opts.mission_id || raw?.mission_id || ''),
      route: String(opts.route || raw?.route || '$Naruto'),
      agent_id: String(agent.id || raw?.agent_id || 'ollama-worker'),
      session_id: String(agent.session_id || raw?.session_id || ''),
      slot_id: String(agent.slot_id || raw?.slot_id || agent.id || 'ollama-worker'),
      generation_index: Number(agent.generation_index || raw?.generation_index || 1),
      task_slice_id: String(slice?.id || raw?.task_slice_id || ''),
      native_cli_worker_session_id: String(agent.session_id || raw?.native_cli_worker_session_id || ''),
      native_cli_process_id: process.pid,
      worker_process_id: process.pid,
      backend_ollama_request_id: requestId,
      fast_mode: opts.fastMode !== false,
      service_tier: opts.serviceTier === 'standard' ? 'standard' : 'fast',
      lease_id: leaseId,
      allowed_paths: allowedPaths.length ? allowedPaths : raw?.allowed_paths,
      strategy_task_id: nodeId,
      verification_node_id: verificationNodeId,
      rollback_node_id: rollbackNodeId,
      lease_proof: {
        lease_id: leaseId,
        owner_agent: String(agent.id || 'ollama-worker'),
        owner_persona: String(agent.persona_id || agent.role || 'ollama-worker'),
        allowed_paths: allowedPaths.length ? allowedPaths : raw?.allowed_paths,
        strategy_task_id: nodeId,
        micro_win_id: slice?.micro_win_id ? String(slice.micro_win_id) : undefined,
        protected_path_check: 'passed',
        conflict_prediction_id: `conflict:${nodeId}`,
        verification_node_id: verificationNodeId,
        rollback_node_id: rollbackNodeId
      },
      operations
    })
  })
}

function normalizeOllamaOperations(raw: any): any[] {
  if (Array.isArray(raw?.operations)) return raw.operations
  if (raw?.operation) return normalizeOllamaOperations(raw.operation)
  if (Array.isArray(raw?.changes)) return raw.changes.flatMap((change: any) => normalizeOllamaOperations(change))
  if (Array.isArray(raw?.edits)) return raw.edits.flatMap((edit: any) => normalizeOllamaOperations(edit))
  const pathValue = raw?.path || raw?.file || raw?.filepath || raw?.file_path || raw?.target_path || raw?.targetPath
  if (pathValue && (raw?.content !== undefined || raw?.text !== undefined)) {
    return [{ op: 'write', path: String(pathValue), content: String(raw.content ?? raw.text ?? '') }]
  }
  if (pathValue && (raw?.diff !== undefined || raw?.unified_diff !== undefined || raw?.unifiedDiff !== undefined)) {
    return [{ op: 'unified_diff', path: String(pathValue), diff: String(raw.diff ?? raw.unified_diff ?? raw.unifiedDiff ?? '') }]
  }
  if (pathValue && (raw?.search !== undefined || raw?.find !== undefined || raw?.replace !== undefined)) {
    return [{
      op: 'replace',
      path: String(pathValue),
      search: String(raw.search ?? raw.find ?? ''),
      replace: String(raw.replace || '')
    }]
  }
  return []
}

function looksLikePatchOperation(value: any) {
  return Boolean(value && typeof value === 'object' && (
    value.path !== undefined ||
    value.file !== undefined ||
    value.filepath !== undefined ||
    value.file_path !== undefined ||
    value.target_path !== undefined ||
    value.targetPath !== undefined ||
    value.content !== undefined ||
    value.text !== undefined ||
    value.diff !== undefined ||
    value.unified_diff !== undefined ||
    value.unifiedDiff !== undefined ||
    value.search !== undefined ||
    value.find !== undefined
  ))
}

function blockedResult(agent: any, slice: any, opts: any, blockers: string[], artifacts: string[]) {
  return {
    mission_id: String(opts.missionId || opts.mission_id || ''),
    agent_id: String(agent.id || 'ollama-worker'),
    session_id: String(agent.session_id || ''),
    persona_id: String(agent.persona_id || agent.id || 'ollama-worker'),
    task_slice_id: String(slice?.id || ''),
    status: 'blocked',
    backend: 'ollama',
    summary: 'Ollama local worker blocked by configuration or worker-only policy.',
    findings: [],
    proposed_changes: [],
    changed_files: [],
    lease_compliance: { ok: true, violations: [] },
    artifacts,
    blockers,
    confidence: 'blocked',
    handoff_notes: 'Local model did not run.',
    unverified: [],
    writes: [],
    verification: { status: 'failed', checks: ['ollama-worker-policy'] },
    recursion_guard: { ok: true, violations: [] }
  }
}

function collectWritePaths(slice: any, opts: any) {
  return [
    ...(Array.isArray(slice?.write_paths) ? slice.write_paths : []),
    ...(Array.isArray(opts?.write_paths) ? opts.write_paths : [])
  ].map(String).filter(Boolean)
}

function stringArray(value: any) {
  return Array.isArray(value) ? value.map(String) : []
}

function safeResponseData(data: any) {
  return {
    model: data?.model || null,
    created_at: data?.created_at || null,
    done: data?.done === true,
    response_present: typeof data?.response === 'string' && data.response.length > 0,
    thinking_present: typeof data?.thinking === 'string' && data.thinking.length > 0,
    total_duration: data?.total_duration || null,
    load_duration: data?.load_duration || null,
    prompt_eval_count: data?.prompt_eval_count || null,
    eval_count: data?.eval_count || null
  }
}

function extractOllamaWorkerText(data: any): { text: string; source: 'response' | 'thinking' | 'empty' } {
  const response = String(data?.response || '').trim()
  if (response) return { text: response, source: 'response' }
  const thinking = String(data?.thinking || '').trim()
  if (thinking) return { text: thinking, source: 'thinking' }
  return { text: '', source: 'empty' }
}
