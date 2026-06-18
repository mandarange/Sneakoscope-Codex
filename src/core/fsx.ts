import fs from 'node:fs';
import type { WriteStream } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PACKAGE_VERSION = '4.0.2';
export const DEFAULT_PROCESS_TAIL_BYTES = 256 * 1024;
export const DEFAULT_PROCESS_TIMEOUT_MS = 30 * 60 * 1000;

export interface RunProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string | Buffer;
  timeoutMs?: number;
  maxOutputBytes?: number;
  stdoutFile?: string;
  stderrFile?: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface RunProcessResult {
  code: number | null;
  pid?: number | undefined;
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;
  timedOut: boolean;
}

export interface ListFilesOptions {
  ignore?: string[];
  maxFiles?: number;
  maxDepth?: number;
}

export interface TailBufferSnapshot {
  text: string;
  bytes: number;
  totalBytes: number;
  truncated: boolean;
}

export type JsonData = ReturnType<typeof JSON.parse>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomId(len = 6): string {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(p: string): Promise<void> {
  await fsp.mkdir(p, { recursive: true });
}

export async function readText(p: string): Promise<string>;
export async function readText<T>(p: string, fallback: T): Promise<string | T>;
export async function readText<T>(p: string, fallback?: T): Promise<string | T> {
  try {
    return await fsp.readFile(p, 'utf8');
  } catch (err: unknown) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export async function writeTextAtomic(p: string, text: string): Promise<void> {
  await ensureDir(path.dirname(p));
  try {
    if ((await fsp.readFile(p, 'utf8')) === text) return;
  } catch {}
  const tmp = `${p}.${process.pid}.${randomId(6)}.tmp`;
  try {
    const handle = await fsp.open(tmp, 'w');
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync().catch(() => {});
    } finally {
      await handle.close().catch(() => {});
    }
    await fsp.rename(tmp, p);
  } catch (err: unknown) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    if (!canFallbackToDirectWrite(err)) throw err;
    try {
      await ensureDir(path.dirname(p));
      await fsp.writeFile(p, text, 'utf8');
    } catch (fallbackErr: unknown) {
      const error = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
      error.message = `Atomic write failed (${errorMessage(err)}); direct write fallback failed: ${error.message}`;
      throw error;
    }
  }
}

function canFallbackToDirectWrite(err: unknown): boolean {
  return ['EACCES', 'EEXIST', 'ENOENT', 'ENOTEMPTY', 'EPERM', 'EXDEV'].includes(errorCode(err));
}

function errorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) return String(err.code);
  return '';
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String(err.message);
  return String(err);
}

export async function readJson<T = unknown>(p: string): Promise<T>;
export async function readJson(p: string, fallback: null): Promise<JsonData | null>;
export async function readJson(p: string, fallback: readonly unknown[]): Promise<JsonData>;
export async function readJson(p: string, fallback: object): Promise<JsonData>;
export async function readJson<T>(p: string, fallback: T): Promise<T>;
export async function readJson<T = unknown>(p: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8')) as T;
  } catch (err: unknown) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export async function writeJsonAtomic<T>(p: string, data: T): Promise<void> {
  await writeTextAtomic(p, `${JSON.stringify(data, null, 2)}\n`);
}

export async function writeBinaryAtomic(p: string, data: Buffer): Promise<void> {
  await ensureDir(path.dirname(p));
  try {
    if ((await fsp.readFile(p)).equals(data)) return;
  } catch {}
  const tmp = `${p}.${process.pid}.${randomId(6)}.tmp`;
  try {
    const handle = await fsp.open(tmp, 'w');
    try {
      await handle.writeFile(data);
      await handle.sync().catch(() => {});
    } finally {
      await handle.close().catch(() => {});
    }
    await fsp.rename(tmp, p);
  } catch (err: unknown) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

export async function appendJsonl(p: string, obj: unknown): Promise<void> {
  await ensureDir(path.dirname(p));
  await fsp.appendFile(p, `${JSON.stringify(obj)}\n`, 'utf8');
}

export async function appendJsonlBounded(
  p: string,
  obj: unknown,
  maxBytes: number = 5 * 1024 * 1024
): Promise<void> {
  await appendJsonl(p, obj);
  try {
    const st = await fsp.stat(p);
    if (st.size <= maxBytes) return;
    const keep = Math.max(1024, Math.floor(maxBytes / 2));
    const handle = await fsp.open(p, 'r');
    try {
      const start = Math.max(0, st.size - keep);
      const buf = Buffer.alloc(st.size - start);
      await handle.read(buf, 0, buf.length, start);
      const marker = Buffer.from(
        `${JSON.stringify({ ts: nowIso(), type: 'log.rotated', kept_tail_bytes: buf.length })}\n`
      );
      await writeTextAtomic(
        p,
        `${marker.toString('utf8')}${buf.toString('utf8').replace(/^.*?\n/, '')}`
      );
    } finally {
      await handle.close().catch(() => {});
    }
  } catch {}
}

export async function copyFileIfMissing(src: string, dest: string): Promise<boolean> {
  if (await exists(dest)) return false;
  await ensureDir(path.dirname(dest));
  await fsp.copyFile(src, dest);
  return true;
}

export async function mergeManagedBlock(
  file: string,
  markerName: string,
  content: string
): Promise<'created' | 'updated' | 'appended'> {
  const begin = `<!-- BEGIN ${markerName} -->`;
  const end = `<!-- END ${markerName} -->`;
  const block = `${begin}\n${content.trim()}\n${end}\n`;
  const current = await readText(file, '');
  if (!current.trim()) {
    await writeTextAtomic(file, `${block}\n`);
    return 'created';
  }
  const beginIdx = current.indexOf(begin);
  const endIdx = current.indexOf(end);
  if (beginIdx >= 0 && endIdx >= beginIdx) {
    const afterEnd = endIdx + end.length;
    const next = `${current.slice(0, beginIdx)}${block}${current.slice(afterEnd).replace(/^\n/, '')}`;
    await writeTextAtomic(file, next);
    return 'updated';
  }
  await writeTextAtomic(file, `${current.replace(/\s*$/, '\n\n')}${block}\n`);
  return 'appended';
}

export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function cwd(): string {
  return process.cwd();
}

export async function findUp(start: string, names: string[]): Promise<string | null> {
  let dir = path.resolve(start);
  const fsRoot = path.parse(dir).root;
  while (true) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (await exists(candidate)) return candidate;
    }
    if (dir === fsRoot) return null;
    dir = path.dirname(dir);
  }
}

export async function findProjectRoot(start: string = process.cwd()): Promise<string | null> {
  const resolved = path.resolve(start);
  const sine = await findUp(resolved, ['.sneakoscope', '.dcodex']);
  if (sine) {
    const rootDir = path.dirname(sine);
    if (rootDir !== path.parse(rootDir).root) return rootDir;
  }
  const git = await findUp(resolved, ['.git']);
  if (git) {
    const rootDir = path.dirname(git);
    if (rootDir !== path.parse(rootDir).root) return rootDir;
  }
  return null;
}

export function globalSksRoot(): string {
  if (process.env.SKS_GLOBAL_ROOT) return path.resolve(process.env.SKS_GLOBAL_ROOT);
  return path.join(process.env.HOME || os.homedir(), '.sneakoscope-global');
}

export async function sksRoot(start: string = process.cwd()): Promise<string> {
  return (await findProjectRoot(start)) || globalSksRoot();
}

export async function projectRoot(start: string = process.cwd()): Promise<string> {
  const resolved = path.resolve(start);
  const root = await findProjectRoot(resolved);
  if (root) return root;
  return resolved;
}

export async function isGitRepo(root: string = process.cwd()): Promise<boolean> {
  return exists(path.join(root, '.git'));
}

export function rel(root: string, p: string): string {
  return path.relative(root, p).split(path.sep).join('/');
}

export async function listFilesRecursive(dir: string, opts: ListFilesOptions = {}): Promise<string[]> {
  const {
    ignore = ['.git', 'node_modules', '.sneakoscope/arenas', '.sneakoscope/tmp'],
    maxFiles = 50000,
    maxDepth = 40,
  } = opts;
  const out: string[] = [];
  async function walk(d: string, depth: number): Promise<void> {
    if (out.length >= maxFiles || depth > maxDepth) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const fp = path.join(d, e.name);
      const rp = rel(dir, fp);
      if (ignore.some((ig) => rp === ig || rp.startsWith(`${ig}/`))) continue;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) await walk(fp, depth + 1);
      else if (e.isFile()) out.push(fp);
    }
  }
  await walk(dir, 0);
  return out;
}

export async function which(cmd: string): Promise<string | null> {
  const paths = (process.env.PATH || '').split(path.delimiter);
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const p of paths) {
    for (const ext of exts) {
      const candidate = path.join(p, `${cmd}${ext}`);
      if (await exists(candidate)) return candidate;
    }
  }
  return null;
}

export class TailBuffer {
  private readonly limit: number;
  private parts: Buffer[];
  private bytes: number;
  private totalBytes: number;
  private truncatedFlag: boolean;

  constructor(limitBytes?: number) {
    this.limit = Math.max(1024, limitBytes ?? DEFAULT_PROCESS_TAIL_BYTES);
    this.parts = [];
    this.bytes = 0;
    this.totalBytes = 0;
    this.truncatedFlag = false;
  }

  push(chunk: Buffer | string): void {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    this.parts.push(buf);
    this.bytes += buf.length;
    this.totalBytes += buf.length;
    while (this.bytes > this.limit && this.parts.length) {
      const first = this.parts[0];
      const excess = this.bytes - this.limit;
      this.truncatedFlag = true;
      if (!first || first.length <= excess) {
        const head = this.parts.shift();
        if (head) this.bytes -= head.length;
      } else {
        this.parts[0] = first.subarray(excess);
        this.bytes -= excess;
      }
    }
  }

  text(): string {
    return Buffer.concat(this.parts, this.bytes).toString('utf8');
  }

  snapshot(): TailBufferSnapshot {
    return {
      text: this.text(),
      bytes: this.bytes,
      totalBytes: this.totalBytes,
      truncated: this.truncatedFlag,
    };
  }

  get truncated(): boolean {
    return this.truncatedFlag;
  }

  get totalBytesCounted(): number {
    return this.totalBytes;
  }
}

export function runProcess(
  command: string,
  args: readonly string[],
  options: RunProcessOptions = {}
): Promise<RunProcessResult> {
  return new Promise<RunProcessResult>((resolve) => {
    const tailBytes = options.maxOutputBytes ?? DEFAULT_PROCESS_TAIL_BYTES;
    const stdoutTail = new TailBuffer(tailBytes);
    const stderrTail = new TailBuffer(tailBytes);
    const timeoutMs = options.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;
    let killedByTimeout = false;
    let settled = false;
    let stdoutStream: WriteStream | null = null;
    let stderrStream: WriteStream | null = null;

    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
      stdio: [options.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    if (options.input !== undefined && child.stdin) {
      child.stdin.end(options.input);
    }

    const finish = async (result: RunProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        await stdoutStream?.end?.();
      } catch {}
      try {
        await stderrStream?.end?.();
      } catch {}
      resolve(result);
    };

    if (options.stdoutFile) {
      fs.mkdirSync(path.dirname(options.stdoutFile), { recursive: true });
      stdoutStream = fs.createWriteStream(options.stdoutFile, { flags: 'a' });
    }
    if (options.stderrFile) {
      fs.mkdirSync(path.dirname(options.stderrFile), { recursive: true });
      stderrStream = fs.createWriteStream(options.stderrFile, { flags: 'a' });
    }

    const timer = setTimeout(() => {
      killedByTimeout = true;
      try {
        child.kill('SIGTERM');
      } catch {}
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {}
      }, 1500).unref?.();
    }, timeoutMs);
    timer.unref?.();

    child.stdout?.on('data', (d: Buffer) => {
      stdoutTail.push(d);
      stdoutStream?.write(d);
      options.onStdout?.(d.toString());
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderrTail.push(d);
      stderrStream?.write(d);
      options.onStderr?.(d.toString());
    });
    child.on('error', (err: Error) =>
      void finish({
        code: -1,
        pid: child.pid,
        stdout: stdoutTail.text(),
        stderr: `${stderrTail.text()}${err.message}`,
        stdoutBytes: stdoutTail.totalBytesCounted,
        stderrBytes: stderrTail.totalBytesCounted,
        truncated: stdoutTail.truncated || stderrTail.truncated,
        timedOut: killedByTimeout,
      })
    );
    child.on('close', (code: number | null) =>
      void finish({
        code: killedByTimeout ? 124 : code,
        pid: child.pid,
        stdout: stdoutTail.text(),
        stderr: stderrTail.text(),
        stdoutBytes: stdoutTail.totalBytesCounted,
        stderrBytes: stderrTail.totalBytesCounted,
        truncated: stdoutTail.truncated || stderrTail.truncated,
        timedOut: killedByTimeout,
      })
    );
  });
}

export async function readStdin(): Promise<string> {
  return new Promise<string>((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
  });
}

export function tmpdir(prefix = 'sks-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export async function fileSize(p: string): Promise<number> {
  try {
    return (await fsp.stat(p)).size;
  } catch {
    return 0;
  }
}

export async function dirSize(dir: string, opts: ListFilesOptions = {}): Promise<number> {
  let total = 0;
  const files = await listFilesRecursive(dir, opts);
  for (const f of files) total += await fileSize(f);
  return total;
}

export function formatBytes(bytes: unknown): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = Number(bytes) || 0;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

export async function rmrf(p: string): Promise<void> {
  await fsp.rm(p, { recursive: true, force: true });
}
