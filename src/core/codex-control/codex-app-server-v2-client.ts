import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { nowIso, PACKAGE_VERSION } from '../fsx.js';
import { resolveCodexRuntime, type CodexRuntimeIdentity } from '../codex-runtime/resolve-codex-runtime.js';

type JsonRpcId = number | string;
type JsonObject = Record<string, unknown>;

interface PendingRequest {
  readonly method: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason?: unknown) => void;
  readonly timer: NodeJS.Timeout;
}

export interface CodexAppServerCurrentTime {
  readonly utcIso: string;
  readonly unixTimeSeconds: number;
  readonly unixTimeMilliseconds: number;
  readonly timezone: 'UTC';
}

export interface CodexAppServerV2ClientOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly currentTimeProvider?: () => Date;
}

export interface CodexAppServerThreadListParams {
  readonly archived?: boolean | null;
  readonly cursor?: string | null;
  readonly cwd?: string | readonly string[] | null;
  readonly limit?: number | null;
  readonly modelProviders?: readonly string[] | null;
  readonly searchTerm?: string | null;
  readonly sortDirection?: 'asc' | 'desc' | null;
  readonly sortKey?: string | null;
  readonly sourceKinds?: readonly string[] | null;
  readonly useStateDbOnly?: boolean;
}

export interface CodexAppServerV2ClientFactoryOptions extends Omit<CodexAppServerV2ClientOptions, 'command'> {
  readonly codexBin?: string | null;
  readonly requestedBy?: string;
}

export class CodexAppServerV2Client {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly currentTimeProvider: () => Date;
  child: ChildProcessWithoutNullStreams | null = null;
  nextId = 1;
  pending = new Map<JsonRpcId, PendingRequest>();
  notifications: JsonObject[] = [];
  stdoutBuffer = '';
  stderr = '';

  constructor(options: CodexAppServerV2ClientOptions) {
    this.command = options.command;
    this.args = options.args || ['app-server', '--stdio'];
    this.env = options.env || process.env;
    this.cwd = options.cwd || process.cwd();
    this.timeoutMs = Number(options.timeoutMs || 20_000);
    this.currentTimeProvider = options.currentTimeProvider || (() => new Date());
  }

  async initialize(): Promise<unknown> {
    this.start();
    const result = await this.request('initialize', {
      clientInfo: {
        name: 'sneakoscope-codex-app-server-v2',
        title: 'Sneakoscope Codex app-server v2',
        version: PACKAGE_VERSION
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: []
      }
    });
    this.notify('notifications/initialized', {});
    return result;
  }

  async listThreads(params: CodexAppServerThreadListParams = {}): Promise<unknown> {
    return await this.request('thread/list', normalizeThreadListParams(params));
  }

  async searchThreads(searchTerm: string, params: Omit<CodexAppServerThreadListParams, 'searchTerm'> = {}): Promise<unknown> {
    return await this.listThreads({ ...params, searchTerm });
  }

  async readThread(threadId: string, includeTurns = false): Promise<unknown> {
    return await this.request('thread/read', { threadId, includeTurns });
  }

  start(): void {
    if (this.child) return;
    this.child = spawn(this.command, [...this.args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env: this.env,
      cwd: this.cwd
    });
    this.child.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk));
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString('utf8');
      if (this.stderr.length > 64 * 1024) this.stderr = this.stderr.slice(-64 * 1024);
    });
    this.child.on('error', (err: Error) => this.rejectAll(err));
    this.child.on('close', (code, signal) => {
      this.rejectAll(new Error(`Codex app-server exited before response (code ${code ?? signal ?? 'unknown'}). ${this.stderr.trim()}`.trim()));
    });
  }

  request(method: string, params: JsonObject): Promise<unknown> {
    this.start();
    const id = this.nextId++;
    const message = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}. ${this.stderr.trim()}`.trim()));
      }, this.timeoutMs);
      timer.unref?.();
      this.pending.set(id, { method, resolve, reject, timer });
      this.write(message);
    });
  }

  notify(method: string, params: JsonObject): void {
    this.start();
    this.write({ jsonrpc: '2.0', method, params });
  }

  handleStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString('utf8');
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message: JsonObject;
      try {
        message = JSON.parse(line) as JsonObject;
      } catch {
        continue;
      }
      if (message.id !== undefined && this.pending.has(message.id as JsonRpcId)) {
        this.resolvePending(message);
      } else if (message.id !== undefined && typeof message.method === 'string') {
        void this.respondToServerRequest(message);
      } else {
        this.notifications.push({ ...message, received_at: nowIso() });
      }
    }
  }

  async respondToServerRequest(message: JsonObject): Promise<void> {
    const id = message.id as JsonRpcId;
    const method = String(message.method || '');
    try {
      if (method === 'currentTime/read') {
        this.write({ jsonrpc: '2.0', id, result: currentTimeResponse(this.currentTimeProvider()) });
        return;
      }
      this.write({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unsupported Codex app-server request: ${method}` }
      });
    } catch (err: unknown) {
      this.write({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err instanceof Error ? err.message : String(err) }
      });
    }
  }

  resolvePending(message: JsonObject): void {
    const id = message.id as JsonRpcId;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(jsonRpcErrorMessage(pending.method, message.error)));
    else pending.resolve(message.result);
  }

  rejectAll(err: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.pending.delete(id);
    }
  }

  async close(): Promise<void> {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    child.stdin.end();
    child.kill('SIGTERM');
  }

  private write(message: JsonObject): void {
    this.child?.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

export async function createCodexAppServerV2Client(
  options: CodexAppServerV2ClientFactoryOptions = {}
): Promise<{ client: CodexAppServerV2Client; runtimeIdentity: CodexRuntimeIdentity }> {
  const runtime = await resolveCodexRuntime({
    explicitPath: options.codexBin || null,
    requestedBy: options.requestedBy || 'codex-app-server-v2-client'
  });
  if (!runtime.identity) throw new Error(`Codex runtime not found: ${runtime.blockers.join(',')}`);
  const clientOptions: {
    command: string;
    args?: readonly string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    currentTimeProvider?: () => Date;
  } = { command: runtime.identity.realpath };
  if (options.args !== undefined) clientOptions.args = options.args;
  if (options.cwd !== undefined) clientOptions.cwd = options.cwd;
  if (options.env !== undefined) clientOptions.env = options.env;
  if (options.timeoutMs !== undefined) clientOptions.timeoutMs = options.timeoutMs;
  if (options.currentTimeProvider !== undefined) clientOptions.currentTimeProvider = options.currentTimeProvider;
  return {
    client: new CodexAppServerV2Client(clientOptions),
    runtimeIdentity: runtime.identity
  };
}

export function currentTimeResponse(date: Date): CodexAppServerCurrentTime {
  return {
    utcIso: date.toISOString(),
    unixTimeSeconds: Math.floor(date.getTime() / 1000),
    unixTimeMilliseconds: date.getTime(),
    timezone: 'UTC'
  };
}

function normalizeThreadListParams(params: CodexAppServerThreadListParams): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function jsonRpcErrorMessage(method: string, error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return `${method}: ${String(error.message)}`;
  return `${method}: ${JSON.stringify(error)}`;
}
