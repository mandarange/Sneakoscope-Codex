import { nowIso, runProcess, which } from '../fsx.js';

export async function detectImagegenCapability(opts: any = {}) {
  const codexBin = opts.codexBin || await which('codex').catch(() => null);
  const codexApp = await detectCodexAppImagegen(codexBin, opts);
  const openaiApiKeyPresent = Boolean(opts.apiKey || process.env.OPENAI_API_KEY);
  const fakeAdapterEnabled = opts.fake === true || process.env.SKS_TEST_FAKE_IMAGEGEN === '1';
  return {
    schema: 'sks.imagegen-capability.v1',
    ok: true,
    created_at: nowIso(),
    model: 'gpt-image-2',
    codex_app: codexApp,
    openai_images_api: {
      available: openaiApiKeyPresent,
      endpoints: {
        images_edits_supported: openaiApiKeyPresent,
        images_generations_supported: openaiApiKeyPresent,
        responses_image_generation_supported: openaiApiKeyPresent
      },
      blocker: openaiApiKeyPresent ? null : 'openai_api_key_missing'
    },
    fake_adapter: {
      available: fakeAdapterEnabled,
      env: 'SKS_TEST_FAKE_IMAGEGEN=1',
      source: 'mock_like_fixture',
      real_generation_claim_allowed: false
    },
    supports_reference_image: codexApp.available || openaiApiKeyPresent || fakeAdapterEnabled,
    gpt_image_2_input_fidelity_automatic: true,
    input_fidelity_must_be_omitted: true,
    supported_workflows: {
      ux_review_callouts: codexApp.available || openaiApiKeyPresent || fakeAdapterEnabled,
      ppt_slide_callouts: codexApp.available || openaiApiKeyPresent || fakeAdapterEnabled,
      structured_extraction_required_after_generation: true
    },
    blockers: codexApp.available || openaiApiKeyPresent || fakeAdapterEnabled ? [] : ['imagegen_capability_missing']
  };
}

async function detectCodexAppImagegen(codexBin: string | null, opts: any = {}) {
  if (opts.codexAppAvailable === true || process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE === '1') {
    return { available: true, detector: 'env_or_option', blocker: null, raw: null };
  }
  if (!codexBin) return { available: false, detector: 'codex_binary_missing', blocker: 'codex_binary_missing', raw: null };
  const jsonRun = await runProcess(codexBin, ['features', 'list', '--json'], {
    timeoutMs: opts.timeoutMs || 5000,
    maxOutputBytes: 64 * 1024
  }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }));
  let parsed: any = null;
  try {
    const candidate = JSON.parse(jsonRun.stdout || 'null');
    parsed = hasCodexFeatureSignal(candidate) ? candidate : null;
  } catch {}
  let plainRun: any = null;
  if (!parsed) {
    plainRun = await runProcess(codexBin, ['features', 'list'], {
      timeoutMs: opts.timeoutMs || 5000,
      maxOutputBytes: 64 * 1024
    }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }));
  }
  const rawText = String(plainRun?.stdout || plainRun?.stderr || jsonRun.stdout || jsonRun.stderr || '');
  const available = codexFeatureEnabled(parsed, rawText);
  return {
    available,
    detector: 'codex_features_list',
    blocker: available ? null : 'codex_app_imagegen_not_detected',
    raw: parsed || rawText.slice(0, 2000)
  };
}

function hasCodexFeatureSignal(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
}

function codexFeatureEnabled(parsed: any, rawText: string): boolean {
  const parsedValue = parsedFeatureEnabled(parsed);
  if (parsedValue !== null) return parsedValue;
  const plainValue = plainFeatureEnabled(rawText);
  if (plainValue !== null) return plainValue;
  const haystack = JSON.stringify(parsed || rawText || '');
  return /image[_-]?generation|imagegen|\$imagegen/i.test(haystack)
    && !/false|disabled|missing/i.test(String(parsed?.image_generation ?? parsed?.features?.image_generation ?? ''));
}

function parsedFeatureEnabled(parsed: any): boolean | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const direct = boolish(parsed.image_generation ?? parsed.imageGeneration ?? parsed.imagegen);
  if (direct !== null) return direct;
  const featureMap = parsed.features && typeof parsed.features === 'object' && !Array.isArray(parsed.features)
    ? boolish(parsed.features.image_generation ?? parsed.features.imageGeneration ?? parsed.features.imagegen)
    : null;
  if (featureMap !== null) return featureMap;
  const featureLists = [
    Array.isArray(parsed) ? parsed : null,
    Array.isArray(parsed.features) ? parsed.features : null
  ].filter(Boolean);
  for (const list of featureLists) {
    for (const item of list as any[]) {
      if (!item || typeof item !== 'object') continue;
      const name = String(item.name ?? item.key ?? item.id ?? item.feature ?? '');
      if (!/^image[_-]?generation$|^imagegen$/i.test(name)) continue;
      const value = boolish(item.enabled ?? item.value ?? item.available ?? item.status);
      if (value !== null) return value;
    }
  }
  return null;
}

function plainFeatureEnabled(rawText: string): boolean | null {
  for (const line of rawText.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/).filter(Boolean);
    if (columns.length < 2) continue;
    if (!/^image[_-]?generation$|^imagegen$/i.test(columns[0] || '')) continue;
    return boolish(columns[columns.length - 1]);
  }
  return null;
}

function boolish(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (typeof value !== 'string') return null;
  if (/^(true|enabled|available|on|yes)$/i.test(value.trim())) return true;
  if (/^(false|disabled|missing|off|no)$/i.test(value.trim())) return false;
  return null;
}
