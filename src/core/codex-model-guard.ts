export const REQUIRED_CODEX_MODEL = 'gpt-5.5';
export const GPT54_MINI_CODEX_MODEL = 'gpt-5.4-mini';
export const SUPPORTED_CODEX_MODELS = [REQUIRED_CODEX_MODEL, GPT54_MINI_CODEX_MODEL] as const;

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

export function forceGpt55CodexArgs(args: any = []) {
  return ['--model', REQUIRED_CODEX_MODEL, ...stripCodexModelOverrides(args)];
}

export function forceGpt55CodexConfigArgs(args: any = []) {
  return ['-c', `model="${REQUIRED_CODEX_MODEL}"`, ...stripCodexModelOverrides(args)];
}

export function isForbiddenCodexModel(value: any = '') {
  const model = String(value || '').trim().toLowerCase();
  return /^gpt-5\./.test(model) && !SUPPORTED_CODEX_MODELS.includes(model as any);
}
