// Default model/effort for every SKS-managed Codex surface. gpt-5.6-terra is
// served by the patched codex-lb (v1.20.1-r3, upstream PR #1173 port) with a
// 6-level low~ultra reasoning range. Keys still LB-pinned to enforced_model=
// gpt-5.5 will have the model rewritten server-side; unpin a key in the LB
// dashboard (:1455) to actually receive 5.6 responses on it.
export const REQUIRED_CODEX_MODEL = 'gpt-5.6-terra';
export const DEFAULT_CODEX_REASONING_EFFORT = 'high';
export const GPT55_CODEX_MODEL = 'gpt-5.5';
export const GPT54_MINI_CODEX_MODEL = 'gpt-5.4-mini';
export const GPT56_CODEX_MODELS = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'] as const;
export const SUPPORTED_CODEX_MODELS = [REQUIRED_CODEX_MODEL, GPT55_CODEX_MODEL, GPT54_MINI_CODEX_MODEL, 'gpt-5.6-sol', 'gpt-5.6-luna'] as const;

const MODEL_VALUE_FLAGS = new Set(['--model', '-m']);
const CONFIG_VALUE_FLAGS = new Set(['-c', '--config']);

function isModelConfigOverride(value: any = '') {
  return /^model\s*=/.test(String(value || '').trim());
}

function stripCodexModelOverrides(args: any = []) {
  const out: any[] = [];
  const input = Array.isArray(args) ? args : [];
  for (let i = 0; i < input.length; i += 1) {
    const arg = String(input[i]);
    if (MODEL_VALUE_FLAGS.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith('--model=') || arg.startsWith('-m=')) continue;
    if (CONFIG_VALUE_FLAGS.has(arg)) {
      const value = i + 1 < input.length ? String(input[i + 1]) : '';
      if (isModelConfigOverride(value)) {
        i += 1;
        continue;
      }
      out.push(arg);
      if (i + 1 < input.length) out.push(String(input[++i]));
      continue;
    }
    if (arg.startsWith('-c=') || arg.startsWith('--config=')) {
      const value = arg.slice(arg.indexOf('=') + 1);
      if (isModelConfigOverride(value)) continue;
    }
    out.push(arg);
  }
  return out;
}

function isSupportedCodexModel(value: any = '') {
  return SUPPORTED_CODEX_MODELS.includes(String(value || '').trim().toLowerCase() as any);
}

// The forced model is REQUIRED_CODEX_MODEL unless the caller explicitly
// requested another SUPPORTED model (via --model/-m/-c model=... args, or
// SKS_CODEX_MODEL when no arg is present). Unsupported/forbidden requests are
// stripped and rewritten to the required default.
function resolveForcedCodexModel(args: any = []) {
  const requested = requestedCodexModelFromArgs(args);
  if (isSupportedCodexModel(requested)) return String(requested).trim().toLowerCase();
  const envModel = String(process.env.SKS_CODEX_MODEL || '').trim().toLowerCase();
  if (!requested && isSupportedCodexModel(envModel)) return envModel;
  return REQUIRED_CODEX_MODEL;
}

function requestedCodexModelFromArgs(args: any = []) {
  const input = Array.isArray(args) ? args : [];
  for (let i = 0; i < input.length; i += 1) {
    const arg = String(input[i]);
    if (MODEL_VALUE_FLAGS.has(arg)) return i + 1 < input.length ? String(input[i + 1]) : '';
    if (arg.startsWith('--model=') || arg.startsWith('-m=')) return arg.slice(arg.indexOf('=') + 1);
    if (CONFIG_VALUE_FLAGS.has(arg)) {
      const value = i + 1 < input.length ? String(input[i + 1]) : '';
      if (isModelConfigOverride(value)) return value.slice(value.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
    }
    if (arg.startsWith('-c=') || arg.startsWith('--config=')) {
      const value = arg.slice(arg.indexOf('=') + 1);
      if (isModelConfigOverride(value)) return value.slice(value.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
    }
  }
  return '';
}

export function forceRequiredCodexModelArgs(args: any = []) {
  return ['--model', resolveForcedCodexModel(args), ...stripCodexModelOverrides(args)];
}

export function forceRequiredCodexModelConfigArgs(args: any = []) {
  return ['-c', `model="${resolveForcedCodexModel(args)}"`, ...stripCodexModelOverrides(args)];
}

export function isForbiddenCodexModel(value: any = '') {
  const model = String(value || '').trim().toLowerCase();
  return /^gpt-5\./.test(model) && !SUPPORTED_CODEX_MODELS.includes(model as any);
}
