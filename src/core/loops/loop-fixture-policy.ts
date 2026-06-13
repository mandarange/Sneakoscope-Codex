import os from 'node:os';
import path from 'node:path';
import { writeJsonAtomic } from '../fsx.js';
import { loopFixturePolicyPath } from './loop-artifacts.js';

export type LoopFixtureMode = 'worker' | 'gate' | 'gpt-final' | 'merge';

export interface LoopFixturePolicyDecision {
  schema: 'sks.loop-fixture-policy-decision.v1';
  allowed: boolean;
  mode: LoopFixtureMode;
  requested: boolean;
  production_like: boolean;
  reason: string;
  blockers: string[];
}

export function decideLoopFixturePolicy(input: {
  root: string;
  missionId: string;
  mode: LoopFixtureMode;
  requested: boolean;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
}): LoopFixturePolicyDecision {
  const env = input.env || process.env;
  const argv = input.argv || process.argv;
  const scriptPath = argv.find((arg) => /(?:^|[\\/])(?:dist|src)[\\/]scripts[\\/]/.test(arg)) || argv[1] || '';
  const scriptName = path.basename(scriptPath);
  const scriptIsCheck = /(?:^|[\\/])(?:dist|src)[\\/]scripts[\\/]/.test(scriptPath)
    && /(check|blackbox)/.test(scriptName);
  const missionIsCheck = /^M-check-/.test(input.missionId);
  const tempRoot = isUnderTempRoot(input.root);
  const explicitTestEnv = env.NODE_ENV === 'test'
    || env.SKS_TEST_RUNTIME_FIXTURE_ALLOWED === '1'
    || env.VITEST_WORKER_ID !== undefined
    || env.JEST_WORKER_ID !== undefined
    || env.NODE_V8_COVERAGE !== undefined;
  const commandText = argv.join(' ');
  const productionCommand = /\bsks\s+(?:loop\s+run|goal|naruto)\b/.test(commandText);
  const requestedByEnv = env.SKS_LOOP_GATE_FIXTURE === '1'
    || env.SKS_LOOP_RUNTIME_FIXTURE === '1'
    || env.SKS_LOOP_GPT_FINAL_FIXTURE === '1';
  const allowReasons = [
    scriptIsCheck ? 'release_check_script' : null,
    missionIsCheck ? 'check_mission_id' : null,
    tempRoot ? 'temp_project_root' : null,
    explicitTestEnv ? 'test_environment' : null
  ].filter((value): value is string => Boolean(value));
  const allowed = input.requested && allowReasons.length > 0 && !productionCommand;
  const productionLike = !scriptIsCheck && !missionIsCheck && !tempRoot && !explicitTestEnv;
  const blockers = input.requested && !allowed
    ? [
        'loop_fixture_forbidden_in_production',
        `loop_${input.mode.replace(/-/g, '_')}_fixture_forbidden_in_production`,
        ...(productionCommand ? ['loop_fixture_forbidden_for_production_command'] : []),
        ...(requestedByEnv && productionLike ? ['loop_fixture_env_without_allowed_reason'] : [])
      ]
    : [];
  return {
    schema: 'sks.loop-fixture-policy-decision.v1',
    allowed,
    mode: input.mode,
    requested: input.requested,
    production_like: productionLike || productionCommand,
    reason: allowed ? allowReasons.join('+') : input.requested ? 'fixture_requires_check_or_test_context' : 'fixture_not_requested',
    blockers: [...new Set(blockers)]
  };
}

export async function writeLoopFixturePolicyDecision(root: string, missionId: string, decision: LoopFixturePolicyDecision): Promise<void> {
  await writeJsonAtomic(loopFixturePolicyPath(root, missionId), { ...decision, generated_at: new Date().toISOString() });
}

export function isUnderTempRoot(root: string): boolean {
  const normalizedRoot = path.resolve(root);
  const tempRoot = path.resolve(os.tmpdir());
  return normalizedRoot === tempRoot || normalizedRoot.startsWith(`${tempRoot}${path.sep}`);
}
