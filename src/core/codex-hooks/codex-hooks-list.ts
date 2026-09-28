import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { packageRoot, which } from '../fsx.js';
import { codexAppCandidatePaths } from '../codex-app.js';
import { messageOf } from '../errors/message.js';

export const CODEX_HOOKS_LIST_SCHEMA = 'sks.codex-hooks-list.v1';

/** One row of Codex app-server `hooks/list` (HooksListEntry.hooks). */
export interface CodexListedHook {
  key: string;
  eventName: string;
  matcher: string | null;
  command?: string | null;
  sourcePath: string;
  source: string;
  enabled: boolean;
  isManaged: boolean;
  currentHash: string;
  trustStatus: string;
}

export interface CodexHooksListResult {
  schema: typeof CODEX_HOOKS_LIST_SCHEMA;
  ok: boolean;
  codex_bin: string | null;
  data: Array<{ cwd: string; hooks: CodexListedHook[]; warnings: string[]; errors: Array<{ path: string; message: string }> }>;
  blocker: string | null;
}

export type CodexHooksLister = (cwds: string[], env: NodeJS.ProcessEnv) => Promise<CodexHooksListResult>;

/**
 * Codex binaries that can answer `hooks/list`, the one the user's Codex app
 * runs first: the desktop app's bundled CLI, then `codex` on PATH, then the
 * Codex CLI that ships inside SKS (always present). Trust hashes have been
 * identical across these, but the app's own CLI is what runs the hooks.
 */
export async function codexHooksListBinaryCandidates(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const home = env.HOME || os.homedir();
  const executable = process.platform === 'win32' ? 'codex.cmd' : 'codex';
  const rows: string[] = [];
  for (const value of [env.SKS_CODEX_BIN, env.CODEX_BIN]) if (value) rows.push(value);
  for (const app of codexAppCandidatePaths(home, env)) {
    if (!/\.app$/i.test(app)) continue;
    rows.push(path.join(app, 'Contents', 'Resources', 'codex-cli', 'bin', 'codex'));
    rows.push(path.join(app, 'Contents', 'Resources', 'codex'));
  }
  const onPath = await which(executable).catch(() => null);
  if (onPath) rows.push(onPath);
  rows.push(path.join(packageRoot(), 'node_modules', '.bin', executable));
  const found: string[] = [];
  for (const row of [...new Set(rows)]) {
    const stat = await fsp.stat(row).catch(() => null);
    if (stat?.isFile()) found.push(row);
  }
  return found;
}

/** Ask Codex which hooks it loads for each cwd and whether it trusts them. */
export async function listCodexHooks(input: {
  cwds: string[];
  env?: NodeJS.ProcessEnv;
  codexBin?: string | null;
  timeoutMs?: number;
}): Promise<CodexHooksListResult> {
  const env = input.env || process.env;
  const bins = input.codexBin ? [input.codexBin] : await codexHooksListBinaryCandidates(env);
  let blocker = 'codex_binary_missing';
  for (const bin of bins) {
    try {
      const data = await requestHooksList(bin, input.cwds, env, input.timeoutMs ?? 20_000);
      return { schema: CODEX_HOOKS_LIST_SCHEMA, ok: true, codex_bin: bin, data, blocker: null };
    } catch (err: unknown) {
      blocker = `codex_hooks_list_failed:${messageOf(err)}`;
    }
  }
  return { schema: CODEX_HOOKS_LIST_SCHEMA, ok: false, codex_bin: null, data: [], blocker };
}

function requestHooksList(bin: string, cwds: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<CodexHooksListResult['data']> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['app-server'], {
      cwd: cwds[0] || os.tmpdir(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });
    let buffer = '';
    let stderr = '';
    let settled = false;
    const finish = (err: Error | null, data?: CodexHooksListResult['data']) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (err) reject(err);
      else resolve(data || []);
    };
    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.on('error', (err) => finish(err));
    child.on('exit', (code) => finish(new Error(`app_server_exited:${code ?? 'signal'}:${stderr.trim().slice(0, 200)}`)));
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4096); });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        let message: any;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1) {
          if (message.error) return finish(new Error(`initialize:${message.error.message || 'error'}`));
          send({ method: 'initialized' });
          send({ id: 2, method: 'hooks/list', params: { cwds } });
        } else if (message.id === 2) {
          if (message.error) return finish(new Error(`hooks_list:${message.error.message || 'error'}`));
          const data = Array.isArray(message.result?.data) ? message.result.data : null;
          return data ? finish(null, data) : finish(new Error('hooks_list_malformed'));
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'sneakoscope', version: '1' }, capabilities: null } });
  });
}
