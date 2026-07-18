import { buildNativeGoalRequest, type NativeGoalAction } from '../goal-workflow.js';
import { flag, promptOf } from './command-utils.js';

const ACTIONS = new Set<NativeGoalAction>(['create', 'edit', 'pause', 'resume', 'clear', 'status']);

export async function goalCommand(sub: any, args: any = []) {
  if (sub === 'help' || sub === '--help' || sub === '-h') return printHelp();
  if (flag(args, '--legacy-goal-runtime') || process.env.SKS_LEGACY_GOAL_RUNTIME === '1') {
    throw new Error('The SKS Goal runtime was removed. Use Codex native /goal only.');
  }
  const action = ACTIONS.has(sub) ? sub as NativeGoalAction : 'create';
  const actionArgs = action === 'create' && sub && !ACTIONS.has(sub) ? [sub, ...args] : args;
  const prompt = action === 'create' || action === 'edit' ? promptOf(actionArgs) : '';
  const request = buildNativeGoalRequest(action, prompt);
  if (flag(args, '--json')) {
    console.log(JSON.stringify(request, null, 2));
    return;
  }
  console.log([
    'Codex native Goal only; SKS did not create or modify goal state.',
    'Run this in Codex:',
    '',
    request.slash_command
  ].join('\n'));
}

function printHelp() {
  console.log(`SKS Goal compatibility helper (stateless)

Codex native /goal is the only goal owner. This command writes no SKS mission,
artifact, loop, fallback state, or current-route state.

Usage:
  sks goal create "task"
  sks goal edit "revised task"
  sks goal pause
  sks goal resume
  sks goal clear
  sks goal status

The create/edit helper expands the task into Outcome, Scope, Constraints,
Verification, Done when, Stop conditions, and Non-goals before printing the
native Codex command. Prefer using /goal directly in Codex.
`);
}
