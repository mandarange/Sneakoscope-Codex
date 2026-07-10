import path from 'node:path';
import { runProcess, type RunProcessResult } from './fsx.js';
import { forceRequiredCodexModelArgs } from './codex-model-guard.js';
import { managedProxyEnvForChild } from './codex/managed-proxy-env.js';
import { resolveCodexRuntime } from './codex-runtime/resolve-codex-runtime.js';

export async function findCodexBinary(): Promise<string | null> {
  const resolved = await resolveCodexRuntime({
    explicitPath: process.env.DCODEX_CODEX_BIN || null,
    requestedBy: 'codex-adapter'
  });
  return resolved.identity?.realpath || null;
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
  args.push(...forceRequiredCodexModelArgs(extraArgs));
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
    env: managedProxyEnvForChild(process.env),
    onStdout,
    onStderr,
    timeoutMs: effectiveTimeoutMs,
    maxOutputBytes: maxBufferBytes,
    stdoutFile: stdoutFile || (logDir ? path.join(logDir, 'codex.stdout.log') : undefined),
    stderrFile: stderrFile || (logDir ? path.join(logDir, 'codex.stderr.log') : undefined)
  });
}
