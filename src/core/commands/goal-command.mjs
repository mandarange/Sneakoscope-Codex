import path from 'node:path';
import { exists, readJson, sksRoot } from '../fsx.mjs';
import { initProject } from '../init.mjs';
import { createMission, loadMission, setCurrent, stateFile } from '../mission.mjs';
import { GOAL_BRIDGE_ARTIFACT, GOAL_WORKFLOW_ARTIFACT, updateGoalWorkflow, writeGoalWorkflow } from '../goal-workflow.mjs';
import { flag, promptOf, resolveMissionId } from './command-utils.mjs';

export async function goalCommand(sub, args = []) {
  const known = new Set(['create', 'pause', 'resume', 'clear', 'status', 'help', '--help', '-h']);
  const action = known.has(sub) ? sub : 'create';
  const actionArgs = action === 'create' && sub && !known.has(sub) ? [sub, ...args] : args;
  if (action === 'create') return goalCreate(actionArgs);
  if (action === 'pause' || action === 'resume' || action === 'clear') return goalControl(action, actionArgs);
  if (action === 'status') return goalStatus(actionArgs);
  console.log(`SKS Goal

Usage:
  sks goal create "task"
  sks goal pause <mission-id|latest>
  sks goal resume <mission-id|latest>
  sks goal clear <mission-id|latest>
  sks goal status <mission-id|latest>
`);
}

async function goalCreate(args) {
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const prompt = promptOf(args);
  if (!prompt) throw new Error('Missing goal task prompt.');
  const { id, dir, mission } = await createMission(root, { mode: 'goal', prompt });
  const workflow = await writeGoalWorkflow(dir, mission, { action: 'create', prompt });
  await setCurrent(root, { mission_id: id, mode: 'GOAL', route: 'Goal', route_command: '$Goal', phase: 'GOAL_READY', questions_allowed: true, implementation_allowed: true, native_goal: workflow.native_goal, stop_gate: 'none' }, { replace: true });
  if (flag(args, '--json')) return console.log(JSON.stringify({ schema: 'sks.goal-create.v1', ok: true, mission_id: id, workflow }, null, 2));
  console.log(`Goal mission created: ${id}`);
  console.log(`Artifact: ${path.relative(root, path.join(dir, GOAL_WORKFLOW_ARTIFACT))}`);
  console.log(`Bridge: ${path.relative(root, path.join(dir, GOAL_BRIDGE_ARTIFACT))}`);
  console.log(`Native Codex control: ${workflow.native_goal.slash_command}`);
}

async function goalControl(action, args) {
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error(`Usage: sks goal ${action} <mission-id|latest>`);
  const { dir } = await loadMission(root, id);
  const workflow = await updateGoalWorkflow(dir, action);
  await setCurrent(root, { mission_id: id, mode: 'GOAL', route: 'Goal', route_command: '$Goal', phase: `GOAL_${String(action).toUpperCase()}`, native_goal: workflow.native_goal, questions_allowed: true, implementation_allowed: action !== 'pause' && action !== 'clear', stop_gate: 'none' }, { replace: true });
  console.log(`Goal ${action}: ${id}`);
  console.log(`Native Codex control: ${workflow.native_goal.slash_command}`);
}

async function goalStatus(args) {
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error('Usage: sks goal status <mission-id|latest>');
  const { dir, mission } = await loadMission(root, id);
  const state = await readJson(stateFile(root), {});
  const workflow = await readJson(path.join(dir, GOAL_WORKFLOW_ARTIFACT), null);
  console.log(JSON.stringify({ mission, state, goal_workflow: workflow }, null, 2));
}
