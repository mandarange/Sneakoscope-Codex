import path from 'node:path';
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js';
import { redactSecrets } from '../secret-redaction.js';

export async function runDfixVerificationCommand(root: string, dir: string, input: any = {}) {
  const started = Date.now();
  const command = input.command || input.selection?.fastest_sufficient_command || null;
  const shouldRun = Boolean(command && (input.runCommand === true || input.verifyAuto === true));
  const commandResult = shouldRun ? await runShell(root, command, input.timeoutMs || input.selection?.expected_duration_budget_ms || 120_000) : null;
  const result = redactSecrets({
    schema: 'sks.dfix-verification-runner.v1',
    created_at: nowIso(),
    selected_command: command,
    selected_command_first: true,
    auto_run_opt_in: shouldRun,
    full_verify_required_for_expansion: true,
    full_verify_run: input.fullVerify === true,
    command_result: commandResult,
    duration_ms: Date.now() - started,
    status: commandResult ? (commandResult.ok ? 'passed' : commandResult.timed_out ? 'timed_out' : 'failed') : input.mock ? 'passed' : 'blocked',
    passed: commandResult ? commandResult.ok : input.mock === true,
    blockers: input.mock === true
      ? []
      : command && !shouldRun
      ? ['verification_command_not_run_without_explicit_run_flag']
      : commandResult ? (commandResult.ok ? [] : ['verification_command_failed']) : ['verification_command_missing'],
    flaky_suspicion: false
  });
  await writeJsonAtomic(path.join(dir, 'dfix-verification-runner.json'), result);
  return result;
}

async function runShell(root: string, command: string, timeoutMs: number) {
  const result = await runProcess(process.execPath, ['-e', `const cp=require('node:child_process'); const r=cp.spawnSync(${JSON.stringify(command)}, {shell:true, cwd:${JSON.stringify(root)}, encoding:'utf8'}); process.stdout.write(r.stdout||''); process.stderr.write(r.stderr||''); process.exit(r.status||0);`], {
    cwd: root,
    timeoutMs,
    maxOutputBytes: 128 * 1024
  });
  return {
    ok: result.code === 0,
    status: result.code === 0 ? 'passed' : 'failed',
    exit_code: result.code,
    stdout_tail: result.stdout.slice(-4000),
    stderr_tail: result.stderr.slice(-4000),
    timed_out: result.timedOut
  };
}
