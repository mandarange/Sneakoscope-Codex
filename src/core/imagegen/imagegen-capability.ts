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
  const run = await runProcess(codexBin, ['features', 'list', '--json'], {
    timeoutMs: opts.timeoutMs || 5000,
    maxOutputBytes: 64 * 1024
  }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }));
  let parsed: any = null;
  try {
    parsed = JSON.parse(run.stdout || '{}');
  } catch {}
  const haystack = JSON.stringify(parsed || run.stdout || run.stderr || '');
  const available = /image[_-]?generation|imagegen|\$imagegen/i.test(haystack)
    && !/false|disabled|missing/i.test(String(parsed?.image_generation ?? parsed?.features?.image_generation ?? ''));
  return {
    available,
    detector: 'codex_features_list',
    blocker: available ? null : 'codex_app_imagegen_not_detected',
    raw: parsed || String(run.stdout || run.stderr || '').slice(0, 2000)
  };
}
