import path from 'node:path';
import { agentWorkerHookContext } from '../agents/agent-recursion-guard.js';
import { consultJevToolDelegation, type JevToolDelegationDecision } from '../decisions/integration.js';
import { nowIso, readJson, sha256, writeJsonAtomic } from '../fsx.js';
import { ensureConfinedDirectory } from '../managed-path-safety.js';
import { missionDir } from '../mission.js';
import { readSubagentEvents } from '../subagents/subagent-evidence.js';

/**
 * Parent orchestration gate.
 *
 * A Naruto mission is parent orchestration: the parent decomposes, spawns,
 * waits, and integrates. Prompt text alone did not stop the parent from
 * implementing the first slice itself, so this PreToolUse gate denies a source
 * edit from the root parent thread while the mission has no child thread yet.
 *
 * The deterministic baseline is "delegate first". When Jev mode is on, one
 * Decisions call may classify the edit as orchestration scaffolding
 * (`parent_owned`) and let it through; an unconfident or unavailable Jev keeps
 * the baseline. Once children exist, a parent source edit while any child of
 * the run is still running is denied as well: the parent waits, then
 * integrates. Both phases release after a bounded number of denials so a host
 * without a working spawn tool or SubagentStop event cannot deadlock, and every
 * release is recorded.
 *
 * Codex hook payloads carry no thread id. A child thread shares the parent's
 * `session_id`; only the optional `agent_id` / `agent_type` fields mark it.
 */

export const PARENT_ORCHESTRATION_GATE_FILENAME = 'parent-orchestration-gate.json';
export const PARENT_ORCHESTRATION_GATE_SCHEMA = 'sks.parent-orchestration-gate.v1' as const;
/** Denials per phase before the gate releases the parent with one visible warning. */
export const PARENT_ORCHESTRATION_MAX_BLOCKS = 2;
const MAX_TARGETS = 16;

const SPAWN_TOOL_RE = /^(?:functions\.|collaboration\.)?spawn_agent$/;
const FILE_EDIT_TOOL_RE = /^(?:functions\.)?(?:apply_patch|edit|write|multiedit|notebookedit|str_replace_editor|str_replace_based_edit_tool|file_write|fs_write|write_file|create_file|edit_file|update_file|delete_file)$/i;
const SHELL_TOOL_RE = /^(?:functions\.)?(?:shell|shell_command|exec_command|local_shell|bash|container\.exec)$/i;
const SHELL_WRITE_RE = new RegExp([
  String.raw`(?:^|[\s;&|(])(?:rm|mv|cp|touch|mkdir|tee|ln|install)\b`,
  String.raw`\bsed\s+(?:-[a-zA-Z]*i|--in-place)`,
  String.raw`\bperl\s+-p?i\b`,
  String.raw`\bpython\d?\s+-c\b`,
  String.raw`\bnode\s+-e\b`,
  String.raw`(?<![<>\d])>{1,2}(?!&)\s*(?!\/dev\/null)\S`,
  String.raw`\*\*\*\s+(?:Update|Add|Delete|Move to)\s+File:`,
  String.raw`\bgit\s+(?:apply|checkout|restore|stash|reset|commit|rebase|merge|cherry-pick|clean)\b`,
  String.raw`\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|uninstall|i)\b`,
  String.raw`\bcargo\s+(?:add|remove)\b`,
  String.raw`\bpip\d?\s+install\b`
].join('|'), 'i');
const PATCH_FILE_RE = /\*\*\*\s+(?:Update|Add|Delete|Move to)\s+File:\s*([^\n\r]+)/g;
const PATCH_HEADER_RE = /\*\*\*\s+(?:Update|Add|Delete|Move to)\s+File:/;
const SHELL_PATH_TOKEN_RE = /(?:^|\s)((?:\.{1,2}\/|\/|~\/)?[\w@.+-]+(?:\/[\w@.+-]+)+|[\w@+-]+\.[a-z0-9]{1,8})(?=\s|$)/gi;

export interface ParentMutationIntent {
  toolName: string;
  kind: 'file_edit' | 'shell_write';
  targets: readonly string[];
  /** Every known target lives under `.sneakoscope/`, which the parent owns. */
  exempt: boolean;
}

export interface ParentOrchestrationLedger {
  schema: typeof PARENT_ORCHESTRATION_GATE_SCHEMA;
  mission_id: string;
  workflow_run_id: string | null;
  spawns: number;
  blocks: number;
  escapes: number;
  parent_owned_allows: number;
  /** Denials while children of the run were still running, for `wait_fingerprint`. */
  wait_blocks: number;
  wait_escapes: number;
  /** Hash of the running child set the wait counter belongs to. */
  wait_fingerprint: string | null;
  last_action: 'allow' | 'block' | 'escape' | 'spawn' | 'wait' | null;
  last_tool: string | null;
  last_targets: readonly string[];
  last_jev_reason: string | null;
  updated_at: string | null;
}

export type ParentOrchestrationDecision =
  | { action: 'allow'; reason: string; jev: JevToolDelegationDecision | null }
  | { action: 'block'; reason: string; message: string; jev: JevToolDelegationDecision | null }
  | { action: 'escape'; reason: string; message: string | null; jev: JevToolDelegationDecision | null };

export function isSpawnToolPayload(payload: any = {}): boolean {
  return SPAWN_TOOL_RE.test(toolNameOf(payload));
}

function toolNameOf(payload: any = {}): string {
  return String(payload?.tool_name || payload?.toolName || payload?.tool?.name || payload?.name || '').trim();
}

function toolInputOf(payload: any = {}): Record<string, unknown> {
  const input = payload?.tool_input || payload?.toolInput || payload?.tool?.input || payload?.input;
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

function commandText(input: Record<string, unknown>, payload: any = {}): string {
  const raw = input.command ?? input.cmd ?? input.args ?? payload?.command ?? '';
  if (Array.isArray(raw)) return raw.map((entry) => String(entry ?? '')).join(' ');
  return String(raw ?? '');
}

function narutoState(state: any = {}): boolean {
  const mode = String(state?.mode || '').toUpperCase();
  const route = String(state?.route || state?.route_command || '').replace(/^\$/, '').toUpperCase();
  return mode === 'NARUTO' || route === 'NARUTO' || state?.subagents_required === true;
}

/**
 * A hook fired inside a spawned child. Codex marks child-thread hook payloads
 * with the optional `agent_id` / `agent_type` fields and keeps the parent's
 * `session_id`, so the session id alone cannot separate them.
 */
export function childThreadHookPayload(payload: any = {}): boolean {
  const agentId = String(payload?.agent_id || payload?.agentId || '').trim();
  const agentType = String(payload?.agent_type || payload?.agentType || '').trim();
  if (agentId || agentType) return true;
  const thread = String(payload?.thread_id || payload?.threadId || '').trim();
  const session = String(payload?.session_id || payload?.sessionId || '').trim();
  return Boolean(thread && session && thread !== session);
}

/**
 * True only for the root parent thread of an open Naruto mission: not a child
 * thread, not an SKS agent worker, and on the mission's recorded session.
 */
export function narutoRootParentHook(state: any = {}, payload: any = {}, sessionKey: unknown = null): boolean {
  if (!narutoState(state)) return false;
  if (!String(state?.mission_id || '').trim()) return false;
  if (state?.route_closed === true) return false;
  if (agentWorkerHookContext(state, payload)) return false;
  if (childThreadHookPayload(payload)) return false;
  const scope = String(state?.session_scope || '').trim();
  const current = String(sessionKey || '').trim();
  if (scope && current && scope !== current) return false;
  return true;
}

export function isSneakoscopeArtifactPath(target: string): boolean {
  const normalized = String(target || '').trim().replace(/\\/g, '/').replace(/^['"]|['"]$/g, '');
  if (!normalized) return false;
  return /^(?:\.\/)?\.sneakoscope(?:\/|$)/.test(normalized) || /\/\.sneakoscope(?:\/|$)/.test(normalized);
}

function pushTarget(targets: string[], value: unknown): void {
  const text = String(value ?? '').trim();
  if (!text || targets.length >= MAX_TARGETS || targets.includes(text)) return;
  targets.push(text);
}

function collectInputTargets(input: Record<string, unknown>, targets: string[]): void {
  for (const key of ['path', 'file_path', 'filePath', 'file', 'filename', 'target', 'target_path', 'targetPath', 'destination']) {
    if (typeof input[key] === 'string') pushTarget(targets, input[key]);
  }
  for (const key of ['paths', 'files', 'targets']) {
    const rows = input[key];
    if (Array.isArray(rows)) for (const row of rows) pushTarget(targets, row);
  }
  const edits = input.edits;
  if (Array.isArray(edits)) {
    for (const edit of edits) {
      if (edit && typeof edit === 'object') {
        const row = edit as Record<string, unknown>;
        pushTarget(targets, row.path ?? row.file_path ?? row.filePath ?? row.file);
      }
    }
  }
}

/** Paths named by apply_patch headers anywhere in the tool input. */
function patchHeaderTargets(texts: readonly unknown[]): string[] {
  const targets: string[] = [];
  for (const text of texts) {
    if (typeof text !== 'string' || !PATCH_HEADER_RE.test(text)) continue;
    for (const match of text.matchAll(PATCH_FILE_RE)) pushTarget(targets, match[1]);
  }
  return targets;
}

function collectShellTargets(command: string, targets: string[]): void {
  for (const match of command.matchAll(SHELL_PATH_TOKEN_RE)) {
    const token = String(match[1] || '').trim();
    if (!token || token.startsWith('-') || /^https?:\/\//i.test(token)) continue;
    if (/^\d+(?:\.\d+)*$/.test(token)) continue;
    pushTarget(targets, token);
  }
}

/**
 * Classify a PreToolUse payload as a parent-side source mutation. Read-only
 * tools, MCP host tools, and verification shell commands return null. Any
 * mutation whose every known target is a `.sneakoscope/` artifact is exempt:
 * plans, mission files, and receipts are the parent's own bookkeeping.
 */
export function parentMutationIntent(payload: any = {}): ParentMutationIntent | null {
  const toolName = toolNameOf(payload);
  if (!toolName || SPAWN_TOOL_RE.test(toolName)) return null;
  const input = toolInputOf(payload);
  const command = commandText(input, payload);
  // Codex's freeform apply_patch arrives as `tool_input.command` = patch text.
  // When patch headers exist they are the exact targets; tokens from the patch
  // body are not paths and must not cost a `.sneakoscope` patch its exemption.
  const patchTargets = patchHeaderTargets([command, input.patch, input.input, input.content, input.text]);
  if (FILE_EDIT_TOOL_RE.test(toolName)) {
    const targets: string[] = [];
    collectInputTargets(input, targets);
    for (const target of patchTargets) pushTarget(targets, target);
    if (!patchTargets.length && command) collectShellTargets(command, targets);
    return {
      toolName,
      kind: 'file_edit',
      targets,
      exempt: targets.length > 0 && targets.every(isSneakoscopeArtifactPath)
    };
  }
  if (SHELL_TOOL_RE.test(toolName)) {
    if (!command || !SHELL_WRITE_RE.test(command)) return null;
    const targets = patchTargets.length ? [...patchTargets] : [];
    if (!patchTargets.length) collectShellTargets(command, targets);
    return {
      toolName,
      kind: 'shell_write',
      targets,
      exempt: targets.length > 0 && targets.every(isSneakoscopeArtifactPath)
    };
  }
  return null;
}

export function parentOrchestrationLedgerPath(root: string, missionId: string): string {
  return path.join(missionDir(root, missionId), PARENT_ORCHESTRATION_GATE_FILENAME);
}

function emptyLedger(missionId: string, workflowRunId: string | null): ParentOrchestrationLedger {
  return {
    schema: PARENT_ORCHESTRATION_GATE_SCHEMA,
    mission_id: missionId,
    workflow_run_id: workflowRunId,
    spawns: 0,
    blocks: 0,
    escapes: 0,
    parent_owned_allows: 0,
    wait_blocks: 0,
    wait_escapes: 0,
    wait_fingerprint: null,
    last_action: null,
    last_tool: null,
    last_targets: [],
    last_jev_reason: null,
    updated_at: null
  };
}

export async function readParentOrchestrationLedger(
  root: string,
  missionId: string,
  workflowRunId: string | null = null
): Promise<ParentOrchestrationLedger> {
  const raw: any = await readJson(parentOrchestrationLedgerPath(root, missionId), null).catch(() => null);
  const fresh = emptyLedger(missionId, workflowRunId);
  if (!raw || raw.schema !== PARENT_ORCHESTRATION_GATE_SCHEMA || String(raw.mission_id || '') !== missionId) return fresh;
  // A new workflow run inside the same mission starts its own count: the
  // previous run's children are not this run's children.
  if (workflowRunId && raw.workflow_run_id && String(raw.workflow_run_id) !== workflowRunId) return fresh;
  return {
    ...fresh,
    workflow_run_id: workflowRunId || (typeof raw.workflow_run_id === 'string' ? raw.workflow_run_id : null),
    spawns: countOf(raw.spawns),
    blocks: countOf(raw.blocks),
    escapes: countOf(raw.escapes),
    parent_owned_allows: countOf(raw.parent_owned_allows),
    wait_blocks: countOf(raw.wait_blocks),
    wait_escapes: countOf(raw.wait_escapes),
    wait_fingerprint: typeof raw.wait_fingerprint === 'string' ? raw.wait_fingerprint : null,
    last_action: ['allow', 'block', 'escape', 'spawn', 'wait'].includes(raw.last_action) ? raw.last_action : null,
    last_tool: typeof raw.last_tool === 'string' ? raw.last_tool : null,
    last_targets: Array.isArray(raw.last_targets) ? raw.last_targets.map((row: unknown) => String(row)).slice(0, MAX_TARGETS) : [],
    last_jev_reason: typeof raw.last_jev_reason === 'string' ? raw.last_jev_reason : null,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null
  };
}

function countOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

async function writeLedger(root: string, ledger: ParentOrchestrationLedger): Promise<void> {
  const dir = missionDir(root, ledger.mission_id);
  await ensureConfinedDirectory(path.resolve(root), dir);
  await writeJsonAtomic(path.join(dir, PARENT_ORCHESTRATION_GATE_FILENAME), { ...ledger, updated_at: nowIso() });
}

/**
 * Record that a child thread exists for this mission. Each accepted parent
 * spawn_agent call counts once; SubagentStart only guarantees at least one,
 * so the gate lifts even when a host emits just one of the two signals.
 */
export async function recordParentOrchestrationSpawn(
  root: string,
  state: any = {},
  opts: { atLeastOne?: boolean } = {}
): Promise<ParentOrchestrationLedger | null> {
  const missionId = String(state?.mission_id || '').trim();
  if (!missionId || !narutoState(state)) return null;
  const workflowRunId = String(state?.official_subagent_run_id || '').trim() || null;
  const ledger = await readParentOrchestrationLedger(root, missionId, workflowRunId);
  if (opts.atLeastOne && ledger.spawns > 0) return ledger;
  const next: ParentOrchestrationLedger = { ...ledger, spawns: ledger.spawns + 1, last_action: 'spawn' };
  await writeLedger(root, next);
  return next;
}

/** Child threads of this run that started, and those still running (no SubagentStop yet). */
async function childThreadActivity(
  root: string,
  missionId: string,
  workflowRunId: string | null
): Promise<{ started: number; running: string[] }> {
  const events = await readSubagentEvents(missionDir(root, missionId)).catch(() => []);
  const started = new Set<string>();
  const running = new Set<string>();
  for (const event of events) {
    if (workflowRunId && event.run_id && event.run_id !== workflowRunId) continue;
    const thread = event.thread_id || event.agent_id;
    if (!thread) continue;
    if (event.event_name === 'SubagentStart') {
      started.add(thread);
      running.add(thread);
    } else if (event.event_name === 'SubagentStop') {
      running.delete(thread);
    }
  }
  return { started: started.size, running: [...running].sort() };
}

function missionGoal(state: any = {}): string {
  return String(state?.prompt || state?.task || state?.goal || '').trim();
}

function renderTargets(intent: ParentMutationIntent): string {
  return intent.targets.length ? intent.targets.slice(0, 6).join(', ') : 'source files';
}

function blockMessage(missionId: string, intent: ParentMutationIntent, jev: JevToolDelegationDecision | null): string {
  const jevNote = jev?.called
    ? jev.choice === 'delegate_child'
      ? ' Jev classified this edit as slice work for a child.'
      : ` Jev did not classify this edit as parent-owned (${jev.reason}).`
    : '';
  return [
    `SKS parent orchestration gate denied ${intent.toolName} on ${renderTargets(intent)}: mission ${missionId} has no child thread yet.`,
    'The Naruto parent orchestrates only. Decompose the task into disjoint slices and spawn each child with spawn_agent first',
    '(sealed model and reasoning_effort; Jev seals them when Jev mode is on; fork_turns="none"; the complete slice contract in message),',
    'wait for the children, then integrate and verify.',
    'Until the first child starts, the parent may write only .sneakoscope artifacts.' + jevNote
  ].join(' ');
}

function escapeMessage(missionId: string, intent: ParentMutationIntent, ledger: ParentOrchestrationLedger): string {
  return [
    `SKS parent orchestration gate released ${intent.toolName} on ${renderTargets(intent)} after ${ledger.blocks} denied attempts without a child spawn.`,
    `This release is recorded as an escape in .sneakoscope/missions/${missionId}/${PARENT_ORCHESTRATION_GATE_FILENAME}.`,
    'Spawn children for the remaining slices before the next source edit.'
  ].join(' ');
}

function waitMessage(missionId: string, intent: ParentMutationIntent, running: readonly string[]): string {
  return [
    `SKS parent orchestration gate denied ${intent.toolName} on ${renderTargets(intent)}: ${running.length} child thread(s) of mission ${missionId} are still running.`,
    'The Naruto parent does not implement slice work beside its children.',
    'Wait for the running children, collect their results, then integrate and verify.',
    'If more work remains, spawn another child for it instead of editing it in the parent.'
  ].join(' ');
}

function waitEscapeMessage(missionId: string, intent: ParentMutationIntent, ledger: ParentOrchestrationLedger): string {
  return [
    `SKS parent orchestration gate released ${intent.toolName} on ${renderTargets(intent)} after ${ledger.wait_blocks} denied attempts while children were still recorded as running.`,
    `The release is recorded in .sneakoscope/missions/${missionId}/${PARENT_ORCHESTRATION_GATE_FILENAME}; edit only integration work, not an assigned slice.`
  ].join(' ');
}

function runningFingerprint(running: readonly string[]): string {
  return sha256(running.join('\n')).slice(0, 16);
}

/**
 * Decide one PreToolUse call. Read-only work, child threads, non-Naruto state,
 * and `.sneakoscope/` writes never touch the ledger or Jev.
 */
export async function evaluateParentOrchestrationGate(input: {
  root: string;
  state: any;
  payload: any;
  sessionKey?: unknown;
}): Promise<ParentOrchestrationDecision> {
  const { root, state, payload } = input;
  if (!narutoRootParentHook(state, payload, input.sessionKey)) return { action: 'allow', reason: 'not_root_parent', jev: null };
  const intent = parentMutationIntent(payload);
  if (!intent) return { action: 'allow', reason: 'no_mutation_intent', jev: null };
  if (intent.exempt) return { action: 'allow', reason: 'sneakoscope_artifact', jev: null };
  const missionId = String(state.mission_id).trim();
  const workflowRunId = String(state?.official_subagent_run_id || '').trim() || null;
  const ledger = await readParentOrchestrationLedger(root, missionId, workflowRunId);
  const activity = await childThreadActivity(root, missionId, workflowRunId);
  if (ledger.spawns > 0 || activity.started > 0) {
    return evaluateWhileChildrenExist(root, missionId, intent, ledger, activity);
  }
  if (ledger.blocks >= PARENT_ORCHESTRATION_MAX_BLOCKS) {
    // Released either way, so Jev is not asked again: no network call per edit.
    const next = { ...ledger, last_tool: intent.toolName, last_targets: intent.targets, escapes: ledger.escapes + 1, last_action: 'escape' as const };
    await writeLedger(root, next).catch(() => null);
    // Warn once per phase; later released edits stay recorded but silent.
    const message = ledger.escapes === 0 ? escapeMessage(missionId, intent, next) : null;
    return { action: 'escape', reason: 'max_blocks_reached', message, jev: null };
  }
  const jev = await consultJevToolDelegation({
    root,
    missionGoal: missionGoal(state),
    toolName: intent.toolName,
    targets: intent.targets
  }).catch((): JevToolDelegationDecision => ({ called: false, choice: null, reason: 'consult_failed' }));
  const base = {
    ...ledger,
    last_tool: intent.toolName,
    last_targets: intent.targets,
    last_jev_reason: jev.called ? `${jev.reason}${jev.choice ? `:${jev.choice}` : ''}` : jev.reason
  };
  if (jev.choice === 'parent_owned') {
    await writeLedger(root, { ...base, parent_owned_allows: ledger.parent_owned_allows + 1, last_action: 'allow' }).catch(() => null);
    return { action: 'allow', reason: 'jev_parent_owned', jev };
  }
  const next = { ...base, blocks: ledger.blocks + 1, last_action: 'block' as const };
  await writeLedger(root, next).catch(() => null);
  return {
    action: 'block',
    reason: jev.choice === 'delegate_child' ? 'jev_delegate_child' : 'no_child_thread',
    message: blockMessage(missionId, intent, jev),
    jev
  };
}

/**
 * Children exist for this run. Integration edits are the parent's job, but only
 * after the children it is waiting on have stopped; an edit beside a running
 * child is slice work the parent took back. The wait counter belongs to one
 * running set, so a later wave gets its own bounded denials.
 */
async function evaluateWhileChildrenExist(
  root: string,
  missionId: string,
  intent: ParentMutationIntent,
  ledger: ParentOrchestrationLedger,
  activity: { started: number; running: string[] }
): Promise<ParentOrchestrationDecision> {
  const spawns = Math.max(ledger.spawns, activity.started);
  if (activity.running.length === 0) {
    if (spawns !== ledger.spawns) await writeLedger(root, { ...ledger, spawns, last_action: 'spawn' }).catch(() => null);
    return { action: 'allow', reason: 'children_settled', jev: null };
  }
  const fingerprint = runningFingerprint(activity.running);
  const sameSet = ledger.wait_fingerprint === fingerprint;
  const waitBlocks = sameSet ? ledger.wait_blocks : 0;
  const waitEscapes = sameSet ? ledger.wait_escapes : 0;
  const base = {
    ...ledger,
    spawns,
    wait_fingerprint: fingerprint,
    last_tool: intent.toolName,
    last_targets: intent.targets
  };
  if (waitBlocks >= PARENT_ORCHESTRATION_MAX_BLOCKS) {
    const next = { ...base, wait_blocks: waitBlocks, wait_escapes: waitEscapes + 1, last_action: 'escape' as const };
    await writeLedger(root, next).catch(() => null);
    const message = waitEscapes === 0 ? waitEscapeMessage(missionId, intent, next) : null;
    return { action: 'escape', reason: 'wait_max_blocks_reached', message, jev: null };
  }
  const next = { ...base, wait_blocks: waitBlocks + 1, wait_escapes: waitEscapes, last_action: 'wait' as const };
  await writeLedger(root, next).catch(() => null);
  return { action: 'block', reason: 'children_running', message: waitMessage(missionId, intent, activity.running), jev: null };
}
