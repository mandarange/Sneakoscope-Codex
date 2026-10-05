import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { alignCommand } from '../align-command.js';
import { resetVerificationProfileCache } from '../../verification-profile.js';

interface AlignProject {
  root: string;
  run: () => Promise<any>;
}

// A user's project has no config/architecture-map-policy.v1.json, and `sks align run`
// must work there as a self-contained refresh with no Codex thread and no prior route.
async function withAlignProject(body: (project: AlignProject) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-align-user-project-'));
  const priorCwd = process.cwd();
  const priorThread = process.env.CODEX_THREAD_ID;
  const priorStandalone = process.env.SKS_NARUTO_STANDALONE_CLI;
  const priorExit = process.exitCode;
  const priorLog = console.log;
  const output: string[] = [];
  try {
    const git = (args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'user-project', version: '1.0.0' }));
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'init']);
    process.chdir(root);
    delete process.env.CODEX_THREAD_ID;
    process.env.SKS_NARUTO_STANDALONE_CLI = '1';
    resetVerificationProfileCache();
    console.log = (value: unknown) => { output.push(String(value)); };

    await body({
      root,
      run: async () => {
        await alignCommand('run', ['--json']);
        return JSON.parse(output.pop()!);
      }
    });
  } finally {
    console.log = priorLog;
    process.exitCode = priorExit;
    process.chdir(priorCwd);
    if (priorThread === undefined) delete process.env.CODEX_THREAD_ID; else process.env.CODEX_THREAD_ID = priorThread;
    if (priorStandalone === undefined) delete process.env.SKS_NARUTO_STANDALONE_CLI; else process.env.SKS_NARUTO_STANDALONE_CLI = priorStandalone;
    resetVerificationProfileCache();
    await fs.rm(root, { recursive: true, force: true });
  }
}

// align used to fail there with architecture_map_policy_unreadable, and a passing run
// left an open Align route that blocked the next route command until `sks route close`.
test('align run works in a project without an architecture-map policy and closes its own route', async () => {
  await withAlignProject(async ({ root, run }) => {
    const result = await run();
    assert.equal(result.ok, true, JSON.stringify(result.gate?.blockers || result));
    assert.equal(result.route_closed, true);
    assert.equal(result.next_action, 'none');

    const state = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'state', 'current.json'), 'utf8'));
    assert.equal(state.mission_id, result.mission_id);
    assert.equal(state.route_closed, true);
    assert.match(String(state.phase), /_CLOSED$/);
  });
});

// The route writes its artifacts once and closes the work-order ledger only after the
// proof exists, so they are always older than the mission's last event. The evidence
// router judges an artifact by mtime against that event unless the proof marks it
// ignoreStale, and a slow machine separating the two timestamps kept a passing run's
// route open about one time in three (trust: work-order-ledger.json:stale).
test('align marks the artifacts it writes once as exempt from the mtime staleness check', async () => {
  await withAlignProject(async ({ root, run }) => {
    const result = await run();
    assert.equal(result.route_closed, true);

    const missionRoot = path.join(root, '.sneakoscope', 'missions', result.mission_id);
    const proof = JSON.parse(await fs.readFile(path.join(missionRoot, 'completion-proof.json'), 'utf8'));
    const artifacts = (proof.evidence.artifacts as Array<string | { path: string; ignoreStale?: boolean }>)
      .filter((artifact): artifact is { path: string; ignoreStale?: boolean } => typeof artifact !== 'string');
    assert.deepEqual(
      artifacts.map((artifact) => artifact.path).sort(),
      ['align-gate.json', 'align-ledger.json', 'align-plan.json', 'work-order-ledger.json']
    );
    for (const artifact of artifacts) assert.equal(artifact.ignoreStale, true, `${artifact.path} must not be mtime-judged`);
  });
});
