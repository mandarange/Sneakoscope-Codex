import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pipelineCommand } from '../pipeline-command.js';
import { createMission, setCurrent } from '../../mission.js';
import { writeQuestions } from '../../questions.js';
import { buildQaLoopQuestionSchema } from '../../qa-loop.js';
import { isClarificationAwaiting } from '../../clarification-gate-state.js';
import { resetVerificationProfileCache } from '../../verification-profile.js';

const PAUSED = {
  phase: 'QALOOP_CLARIFICATION_AWAITING_ANSWERS',
  implementation_allowed: false,
  clarification_required: true,
  ambiguity_gate_required: true,
  ambiguity_gate_passed: false,
  stop_gate: 'clarification-gate'
};

async function withPausedQaLoop(fn: (ctx: { root: string; id: string; dir: string; output: string[] }) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-paused-answer-'));
  const priorCwd = process.cwd();
  const priorThread = process.env.CODEX_THREAD_ID;
  const priorStandalone = process.env.SKS_NARUTO_STANDALONE_CLI;
  const priorProfile = process.env.SKS_VERIFICATION_PROFILE;
  const priorExit = process.exitCode;
  const priorLog = console.log;
  const output: string[] = [];
  try {
    const prompt = 'QA the local dev app at http://localhost:3000';
    const { id, dir } = await createMission(root, { mode: 'qaloop', prompt, sessionKey: 'caller' });
    await writeQuestions(dir, buildQaLoopQuestionSchema(prompt));
    await fs.writeFile(path.join(dir, 'route-context.json'), JSON.stringify({ route: 'QALoop', command: '$QA-LOOP', mode: 'QALOOP', task: prompt }));
    await setCurrent(root, { mission_id: id, route: 'QALoop', route_command: '$QA-LOOP', mode: 'QALOOP', ...PAUSED }, { sessionKey: 'caller' });
    process.chdir(root);
    process.env.CODEX_THREAD_ID = 'caller';
    process.env.SKS_NARUTO_STANDALONE_CLI = '0';
    process.env.SKS_VERIFICATION_PROFILE = 'essential';
    resetVerificationProfileCache();
    console.log = (value: unknown) => { output.push(String(value)); };
    await fn({ root, id, dir, output });
  } finally {
    console.log = priorLog;
    process.exitCode = priorExit;
    process.chdir(priorCwd);
    if (priorThread === undefined) delete process.env.CODEX_THREAD_ID; else process.env.CODEX_THREAD_ID = priorThread;
    if (priorStandalone === undefined) delete process.env.SKS_NARUTO_STANDALONE_CLI; else process.env.SKS_NARUTO_STANDALONE_CLI = priorStandalone;
    if (priorProfile === undefined) delete process.env.SKS_VERIFICATION_PROFILE; else process.env.SKS_VERIFICATION_PROFILE = priorProfile;
    resetVerificationProfileCache();
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function sessionState(root: string) {
  const dir = path.join(root, '.sneakoscope', 'state', 'sessions');
  const [file] = await fs.readdir(dir);
  return JSON.parse(await fs.readFile(path.join(dir, file!), 'utf8'));
}

test('the clarification gate predicate recognises a paused route and nothing else', () => {
  assert.equal(isClarificationAwaiting({ mission_id: 'M-1', ...PAUSED }), true);
  assert.equal(isClarificationAwaiting({ mission_id: 'M-1', ...PAUSED, ambiguity_gate_passed: true }), false);
  assert.equal(isClarificationAwaiting({ mission_id: 'M-1', ...PAUSED, phase: 'QALOOP_CLARIFICATION_CONTRACT_SEALED', stop_gate: 'qa-gate.json' }), false);
  assert.equal(isClarificationAwaiting({ ...PAUSED }), false);
});

test('sks pipeline answer keeps a rejected reply out and seals a valid one', async () => {
  await withPausedQaLoop(async ({ root, dir, output }) => {
    const bad = path.join(root, 'bad.json');
    await fs.writeFile(bad, JSON.stringify({ DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED: 'yes' }));
    await pipelineCommand(['answer', 'latest', bad, '--json']);
    const rejected = JSON.parse(output.pop()!);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'answer_validation_failed');
    assert.equal(process.exitCode, 2);
    assert.equal(isClarificationAwaiting(await sessionState(root)), true, 'a rejected reply must leave the route paused');

    // The next attempt starts from the inferred defaults, not from the rejected value.
    const good = path.join(root, 'good.json');
    await fs.writeFile(good, '{}');
    process.exitCode = 0;
    await pipelineCommand(['answer', 'latest', good, '--json']);
    const sealed = JSON.parse(output.pop()!);
    assert.equal(sealed.ok, true, JSON.stringify(sealed));
    assert.equal(sealed.phase, 'QALOOP_CLARIFICATION_CONTRACT_SEALED');
    const state = await sessionState(root);
    assert.equal(state.implementation_allowed, true);
    assert.equal(isClarificationAwaiting(state), false);
    assert.ok(JSON.parse(await fs.readFile(path.join(dir, 'decision-contract.json'), 'utf8')).sealed_hash);

    // A sealed route has nothing left to answer.
    await pipelineCommand(['answer', 'latest', good, '--json']);
    assert.equal(JSON.parse(output.pop()!).reason, 'mission_not_awaiting_answers');
  });
});

test('sks pipeline answer refuses input that is not a JSON object', async () => {
  await withPausedQaLoop(async ({ root, output }) => {
    const file = path.join(root, 'list.json');
    await fs.writeFile(file, '["yes"]');
    await pipelineCommand(['answer', 'latest', file, '--json']);
    assert.equal(JSON.parse(output.pop()!).reason, 'answers_not_a_json_object');
    assert.equal(isClarificationAwaiting(await sessionState(root)), true);
  });
});
