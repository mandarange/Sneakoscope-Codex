import path from 'node:path';
import { ensureDir, exists, nowIso, readJson, sha256, writeJsonAtomic, writeTextAtomic } from './fsx.js';

export const TEAM_GRAPH_ARTIFACT = 'team-graph.json';
export const TEAM_RUNTIME_TASKS_ARTIFACT = 'team-runtime-tasks.json';
export const TEAM_DECOMPOSITION_ARTIFACT = 'team-decomposition-report.json';
export const TEAM_INBOX_DIR = 'team-inbox';

const TASK_ID_PREFIX = 'task-';

export function teamRuntimeRequiredArtifacts() {
  return [TEAM_GRAPH_ARTIFACT, TEAM_RUNTIME_TASKS_ARTIFACT, TEAM_DECOMPOSITION_ARTIFACT, TEAM_INBOX_DIR];
}

export function teamRuntimePlanMetadata() {
  return {
    schema_version: 1,
    graph_artifact: TEAM_GRAPH_ARTIFACT,
    runtime_tasks_artifact: TEAM_RUNTIME_TASKS_ARTIFACT,
    decomposition_artifact: TEAM_DECOMPOSITION_ARTIFACT,
    inbox_dir: TEAM_INBOX_DIR,
    dependency_policy: 'symbolic_node_ids_are_remapped_to_concrete_task_ids_before_worker_inboxes_are_written',
    allocation_policy: 'role_path_domain_load_scoring_with_same_scope_affinity'
  };
}

export async function writeTeamRuntimeArtifacts(dir: any, plan: any, opts: any = {}) {
  const compiled = compileTeamRuntime(plan, opts);
  if (!compiled.ok) {
    const message = compiled.validation.errors.join('; ') || 'unknown Team DAG validation error';
    throw new Error(`Team DAG compile failed: ${message}`);
  }
  await writeJsonAtomic(path.join(dir, TEAM_GRAPH_ARTIFACT), compiled.graph);
  await writeJsonAtomic(path.join(dir, TEAM_RUNTIME_TASKS_ARTIFACT), compiled.runtime);
  await writeJsonAtomic(path.join(dir, TEAM_DECOMPOSITION_ARTIFACT), compiled.report);
  await writeWorkerInboxes(dir, compiled);
  return {
    ...compiled,
    gate_fields: teamRuntimeGateFields(compiled),
    artifacts: {
      graph: TEAM_GRAPH_ARTIFACT,
      runtime_tasks: TEAM_RUNTIME_TASKS_ARTIFACT,
      decomposition_report: TEAM_DECOMPOSITION_ARTIFACT,
      inbox_dir: TEAM_INBOX_DIR
    }
  };
}

export function compileTeamRuntime(plan: any, opts: any = {}) {
  const dag = normalizeTeamDag(opts.dag || plan?.team_dag || planToTeamDag(plan, opts), plan, opts);
  const validation = validateTeamDag(dag);
  if (!validation.ok) return { ok: false, validation, dag };
  const order = topologicalOrder(dag.nodes);
  const nodeIdToTaskId: Record<string, string> = {};
  const agentReasoning = teamAgentReasoningById(plan?.roster || {});
  const tasks = order.map((node: any, index: any) => {
    const taskId = `${TASK_ID_PREFIX}${String(index + 1).padStart(3, '0')}`;
    nodeIdToTaskId[node.id] = taskId;
    const reasoning = agentReasoning[node.agent || ''] || {};
    return {
      task_id: taskId,
      symbolic_id: node.id,
      subject: node.subject,
      description: node.description,
      role: node.role || 'worker',
      phase: node.phase || null,
      agent_hint: node.agent || null,
      file_paths: node.file_paths || [],
      domains: node.domains || [],
      lane: node.lane || null,
      reasoning_effort: reasoning.reasoning_effort || null,
      reasoning_profile: reasoning.reasoning_profile || null,
      service_tier: reasoning.service_tier || 'fast',
      reasoning_reason: reasoning.reasoning_reason || null,
      depends_on: [],
      blocked_by: [],
      status: 'pending'
    };
  });
  const bySymbolic = new Map(order.map((node: any) => [node.id, node]));
  for (const task of tasks) {
    const node = bySymbolic.get(task.symbolic_id);
    task.depends_on = (node.depends_on || []).map((id: any) => nodeIdToTaskId[id]).filter(Boolean);
    task.blocked_by = [...task.depends_on];
  }
  const allocation = allocateTasks(tasks, plan);
  const runtimeTasks = tasks.map((task: any) => ({
    ...task,
    worker: allocation.by_task_id[task.task_id]?.worker || 'parent_orchestrator',
    allocation_reason: allocation.by_task_id[task.task_id]?.reason || 'default_parent_orchestrator'
  }));
  const runtime = {
    schema_version: 1,
    compiled_at: nowIso(),
    mission_id: plan?.mission_id || opts.missionId || null,
    node_id_to_task_id: nodeIdToTaskId,
    tasks: runtimeTasks,
    dependency_policy: 'all_runtime_dependencies_are_concrete_task_ids'
  };
  const report = {
    schema_version: 1,
    compiled_at: runtime.compiled_at,
    mission_id: runtime.mission_id,
    source: dag.source,
    validation,
    task_count: runtimeTasks.length,
    ready_lane_count: runtimeTasks.filter((task: any) => task.depends_on.length === 0).length,
    useful_lane_count: allocation.useful_lane_count,
    verification_lane_reserved: allocation.verification_lane_reserved,
    worker_allocations: allocation.workers,
    write_scope_conflicts: allocation.write_scope_conflicts,
    inboxes: Object.keys(groupTasksByWorker(runtimeTasks)).sort(),
    node_id_to_task_id: nodeIdToTaskId
  };
  const graph = {
    ...dag,
    validation,
    node_id_to_task_id: nodeIdToTaskId,
    runtime_task_ids: runtimeTasks.map((task: any) => task.task_id)
  };
  return { ok: true, graph, runtime, report, validation, inboxes: groupTasksByWorker(runtimeTasks) };
}

function teamAgentReasoningById(roster: any = {}) {
  const out: Record<string, any> = {};
  const groups = ['analysis_team', 'debate_team', 'development_team', 'validation_team', 'all_agents'];
  for (const group of groups) {
    for (const agent of Array.isArray(roster[group]) ? roster[group] : []) {
      if (!agent?.id || out[agent.id]) continue;
      out[agent.id] = {
        reasoning_effort: agent.reasoning_effort || agent.model_reasoning_effort || null,
        reasoning_profile: agent.reasoning_profile || null,
        service_tier: agent.service_tier || 'fast',
        reasoning_reason: agent.reasoning_reason || null
      };
    }
  }
  return out;
}

export async function validateTeamRuntimeArtifacts(dir: any) {
  const issues: any[] = [];
  const graph = await readJson(path.join(dir, TEAM_GRAPH_ARTIFACT), null);
  const runtime = await readJson(path.join(dir, TEAM_RUNTIME_TASKS_ARTIFACT), null);
  const report = await readJson(path.join(dir, TEAM_DECOMPOSITION_ARTIFACT), null);
  if (!graph) issues.push(TEAM_GRAPH_ARTIFACT);
  if (!runtime) issues.push(TEAM_RUNTIME_TASKS_ARTIFACT);
  if (!report) issues.push(TEAM_DECOMPOSITION_ARTIFACT);
  if (!await exists(path.join(dir, TEAM_INBOX_DIR))) issues.push(TEAM_INBOX_DIR);
  if (!runtime?.tasks?.length) issues.push(`${TEAM_RUNTIME_TASKS_ARTIFACT}:tasks`);
  for (const worker of Array.isArray(report?.inboxes) ? report.inboxes : []) {
    if (!await exists(path.join(dir, TEAM_INBOX_DIR, `${safeName(worker)}.md`))) issues.push(`${TEAM_INBOX_DIR}:${worker}`);
  }
  const ids = new Set((runtime?.tasks || []).map((task: any) => task.task_id));
  for (const task of runtime?.tasks || []) {
    if (!String(task.task_id || '').startsWith(TASK_ID_PREFIX)) issues.push(`${task.task_id || 'task'}:task_id`);
    for (const dep of [...(task.depends_on || []), ...(task.blocked_by || [])]) {
      if (!ids.has(dep)) issues.push(`${task.task_id}:dependency:${dep}`);
      if (!String(dep).startsWith(TASK_ID_PREFIX)) issues.push(`${task.task_id}:symbolic_dependency:${dep}`);
    }
    if (!task.worker) issues.push(`${task.task_id}:worker`);
  }
  if (Array.isArray(report?.write_scope_conflicts) && report.write_scope_conflicts.length > 0) issues.push(`${TEAM_DECOMPOSITION_ARTIFACT}:write_scope_conflicts`);
  if (!report?.node_id_to_task_id || Object.keys(report.node_id_to_task_id).length !== (runtime?.tasks || []).length) issues.push(`${TEAM_DECOMPOSITION_ARTIFACT}:node_id_to_task_id`);
  return { ok: issues.length === 0, issues, graph, runtime, report };
}

export function teamRuntimeGateFields(compiledOrValidation: any) {
  const report = compiledOrValidation?.report || compiledOrValidation;
  const ok = Boolean(compiledOrValidation?.ok ?? report?.validation?.ok);
  const noConflicts = Array.isArray(report?.write_scope_conflicts) ? report.write_scope_conflicts.length === 0 : ok;
  return {
    team_graph_required: true,
    team_graph_compiled: ok,
    runtime_dependencies_concrete: ok,
    worker_inboxes_written: ok,
    write_scope_conflicts_zero: noConflicts,
    task_claim_readiness_checked: ok && noConflicts
  };
}

function planToTeamDag(plan: any = {}, opts: any = {}) {
  const nodes: any[] = [];
  let previousIds: any[] = [];
  for (const phase of plan.phases || []) {
    const agents = Array.isArray(phase.agents) && phase.agents.length ? phase.agents.map(String) : ['parent_orchestrator'];
    const parallel = agents.length > 1 && (/parallel|debate|review/i.test(String(phase.id || '')) || phase.max_parallel_subagents);
    const created = parallel
      ? agents.map((agent: any) => phaseNode(phase, { agent, suffix: agent, dependsOn: previousIds }))
      : [phaseNode(phase, { agent: agents[0], dependsOn: previousIds })];
    nodes.push(...created);
    previousIds = created.map((node: any) => node.id);
  }
  return {
    schema_version: 1,
    source: 'team_plan_phases',
    mission_id: plan.mission_id || opts.missionId || null,
    prompt_hash: shortHash(plan.prompt || plan.task || opts.prompt || ''),
    contract_hash: opts.contractHash || plan.contract_hash || null,
    nodes
  };
}

function phaseNode(phase: any = {}, opts: any = {}) {
  const idBase = String(phase.id || 'team_task').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'team_task';
  const agentSuffix = opts.suffix ? `_${String(opts.suffix).replace(/[^A-Za-z0-9_-]+/g, '_')}` : '';
  const id = `${idBase}${agentSuffix}`;
  const description = String(phase.goal || phase.description || phase.subject || idBase);
  const hints = extractTaskHints(description, phase);
  return {
    id,
    subject: String(phase.subject || humanizeId(idBase)),
    description,
    depends_on: opts.dependsOn || [],
    role: inferRole(phase, opts.agent),
    agent: opts.agent || null,
    phase: String(phase.id || idBase),
    lane: inferLane(phase, opts.agent),
    file_paths: hints.file_paths,
    domains: hints.domains,
    write_policy: phase.write_policy || null
  };
}

function normalizeTeamDag(dag: any = {}, plan: any = {}, opts: any = {}) {
  return {
    schema_version: dag.schema_version || 1,
    source: dag.source || 'explicit_team_dag',
    mission_id: dag.mission_id || plan?.mission_id || opts.missionId || null,
    prompt_hash: dag.prompt_hash || shortHash(plan?.prompt || plan?.task || opts.prompt || ''),
    contract_hash: dag.contract_hash || opts.contractHash || plan?.contract_hash || null,
    nodes: (dag.nodes || []).map((node: any) => ({
      id: String(node.id || '').trim(),
      subject: String(node.subject || node.id || '').trim(),
      description: String(node.description || node.goal || node.subject || '').trim(),
      depends_on: Array.isArray(node.depends_on) ? node.depends_on.map(String) : [],
      role: node.role ? String(node.role) : undefined,
      agent: node.agent ? String(node.agent) : undefined,
      phase: node.phase ? String(node.phase) : undefined,
      lane: node.lane ? String(node.lane) : undefined,
      file_paths: Array.isArray(node.file_paths) ? [...new Set(node.file_paths.map(String).filter(Boolean))] : [],
      domains: Array.isArray(node.domains) ? [...new Set(node.domains.map(String).filter(Boolean))] : [],
      write_policy: node.write_policy ? String(node.write_policy) : undefined
    }))
  };
}

function validateTeamDag(dag: any) {
  const errors: any[] = [];
  const ids = new Set();
  for (const node of dag.nodes || []) {
    if (!node.id || !/^[A-Za-z0-9_-]+$/.test(node.id)) errors.push(`invalid_node_id:${node.id || 'missing'}`);
    if (ids.has(node.id)) errors.push(`duplicate_node_id:${node.id}`);
    ids.add(node.id);
    if (!node.subject) errors.push(`missing_subject:${node.id || 'unknown'}`);
    if (!node.description) errors.push(`missing_description:${node.id || 'unknown'}`);
  }
  for (const node of dag.nodes || []) {
    for (const dep of node.depends_on || []) {
      if (!ids.has(dep)) errors.push(`unknown_dependency:${node.id}->${dep}`);
      if (dep === node.id) errors.push(`self_dependency:${node.id}`);
    }
  }
  const cycle = findCycle(dag.nodes || []);
  if (cycle.length) errors.push(`cycle:${cycle.join('->')}`);
  return { ok: errors.length === 0, errors, checked_nodes: (dag.nodes || []).length };
}

function topologicalOrder(nodes: any = []) {
  const byId = new Map(nodes.map((node: any) => [node.id, node]));
  const seen = new Set();
  const out: any[] = [];
  const visit = (node: any): void => {
    if (!node || seen.has(node.id)) return;
    for (const dep of node.depends_on || []) visit(byId.get(dep));
    seen.add(node.id);
    out.push(node);
  };
  for (const node of nodes) visit(node);
  return out;
}

function findCycle(nodes: any = []) {
  const byId = new Map(nodes.map((node: any) => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();
  const stack: any[] = [];
  const visit = (node: any): any[] => {
    if (!node) return [];
    if (visiting.has(node.id)) return stack.slice(stack.indexOf(node.id)).concat(node.id);
    if (visited.has(node.id)) return [];
    visiting.add(node.id);
    stack.push(node.id);
    for (const dep of node.depends_on || []) {
      const cycle = visit(byId.get(dep));
      if (cycle.length) return cycle;
    }
    stack.pop();
    visiting.delete(node.id);
    visited.add(node.id);
    return [];
  };
  for (const node of nodes) {
    const cycle = visit(node);
    if (cycle.length) return cycle;
  }
  return [];
}

function allocateTasks(tasks: any = [], plan: any = {}) {
  const roster = plan.roster || {};
  const workerIds = [
    'parent_orchestrator',
    ...(roster.analysis_team || []).map((agent: any) => agent.id),
    ...(roster.debate_team || []).map((agent: any) => agent.id),
    ...(roster.development_team || []).map((agent: any) => agent.id),
    ...(roster.validation_team || []).map((agent: any) => agent.id)
  ];
  const workers: Record<string, any> = Object.fromEntries([...new Set(workerIds)].map((id: any) => [id, { worker: id, load: 0, file_paths: [], domains: [], tasks: [] }]));
  const byTask: Record<string, any> = {};
  for (const task of tasks) {
    const worker = workers[task.agent_hint] ? task.agent_hint : chooseWorker(task, workers);
    const state = workers[worker] || workers.parent_orchestrator;
    const reason = task.agent_hint && workers[task.agent_hint] ? 'phase_agent_hint' : allocationReason(task, state);
    state.load += 1;
    state.tasks.push(task.task_id);
    state.file_paths = [...new Set([...state.file_paths, ...(task.file_paths || [])])];
    state.domains = [...new Set([...state.domains, ...(task.domains || [])])];
    byTask[task.task_id] = { worker: state.worker, reason };
  }
  const writeScopeConflicts = detectWriteScopeConflicts(tasks, byTask);
  const usedWorkers = Object.values(workers).filter((worker: any) => worker.tasks.length > 0);
  return {
    by_task_id: byTask,
    workers: usedWorkers,
    useful_lane_count: usedWorkers.filter((worker: any) => worker.worker !== 'parent_orchestrator').length,
    verification_lane_reserved: tasks.some((task: any) => task.role === 'executor') && usedWorkers.some((worker: any) => /^reviewer_/.test(worker.worker)),
    write_scope_conflicts: writeScopeConflicts
  };
}

function chooseWorker(task: any, workers: any) {
  const candidates = Object.values(workers).filter((worker: any) => {
    if (task.role === 'executor') return /^executor_/.test(worker.worker);
    if (task.role === 'scout') return /^analysis_scout_/.test(worker.worker);
    if (task.role === 'reviewer') return /^reviewer_/.test(worker.worker) || /^user_/.test(worker.worker);
    if (task.role === 'planner') return /debate_|team_consensus|parent_orchestrator/.test(worker.worker);
    return true;
  });
  const scored = (candidates.length ? candidates : Object.values(workers)).map((worker: any) => {
    const pathOverlap = overlapCount(task.file_paths || [], worker.file_paths || []);
    const domainOverlap = overlapCount(task.domains || [], worker.domains || []);
    const roleScore = roleMatchesWorker(task.role, worker.worker) ? 4 : 0;
    return { worker, score: roleScore + pathOverlap * 3 + domainOverlap * 2 - worker.load };
  }).sort((a: any, b: any) => b.score - a.score || a.worker.worker.localeCompare(b.worker.worker));
  return scored[0]?.worker.worker || 'parent_orchestrator';
}

function allocationReason(task: any, worker: any) {
  const pathOverlap = overlapCount(task.file_paths || [], worker.file_paths || []);
  const domainOverlap = overlapCount(task.domains || [], worker.domains || []);
  if (pathOverlap || domainOverlap) return `scope_affinity:path_overlap=${pathOverlap},domain_overlap=${domainOverlap}`;
  if (roleMatchesWorker(task.role, worker.worker)) return `role_match:${task.role}`;
  return 'lowest_load_default';
}

function detectWriteScopeConflicts(tasks: any, byTask: any) {
  const conflicts: any[] = [];
  const writable = tasks.filter((task: any) => task.role === 'executor' && task.file_paths?.length);
  for (let i = 0; i < writable.length; i++) {
    for (let j = i + 1; j < writable.length; j++) {
      const a = writable[i];
      const b = writable[j];
      const overlap = a.file_paths.filter((file: any) => b.file_paths.includes(file));
      if (overlap.length && byTask[a.task_id]?.worker !== byTask[b.task_id]?.worker) {
        conflicts.push({ tasks: [a.task_id, b.task_id], file_paths: overlap, workers: [byTask[a.task_id]?.worker, byTask[b.task_id]?.worker] });
      }
    }
  }
  return conflicts;
}

async function writeWorkerInboxes(dir: any, compiled: any) {
  const inboxRoot = path.join(dir, TEAM_INBOX_DIR);
  await ensureDir(inboxRoot);
  for (const [worker, tasks] of Object.entries(compiled.inboxes || {})) {
    await writeTextAtomic(path.join(inboxRoot, `${safeName(worker)}.md`), inboxMarkdown(worker, tasks, compiled));
  }
}

function inboxMarkdown(worker: any, tasks: any, compiled: any) {
  const lines = [
    `# Team Inbox: ${worker}`,
    '',
    `Mission: ${compiled.runtime.mission_id || 'unknown'}`,
    '',
    'Use concrete task ids for readiness and handoff. Dependencies below are runtime task ids, not plan-only symbolic ids.',
    'Before task work, read `.sneakoscope/wiki/context-pack.json`: use `attention.use_first` for compact high-trust context and hydrate `attention.hydrate_first` from source before risky or lower-trust decisions.',
    'Do not create fallback implementation code, substitute behavior, mock behavior, or compatibility shims unless the user or sealed decision contract explicitly requested them.',
    ''
  ];
  for (const task of tasks) {
    lines.push(`## ${task.task_id} ${task.subject}`);
    lines.push('');
    lines.push(`- Symbolic id: ${task.symbolic_id}`);
    lines.push(`- Role: ${task.role}`);
    lines.push(`- Phase: ${task.phase || 'n/a'}`);
    lines.push(`- Depends on: ${(task.depends_on || []).join(', ') || 'none'}`);
    lines.push(`- Blocked by: ${(task.blocked_by || []).join(', ') || 'none'}`);
    lines.push(`- File paths: ${(task.file_paths || []).join(', ') || 'none declared'}`);
    lines.push(`- Domains: ${(task.domains || []).join(', ') || 'general'}`);
    lines.push(`- Allocation reason: ${task.allocation_reason}`);
    lines.push('');
    lines.push(task.description);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function groupTasksByWorker(tasks: any = []) {
  const grouped: Record<string, any[]> = {};
  for (const task of tasks) {
    const worker = task.worker || 'parent_orchestrator';
    grouped[worker] ||= [];
    grouped[worker].push(task);
  }
  return grouped;
}

function inferRole(phase: any = {}, agent: any = '') {
  const text = `${phase.id || ''} ${phase.write_policy || ''} ${agent || ''}`.toLowerCase();
  if (text.includes('workspace-write') || /^executor_/.test(agent)) return 'executor';
  if (/analysis_scout|scout/.test(text)) return 'scout';
  if (/reviewer|review|qa|user_/.test(text)) return 'reviewer';
  if (/debate|planner|consensus/.test(text)) return 'planner';
  return 'orchestrator';
}

function inferLane(phase: any = {}, agent: any = '') {
  if (/executor_/.test(agent)) return 'implementation';
  if (/analysis_scout/.test(agent)) return 'analysis';
  if (/reviewer_|user_/.test(agent)) return 'verification';
  if (/debate_/.test(agent)) return 'debate';
  return String(phase.id || 'orchestration');
}

function extractTaskHints(description: any, phase: any = {}) {
  const hay = `${description || ''} ${phase.output ? JSON.stringify(phase.output) : ''}`;
  const filePaths = new Set();
  const re = /(?:^|[\s`"'(])((?:src|bin|scripts|docs|test|tests|\.agents|\.codex|\.sneakoscope|README\.md|CHANGELOG\.md|package\.json|package-lock\.json)[A-Za-z0-9_./-]*)/g;
  let match;
  while ((match = re.exec(hay))) if (match[1]) filePaths.add(match[1].replace(/[),.;:]+$/, ''));
  const domains = new Set();
  const domainRules: Array<[string, RegExp]> = [
    ['triwiki', /triwiki|wiki|context-pack/i],
    ['team', /team|worker|executor|scout|debate|inbox|roster/i],
    ['qa', /qa|test|verify|review/i],
    ['codex-app', /codex|skill|agent/i],
    ['release', /version|changelog|publish|package|npm|size/i],
    ['docs', /readme|docs|documentation/i]
  ];
  for (const [domain, rule] of domainRules) if (rule.test(hay)) domains.add(domain);
  return { file_paths: [...filePaths].sort(), domains: [...domains].sort() };
}

function roleMatchesWorker(role: any, worker: any) {
  if (role === 'executor') return /^executor_/.test(worker);
  if (role === 'scout') return /^analysis_scout_/.test(worker);
  if (role === 'reviewer') return /^reviewer_|^user_/.test(worker);
  if (role === 'planner') return /^debate_|team_consensus|parent_orchestrator/.test(worker);
  return worker === 'parent_orchestrator';
}

function overlapCount(a: any = [], b: any = []) {
  const set = new Set(b);
  return a.filter((item: any) => set.has(item)).length;
}

function shortHash(input: any) {
  return sha256(String(input || '')).slice(0, 16);
}

function humanizeId(id: any) {
  return String(id || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch: any) => ch.toUpperCase());
}

function safeName(name: any) {
  return String(name || 'worker').replace(/[^A-Za-z0-9_.-]+/g, '_');
}
