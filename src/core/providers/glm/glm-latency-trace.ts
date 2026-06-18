import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../../fsx.js';

export interface GlmLatencyTrace {
  readonly schema: 'sks.glm-latency-trace.v1';
  readonly version: '4.0.9';
  readonly mode: 'speed' | 'deep' | 'xhigh' | 'strict';
  readonly total_ms: number;
  readonly preflight_ms: number;
  readonly key_resolve_ms: number;
  readonly model_meta_ms: number;
  readonly task_classify_ms: number;
  readonly context_build_ms: number;
  readonly context_estimated_tokens: number;
  readonly context_cache_hit: boolean;
  readonly tool_schema_build_ms: number;
  readonly tool_schema_cache_hit: boolean;
  readonly request_build_ms: number;
  readonly request_encode_ms: number;
  readonly encoded_request_cache_hit: boolean;
  readonly openrouter_ttft_ms: number | null;
  readonly openrouter_total_ms: number | null;
  readonly output_parse_ms: number;
  readonly model_guard_ms: number;
  readonly patch_apply_ms: number;
  readonly deterministic_gate_ms: number;
  readonly proof_write_ms: number;
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly reasoning_tokens?: number;
  readonly cached_tokens?: number;
  readonly actual_model?: string;
  readonly provider?: string;
}

export function createEmptyGlmLatencyTrace(mode: GlmLatencyTrace['mode']): GlmLatencyTrace {
  return {
    schema: 'sks.glm-latency-trace.v1',
    version: '4.0.9',
    mode,
    total_ms: 0,
    preflight_ms: 0,
    key_resolve_ms: 0,
    model_meta_ms: 0,
    task_classify_ms: 0,
    context_build_ms: 0,
    context_estimated_tokens: 0,
    context_cache_hit: false,
    tool_schema_build_ms: 0,
    tool_schema_cache_hit: false,
    request_build_ms: 0,
    request_encode_ms: 0,
    encoded_request_cache_hit: false,
    openrouter_ttft_ms: null,
    openrouter_total_ms: null,
    output_parse_ms: 0,
    model_guard_ms: 0,
    patch_apply_ms: 0,
    deterministic_gate_ms: 0,
    proof_write_ms: 0
  };
}

export async function writeGlmLatencyTrace(root: string, trace: GlmLatencyTrace): Promise<string> {
  const safeTrace = redactTrace(trace);
  const filename = `${nowIso().replace(/[:.]/g, '-')}-glm-${trace.mode}-trace.json`;
  const out = path.join(root, '.sneakoscope', 'glm', 'traces', filename);
  await writeJsonAtomic(out, safeTrace);
  return out;
}

function redactTrace(trace: GlmLatencyTrace): GlmLatencyTrace {
  return JSON.parse(JSON.stringify(trace).replace(/sk-or-[A-Za-z0-9_-]+/g, 'sk-or-...redacted...')) as GlmLatencyTrace;
}
