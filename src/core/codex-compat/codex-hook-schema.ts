import path from 'node:path';
import { exists, projectRoot, readJson } from '../fsx.js';
import { CODEX_HOOK_EVENTS, type CodexHookEventName, codexHookEventName, readCodexHookSchema } from './codex-schema-snapshot.js';
import { validateCodexHookSemanticOutput, type CodexHookSemanticValidation } from './codex-hook-semantic-validator.js';

export type CodexSchemaValidation = {
  ok: boolean;
  event: CodexHookEventName;
  issues: string[];
};

export type CodexHookOutputValidation = CodexSchemaValidation & {
  semantic: CodexHookSemanticValidation;
};

export async function validateCodexHookOutput(eventLike: unknown, output: unknown): Promise<CodexSchemaValidation> {
  const event = codexHookEventName(eventLike) || 'UserPromptSubmit';
  const schema = await readCodexHookSchema(event, 'output');
  const issues = validateJsonValue(output, schema, schema, '$');
  return { ok: issues.length === 0, event, issues };
}

export async function validateCodexFixtureOutputs(root?: string) {
  root ||= await projectRoot();
  const fixtureRoot = path.join(root, 'test', 'fixtures', 'codex-hooks', 'rust-v0.131.0');
  const outputs = [];
  for (const event of CODEX_HOOK_EVENTS) {
    const candidates = await expectedOutputFilesForEvent(fixtureRoot, event);
    for (const file of candidates) {
      const output = await readJson(file, {});
      const validation = await validateCodexHookOutput(event, output);
      const semantic = validateCodexHookSemanticOutput(event, output);
      outputs.push({
        file,
        ...validation,
        semantic,
        ok: validation.ok && semantic.ok,
        issues: [
          ...validation.issues,
          ...semantic.warnings.map((issue) => `semantic_warning:${issue}`),
          ...semantic.unsupported.map((issue) => `semantic_unsupported:${issue}`),
          ...semantic.fatal.map((issue) => `semantic_fatal:${issue}`)
        ]
      });
    }
  }
  const ok = outputs.length > 0 && outputs.every((row) => row.ok);
  return {
    schema: 'sks.codex-hook-fixture-validation.v1',
    ok,
    fixture_root: fixtureRoot,
    checked: outputs.length,
    outputs
  };
}

async function expectedOutputFilesForEvent(fixtureRoot: string, event: CodexHookEventName): Promise<string[]> {
  if (!(await exists(fixtureRoot))) return [];
  const fs = await import('node:fs/promises');
  const eventStem = {
    PreToolUse: 'pre-tool-use',
    PermissionRequest: 'permission-request',
    PostToolUse: 'post-tool-use',
    PreCompact: 'pre-compact',
    PostCompact: 'post-compact',
    SessionStart: 'session-start',
    UserPromptSubmit: 'user-prompt-submit',
    Stop: 'stop'
  }[event];
  const entries = await fs.readdir(fixtureRoot).catch(() => []);
  return entries
    .filter((entry) => entry.startsWith(eventStem) && entry.endsWith('.output.expected.json'))
    .map((entry) => path.join(fixtureRoot, entry));
}

function validateJsonValue(value: any, schema: any, root: any, pointer: string): string[] {
  const issues: string[] = [];
  if (!schema || typeof schema !== 'object') return issues;
  if (schema.$ref) return validateJsonValue(value, resolveRef(root, schema.$ref), root, pointer);
  for (const child of schema.allOf || []) issues.push(...validateJsonValue(value, child, root, pointer));
  if (schema.const !== undefined && value !== schema.const) issues.push(`${pointer}:const`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) issues.push(`${pointer}:enum`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type: string) => matchesJsonType(value, type))) issues.push(`${pointer}:type:${types.join('|')}`);
  }
  if (schema.type === 'object' || schema.properties || schema.additionalProperties === false) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return issues;
    const properties = schema.properties || {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) issues.push(`${pointer}.${key}:required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) issues.push(`${pointer}.${key}:unknown_field`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        issues.push(...validateJsonValue(value[key], childSchema, root, `${pointer}.${key}`));
      }
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => issues.push(...validateJsonValue(item, schema.items, root, `${pointer}[${index}]`)));
  }
  return issues;
}

function resolveRef(root: any, ref: string) {
  if (!ref.startsWith('#/')) return {};
  return ref.slice(2).split('/').reduce((node: any, part) => node?.[part], root) || {};
}

function matchesJsonType(value: unknown, type: string): boolean {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}
