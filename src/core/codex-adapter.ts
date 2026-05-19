import path from 'node:path';
import { exists, packageRoot, runProcess, which, type RunProcessResult } from './fsx.js';
import { forceGpt55CodexArgs } from './codex-model-guard.js';

export async function findCodexBinary(): Promise<string | null> {
  const env = process.env.SKS_CODEX_BIN || process.env.DCODEX_CODEX_BIN || process.env.CODEX_BIN;
  if (env && await exists(env)) return env;
  const global = await which('codex');
  if (global) return global;
  const root = packageRoot();
  const local = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'codex.cmd' : 'codex');
  if (await exists(local)) return local;
  return null;
}

export async function codexVersion(bin: string | null): Promise<string | null> {
  if (!bin) return null;
  const result = await runProcess(bin, ['--version'], { timeoutMs: 10000, maxOutputBytes: 16 * 1024 });
  const text = `${result.stdout}${result.stderr}`.trim();
  return result.code === 0 ? text : null;
}

/** Shape returned by {@link getCodexInfo}; use {@link EMPTY_CODEX_INFO} for safe fallbacks. */
export type CodexInfo = {
  bin: string | null;
  version: string | null;
  available: boolean;
};

export const EMPTY_CODEX_INFO: CodexInfo = Object.freeze({
  bin: null,
  version: null,
  available: false
});

export async function getCodexInfo(): Promise<CodexInfo> {
  const bin = await findCodexBinary();
  const version = await codexVersion(bin);
  return { bin, version, available: Boolean(bin) };
}

export function buildCodexExecArgs({ root, prompt, outputFile, json = true, profile = null, extraArgs = [] }: any) {
  const args = ['exec', '--cd', root];
  if (profile) args.push('--profile', profile);
  if (json) args.push('--json');
  if (outputFile) args.push('--output-last-message', outputFile);
  args.push(...forceGpt55CodexArgs(extraArgs));
  args.push(prompt);
  return args;
}

export async function runCodexExec({ root, prompt, outputFile, json = true, profile = null, extraArgs = [], onStdout, onStderr, logDir = null, stdoutFile = null, stderrFile = null, maxBufferBytes = 256 * 1024, timeoutMs = null }: any): Promise<RunProcessResult> {
  const bin = await findCodexBinary();
  if (!bin) {
    return {
      code: 127,
      stdout: '',
      stderr: 'Codex CLI not found. Install @openai/codex or set SKS_CODEX_BIN.',
      stdoutBytes: 0,
      stderrBytes: 0,
      truncated: false,
      timedOut: false
    };
  }
  const args = buildCodexExecArgs({ root, prompt, outputFile, json, profile, extraArgs });
  const effectiveTimeoutMs = Number(timeoutMs || process.env.SKS_CODEX_TIMEOUT_MS || process.env.DCODEX_CODEX_TIMEOUT_MS || 30 * 60 * 1000);
  return runProcess(bin, args, {
    cwd: root,
    onStdout,
    onStderr,
    timeoutMs: effectiveTimeoutMs,
    maxOutputBytes: maxBufferBytes,
    stdoutFile: stdoutFile || (logDir ? path.join(logDir, 'codex.stdout.log') : undefined),
    stderrFile: stderrFile || (logDir ? path.join(logDir, 'codex.stderr.log') : undefined)
  });
}
