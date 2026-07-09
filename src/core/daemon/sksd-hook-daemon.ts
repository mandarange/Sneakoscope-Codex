import net from 'node:net';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../fsx.js';

// 20차 P2-1: hook round-trip daemon. `.codex/hooks.json` fires PreToolUse/
// PostToolUse for every tool call, each spawning a fresh `sks hook <event>`
// process that cold-imports the CLI and re-does all hook setup work — the
// audited raw cost was ~171ms/call. This daemon keeps that work warm in a
// long-lived process reachable over a Unix domain socket, so a hook call
// only pays for a short-lived client process's own boot plus a small
// socket round-trip.
//
// Opt-in only for now via SKS_HOOK_DAEMON=1 (see sks-dispatch.ts) — the
// default `sks hook <event>` path is unchanged until this has been proven
// safe and .codex/hooks.json is deliberately updated to depend on it.

const IDLE_SHUTDOWN_MS = 30 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 150;
const REQUEST_TIMEOUT_MS = 5_000;

export interface SksdHookRequest {
  schema: 'sks.sksd-hook-request.v1';
  name: string;
  payload: unknown;
}

export interface SksdHookResponse {
  schema: 'sks.sksd-hook-response.v1';
  ok: boolean;
  result?: unknown;
  error?: string;
}

// Unix domain socket paths have a ~100 byte limit on macOS/Linux (see
// ZELLIJ_UNIX_SOCKET_PATH_LIMIT for the same constraint elsewhere in this
// codebase) — a deeply nested project path under .sneakoscope/ would
// routinely blow that. Keyed by a root hash under the OS tmpdir instead,
// same strategy as zellij's socket dir.
export function sksdSocketPath(root: string): string {
  return path.join(os.tmpdir(), `sksd-${sha256(path.resolve(root)).slice(0, 16)}.sock`);
}

function sksdPidFilePath(root: string): string {
  return path.join(os.tmpdir(), `sksd-${sha256(path.resolve(root)).slice(0, 16)}.pid.json`);
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface SksdHookDaemonHandle {
  close: () => Promise<void>;
}

// Called by the daemon entrypoint (registers real process signal handlers
// and exits the process on shutdown) and directly by tests (which own the
// returned handle's close() instead and must not have this call
// process.exit — that would kill the test runner).
export async function startSksdHookDaemon(root: string, handleHook: (name: string, payload: unknown) => Promise<unknown>): Promise<SksdHookDaemonHandle | null> {
  const socketPath = sksdSocketPath(root);
  const pidFilePath = sksdPidFilePath(root);

  const existingPid = await fsp.readFile(pidFilePath, 'utf8').then((raw) => JSON.parse(raw)?.pid, () => null);
  if (existingPid && pidAlive(existingPid)) {
    // Another daemon for this root is already up; nothing to do.
    return null;
  }
  await fsp.rm(socketPath, { force: true }).catch(() => undefined);
  await fsp.mkdir(path.dirname(pidFilePath), { recursive: true });
  await fsp.writeFile(pidFilePath, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), root }));

  let idleTimer: NodeJS.Timeout | null = null;
  const server = net.createServer((socket) => {
    resetIdleTimer();
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx === -1) return;
      const line = buffer.slice(0, newlineIdx);
      buffer = '';
      void respond(line);
    });
    async function respond(line: string) {
      let response: SksdHookResponse;
      try {
        const request = JSON.parse(line) as SksdHookRequest;
        const result = await handleHook(request.name, request.payload);
        response = { schema: 'sks.sksd-hook-response.v1', ok: true, result };
      } catch (err: unknown) {
        response = { schema: 'sks.sksd-hook-response.v1', ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      try {
        socket.write(`${JSON.stringify(response)}\n`);
      } catch {}
      socket.end();
      resetIdleTimer();
    }
    socket.on('error', () => undefined);
  });

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void idleShutdown(), IDLE_SHUTDOWN_MS);
    idleTimer.unref();
  }

  async function close(): Promise<void> {
    if (idleTimer) clearTimeout(idleTimer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fsp.rm(socketPath, { force: true }).catch(() => undefined);
    await fsp.rm(pidFilePath, { force: true }).catch(() => undefined);
  }

  async function idleShutdown() {
    await close();
    process.exit(0);
  }

  process.on('SIGTERM', () => void idleShutdown());
  process.on('SIGINT', () => void idleShutdown());

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  resetIdleTimer();
  return { close };
}

// Spawns the daemon as a detached background process running this same
// module's entrypoint, then returns immediately — the caller (a hook
// client that couldn't connect) does not wait for it to finish warming up;
// it falls back to handling the current call itself and lets the daemon
// serve the *next* call.
export function spawnSksdHookDaemonDetached(root: string): void {
  const entrypoint = fileURLToPath(new URL('./sksd-hook-daemon-entrypoint.js', import.meta.url));
  const child = spawn(process.execPath, [entrypoint, root], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

// Thin client used by `sks hook <event>`: attempt a fast socket round-trip;
// return null (never throws) if the daemon isn't reachable so the caller
// can fail open to the direct in-process path.
export async function callSksdHookDaemon(root: string, name: string, payload: unknown): Promise<{ ok: true; result: unknown } | null> {
  const socketPath = sksdSocketPath(root);
  if (!fs.existsSync(socketPath)) return null;
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    let settled = false;
    const finish = (value: { ok: true; result: unknown } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(requestTimer);
      socket.destroy();
      resolve(value);
    };
    const connectTimer = setTimeout(() => finish(null), CONNECT_TIMEOUT_MS);
    const requestTimer = setTimeout(() => finish(null), REQUEST_TIMEOUT_MS);
    let buffer = '';
    socket.on('connect', () => {
      clearTimeout(connectTimer);
      const request: SksdHookRequest = { schema: 'sks.sksd-hook-request.v1', name, payload };
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx === -1) return;
      try {
        const response = JSON.parse(buffer.slice(0, newlineIdx)) as SksdHookResponse;
        finish(response.ok ? { ok: true, result: response.result } : null);
      } catch {
        finish(null);
      }
    });
    socket.on('error', () => finish(null));
    socket.on('close', () => finish(null));
  });
}
