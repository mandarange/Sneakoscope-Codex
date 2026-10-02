import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, exists, packageRoot, readJson, runProcess, which } from './fsx.js';
import { validateJsonSchemaRecursive } from './json-schema-validator.js';
import {
  inspectDesktopBridgeCliLaunchGuard,
  stripRetiredDirectProviderEnv,
  type DesktopBridgeLaunchGuard
} from './codex-control/desktop-bridge-launch-guard.js';
import { prepareCodexAppServerRuntimeEnv } from './codex-control/codex-app-server-runtime-env.js';

export interface CodexResumeOutputSchemaCommandInput {
  sessionId: string;
  prompt?: string;
  outputSchemaPath: string;
  outputFile?: string | null;
  json?: boolean;
  extraArgs?: readonly string[];
}

export interface CodexExecOutputSchemaCommandInput {
  prompt: string;
  outputSchemaPath: string;
  outputFile?: string | null;
  json?: boolean;
  extraArgs?: readonly string[];
}

export interface CodexExecResumeOutputSchemaRunResult {
  schema: 'sks.codex-exec-output-schema-run.v1';
  ok: boolean;
  status: 'parsed' | 'blocked' | 'integration_optional';
  args: string[];
  codex_bin: string | null;
  output_file: string | null;
  parsed_json: unknown | null;
  blocker: ReturnType<typeof structuredOutputBlocker> | null;
  validation: { ok: boolean; issues: string[] };
  stdout_tail: string;
  stderr_tail: string;
  timed_out: boolean;
  exit_code: number | null;
  desktop_bridge_launch_guard: DesktopBridgeLaunchGuard;
}

export async function buildCodexExecOutputSchemaArgs(input: CodexExecOutputSchemaCommandInput): Promise<string[]> {
  const schemaPath = path.resolve(input.outputSchemaPath);
  const schema = await assertCodexSchemaFile(schemaPath);
  if (!schema.ok) throw new Error(`Invalid output schema: ${schema.issues.join(', ')}`);
  const args = ['exec'];
  if (input.json !== false) args.push('--json');
  args.push('--output-schema', schemaPath);
  if (input.outputFile) args.push('--output-last-message', path.resolve(input.outputFile));
  args.push(...Array.from(input.extraArgs || []));
  args.push(String(input.prompt || ''));
  return args;
}

export async function codexSchemaPath(name: string): Promise<string> {
  const clean = String(name || '').replace(/[^A-Za-z0-9_.-]+/g, '');
  const file = clean.endsWith('.json') ? clean : `${clean}.schema.json`;
  const candidate = path.join(packageRoot(), 'schemas', 'codex', file);
  if (!(await exists(candidate))) throw new Error(`Codex output schema missing: ${candidate}`);
  return candidate;
}

export async function assertCodexSchemaFile(schemaPath: string): Promise<{ ok: boolean; path: string; schema_id: string | null; issues: string[] }> {
  const absolute = path.resolve(schemaPath);
  const issues: string[] = [];
  if (!(await exists(absolute))) issues.push('schema_file_missing');
  const parsed = issues.length ? null : await readJson<any>(absolute, null);
  if (!parsed || typeof parsed !== 'object') issues.push('schema_invalid_json');
  if (parsed && parsed.type !== 'object') issues.push('schema_root_type_not_object');
  return { ok: issues.length === 0, path: absolute, schema_id: parsed?.$id || parsed?.title || null, issues };
}

export async function buildCodexExecResumeOutputSchemaArgs(input: CodexResumeOutputSchemaCommandInput): Promise<string[]> {
  const sessionId = sanitizeResumeId(input.sessionId);
  const schemaPath = path.resolve(input.outputSchemaPath);
  const schema = await assertCodexSchemaFile(schemaPath);
  if (!schema.ok) throw new Error(`Invalid output schema: ${schema.issues.join(', ')}`);
  const args = ['exec', 'resume'];
  if (input.json !== false) args.push('--json');
  args.push('--output-schema', schemaPath);
  if (input.outputFile) args.push('-o', path.resolve(input.outputFile));
  args.push(...Array.from(input.extraArgs || []));
  args.push(sessionId);
  if (input.prompt) args.push(String(input.prompt));
  return args;
}

export async function runCodexExecResumeWithOutputSchema(
  input: CodexResumeOutputSchemaCommandInput,
  opts: { codexBin?: string | null; timeoutMs?: number; maxOutputBytes?: number; cwd?: string; env?: NodeJS.ProcessEnv; runProcessImpl?: typeof runProcess; prepareCodexRuntimeEnvImpl?: typeof prepareCodexAppServerRuntimeEnv } = {}
): Promise<CodexExecResumeOutputSchemaRunResult> {
  const root = opts.cwd || packageRoot();
  const env = stripRetiredDirectProviderEnv(await (opts.prepareCodexRuntimeEnvImpl || prepareCodexAppServerRuntimeEnv)({
    env: opts.env || process.env
  }));
  const launchGuard = await inspectDesktopBridgeCliLaunchGuard({
    root,
    env,
    cliArgs: input.extraArgs || []
  });
  if (!launchGuard.ok) {
    return {
      schema: 'sks.codex-exec-output-schema-run.v1',
      ok: false,
      status: 'blocked',
      args: [],
      codex_bin: opts.codexBin || null,
      output_file: null,
      parsed_json: null,
      blocker: structuredOutputBlocker('desktop_bridge_launch_guard_blocked', launchGuard.blockers.join(', ')),
      validation: { ok: false, issues: ['desktop_bridge_launch_guard_blocked'] },
      stdout_tail: '',
      stderr_tail: '',
      timed_out: false,
      exit_code: null,
      desktop_bridge_launch_guard: launchGuard
    };
  }
  const codexBin = opts.codexBin || await which('codex').catch(() => null);
  if (!codexBin) {
    return {
      schema: 'sks.codex-exec-output-schema-run.v1',
      ok: false,
      status: 'integration_optional',
      args: [],
      codex_bin: null,
      output_file: null,
      parsed_json: null,
      blocker: structuredOutputBlocker('output_schema_unavailable', 'codex binary not detected; output-schema resume path is integration_optional'),
      validation: { ok: false, issues: ['output_schema_unavailable'] },
      stdout_tail: '',
      stderr_tail: '',
      timed_out: false,
      exit_code: null,
      desktop_bridge_launch_guard: launchGuard
    };
  }

  const outputFile = input.outputFile
    ? path.resolve(input.outputFile)
    : path.join(packageRoot(), '.sneakoscope', 'tmp', `codex-output-schema-${Date.now()}.json`);
  await ensureDir(path.dirname(outputFile));
  const args = await buildCodexExecResumeOutputSchemaArgs({ ...input, outputFile });
  const runOpts: Parameters<typeof runProcess>[2] = {
    cwd: root,
    timeoutMs: opts.timeoutMs || 120_000,
    maxOutputBytes: opts.maxOutputBytes || 256 * 1024
  };
  runOpts.env = env;
  const result = await (opts.runProcessImpl || runProcess)(codexBin, args, runOpts);
  const outputText = await readOutputText(outputFile, result.stdout);
  const parsed = parseStructuredCodexOutput(outputText);
  const schema = await readJson<any>(path.resolve(input.outputSchemaPath), null);
  const validation = parsed.ok ? validateStructuredOutput(parsed.value, schema) : { ok: false, issues: ['json_parse_failed'] };
  const blocker = !parsed.ok
    ? parsed.blocker
    : validation.ok
      ? null
      : structuredOutputBlocker('schema_validation_failed', validation.issues.join(', '));
  return {
    schema: 'sks.codex-exec-output-schema-run.v1',
    ok: result.code === 0 && parsed.ok && validation.ok,
    status: result.code === 0 && parsed.ok && validation.ok ? 'parsed' : 'blocked',
    args,
    codex_bin: codexBin,
    output_file: outputFile,
    parsed_json: parsed.ok ? parsed.value : null,
    blocker,
    validation,
    stdout_tail: redactCodexOutput(result.stdout).slice(-12_000),
    stderr_tail: redactCodexOutput(result.stderr).slice(-12_000),
    timed_out: result.timedOut,
    exit_code: result.code,
    desktop_bridge_launch_guard: launchGuard
  };
}

export function parseStructuredCodexOutput(text: unknown): { ok: boolean; value: unknown | null; blocker: any | null } {
  const raw = String(text || '').trim();
  if (!raw) {
    return { ok: false, value: null, blocker: structuredOutputBlocker('json_parse_failed', 'empty output') };
  }
  try {
    return { ok: true, value: JSON.parse(raw), blocker: null };
  } catch (err) {
    return { ok: false, value: null, blocker: structuredOutputBlocker('json_parse_failed', err instanceof Error ? err.message : String(err)) };
  }
}

export function validateStructuredOutput(value: unknown, schema: any): { ok: boolean; issues: string[] } {
  return validateJsonSchemaRecursive(value, schema);
}

export function structuredOutputBlocker(reason: string, detail: string) {
  return {
    schema: 'sks.codex-structured-output-blocker.v1',
    reason,
    detail: redactCodexOutput(detail),
    status: 'verified_partial_or_blocked',
    wrongness_kind: reason === 'schema_validation_failed' ? 'callout_extraction_schema_failed' : 'missing_evidence'
  };
}

export function redactCodexOutput(text: unknown): string {
  return String(text || '')
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_OPENAI_KEY]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[REDACTED_GITHUB_PAT]')
    .slice(0, 12_000);
}

function sanitizeResumeId(value: unknown): string {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(id)) throw new Error('Unsafe Codex resume session id');
  return id;
}

async function readOutputText(outputFile: string, stdout: string) {
  try {
    const text = await fsp.readFile(outputFile, 'utf8');
    if (text.trim()) return text;
  } catch {}
  return stdout;
}
