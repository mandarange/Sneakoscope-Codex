#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from '../core/fsx.js';

const root = process.cwd();
const compiled = discover(path.join(root, 'dist'), (file) => file.endsWith('.test.js') && file.includes(`${path.sep}__tests__${path.sep}`));
const unit = discover(path.join(root, 'test', 'unit'), (file) => file.endsWith('.test.mjs'));
const files = [...compiled, ...unit].sort();

if (!compiled.length || !unit.length) {
  console.error(JSON.stringify({
    schema: 'sks.canonical-test-runner.v1',
    ok: false,
    compiled_tests: compiled.length,
    unit_tests: unit.length,
    blockers: ['canonical_test_surface_missing']
  }));
  process.exit(1);
}

const scratch = tmpdir('sks-canonical-test-');
let cleaned = false;
let finalized = false;
const removeScratchSync = (): Error | null => {
  if (cleaned) return null;
  try {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
    if (!fs.existsSync(scratch)) {
      cleaned = true;
      return null;
    }
    return new Error(`canonical test scratch still exists after cleanup: ${scratch}`);
  } catch (error: unknown) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const cleanup = async (): Promise<Error | null> => {
  if (cleaned) return null;
  const deadline = Date.now() + 2_000;
  let lastError: Error | null = null;
  do {
    lastError = removeScratchSync();
    if (!lastError) {
      // A just-terminated test descendant can recreate its temp directory a
      // moment after the first rm. Require a short no-recreation window.
      await delay(100);
      if (!fs.existsSync(scratch)) return null;
      cleaned = false;
      lastError = new Error(`canonical test scratch was recreated during cleanup: ${scratch}`);
    }
    await delay(50);
  } while (Date.now() < deadline);
  return lastError ?? new Error(`canonical test scratch cleanup timed out: ${scratch}`);
};

process.once('exit', () => {
  const error = removeScratchSync();
  if (error) console.error(`canonical test cleanup failed during exit: ${error.message}`);
});

const isolatedProcessGroup = process.platform !== 'win32';
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files, ...process.argv.slice(2)], {
  cwd: root,
  detached: isolatedProcessGroup,
  env: {
    ...process.env,
    TMPDIR: scratch,
    TMP: scratch,
    TEMP: scratch,
    SKS_TMP_DIR: scratch
  },
  stdio: 'inherit'
});
child.on('error', (error) => {
  void finalize(1, null, error);
});
child.on('close', (code, signal) => {
  void finalize(code ?? 1, signal, null);
});

type ForwardedSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP';
const signals: ForwardedSignal[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const signalExitCodes: Record<ForwardedSignal, number> = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
let forwardedSignal: ForwardedSignal | null = null;
let signalTimer: NodeJS.Timeout | null = null;
const signalHandlers = new Map<ForwardedSignal, () => void>();
for (const signal of signals) {
  const handler = () => {
    if (forwardedSignal) return;
    forwardedSignal = signal;
    signalChildTree(signal);
    signalTimer = setTimeout(() => {
      signalChildTree('SIGKILL');
      void finalize(signalExitCodes[signal], signal, null);
    }, 5_000);
  };
  signalHandlers.set(signal, handler);
  process.once(signal, handler);
}

function removeSignalHandlers(): void {
  for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
}

async function finalize(code: number, signal: NodeJS.Signals | null, spawnError: Error | null): Promise<void> {
  if (finalized) return;
  finalized = true;
  if (signalTimer) clearTimeout(signalTimer);
  await settleChildTree();
  const cleanupError = await cleanup();
  removeSignalHandlers();
  if (spawnError) console.error(`canonical test runner failed: ${spawnError.message}`);
  if (cleanupError) console.error(`canonical test cleanup failed: ${cleanupError.message}`);
  if (forwardedSignal) process.kill(process.pid, forwardedSignal);
  else if (signal) process.kill(process.pid, signal);
  else process.exitCode = spawnError || cleanupError ? 1 : code;
}

function signalChildTree(signal: NodeJS.Signals): void {
  if (!child.pid) return;
  if (isolatedProcessGroup) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {}
  }
  try { child.kill(signal); } catch {}
}

function childTreeAlive(): boolean {
  if (!isolatedProcessGroup || !child.pid) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function settleChildTree(): Promise<void> {
  if (!childTreeAlive()) return;
  signalChildTree('SIGTERM');
  const termDeadline = Date.now() + 750;
  while (childTreeAlive() && Date.now() < termDeadline) await delay(25);
  if (!childTreeAlive()) return;
  signalChildTree('SIGKILL');
  const killDeadline = Date.now() + 750;
  while (childTreeAlive() && Date.now() < killDeadline) await delay(25);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function discover(dir: string, accept: (file: string) => boolean): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile() && accept(file)) out.push(file);
    }
  }
  return out;
}
