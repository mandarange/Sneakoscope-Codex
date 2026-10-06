import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeJsonAtomic } from '../fsx.js';
import { withFileLock } from '../locks/file-lock.js';
import { ensureConfinedDirectory, inspectConfinedPath } from '../managed-path-safety.js';

export const NARUTO_EXECUTION_MODES = ['auto', 'current-session', 'standalone'] as const;
export type NarutoExecutionMode = typeof NARUTO_EXECUTION_MODES[number];
export const NARUTO_EXECUTION_SCHEMA = 'sks.naruto-execution.v1' as const;

export function narutoExecutionPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(path.resolve(env.SKS_HOME || path.join(env.HOME || os.homedir(), '.sneakoscope')), 'preferences', 'naruto-execution.json');
}

export function isNarutoExecutionMode(value: unknown): value is NarutoExecutionMode {
  return NARUTO_EXECUTION_MODES.some(mode => mode === value);
}

export function readNarutoExecutionMode(env: NodeJS.ProcessEnv = process.env) {
  const file = narutoExecutionPath(env);
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw?.schema !== NARUTO_EXECUTION_SCHEMA || !isNarutoExecutionMode(raw.mode)) throw new Error('invalid');
    return { schema: NARUTO_EXECUTION_SCHEMA, mode: raw.mode as NarutoExecutionMode, path: file, stored: true, blockers: [] as string[] };
  } catch (error: any) {
    return {
      schema: NARUTO_EXECUTION_SCHEMA, mode: 'auto' as NarutoExecutionMode, path: file, stored: false,
      blockers: error?.code === 'ENOENT' ? [] : ['naruto_execution_preference_unreadable']
    };
  }
}

/** Update seeds auto once; later updates preserve every explicit user choice. */
export async function writeNarutoExecutionMode(mode: NarutoExecutionMode, env: NodeJS.ProcessEnv = process.env, onlyIfAbsent = false) {
  if (!isNarutoExecutionMode(mode)) throw new Error('naruto_execution_mode_invalid');
  const file = narutoExecutionPath(env);
  const root = path.dirname(path.dirname(file));
  await fsp.mkdir(root, { recursive: true });
  await ensureConfinedDirectory(root, path.dirname(file));
  return withFileLock({ lockPath: `${file}.lock`, timeoutMs: 5_000, staleMs: 30_000 }, async () => {
    const safety = await inspectConfinedPath(root, file);
    if (safety.leafSymlink) throw new Error('naruto_execution_preference_unsafe_path');
    const before = readNarutoExecutionMode(env);
    if (before.blockers.length) throw new Error(before.blockers[0]);
    if ((onlyIfAbsent && before.stored) || (before.stored && before.mode === mode)) return { ...before, changed: false };
    await writeJsonAtomic(file, { schema: NARUTO_EXECUTION_SCHEMA, mode }, { mode: 0o600 });
    return { ...readNarutoExecutionMode(env), changed: true };
  });
}

/** Resolve the trusted App/terminal lane without treating inherited TTY state as identity. */
export function narutoUsesCurrentSession(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SKS_NARUTO_STANDALONE_CLI === '1') return false;
  if (env.SKS_NARUTO_APP_SESSION === '1') return true;
  const mode = readNarutoExecutionMode(env).mode;
  if (mode === 'standalone') return false;
  if (mode === 'current-session') return Boolean(env.CODEX_THREAD_ID?.trim());
  // Auto preserves the original Codex contract: a thread id means the
  // current App parent owns official children. The terminal distinction is
  // explicit through the standalone mode or environment override; TTY state
  // is not a trustworthy host capability signal.
  return Boolean(env.CODEX_THREAD_ID?.trim());
}
