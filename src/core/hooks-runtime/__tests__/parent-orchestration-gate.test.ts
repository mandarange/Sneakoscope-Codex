import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultDecisionConfig } from '../../decisions/config.js';
import { setDecisionTestOverrides } from '../../decisions/integration.js';
import { readJson } from '../../fsx.js';
import {
  PARENT_ORCHESTRATION_MAX_BLOCKS,
  childThreadHookPayload,
  evaluateParentOrchestrationGate,
  narutoRootParentHook,
  parentMutationIntent,
  parentOrchestrationLedgerPath,
  readParentOrchestrationLedger,
  recordParentOrchestrationSpawn
} from '../parent-orchestration-gate.js';

process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';

// Codex 0.147+ PreToolUse payloads: no thread id; a child thread keeps the
// parent's session_id and adds agent_id / agent_type.
const SESSION = '019fd710-d952-7000-8000-000000000001';
const MISSION = 'M-parent-orchestration';
const RUN = 'run-0001';

function narutoState(overrides: Record<string, unknown> = {}) {
  return {
    mission_id: MISSION,
    official_subagent_run_id: RUN,
    session_scope: SESSION,
    mode: 'NARUTO',
    route: 'Naruto',
    route_command: '$Naruto',
    subagents_required: true,
    prompt: 'Implement the login parser fix across the auth package.',
    ...overrides
  };
}

function patchText(...files: string[]) {
  return [
    '*** Begin Patch',
    ...files.flatMap((file) => [`*** Update File: ${file}`, '@@', '-const a = config.value;', '+const a = config.nextValue;']),
    '*** End Patch'
  ].join('\n');
}

function applyPatch(files: string[], extra: Record<string, unknown> = {}) {
  return {
    session_id: SESSION,
    turn_id: 'turn-parent-1',
    hook_event_name: 'PreToolUse',
    tool_name: 'apply_patch',
    tool_use_id: 'call-1',
    tool_input: { command: patchText(...files) },
    ...extra
  };
}

function childPayload(files: string[]) {
  return applyPatch(files, { agent_id: '019fd711-aaaa-7000-8000-000000000002', agent_type: 'worker', turn_id: 'turn-child-1' });
}

async function withRoot(run: (root: string) => Promise<void>) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-parent-orchestration-'));
  await fsp.mkdir(path.join(root, '.sneakoscope', 'missions', MISSION), { recursive: true });
  try {
    await run(root);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function writeEvents(root: string, rows: Array<{ event: 'SubagentStart' | 'SubagentStop'; agent: string; run?: string }>) {
  const file = path.join(root, '.sneakoscope', 'missions', MISSION, 'subagent-events.jsonl');
  const lines = rows.map((row, index) => JSON.stringify({
    schema: 'sks.subagent-event.v1',
    event_name: row.event,
    thread_id: row.agent,
    thread_id_source: 'agent_id',
    agent_id: row.agent,
    session_id: SESSION,
    run_id: row.run ?? RUN,
    outcome: row.event === 'SubagentStart' ? 'started' : 'stopped',
    occurred_at: new Date(Date.UTC(2026, 8, 25, 0, 0, index)).toISOString()
  }));
  await fsp.writeFile(file, `${lines.join('\n')}\n`);
}

test('parentMutationIntent reads Codex apply_patch command text, Bash writes, and exemptions', () => {
  const patch = parentMutationIntent(applyPatch(['src/auth/parser.ts', 'src/auth/index.ts']));
  assert.equal(patch?.kind, 'file_edit');
  assert.deepEqual(patch?.targets, ['src/auth/parser.ts', 'src/auth/index.ts']);
  assert.equal(patch?.exempt, false);

  // Dotted words in the patch body (config.value) are not targets.
  const bookkeeping = parentMutationIntent(applyPatch(['.sneakoscope/missions/M-1/plan.md']));
  assert.deepEqual(bookkeeping?.targets, ['.sneakoscope/missions/M-1/plan.md']);
  assert.equal(bookkeeping?.exempt, true);

  const mixed = parentMutationIntent(applyPatch(['.sneakoscope/plan.md', 'src/app.ts']));
  assert.equal(mixed?.exempt, false);

  const bashWrite = parentMutationIntent({ tool_name: 'Bash', tool_input: { command: "sed -i '' 's/a/b/' src/auth/parser.ts" } });
  assert.equal(bashWrite?.kind, 'shell_write');
  assert.ok(bashWrite?.targets.includes('src/auth/parser.ts'));

  const heredocPatch = parentMutationIntent({ tool_name: 'Bash', tool_input: { command: `apply_patch <<'EOF'\n${patchText('src/x.ts')}\nEOF` } });
  assert.deepEqual(heredocPatch?.targets, ['src/x.ts']);

  assert.equal(parentMutationIntent({ tool_name: 'exec_command', tool_input: { cmd: 'npm test 2>&1 | tail -20' } }), null);
  assert.equal(parentMutationIntent({ tool_name: 'Bash', tool_input: { command: 'git status && git diff --stat' } }), null);
  assert.equal(parentMutationIntent({ tool_name: 'Read', tool_input: { path: 'src/auth/parser.ts' } }), null);
  assert.equal(parentMutationIntent({ tool_name: 'mcp__acas-tools__spreadsheet_create', tool_input: { path: 'reports/x.xlsx' } }), null);
  assert.equal(parentMutationIntent({ tool_name: 'spawn_agent', tool_input: { message: 'slice' } }), null);
});

test('only the root parent thread of an open Naruto mission is gated', () => {
  assert.equal(childThreadHookPayload(applyPatch(['a.ts'])), false);
  assert.equal(childThreadHookPayload(childPayload(['a.ts'])), true);
  assert.equal(narutoRootParentHook(narutoState(), applyPatch(['a.ts']), SESSION), true);
  // Same session_id as the parent: only agent_id marks the child.
  assert.equal(narutoRootParentHook(narutoState(), childPayload(['a.ts']), SESSION), false);
  assert.equal(narutoRootParentHook(narutoState(), applyPatch(['a.ts']), 'other-session'), false);
  assert.equal(narutoRootParentHook(narutoState({ route_closed: true }), applyPatch(['a.ts']), SESSION), false);
  assert.equal(narutoRootParentHook(narutoState({ mode: 'DFIX', route: 'DFix', route_command: '$DFix', subagents_required: false }), applyPatch(['a.ts']), SESSION), false);
  assert.equal(narutoRootParentHook(narutoState(), applyPatch(['a.ts'], { agent_worker: true }), SESSION), false);
  assert.equal(narutoRootParentHook({ mode: 'NARUTO' }, applyPatch(['a.ts']), SESSION), false);
});

test('before the first spawn the parent is denied, then released once with a warning, then silently', async () => {
  setDecisionTestOverrides({ config: defaultDecisionConfig() });
  try {
    await withRoot(async (root) => {
      const state = narutoState();
      for (let attempt = 1; attempt <= PARENT_ORCHESTRATION_MAX_BLOCKS; attempt += 1) {
        const denied = await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/auth/parser.ts']), sessionKey: SESSION });
        assert.equal(denied.action, 'block');
        assert.equal(denied.reason, 'no_child_thread');
        assert.match(denied.action === 'block' ? denied.message : '', /no child thread yet[\s\S]*spawn_agent/);
      }
      const artifact = await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['.sneakoscope/missions/M/plan.md']), sessionKey: SESSION });
      assert.equal(artifact.reason, 'sneakoscope_artifact');
      const child = await evaluateParentOrchestrationGate({ root, state, payload: childPayload(['src/auth/parser.ts']), sessionKey: SESSION });
      assert.equal(child.reason, 'not_root_parent');

      const firstEscape = await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/auth/parser.ts']), sessionKey: SESSION });
      assert.equal(firstEscape.action, 'escape');
      assert.match(firstEscape.action === 'escape' ? String(firstEscape.message) : '', /recorded as an escape/);
      const laterEscape = await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/auth/parser.ts']), sessionKey: SESSION });
      assert.equal(laterEscape.action, 'escape');
      assert.equal(laterEscape.action === 'escape' ? laterEscape.message : 'unexpected', null);
      const ledger = await readParentOrchestrationLedger(root, MISSION, RUN);
      assert.equal(ledger.blocks, PARENT_ORCHESTRATION_MAX_BLOCKS);
      assert.equal(ledger.escapes, 2);
      assert.equal(ledger.spawns, 0);
    });
  } finally {
    setDecisionTestOverrides(null);
  }
});

test('an accepted spawn releases the gate; a new workflow run starts its own count', async () => {
  setDecisionTestOverrides({ config: defaultDecisionConfig() });
  try {
    await withRoot(async (root) => {
      const state = narutoState();
      assert.equal((await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/a.ts']), sessionKey: SESSION })).action, 'block');
      const spawned = await recordParentOrchestrationSpawn(root, state);
      assert.equal(spawned?.spawns, 1);
      const released = await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/a.ts']), sessionKey: SESSION });
      assert.equal(released.action, 'allow');
      assert.equal(released.reason, 'children_settled');
      const stored: any = await readJson(parentOrchestrationLedgerPath(root, MISSION), null);
      assert.equal(stored?.schema, 'sks.parent-orchestration-gate.v1');

      const newRun = await evaluateParentOrchestrationGate({
        root,
        state: narutoState({ official_subagent_run_id: 'run-0002' }),
        payload: applyPatch(['src/a.ts']),
        sessionKey: SESSION
      });
      assert.equal(newRun.action, 'block');
      assert.equal(newRun.reason, 'no_child_thread');
    });
  } finally {
    setDecisionTestOverrides(null);
  }
});

test('while children run the parent waits; settled children release integration; a new wave gets its own denials', async () => {
  setDecisionTestOverrides({ config: defaultDecisionConfig() });
  try {
    await withRoot(async (root) => {
      const state = narutoState();
      await writeEvents(root, [
        { event: 'SubagentStart', agent: 'agent-a' },
        { event: 'SubagentStart', agent: 'agent-b' },
        { event: 'SubagentStop', agent: 'agent-a' },
        { event: 'SubagentStart', agent: 'agent-old', run: 'run-0000' }
      ]);
      const waiting = await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/auth/parser.ts']), sessionKey: SESSION });
      assert.equal(waiting.action, 'block');
      assert.equal(waiting.reason, 'children_running');
      assert.match(waiting.action === 'block' ? waiting.message : '', /1 child thread\(s\)[\s\S]*Wait for the running children/);
      // Read-only work and bookkeeping stay open while children run.
      assert.equal((await evaluateParentOrchestrationGate({ root, state, payload: { session_id: SESSION, tool_name: 'Bash', tool_input: { command: 'npm test' } }, sessionKey: SESSION })).action, 'allow');

      assert.equal((await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/x.ts']), sessionKey: SESSION })).action, 'block');
      const released = await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/x.ts']), sessionKey: SESSION });
      assert.equal(released.action, 'escape');
      assert.equal(released.reason, 'wait_max_blocks_reached');
      assert.match(released.action === 'escape' ? String(released.message) : '', /edit only integration work/);

      await writeEvents(root, [
        { event: 'SubagentStart', agent: 'agent-a' },
        { event: 'SubagentStart', agent: 'agent-b' },
        { event: 'SubagentStop', agent: 'agent-a' },
        { event: 'SubagentStop', agent: 'agent-b' }
      ]);
      const integrate = await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/x.ts']), sessionKey: SESSION });
      assert.equal(integrate.action, 'allow');
      assert.equal(integrate.reason, 'children_settled');

      await writeEvents(root, [
        { event: 'SubagentStart', agent: 'agent-a' },
        { event: 'SubagentStop', agent: 'agent-a' },
        { event: 'SubagentStart', agent: 'agent-c' }
      ]);
      const nextWave = await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/x.ts']), sessionKey: SESSION });
      assert.equal(nextWave.action, 'block');
      assert.equal(nextWave.reason, 'children_running');
      const ledger = await readParentOrchestrationLedger(root, MISSION, RUN);
      assert.equal(ledger.wait_blocks, 1);
      assert.equal(ledger.spawns, 2);
    });
  } finally {
    setDecisionTestOverrides(null);
  }
});

test('a confident Jev parent_owned answer releases one scaffolding edit; delegate_child keeps the denial', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test-parentorchestrationaaaa';
  let choice = 'parent_owned';
  let fetched = 0;
  setDecisionTestOverrides({
    config: { ...defaultDecisionConfig(), mode: 'jev', consentCloud: true },
    fetchImpl: async (_url, init) => {
      fetched += 1;
      const body = JSON.parse(String(init?.body || '')) as { questions: Record<string, { type: string; criteria?: Record<string, string> }>; state: any };
      assert.equal(body.questions.delegation?.type, 'choice');
      assert.deepEqual(Object.keys(body.questions.delegation?.criteria || {}).sort(), ['delegate_child', 'keep_baseline', 'parent_owned']);
      assert.equal(body.state.delegation.tool, 'apply_patch');
      assert.deepEqual(body.state.delegation.targets, choice === 'parent_owned' ? ['tsconfig.build.json'] : ['src/auth/parser.ts']);
      return new Response(JSON.stringify({
        model: 'typesafe/jev-1.13',
        answers: {
          delegation: {
            type: 'choice',
            choice,
            confidence: 0.92,
            probabilities: {
              delegate_child: choice === 'delegate_child' ? 0.9 : 0.05,
              parent_owned: choice === 'parent_owned' ? 0.9 : 0.05,
              keep_baseline: 0.05
            }
          }
        },
        usage: { input_tokens: 30, output_tokens: 3 }
      }), { status: 200 });
    }
  });
  try {
    await withRoot(async (root) => {
      const state = narutoState();
      const allowed = await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['tsconfig.build.json']), sessionKey: SESSION });
      assert.equal(allowed.action, 'allow');
      assert.equal(allowed.reason, 'jev_parent_owned');
      assert.equal(fetched, 1);
      const ledger = await readParentOrchestrationLedger(root, MISSION, RUN);
      assert.equal(ledger.parent_owned_allows, 1);
      assert.equal(ledger.blocks, 0);

      choice = 'delegate_child';
      const denied = await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/auth/parser.ts']), sessionKey: SESSION });
      assert.equal(denied.action, 'block');
      assert.equal(denied.reason, 'jev_delegate_child');
      assert.match(denied.action === 'block' ? denied.message : '', /Jev classified this edit as slice work/);

      // Children running: Jev is not consulted; the wait rule decides.
      await writeEvents(root, [{ event: 'SubagentStart', agent: 'agent-a' }]);
      const before = fetched;
      assert.equal((await evaluateParentOrchestrationGate({ root, state, payload: applyPatch(['src/auth/parser.ts']), sessionKey: SESSION })).reason, 'children_running');
      assert.equal(fetched, before);
    });
  } finally {
    setDecisionTestOverrides(null);
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});
