import path from 'node:path';
import { exists, readJson } from './fsx.js';

export const TEAM_GRAPH_ARTIFACT = 'team-graph.json';
export const TEAM_RUNTIME_TASKS_ARTIFACT = 'team-runtime-tasks.json';
export const TEAM_DECOMPOSITION_ARTIFACT = 'team-decomposition-report.json';
export const TEAM_INBOX_DIR = 'team-inbox';

export function teamRuntimeRequiredArtifacts() {
  return [TEAM_GRAPH_ARTIFACT, TEAM_RUNTIME_TASKS_ARTIFACT, TEAM_DECOMPOSITION_ARTIFACT, TEAM_INBOX_DIR];
}

export function teamRuntimePlanMetadata() {
  return {
    schema_version: 1,
    legacy_observe_only: true,
    graph_artifact: TEAM_GRAPH_ARTIFACT,
    runtime_tasks_artifact: TEAM_RUNTIME_TASKS_ARTIFACT,
    decomposition_artifact: TEAM_DECOMPOSITION_ARTIFACT,
    inbox_dir: TEAM_INBOX_DIR
  };
}

export async function validateTeamRuntimeArtifacts(dir: any) {
  const issues: any[] = [];
  const graph = await readJson(path.join(dir, TEAM_GRAPH_ARTIFACT), null);
  const runtime = await readJson(path.join(dir, TEAM_RUNTIME_TASKS_ARTIFACT), null);
  const report = await readJson(path.join(dir, TEAM_DECOMPOSITION_ARTIFACT), null);
  const inboxRoot = path.join(dir, TEAM_INBOX_DIR);
  if (!graph) issues.push(TEAM_GRAPH_ARTIFACT);
  if (!runtime) issues.push(TEAM_RUNTIME_TASKS_ARTIFACT);
  if (!report) issues.push(TEAM_DECOMPOSITION_ARTIFACT);
  if (!(await exists(inboxRoot))) issues.push(TEAM_INBOX_DIR);
  if (!runtime?.tasks?.length) issues.push(`${TEAM_RUNTIME_TASKS_ARTIFACT}:tasks`);

  const ids = new Set((runtime?.tasks || []).map((task: any) => task.task_id));
  for (const task of runtime?.tasks || []) {
    if (!String(task.task_id || '').startsWith('task-')) issues.push(`${task.task_id || 'task'}:task_id`);
    for (const dep of [...(task.depends_on || []), ...(task.blocked_by || [])]) {
      if (!ids.has(dep)) issues.push(`${task.task_id}:dependency:${dep}`);
      if (!String(dep).startsWith('task-')) issues.push(`${task.task_id}:symbolic_dependency:${dep}`);
    }
    if (!task.worker) issues.push(`${task.task_id}:worker`);
  }

  for (const worker of Array.isArray(report?.inboxes) ? report.inboxes : []) {
    const name = String(worker || 'worker').replace(/[^A-Za-z0-9_.-]+/g, '_');
    if (!(await exists(path.join(inboxRoot, `${name}.md`)))) issues.push(`${TEAM_INBOX_DIR}:${worker}`);
  }
  if (Array.isArray(report?.write_scope_conflicts) && report.write_scope_conflicts.length > 0) issues.push(`${TEAM_DECOMPOSITION_ARTIFACT}:write_scope_conflicts`);
  return { ok: issues.length === 0, issues, graph, runtime, report };
}
