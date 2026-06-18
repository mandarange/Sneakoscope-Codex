import readline from 'node:readline/promises';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { printJson } from '../../../cli/output.js';
import { flag } from '../../../cli/args.js';
import { nowIso, writeJsonAtomic } from '../../fsx.js';
import type { SksResult } from '../../results.js';
import {
  type OpenRouterChatCompletionRequest,
  type OpenRouterChatCompletionResponse,
  type OpenRouterKeySource,
  type OpenRouterKeyValidation
} from '../openrouter/openrouter-types.js';
import { sendOpenRouterChatCompletion } from '../openrouter/openrouter-client.js';
import {
  resolveOpenRouterApiKey,
  writeStoredOpenRouterKey
} from '../openrouter/openrouter-secret-store.js';
import { redactOpenRouterKey } from '../../security/redact-secrets.js';
import { buildGlmCodexAppModelProfile } from './glm-52-profile.js';
import { buildGlm52KeyValidationRequest, buildGlm52Request } from './glm-52-request.js';
import { assertGlm52ActualModel } from './glm-52-response-guard.js';
import {
  GLM_52_OPENROUTER_MODEL,
  type GlmModeId,
  OPENROUTER_CHAT_COMPLETIONS_URL
} from './glm-52-settings.js';
import { resolveGlmProfileFromArgs, type GlmResolvedProfile } from './glm-profile-resolver.js';
import { createEmptyGlmLatencyTrace, writeGlmLatencyTrace } from './glm-latency-trace.js';

export interface GlmModeResult {
  readonly schema: 'sks.glm-mode-result.v1';
  readonly ok: boolean;
  readonly status: 'ready' | 'running' | 'blocked' | 'failed' | 'completed';
  readonly mode: GlmModeId;
  readonly profile: GlmResolvedProfile['name'];
  readonly provider: 'openrouter';
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly requested_model: typeof GLM_52_OPENROUTER_MODEL;
  readonly actual_model?: string;
  readonly strict_model_lock: true;
  readonly gpt_fallback_allowed: false;
  readonly openrouter_key_source?: OpenRouterKeySource;
  readonly key_preview?: string | null;
  readonly codex_app_profile_id: 'sks/glm-5.2-mad';
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface GlmModeAdapters {
  readonly nowIso: () => string;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly promptSecret: (prompt: string) => Promise<string | null>;
  readonly promptConfirm: (prompt: string, defaultYes: boolean) => Promise<boolean>;
  readonly writeSecret: (value: string) => Promise<void>;
  readonly validateOpenRouterKey: (key: string) => Promise<SksResult<OpenRouterKeyValidation>>;
  readonly sendOpenRouterRequest: (
    request: OpenRouterChatCompletionRequest,
    key: string
  ) => Promise<SksResult<OpenRouterChatCompletionResponse>>;
  readonly log: (message: string) => void;
}

export async function runMadGlmMode(
  args: readonly string[] = [],
  adapters: Partial<GlmModeAdapters> = {}
): Promise<GlmModeResult> {
  const runtime = buildDefaultAdapters(adapters);
  const repair = flag(args, '--repair');
  const noSaveKey = flag(args, '--no-save-key');
  const skipValidation = flag(args, '--skip-validation');
  const json = flag(args, '--json');
  const selectedProfile = resolveGlmProfileFromArgs(args);
  const profile = buildGlmCodexAppModelProfile();

  let result: GlmModeResult;
  if (selectedProfile.blockers.length) {
    result = baseResult({
      status: 'blocked',
      blockers: selectedProfile.blockers,
      warnings: []
    }, selectedProfile);
  } else if (repair) {
    const key = await runtime.promptSecret('OpenRouter API key is required for GLM 5.2 mode.\nEnter OpenRouter API key: ');
    if (!key) {
      result = baseResult({
        status: 'blocked',
        blockers: ['glm_key_prompt_cancelled'],
        warnings: []
      }, selectedProfile);
    } else {
      if (!noSaveKey) await runtime.writeSecret(key);
      const validation = skipValidation
        ? { ok: true as const, value: validationValue(null) }
        : await runtime.validateOpenRouterKey(key);
      result = validation.ok
        ? baseResult({
          status: 'ready',
          ...(validation.value.actual_model ? { actual_model: validation.value.actual_model } : {}),
          openrouter_key_source: noSaveKey ? 'prompt' : 'user-secret-store',
          key_preview: redactOpenRouterKey(key),
          blockers: [],
          warnings: noSaveKey ? ['openrouter_key_not_saved'] : []
        }, selectedProfile)
        : baseResult({
          status: 'blocked',
          openrouter_key_source: noSaveKey ? 'prompt' : 'user-secret-store',
          key_preview: redactOpenRouterKey(key),
          blockers: [validation.error.code],
          warnings: []
        }, selectedProfile);
    }
  } else {
    const resolved = await resolveOpenRouterApiKey({ env: runtime.env });
    if (!resolved.key && process.stdin.isTTY) {
      const key = await runtime.promptSecret('OpenRouter API key is required for GLM 5.2 mode.\nEnter OpenRouter API key: ');
      if (!key) {
        result = baseResult({ status: 'blocked', blockers: ['glm_key_prompt_cancelled'], warnings: [] }, selectedProfile);
      } else {
        const save = noSaveKey ? false : await runtime.promptConfirm('Save this key for future SKS GLM runs? [Y/n] ', true);
        if (save) await runtime.writeSecret(key);
        result = baseResult({
          status: 'ready',
          openrouter_key_source: save ? 'user-secret-store' : 'prompt',
          key_preview: redactOpenRouterKey(key),
          blockers: [],
          warnings: save ? [] : ['openrouter_key_not_saved']
        }, selectedProfile);
      }
    } else if (!resolved.key) {
      result = baseResult({
        status: 'blocked',
        blockers: resolved.blockers,
        warnings: ['set_OPENROUTER_API_KEY_or_run_sks_--mad_--glm_--repair']
      }, selectedProfile);
    } else {
      result = baseResult({
        status: 'ready',
        ...(resolved.source ? { openrouter_key_source: resolved.source } : {}),
        key_preview: resolved.key_preview,
        blockers: [],
        warnings: resolved.warnings
      }, selectedProfile);
    }
  }

  await writeGlmModeArtifacts(runtime.cwd, result, profile, selectedProfile, runtime.nowIso()).catch(() => undefined);
  if (flag(args, '--trace')) {
    await writeGlmLatencyTrace(runtime.cwd, {
      ...createEmptyGlmLatencyTrace(selectedProfile.name),
      context_estimated_tokens: selectedProfile.name === 'speed' ? 16_000 : 64_000,
      request_encode_ms: 1,
      encoded_request_cache_hit: false,
      provider: 'openrouter'
    }).catch(() => undefined);
  }
  if (json) printJson(result);
  else printHumanGlmResult(result, runtime.log);
  if (!result.ok) process.exitCode = 1;
  return result;
}

function baseResult(input: {
  readonly status: GlmModeResult['status'];
  readonly actual_model?: string;
  readonly openrouter_key_source?: OpenRouterKeySource;
  readonly key_preview?: string | null;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}, profile: GlmResolvedProfile): GlmModeResult {
  const result: GlmModeResult = {
    schema: 'sks.glm-mode-result.v1',
    ok: input.blockers.length === 0 && input.status !== 'failed',
    status: input.status,
    mode: profile.mode,
    profile: profile.name,
    provider: 'openrouter',
    model: GLM_52_OPENROUTER_MODEL,
    requested_model: GLM_52_OPENROUTER_MODEL,
    strict_model_lock: true,
    gpt_fallback_allowed: false,
    codex_app_profile_id: 'sks/glm-5.2-mad',
    blockers: input.blockers,
    warnings: input.warnings
  };
  return {
    ...result,
    ...(input.actual_model ? { actual_model: input.actual_model } : {}),
    ...(input.openrouter_key_source ? { openrouter_key_source: input.openrouter_key_source } : {}),
    ...(input.key_preview !== undefined ? { key_preview: input.key_preview } : {})
  };
}

function buildDefaultAdapters(overrides: Partial<GlmModeAdapters>): GlmModeAdapters {
  return {
    nowIso: overrides.nowIso || nowIso,
    env: overrides.env || process.env,
    cwd: overrides.cwd || process.cwd(),
    promptSecret: overrides.promptSecret || promptLine,
    promptConfirm: overrides.promptConfirm || promptConfirmLine,
    writeSecret: overrides.writeSecret || (async (value: string) => {
      await writeStoredOpenRouterKey(value);
    }),
    validateOpenRouterKey: overrides.validateOpenRouterKey || validateOpenRouterKey,
    sendOpenRouterRequest: overrides.sendOpenRouterRequest || (async (request, key) =>
      sendOpenRouterChatCompletion({ request, apiKey: key })),
    log: overrides.log || ((message: string) => console.log(message))
  };
}

async function validateOpenRouterKey(key: string): Promise<SksResult<OpenRouterKeyValidation>> {
  const response = await sendOpenRouterChatCompletion({
    apiKey: key,
    request: buildGlm52KeyValidationRequest()
  });
  if (!response.ok) return response;
  const guard = assertGlm52ActualModel(response.value.model);
  if (!guard.ok) {
    return {
      ok: false,
      error: {
        code: guard.code,
        message: 'GLM model lock violated.',
        severity: 'blocked'
      }
    };
  }
  return { ok: true, value: validationValue(response.value.model || null) };
}

function validationValue(actualModel: string | null): OpenRouterKeyValidation {
  return {
    schema: 'sks.openrouter-key-validation.v1',
    ok: true,
    requested_model: GLM_52_OPENROUTER_MODEL,
    actual_model: actualModel,
    strict_model_lock: true,
    gpt_fallback_allowed: false
  };
}

async function writeGlmModeArtifacts(
  cwd: string,
  result: GlmModeResult,
  profile: ReturnType<typeof buildGlmCodexAppModelProfile>,
  selectedProfile: GlmResolvedProfile,
  generatedAt: string
): Promise<void> {
  const dir = path.join(cwd, '.sneakoscope', 'glm');
  await writeJsonAtomic(path.join(dir, 'mad-glm-session.json'), {
    schema: 'sks.glm-mad-session.v1',
    generated_at: generatedAt,
    result,
    profile_id: profile.id,
    selected_profile: selectedProfile.name
  });
  await writeJsonAtomic(path.join(dir, 'openrouter-request-summary.json'), {
    schema: 'sks.openrouter-request-summary.v1',
    generated_at: generatedAt,
    endpoint: OPENROUTER_CHAT_COMPLETIONS_URL,
    model: GLM_52_OPENROUTER_MODEL,
    mode: selectedProfile.mode,
    profile: selectedProfile.name,
    temperature: selectedProfile.temperature,
    top_p: selectedProfile.top_p,
    reasoning_effort: selectedProfile.reasoning_effort || 'xhigh',
    max_tokens: selectedProfile.max_tokens,
    tool_choice: selectedProfile.tool_choice,
    parallel_tool_calls: selectedProfile.parallel_tool_calls,
    stream: selectedProfile.stream,
    provider_allow_fallbacks: false,
    provider_sort: selectedProfile.provider.sort || null,
    require_parameters: selectedProfile.provider.require_parameters,
    key_source: result.openrouter_key_source || null,
    key_preview: result.key_preview || null
  });
  await writeJsonAtomic(path.join(dir, 'model-guard.json'), {
    schema: 'sks.glm-model-guard.v1',
    generated_at: generatedAt,
    requested_model: GLM_52_OPENROUTER_MODEL,
    actual_model: result.actual_model || null,
    accepted: result.actual_model ? assertGlm52ActualModel(result.actual_model).ok : result.ok,
    strict_model_lock: true,
    gpt_fallback_allowed: false,
    blockers: result.blockers
  });
}

function printHumanGlmResult(result: GlmModeResult, log: (message: string) => void): void {
  log(`GLM 5.2 MAD mode: ${result.ok ? result.status : 'blocked'} (${result.profile})`);
  log(`Model: ${result.model}`);
  log(`GPT fallback: ${result.gpt_fallback_allowed ? 'allowed' : 'blocked'}`);
  if (result.openrouter_key_source) log(`OpenRouter key: ${result.openrouter_key_source} ${result.key_preview || ''}`.trim());
  for (const blocker of result.blockers) log(`- blocker: ${blocker}`);
  for (const warning of result.warnings) log(`- warning: ${warning}`);
}

async function promptLine(prompt: string): Promise<string | null> {
  if (!process.stdin.isTTY) return null;
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(prompt);
    return answer.trim() || null;
  } finally {
    rl.close();
  }
}

async function promptConfirmLine(prompt: string, defaultYes: boolean): Promise<boolean> {
  if (!process.stdin.isTTY) return defaultYes;
  const answer = await promptLine(prompt);
  if (!answer) return defaultYes;
  return !/^n(o)?$/i.test(answer);
}

export function buildGlmModeDryRunRequest(): OpenRouterChatCompletionRequest {
  return buildGlm52Request({
    messages: [{ role: 'user', content: 'SKS GLM dry run.' }],
    profile: 'speed',
    stream: false,
    maxTokens: 1,
    toolChoice: 'none',
    parallelToolCalls: false
  });
}
