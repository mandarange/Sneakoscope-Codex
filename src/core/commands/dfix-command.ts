import path from 'node:path';
import { projectRoot, readJson } from '../fsx.js';
import { flag, readOption } from './command-utils.js';
import { printJson } from '../../cli/output.js';
import {
  DFIX_GATE_ARTIFACT,
  createDfixRun,
  finalizeDfix,
  resolveDfixRun,
  writeDfixDiagnosis,
  writeDfixGate,
  writeDfixPatchPlan,
  writeDfixPatchResult,
  writeDfixVerification
} from '../dfix.js';

export async function dfixCommand(commandOrArgs: any[] | string = [], maybeArgs: any[] = []) {
  const args = Array.isArray(commandOrArgs) ? commandOrArgs : maybeArgs;
  const root = await projectRoot();
  const action = args[0] || 'status';
  if (action === 'diagnose') return diagnose(root, args.slice(1));
  if (action === 'plan') return plan(root, args.slice(1));
  if (action === 'patch') return patch(root, args.slice(1));
  if (action === 'verify') return verify(root, args.slice(1));
  if (action === 'rollback-plan') return rollbackPlan(root, args.slice(1));
  if (action === 'proof') return proof(root, args.slice(1));
  if (action === 'trust') return proof(root, args.slice(1));
  if (action === 'fixture') return fixture(root, args.slice(1));
  if (action === 'status') return status(root, args.slice(1));
  console.error('Usage: sks dfix diagnose|plan|patch|verify|rollback-plan|proof|trust|fixture|status [--json]');
  process.exitCode = 1;
}

async function diagnose(root: string, args: any[]) {
  const run = await createDfixRun(root, args);
  const written = await writeDfixDiagnosis(root, run.dir, options(args));
  const result = { schema: 'sks.dfix-diagnose-command.v1', ok: true, mission_id: run.id, ...written };
  if (flag(args, '--json')) return printJson(result);
  console.log(`DFix diagnosis: ${run.id}`);
  return result;
}

async function plan(root: string, args: any[]) {
  const run = await resolve(root, args);
  if (!run) return missing(args);
  const patchPlan = await writeDfixPatchPlan(run.dir, options(args));
  const result = { schema: 'sks.dfix-plan-command.v1', ok: patchPlan.passed === true, mission_id: run.id, patch_plan: patchPlan };
  if (!result.ok) process.exitCode = 1;
  if (flag(args, '--json')) return printJson(result);
  console.log(`DFix patch plan: ${result.ok ? 'ok' : 'blocked'} ${run.id}`);
  return result;
}

async function patch(root: string, args: any[]) {
  const run = await resolve(root, args);
  if (!run) return missing(args);
  await writeDfixPatchPlan(run.dir, options(args));
  const patchResult = await writeDfixPatchResult(root, run.dir, options(args));
  const result = { schema: 'sks.dfix-patch-command.v1', ok: patchResult.passed === true, mission_id: run.id, patch_result: patchResult };
  if (!result.ok) process.exitCode = 1;
  if (flag(args, '--json')) return printJson(result);
  console.log(`DFix patch: ${result.ok ? 'ok' : 'blocked'} ${run.id}`);
  return result;
}

async function verify(root: string, args: any[]) {
  const run = await resolve(root, args);
  if (!run) return missing(args);
  const verification = await writeDfixVerification(root, run.dir, { ...options(args), mock: flag(args, '--mock') });
  const artifacts = await writeDfixGate(run.dir, { mock: flag(args, '--mock') });
  const final = await finalizeDfix(root, run.id, artifacts, { mock: flag(args, '--mock'), cmd: 'sks dfix verify' });
  const result = { schema: 'sks.dfix-verify-command.v1', ok: final.ok && artifacts.gate.passed === true, mission_id: run.id, verification, gate: artifacts.gate, proof: final.validation };
  if (!result.ok) process.exitCode = 1;
  if (flag(args, '--json')) return printJson(result);
  console.log(`DFix verification: ${result.ok ? 'ok' : 'blocked'} ${run.id}`);
  return result;
}

async function rollbackPlan(root: string, args: any[]) {
  const run = await resolve(root, args);
  if (!run) return missing(args);
  const patchResult = await readJson(path.join(run.dir, 'dfix-patch-result.json'), {});
  const result = { schema: 'sks.dfix-rollback-plan-command.v1', ok: true, mission_id: run.id, rollback_plan: patchResult.rollback_plan || [] };
  if (flag(args, '--json')) return printJson(result);
  console.log(JSON.stringify(result.rollback_plan, null, 2));
  return result;
}

async function proof(root: string, args: any[]) {
  const run = await resolve(root, args);
  if (!run) return missing(args);
  const artifacts = await writeDfixGate(run.dir, { mock: flag(args, '--mock') });
  const final = await finalizeDfix(root, run.id, artifacts, { mock: flag(args, '--mock'), cmd: 'sks dfix proof' });
  const result = { schema: 'sks.dfix-proof-command.v1', ok: final.ok, mission_id: run.id, gate: artifacts.gate, proof: final.validation };
  if (!result.ok) process.exitCode = 1;
  if (flag(args, '--json')) return printJson(result);
  console.log(`DFix proof: ${result.ok ? 'ok' : 'blocked'} ${run.id}`);
  return result;
}

async function fixture(root: string, args: any[]) {
  const run = await createDfixRun(root, ['fixture']);
  await writeDfixDiagnosis(root, run.dir, { prompt: 'Mock DFix fixture', error: 'AssertionError: expected fixture value', file: 'fixture.ts', mock: true });
  await writeDfixPatchPlan(run.dir, { file: 'fixture.ts' });
  await writeDfixPatchResult(root, run.dir, { apply: false, file: 'fixture.ts' });
  await writeDfixVerification(root, run.dir, { mock: true });
  const artifacts = await writeDfixGate(run.dir, { mock: true });
  const final = await finalizeDfix(root, run.id, artifacts, { mock: true, cmd: 'sks dfix fixture --mock' });
  const result = { schema: 'sks.dfix-fixture-command.v1', ok: final.ok, mission_id: run.id, artifacts, proof: final.validation };
  if (flag(args, '--json')) return printJson(result);
  console.log(`DFix fixture: ${result.ok ? 'ok' : 'blocked'} ${run.id}`);
  return result;
}

async function status(root: string, args: any[]) {
  const run = await resolve(root, args);
  if (!run) return missing(args);
  const gate = await readJson(path.join(run.dir, DFIX_GATE_ARTIFACT), null);
  const result = { schema: 'sks.dfix-status-command.v1', ok: true, mission_id: run.id, gate };
  if (flag(args, '--json')) return printJson(result);
  console.log(`DFix mission: ${run.id}`);
  console.log(`Gate: ${gate?.passed ? 'passed' : gate ? 'present' : 'missing'}`);
  return result;
}

async function resolve(root: string, args: any[]) {
  const positional = args.find((arg: any) => !String(arg).startsWith('--')) || 'latest';
  return resolveDfixRun(root, positional);
}

function missing(args: any[]) {
  const result = { schema: 'sks.dfix-status-command.v1', ok: false, status: 'missing_mission' };
  process.exitCode = 1;
  if (flag(args, '--json')) return printJson(result);
  console.error('No DFix mission found.');
  return result;
}

function options(args: any[]) {
  return {
    prompt: args.filter((arg: any) => !String(arg).startsWith('--')).join(' '),
    command: readOption(args, '--command', null),
    runCommand: flag(args, '--run'),
    verifyAuto: flag(args, '--verify-auto'),
    file: readOption(args, '--file', null),
    error: readOption(args, '--error', null),
    rootCause: readOption(args, '--root-cause', null),
    findText: readOption(args, '--find', null),
    replaceText: readOption(args, '--replace', null),
    apply: flag(args, '--apply'),
    applyCodexPatch: flag(args, '--apply-codex-patch'),
    fullVerify: flag(args, '--full-verify')
  };
}
