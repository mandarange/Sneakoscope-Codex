import fsp from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './fsx.js';
import { redactCodexOutput, structuredOutputBlocker, validateStructuredOutput } from './codex-exec-output-schema.js';

export interface StructuredOutputAdapterRequest {
  model?: string;
  apiKey?: string | null;
  prompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  imagePath?: string | null;
  timeoutMs?: number;
}

export interface StructuredOutputAdapterResult {
  schema: 'sks.structured-output-adapter-result.v1';
  ok: boolean;
  status: 'parsed' | 'blocked' | 'integration_optional';
  provider: 'openai_responses_text_format';
  model: string;
  parsed_json: unknown | null;
  validation: { ok: boolean; issues: string[] };
  blocker: ReturnType<typeof structuredOutputBlocker> | null;
  setup_guidance: string | null;
  source_sha256: string | null;
}

export function strictJsonSchemaFormat(schemaName: string, jsonSchema: Record<string, unknown>) {
  const normalized = ensureStrictObjectSchema(jsonSchema);
  return {
    type: 'json_schema',
    name: schemaName.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 64) || 'sks_schema',
    strict: true,
    schema: normalized
  };
}

export function ensureStrictObjectSchema(schema: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...schema };
  if (next.type !== 'object') next.type = 'object';
  const properties = next.properties && typeof next.properties === 'object'
    ? next.properties as Record<string, unknown>
    : {};
  next.properties = Object.fromEntries(Object.entries(properties).map(([key, value]) => [
    key,
    value && typeof value === 'object' && !Array.isArray(value)
      ? ensureNestedStrictSchema(value as Record<string, unknown>)
      : value
  ]));
  next.required = Object.keys(properties);
  next.additionalProperties = false;
  return next;
}

export async function runOpenAIStructuredOutput(request: StructuredOutputAdapterRequest): Promise<StructuredOutputAdapterResult> {
  const model = String(request.model || process.env.OPENAI_STRUCTURED_OUTPUT_MODEL || '').trim();
  const apiKey = request.apiKey || process.env.OPENAI_API_KEY || null;
  const sourceSha = request.imagePath ? sha256(await fsp.readFile(path.resolve(request.imagePath))) : null;
  if (!model) {
    return {
      schema: 'sks.structured-output-adapter-result.v1',
      ok: false,
      status: 'integration_optional',
      provider: 'openai_responses_text_format',
      model: '',
      parsed_json: null,
      validation: { ok: false, issues: ['openai_structured_output_model_missing'] },
      blocker: structuredOutputBlocker('openai_structured_output_model_missing', 'Pass request.model or set OPENAI_STRUCTURED_OUTPUT_MODEL; SKS does not invent a model identifier.'),
      setup_guidance: 'Choose any model available to your OpenAI account and pass it explicitly, or use Codex structured output so the current Codex selection is inherited.',
      source_sha256: sourceSha
    };
  }
  if (!apiKey) {
    return {
      schema: 'sks.structured-output-adapter-result.v1',
      ok: false,
      status: 'integration_optional',
      provider: 'openai_responses_text_format',
      model,
      parsed_json: null,
      validation: { ok: false, issues: ['openai_api_key_missing'] },
      blocker: structuredOutputBlocker('openai_api_key_missing', 'Set OPENAI_API_KEY to enable Structured Outputs fallback.'),
      setup_guidance: 'Set OPENAI_API_KEY or use Codex 0.133 codex exec resume --output-schema; do not accept unstructured extraction as verified evidence.',
      source_sha256: sourceSha
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs || 120_000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: await structuredInputContent(request)
          }
        ],
        text: { format: strictJsonSchemaFormat(request.schemaName, request.jsonSchema) }
      }),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      return blockedResult(model, 'openai_structured_output_api_error', redactCodexOutput(text), sourceSha);
    }
    const payload = JSON.parse(text) as Record<string, unknown>;
    const parsed = (payload as any).output_parsed || parseResponseOutputText(payload);
    if (!parsed || typeof parsed !== 'object') return blockedResult(model, 'json_parse_failed', 'Responses output did not contain parsed JSON.', sourceSha);
    const strictSchema = strictJsonSchemaFormat(request.schemaName, request.jsonSchema).schema;
    const validation = validateStructuredOutput(parsed, strictSchema);
    return {
      schema: 'sks.structured-output-adapter-result.v1',
      ok: validation.ok,
      status: validation.ok ? 'parsed' : 'blocked',
      provider: 'openai_responses_text_format',
      model,
      parsed_json: validation.ok ? parsed : null,
      validation,
      blocker: validation.ok ? null : structuredOutputBlocker('schema_validation_failed', validation.issues.join(', ')),
      setup_guidance: null,
      source_sha256: sourceSha
    };
  } catch (err: unknown) {
    return blockedResult(model, 'openai_structured_output_api_error', err instanceof Error ? err.message : String(err), sourceSha);
  } finally {
    clearTimeout(timer);
  }
}

async function structuredInputContent(request: StructuredOutputAdapterRequest) {
  const parts: any[] = [{ type: 'input_text', text: request.prompt }];
  if (request.imagePath) {
    const absolute = path.resolve(request.imagePath);
    const data = await fsp.readFile(absolute);
    const mime = mimeForPath(absolute);
    parts.push({ type: 'input_image', image_url: `data:${mime};base64,${data.toString('base64')}` });
  }
  return parts;
}

function ensureNestedStrictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type === 'object' || schema.properties) return ensureStrictObjectSchema(schema);
  if (schema.type === 'array' && schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
    return { ...schema, items: ensureNestedStrictSchema(schema.items as Record<string, unknown>) };
  }
  return schema;
}

function parseResponseOutputText(payload: Record<string, unknown>) {
  const chunks = Array.isArray((payload as any).output) ? (payload as any).output : [];
  for (const item of chunks) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.parsed) return part.parsed;
      if (typeof part?.text === 'string') {
        try { return JSON.parse(part.text); } catch {}
      }
    }
  }
  return null;
}

function blockedResult(model: string, reason: string, detail: string, sourceSha: string | null): StructuredOutputAdapterResult {
  return {
    schema: 'sks.structured-output-adapter-result.v1',
    ok: false,
    status: 'blocked',
    provider: 'openai_responses_text_format',
    model,
    parsed_json: null,
    validation: { ok: false, issues: [reason] },
    blocker: structuredOutputBlocker(reason, redactCodexOutput(detail)),
    setup_guidance: null,
    source_sha256: sourceSha
  };
}

function mimeForPath(file: string) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}
