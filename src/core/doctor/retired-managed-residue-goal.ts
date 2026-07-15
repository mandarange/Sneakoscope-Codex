import path from 'node:path';
import { readJson, readText, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { inspectConfinedPath } from '../managed-path-safety.js';
import { quarantineUserPath, type MutableCounters } from './retired-managed-residue-private.js';

const RETIRED_GOAL_BRIDGE_LINE = /^- Ralph route is removed from the user-facing SKS surface\.\r?$/m;

export async function reconcileRetiredGoalArtifactResidue(input: {
  root: string;
  missionRoot: string;
  fix: boolean;
  quarantineRoot: string;
  counters: MutableCounters;
}): Promise<void> {
  await reconcileGoalWorkflowJson(input);
  await reconcileGoalBridgeMarkdown(input);
}

async function reconcileGoalWorkflowJson(input: {
  root: string;
  missionRoot: string;
  fix: boolean;
  quarantineRoot: string;
  counters: MutableCounters;
}): Promise<void> {
  const file = path.join(input.missionRoot, 'goal-workflow.json');
  const inspected = await inspectConfinedPath(input.root, file).catch(() => null);
  if (!inspected?.exists || inspected.leafSymlink || !inspected.stat?.isFile()) return;
  const value = await readJson<Record<string, any> | null>(file, null).catch(() => null);
  const pipeline = value?.pipeline_contract;
  if (!pipeline || typeof pipeline !== 'object' || !Object.hasOwn(pipeline, 'ralph_removed')) return;
  input.counters.detected += 1;
  if (!input.fix) {
    input.counters.remaining += 1;
    if (!isManagedGoalWorkflow(value)) input.counters.preserved += 1;
    return;
  }
  try {
    if (!isManagedGoalWorkflow(value)) {
      await quarantineUserPath(input.root, file, input.quarantineRoot);
      input.counters.preserved += 1;
      return;
    }
    const nextPipeline = { ...pipeline };
    delete nextPipeline.ralph_removed;
    await writeJsonAtomic(file, { ...value, pipeline_contract: nextPipeline });
    input.counters.removed += 1;
    input.counters.rewrittenState += 1;
  } catch {
    input.counters.errors += 1;
    input.counters.remaining += 1;
  }
}

async function reconcileGoalBridgeMarkdown(input: {
  root: string;
  missionRoot: string;
  fix: boolean;
  quarantineRoot: string;
  counters: MutableCounters;
}): Promise<void> {
  const file = path.join(input.missionRoot, 'goal-bridge.md');
  const inspected = await inspectConfinedPath(input.root, file).catch(() => null);
  if (!inspected?.exists || inspected.leafSymlink || !inspected.stat?.isFile()) return;
  const source = await readText(file, '');
  if (!RETIRED_GOAL_BRIDGE_LINE.test(source)) return;
  input.counters.detected += 1;
  if (!input.fix) {
    input.counters.remaining += 1;
    if (!isManagedGoalBridge(source)) input.counters.preserved += 1;
    return;
  }
  try {
    if (!isManagedGoalBridge(source)) {
      await quarantineUserPath(input.root, file, input.quarantineRoot);
      input.counters.preserved += 1;
      return;
    }
    await writeTextAtomic(file, source.replace(RETIRED_GOAL_BRIDGE_LINE, '').replace(/\n{3,}/g, '\n\n'));
    input.counters.removed += 1;
    input.counters.rewrittenState += 1;
  } catch {
    input.counters.errors += 1;
    input.counters.remaining += 1;
  }
}

function isManagedGoalWorkflow(value: Record<string, any> | null): boolean {
  return value?.schema_version === 1
    && value?.route === 'Goal'
    && value?.native_goal?.workflow_kind === 'native /goal persistence bridge';
}

function isManagedGoalBridge(source: string): boolean {
  return source.startsWith('# SKS Goal Persistence Bridge\n')
    && source.includes('## Native Codex Goal Control')
    && source.includes('## SKS Bridge Contract');
}
