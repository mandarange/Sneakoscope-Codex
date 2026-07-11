// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assertGate, root } from '../sks-1-18-gate-lib.js';

const MAX_EMPTY_OUTPUT_ATTEMPTS = 2;
const CLI_COMPLETION_TIMEOUT_MS = 180_000;
const CLI_STABILITY_WAIT_MS = 500;
const CLI_STABILITY_SAMPLE_MS = 25;
const stabilityWaitCell = new Int32Array(new SharedArrayBuffer(4));

export function runNativeCliSwarmCheck({ agents, workItems = agents, reportName, backend = 'fake', extraArgs = [], expectedFastMode = null }) {
  const distCli = path.join(root, 'dist', 'bin', 'sks.js');
  assertGate(fs.existsSync(distCli), 'dist CLI missing for native CLI swarm check', { distCli });
  const args = [
    distCli,
    'agent',
    'run',
    `native cli session swarm ${agents}`,
    '--backend',
    backend,
    '--mock',
    '--agents',
    String(agents),
    '--concurrency',
    String(agents),
    '--work-items',
    String(workItems),
    '--minimum-work-items',
    String(agents),
    '--json',
    ...extraArgs
  ];
  const attempts = [];
  let inspected = null;
  while (attempts.length < MAX_EMPTY_OUTPUT_ATTEMPTS) {
    const attempt = runCliAttempt({ distCli, args, backend, attemptNumber: attempts.length + 1 });
    attempts.push(attempt);
    inspected = inspectNativeCliSwarmOutput(attempt.stdout);
    if (inspected.ok || inspected.reason !== 'empty_stdout') break;
    if (attempts.length >= MAX_EMPTY_OUTPUT_ATTEMPTS) break;
    const stable = waitForStableNonemptyCli(distCli);
    assertGate(stable.ok, 'native CLI session swarm emitted empty JSON and the CLI did not settle for a bounded retry', {
      dist_cli: distCli,
      attempt_count: attempts.length,
      completion_timeout_ms: CLI_COMPLETION_TIMEOUT_MS,
      stability_wait_ms: CLI_STABILITY_WAIT_MS,
      before: attempt.cli_before,
      after: attempt.cli_after,
      stable
    });
  }
  assertGate(inspected?.ok === true, inspected?.reason === 'empty_stdout'
    ? 'native CLI session swarm completed without JSON output after one bounded retry'
    : 'native CLI session swarm emitted incomplete or invalid JSON', {
    dist_cli: distCli,
    attempt_count: attempts.length,
    completion_timeout_ms: CLI_COMPLETION_TIMEOUT_MS,
    attempts: attempts.map(attemptDiagnostic),
    output: inspected
  });
  const result = inspected.value;
  const proof = result.native_cli_session_proof || {};
  const noSubagent = result.no_subagent_scaling_policy || {};
  const officialHelper = result.official_subagent_helper_policy || {};
  const fast = result.fast_mode_propagation || {};
  const policy = fast.policy || result.fast_mode_policy || {};
  const expectedFast = expectedFastMode === null || expectedFastMode === undefined ? Boolean(policy.fast_mode) : Boolean(expectedFastMode);
  const expectedTier = expectedFast ? 'fast' : 'standard';
  const report = {
    schema: 'sks.native-cli-session-swarm-check.v1',
    ok: result.ok === true,
    agents,
    work_items: workItems,
    mission_id: result.mission_id,
    backend: result.backend,
    native_cli_session_proof: proof,
    no_subagent_scaling_policy: noSubagent,
    official_subagent_helper_policy: officialHelper,
    fast_mode_propagation: fast,
    proof_status: result.proof?.status || null,
    completion_protocol: {
      schema: 'sks.native-cli-check-completion.v1',
      attempt_count: attempts.length,
      max_attempts: MAX_EMPTY_OUTPUT_ATTEMPTS,
      bounded_timeout_ms: CLI_COMPLETION_TIMEOUT_MS,
      atomic_output_read: true,
      transient_empty_output_recovered: attempts.length > 1,
      output_bytes: attempts.at(-1)?.output_bytes || 0
    }
  };
  const out = path.join(root, '.sneakoscope', 'reports', reportName);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

  assertGate(result.ok === true, 'native CLI session swarm run must pass', report);
  assertGate(proof.spawned_worker_process_count >= agents, 'spawned native worker process count below requested agents', report);
  assertGate(proof.unique_worker_session_count >= agents, 'unique worker session count below requested agents', report);
  const expectedSlots = Math.min(agents, Number(proof.target_active_slots || agents));
  assertGate(proof.unique_slot_count >= expectedSlots, 'unique slot count below effective concurrency target', report);
  assertGate(Array.isArray(proof.process_ids) && proof.process_ids.length >= agents, 'process ids missing from native CLI proof', report);
  assertGate(proof.close_report_count >= agents, 'worker close report count below requested agents', report);
  assertGate(noSubagent.ok === true && noSubagent.subagent_events_counted_as_worker_sessions === false, 'no-subagent scaling policy must pass', report);
  assertGate(officialHelper.ok === true && officialHelper.official_codex_subagent_helper_lane_enabled === true, 'official subagent helper policy must pass', report);
  assertGate(officialHelper.worker_capacity_credit === 0 && officialHelper.subagent_events_counted_as_worker_sessions === false, 'official helper lane must not count toward worker capacity', report);
  assertGate(noSubagent.official_codex_subagent_helper_lane_allowed === true && noSubagent.official_helper_lane_worker_capacity_credit === 0, 'no-subagent policy must allow helper lane with zero capacity credit', report);
  assertGate(fast.ok === true, 'fast mode propagation proof must pass', report);
  assertGate(fast.fast_mode === expectedFast && fast.service_tier === expectedTier, 'worker service tier must match the selected fast-mode policy', { ...report, expected_fast_mode: expectedFast, expected_service_tier: expectedTier });
  if (expectedFast && expectedFastMode === true) {
    assertGate(policy.explicit_fast === true || policy.preference_mode === 'fast' || policy.explicit_service_tier === 'fast', 'fast-mode propagation gate must use explicit fast opt-in', report);
  }
  assertGate((proof.worker_command_lines || []).every((line) => line.includes('--agent') && line.includes('worker')), 'worker command lines must use --agent worker', report);
  return report;
}

export function inspectNativeCliSwarmOutput(stdout) {
  const text = typeof stdout === 'string' ? stdout : String(stdout || '');
  if (text.trim().length === 0) return { ok: false, reason: 'empty_stdout', output_bytes: Buffer.byteLength(text) };
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, reason: 'non_object_json', output_bytes: Buffer.byteLength(text) };
    }
    return { ok: true, value, output_bytes: Buffer.byteLength(text) };
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid_json',
      output_bytes: Buffer.byteLength(text),
      parse_error: error instanceof Error ? error.message : String(error),
      output_sha256: crypto.createHash('sha256').update(text).digest('hex')
    };
  }
}

function runCliAttempt({ distCli, args, backend, attemptNumber }) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-native-cli-swarm-fixture-'));
  const fixtureHome = path.join(fixtureRoot, 'home');
  const outputDraft = path.join(fixtureRoot, `.native-cli-result-${attemptNumber}.json.partial`);
  const outputComplete = path.join(fixtureRoot, `.native-cli-result-${attemptNumber}.json`);
  let outputFd = fs.openSync(outputDraft, 'wx', 0o600);
  const cleanupFixture = () => fs.rmSync(fixtureRoot, { recursive: true, force: true });
  process.once('exit', cleanupFixture);
  const cliBefore = cliSnapshot(distCli);
  try {
    execFileSync(process.execPath, args, {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        HOME: fixtureHome,
        CODEX_HOME: path.join(fixtureHome, '.codex'),
        SKS_GLOBAL_ROOT: path.join(fixtureHome, '.sneakoscope-global'),
        TMPDIR: fixtureRoot,
        TMP: fixtureRoot,
        TEMP: fixtureRoot,
        PWD: fixtureRoot,
        SKS_TEST_ISOLATION: '1',
        SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
        NODE_ENV: 'test',
        CI: 'true',
        ...(backend === 'codex-sdk' ? { SKS_CODEX_SDK_FAKE: '1' } : {})
      },
      timeout: CLI_COMPLETION_TIMEOUT_MS,
      killSignal: 'SIGTERM',
      stdio: ['ignore', outputFd, 'pipe'],
      maxBuffer: 96 * 1024 * 1024
    });
    fs.fsyncSync(outputFd);
    fs.closeSync(outputFd);
    outputFd = null;
    fs.renameSync(outputDraft, outputComplete);
    const stdout = fs.readFileSync(outputComplete, 'utf8');
    const cliAfter = cliSnapshot(distCli);
    return {
      attempt: attemptNumber,
      stdout,
      output_bytes: Buffer.byteLength(stdout),
      cli_before: cliBefore,
      cli_after: cliAfter
    };
  } finally {
    if (outputFd !== null) {
      try { fs.closeSync(outputFd); } catch {}
    }
    process.removeListener('exit', cleanupFixture);
    cleanupFixture();
  }
}

function waitForStableNonemptyCli(distCli) {
  const startedAt = Date.now();
  let previous = cliSnapshot(distCli);
  while (Date.now() - startedAt < CLI_STABILITY_WAIT_MS) {
    Atomics.wait(stabilityWaitCell, 0, 0, CLI_STABILITY_SAMPLE_MS);
    const current = cliSnapshot(distCli);
    if (current.ok && current.size > 0 && sameCliSnapshot(previous, current)) {
      return { ok: true, waited_ms: Date.now() - startedAt, snapshot: current };
    }
    previous = current;
  }
  return { ok: false, waited_ms: Date.now() - startedAt, snapshot: previous };
}

function cliSnapshot(file) {
  try {
    const stat = fs.statSync(file);
    const bytes = fs.readFileSync(file);
    return {
      ok: stat.isFile(),
      size: stat.size,
      mtime_ms: stat.mtimeMs,
      dev: String(stat.dev),
      ino: String(stat.ino),
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    };
  } catch (error) {
    return { ok: false, size: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

function sameCliSnapshot(left, right) {
  return left?.ok === true
    && right?.ok === true
    && left.size === right.size
    && left.mtime_ms === right.mtime_ms
    && left.dev === right.dev
    && left.ino === right.ino
    && left.sha256 === right.sha256;
}

function attemptDiagnostic(attempt) {
  return {
    attempt: attempt.attempt,
    output_bytes: attempt.output_bytes,
    cli_before: attempt.cli_before,
    cli_after: attempt.cli_after
  };
}
