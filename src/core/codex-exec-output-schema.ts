import path from 'node:path';
import { exists, packageRoot, readJson, runProcess, which } from './fsx.js';
import { codexVersionPolicy, compareSemverLike, parseCodexVersionText } from './codex-compat/codex-version-policy.js';

export interface CodexExecResumeOutputSchemaAvailability {
  schema: 'sks.codex-exec-output-schema-availability.v1';
  ok: boolean;
  status: 'available' | 'integration_optional' | 'degraded_supported';
  codex_bin: string | null;
  version: string | null;
  output_schema_supported: boolean;
  output_last_message_supported: boolean;
  warnings: string[];
}

export interface CodexResumeOutputSchemaCommandInput {
  sessionId: string;
  prompt?: string;
  outputSchemaPath: string;
  outputFile?: string | null;
  json?: boolean;
  extraArgs?: readonly string[];
}

export async function detectCodexExecResumeOutputSchema(opts: any = {}): Promise<CodexExecResumeOutputSchemaAvailability> {
  const codexBin = opts.codexBin || await which('codex').catch(() => null);
  if (!codexBin) {
    return {
      schema: 'sks.codex-exec-output-schema-availability.v1',
      ok: true,
      status: 'integration_optional',
      codex_bin: null,
      version: null,
      output_schema_supported: false,
      output_last_message_supported: false,
      warnings: ['codex binary not detected; output-schema resume path is integration_optional']
    };
  }
  const versionResult = opts.versionText
    ? { code: 0, stdout: String(opts.versionText), stderr: '' }
    : await runProcess(codexBin, ['--version'], { timeoutMs: opts.timeoutMs || 3000, maxOutputBytes: 16 * 1024 });
  const helpResult = opts.resumeHelpText
    ? { code: 0, stdout: String(opts.resumeHelpText), stderr: '' }
    : await runProcess(codexBin, ['exec', 'resume', '--help'], { timeoutMs: opts.timeoutMs || 5000, maxOutputBytes: 64 * 1024 });
  const rawVersion = `${versionResult.stdout || ''}\n${versionResult.stderr || ''}`;
  const version = parseCodexVersionText(rawVersion);
  const help = `${helpResult.stdout || ''}\n${helpResult.stderr || ''}`;
  const outputSchemaSupported = /--output-schema\b/.test(help) || Boolean(version && compareSemverLike(version, '0.132.0') >= 0);
  const outputLastMessageSupported = /--output-last-message\b|-o,/.test(help);
  const policy = codexVersionPolicy({ available: Boolean(version), version, source: 'codex --version' });
  const status = policy.status === 'integration_optional'
    ? 'integration_optional'
    : outputSchemaSupported ? 'available' : 'degraded_supported';
  const warnings = [
    ...policy.warnings,
    ...(outputSchemaSupported ? [] : ['codex exec resume --output-schema unavailable; fallback is capped at verified_partial'])
  ];
  return {
    schema: 'sks.codex-exec-output-schema-availability.v1',
    ok: true,
    status,
    codex_bin: codexBin,
    version,
    output_schema_supported: outputSchemaSupported,
    output_last_message_supported: outputLastMessageSupported,
    warnings
  };
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
  const issues: string[] = [];
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  if (!row) issues.push('output_not_object');
  const required = Array.isArray(schema?.required) ? schema.required.map(String) : [];
  for (const key of required) {
    if (!row || !Object.hasOwn(row, key)) issues.push(`required:${key}`);
  }
  return { ok: issues.length === 0, issues };
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
