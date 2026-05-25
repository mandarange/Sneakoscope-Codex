import path from 'node:path';
import fsp from 'node:fs/promises';
import { parseShellEnvValue } from '../codex-lb/codex-lb-env.js';
import { ensureDir, exists, nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js';
import { sha256File, imageDimensions } from '../wiki-image/image-hash.js';
import { detectImagegenCapability } from '../imagegen/imagegen-capability.js';
import { validateGptImage2Request } from '../imagegen/gpt-image-2-request-validator.js';

const DEFAULT_OPENAI_IMAGE_EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits';

export interface ImageUxReviewImagegenAdapter {
  surface: 'codex_app_imagegen' | 'openai_images_api' | 'fake_imagegen_adapter';
  model: 'gpt-image-2';
  available: boolean;
  generateCalloutReview(input: ImageUxReviewImagegenRequest): Promise<ImageUxReviewImagegenResult>;
}

export interface ImageUxReviewImagegenRequest {
  mission_id: string | null;
  source_screen_id: string;
  source_image_path: string;
  output_dir: string;
  prompt: string;
  requested_fidelity: 'original';
  privacy: 'local-only';
}

export interface ImageUxReviewImagegenResult {
  ok: boolean;
  status: 'generated' | 'blocked';
  generated_image_path: string | null;
  output_id: string | null;
  blocker: string | null;
  provider?: string;
  request_artifact?: string | null;
  response_artifact?: string | null;
  latency_ms?: number | null;
}

export function buildCalloutPrompt(sourceScreenId: string, context: any = {}) {
  return [
    'Review this UI screenshot as a senior product design lead.',
    `Screenshot source id: ${sourceScreenId}.`,
    'Output must be a new image artifact, not prose.',
    'Text-only response is invalid.',
    'Use the screenshot as the reference image input and preserve original-resolution visual evidence as much as the host allows.',
    'Overlay numbered callouts on concrete visible UI regions.',
    'Each callout must include P0/P1/P2/P3 severity labels.',
    'Mark visual hierarchy, contrast, alignment, density, affordance, and eye-flow arrows.',
    'Include a compact corrected mini-comp or before/after strip for the highest-impact fix.',
    'Use only visible evidence and the provided route context.',
    'Do not invent product requirements.',
    context?.target ? `Target surface: ${context.target}.` : ''
  ].filter(Boolean).join(' ');
}

export async function detectCodexAppImagegenCapability(opts: any = {}) {
  const capability = await detectImagegenCapability(opts).catch(() => null);
  const codexApp = capability?.codex_app || {
    available: false,
    detector: 'capability_detection_failed',
    raw: null
  };
  const available = codexApp.available === true;
  return {
    schema: 'sks.codex-app-imagegen-capability.v1',
    ok: true,
    available,
    status: available ? 'available' : 'integration_optional',
    detector: codexApp.detector || 'codex_features_list',
    raw: codexApp.raw || null
  };
}

export function createCodexAppImagegenAdapter(opts: any = {}): ImageUxReviewImagegenAdapter {
  const available = opts.available === true || process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE === '1';
  return {
    surface: 'codex_app_imagegen',
    model: 'gpt-image-2',
    available,
    async generateCalloutReview(input: ImageUxReviewImagegenRequest) {
      const suppliedOutput = opts.outputImagePath || process.env.SKS_CODEX_APP_IMAGEGEN_OUTPUT || null;
      if (!input?.output_dir && !suppliedOutput) {
        const blocker = available ? 'imagegen_request_output_dir_missing' : 'imagegen_capability_missing';
        return {
          ok: false,
          status: 'blocked',
          generated_image_path: null,
          output_id: null,
          blocker,
          provider: 'codex_app_imagegen',
          latency_ms: null
        };
      }
      await ensureDir(input.output_dir);
      const requestArtifact = path.join(input.output_dir, 'image-ux-gpt-image-2-request.json');
      const responseArtifact = path.join(input.output_dir, 'image-ux-gpt-image-2-response.json');
      const validation = await validateGptImage2Request({
        provider: 'codex_app_imagegen',
        endpoint: 'Codex App $imagegen',
        model: 'gpt-image-2',
        prompt: input.prompt,
        source_image_path: input.source_image_path,
        output_dir: input.output_dir,
        params: { size: 'auto' },
        privacy: input.privacy
      });
      await writeJsonAtomic(requestArtifact, {
        schema: 'sks.image-ux-gpt-image-2-request.v1',
        created_at: nowIso(),
        provider: 'codex_app_imagegen',
        endpoint: 'Codex App $imagegen',
        model: 'gpt-image-2',
        source_screen_id: input.source_screen_id,
        source_image_path: path.resolve(input.source_image_path),
        prompt: input.prompt,
        validation,
        unsupported_parameters_omitted: ['input_fidelity'],
        privacy: input.privacy
      });
      if (!validation.ok) {
        await writeJsonAtomic(responseArtifact, {
          schema: 'sks.image-ux-gpt-image-2-response.v1',
          created_at: nowIso(),
          provider: 'codex_app_imagegen',
          model: 'gpt-image-2',
          ok: false,
          status: 'blocked',
          blocker: 'gpt_image_2_request_validation_failed',
          validation_blockers: validation.blockers,
          local_only: true
        });
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: 'gpt_image_2_request_validation_failed', provider: 'codex_app_imagegen', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: null };
      }
      if (suppliedOutput && await exists(path.resolve(suppliedOutput))) {
        const dest = path.join(input.output_dir, path.basename(String(suppliedOutput)));
        await fsp.copyFile(path.resolve(suppliedOutput), dest);
        const meta = await generatedImageMetadata(process.cwd(), dest, {
          source_screen_id: input.source_screen_id,
          provider_surface: 'codex_app_imagegen',
          output_id: opts.outputId || null,
          real_generated: true
        });
        await writeJsonAtomic(responseArtifact, {
          schema: 'sks.image-ux-gpt-image-2-response.v1',
          created_at: nowIso(),
          provider: 'codex_app_imagegen',
          model: 'gpt-image-2',
          ok: true,
          status: 'generated',
          output_image_path: dest,
          output_image_sha256: meta.sha256,
          output_id: meta.output_id,
          local_only: true
        });
        return {
          ok: true,
          status: 'generated',
          generated_image_path: dest,
          output_id: opts.outputId || null,
          blocker: null,
          provider: 'codex_app_imagegen',
          request_artifact: requestArtifact,
          response_artifact: responseArtifact,
          latency_ms: null
        };
      }
      await writeJsonAtomic(responseArtifact, {
        schema: 'sks.image-ux-gpt-image-2-response.v1',
        created_at: nowIso(),
        provider: 'codex_app_imagegen',
        model: 'gpt-image-2',
        ok: false,
        status: 'blocked',
        blocker: available ? 'codex_app_imagegen_output_missing' : 'imagegen_capability_missing',
        setup_guidance: available
          ? 'Codex App image generation is available, but SKS did not receive an attached generated annotated review image. Re-run with $imagegen/gpt-image-2 and provide SKS_CODEX_APP_IMAGEGEN_OUTPUT or attach the generated image path.'
          : 'Codex App image generation was not detected. Run in Codex App with $imagegen/gpt-image-2 or set OPENAI_API_KEY for the optional Images API fallback.',
        local_only: true
      });
      return {
        ok: false,
        status: 'blocked',
        generated_image_path: null,
        output_id: null,
        blocker: available ? 'codex_app_imagegen_output_missing' : 'imagegen_capability_missing',
        provider: 'codex_app_imagegen',
        request_artifact: requestArtifact,
        response_artifact: responseArtifact,
        latency_ms: null
      };
    }
  };
}

export function createFakeImagegenAdapter(opts: any = {}): ImageUxReviewImagegenAdapter {
  return {
    surface: 'fake_imagegen_adapter',
    model: 'gpt-image-2',
    available: opts.available !== false,
    async generateCalloutReview(input: ImageUxReviewImagegenRequest) {
      const started = Date.now();
      await ensureDir(input.output_dir);
      const requestArtifact = path.join(input.output_dir, 'image-ux-gpt-image-2-request.json');
      const responseArtifact = path.join(input.output_dir, 'image-ux-gpt-image-2-response.json');
      const validation = await validateGptImage2Request({
        provider: 'fake_imagegen_adapter',
        endpoint: 'local hermetic fixture',
        model: 'gpt-image-2',
        prompt: input.prompt,
        source_image_path: input.source_image_path,
        output_dir: input.output_dir,
        params: { size: 'auto' },
        privacy: input.privacy
      });
      await writeJsonAtomic(requestArtifact, {
        schema: 'sks.image-ux-gpt-image-2-request.v1',
        created_at: nowIso(),
        provider: 'fake_imagegen_adapter',
        endpoint: 'local hermetic fixture',
        model: 'gpt-image-2',
        source_screen_id: input.source_screen_id,
        source_image_path: path.resolve(input.source_image_path),
        prompt: input.prompt,
        validation,
        fake_adapter: true,
        source: 'mock_like_fixture',
        real_generation_claim_allowed: false,
        unsupported_parameters_omitted: ['input_fidelity'],
        privacy: input.privacy
      });
      if (!validation.ok) {
        await writeJsonAtomic(responseArtifact, {
          schema: 'sks.image-ux-gpt-image-2-response.v1',
          created_at: nowIso(),
          provider: 'fake_imagegen_adapter',
          model: 'gpt-image-2',
          ok: false,
          status: 'blocked',
          blocker: 'gpt_image_2_request_validation_failed',
          validation_blockers: validation.blockers,
          local_only: true
        });
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: 'gpt_image_2_request_validation_failed', provider: 'fake_imagegen_adapter', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
      const sourcePath = path.resolve(input.source_image_path);
      const out = path.join(input.output_dir, `fake-gpt-image-2-callout-${input.source_screen_id || 'screen'}.png`);
      await fsp.copyFile(sourcePath, out);
      const meta = await generatedImageMetadata(process.cwd(), out, {
        source_screen_id: input.source_screen_id,
        provider_surface: 'fake_imagegen_adapter',
        output_id: `fake-${Date.now()}`,
        real_generated: false,
        mock: true
      });
      await writeJsonAtomic(responseArtifact, {
        schema: 'sks.image-ux-gpt-image-2-response.v1',
        created_at: nowIso(),
        provider: 'fake_imagegen_adapter',
        model: 'gpt-image-2',
        ok: true,
        status: 'generated',
        output_image_path: out,
        output_image_sha256: meta.sha256,
        output_id: meta.output_id,
        dimensions: { width: meta.width, height: meta.height, format: meta.format },
        latency_ms: Date.now() - started,
        fake_adapter: true,
        source: 'mock_like_fixture',
        real_generated: false,
        mock: true,
        local_only: true
      });
      return { ok: true, status: 'generated', generated_image_path: out, output_id: meta.output_id, blocker: null, provider: 'fake_imagegen_adapter', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
    }
  };
}

export function createOpenAIImagesApiAdapter(opts: any = {}): ImageUxReviewImagegenAdapter {
  const apiKey = opts.apiKey || process.env.OPENAI_API_KEY || null;
  const codexLb = opts.codexLb?.available === true ? opts.codexLb : null;
  return {
    surface: 'openai_images_api',
    model: 'gpt-image-2',
    available: Boolean(apiKey || codexLb),
    async generateCalloutReview(input: ImageUxReviewImagegenRequest) {
      const started = Date.now();
      await ensureDir(input.output_dir);
      const requestArtifact = path.join(input.output_dir, 'image-ux-gpt-image-2-request.json');
      const responseArtifact = path.join(input.output_dir, 'image-ux-gpt-image-2-response.json');
      const sourcePath = path.resolve(input.source_image_path);
      const sourceSha = await sha256File(sourcePath);
      const auth = await resolveImagesApiAuth({ ...opts, apiKey, codexLb });
      const validation = await validateGptImage2Request({
        provider: 'openai_images_api',
        endpoint: auth.endpoint,
        model: 'gpt-image-2',
        prompt: input.prompt,
        source_image_path: sourcePath,
        output_dir: input.output_dir,
        params: { size: 'auto' },
        privacy: input.privacy
      });
      await writeJsonAtomic(requestArtifact, {
        schema: 'sks.image-ux-gpt-image-2-request.v1',
        created_at: nowIso(),
        provider: 'openai_images_api',
        endpoint: auth.endpoint,
        auth_source: auth.auth_source,
        model: 'gpt-image-2',
        source_screen_id: input.source_screen_id,
        source_image_path: sourcePath,
        source_screenshot_sha256: sourceSha,
        prompt: input.prompt,
        validation,
        image_input_fidelity_note: 'high_fidelity_automatic',
        unsupported_parameters_omitted: ['input_fidelity'],
        privacy: input.privacy
      });
      if (!validation.ok) {
        await writeJsonAtomic(responseArtifact, {
          schema: 'sks.image-ux-gpt-image-2-response.v1',
          created_at: nowIso(),
          provider: 'openai_images_api',
          model: 'gpt-image-2',
          ok: false,
          status: 'blocked',
          blocker: 'gpt_image_2_request_validation_failed',
          validation_blockers: validation.blockers,
          local_only: true
        });
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: 'gpt_image_2_request_validation_failed', provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
      if (!auth.apiKey) {
        const blocked = {
          schema: 'sks.image-ux-gpt-image-2-response.v1',
          created_at: nowIso(),
          provider: 'openai_images_api',
          model: 'gpt-image-2',
          ok: false,
          status: 'blocked',
          blocker: auth.blocker,
          setup_guidance: auth.auth_source === 'CODEX_LB_API_KEY'
            ? 'Set CODEX_LB_API_KEY for the selected codex-lb provider with requires_openai_auth=false, or attach a real Codex App $imagegen output image.'
            : 'Set OPENAI_API_KEY to enable OpenAI Images API fallback, or attach a real Codex App $imagegen output image.',
          local_only: true
        };
        await writeJsonAtomic(responseArtifact, blocked);
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: auth.blocker, provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
      try {
        const form = new FormData();
        form.append('model', 'gpt-image-2');
        form.append('prompt', input.prompt);
        form.append('image', new Blob([await fsp.readFile(sourcePath)], { type: mimeForPath(sourcePath) }), path.basename(sourcePath));
        const response = await fetch(auth.endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${auth.apiKey}` },
          body: form
        });
        const payload = await response.json().catch(async () => ({ error: { message: await response.text() } }));
        if (!response.ok) {
          await writeJsonAtomic(responseArtifact, redactedImagegenResponse(payload, false, Date.now() - started));
          return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: imagegenErrorKind(payload), provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
        }
        const image = Array.isArray(payload?.data) ? payload.data[0] : null;
        const b64 = image?.b64_json || image?.b64 || null;
        if (!b64) {
          await writeJsonAtomic(responseArtifact, redactedImagegenResponse({ ...payload, blocker: 'missing_b64_image_output' }, false, Date.now() - started));
          return { ok: false, status: 'blocked', generated_image_path: null, output_id: image?.id || null, blocker: 'missing_b64_image_output', provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
        }
        const out = path.join(input.output_dir, `gpt-image-2-callout-${Date.now()}.png`);
        await fsp.writeFile(out, Buffer.from(String(b64), 'base64'));
        const meta = await generatedImageMetadata(process.cwd(), out, {
          source_screen_id: input.source_screen_id,
          provider_surface: 'openai_images_api',
          output_id: image?.id || payload?.id || null,
          real_generated: true
        });
        await writeJsonAtomic(responseArtifact, {
          schema: 'sks.image-ux-gpt-image-2-response.v1',
          created_at: nowIso(),
          provider: 'openai_images_api',
          model: 'gpt-image-2',
          auth_source: auth.auth_source,
          ok: true,
          status: 'generated',
          output_image_path: out,
          output_image_sha256: meta.sha256,
          output_id: meta.output_id,
          dimensions: { width: meta.width, height: meta.height, format: meta.format },
          latency_ms: Date.now() - started,
          token_cost_metadata: payload?.usage || null,
          local_only: true
        });
        return { ok: true, status: 'generated', generated_image_path: out, output_id: meta.output_id, blocker: null, provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      } catch (err: unknown) {
        const response = redactedImagegenResponse({ error: { message: err instanceof Error ? err.message : String(err) } }, false, Date.now() - started);
        await writeJsonAtomic(responseArtifact, response);
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: 'openai_images_api_error', provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
    }
  };
}

export async function generateGptImage2CalloutReview(input: ImageUxReviewImagegenRequest, opts: any = {}) {
  if (opts.fake === true || process.env.SKS_TEST_FAKE_IMAGEGEN === '1') {
    return createFakeImagegenAdapter(opts.fakeAdapter || {}).generateCalloutReview(input);
  }
  const capability = await detectImagegenCapability(opts.capability || {}).catch(() => null);
  const openaiOptions = { ...(opts.openai || {}), codexLb: opts.openai?.codexLb || capability?.codex_lb || null };
  const codexAdapter = createCodexAppImagegenAdapter({
    ...(opts.codexApp || {}),
    available: opts.codexApp?.available === true || capability?.codex_app?.available === true
  });
  if (codexAdapter.available) {
    const result = await codexAdapter.generateCalloutReview(input);
    if (result.ok) return result;
    const openaiAdapter = createOpenAIImagesApiAdapter(openaiOptions);
    if (!openaiAdapter.available) return result;
    return openaiAdapter.generateCalloutReview(input);
  }
  return createOpenAIImagesApiAdapter(openaiOptions).generateCalloutReview(input);
}

export function imagegenCapabilityBlocker(surface = 'Codex App $imagegen') {
  return {
    schema: 'sks.image-ux-imagegen-blocker.v1',
    status: 'blocked',
    blocker: 'imagegen_capability_missing',
    surface,
    model: 'gpt-image-2',
    guidance: 'Run the request in Codex App with $imagegen/gpt-image-2, or set OPENAI_API_KEY. When codex-lb is the selected provider, CODEX_LB_API_KEY is accepted only with requires_openai_auth=false. Attach the generated annotated review image path; SKS must not fabricate or substitute a text-only review.'
  };
}

async function resolveImagesApiAuth(opts: any = {}) {
  const openAiKey = String(opts.apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (openAiKey) {
    return {
      apiKey: openAiKey,
      auth_source: 'OPENAI_API_KEY',
      endpoint: imageEditsEndpoint(opts.baseUrl || 'https://api.openai.com/v1'),
      blocker: null
    };
  }
  const codexLb = opts.codexLb?.available === true ? opts.codexLb : null;
  if (!codexLb) {
    return {
      apiKey: null,
      auth_source: null,
      endpoint: imageEditsEndpoint(opts.baseUrl || 'https://api.openai.com/v1'),
      blocker: 'openai_api_key_missing'
    };
  }
  const envKey = codexLb.env_key || 'CODEX_LB_API_KEY';
  const envPath = codexLb.env_path || opts.codexLbEnvPath || '';
  const envText = envPath ? await readText(envPath, '').catch(() => '') : '';
  const codexLbKey = String(opts.codexLbApiKey || process.env[envKey] || parseShellEnvValue(envText, envKey) || '').trim();
  return {
    apiKey: codexLbKey || null,
    auth_source: envKey,
    endpoint: imageEditsEndpoint(codexLb.base_url || opts.baseUrl || ''),
    blocker: codexLbKey ? null : 'codex_lb_api_key_missing'
  };
}

function imageEditsEndpoint(baseUrl: any = '') {
  const base = String(baseUrl || DEFAULT_OPENAI_IMAGE_EDITS_ENDPOINT).trim().replace(/\/+$/, '');
  return /\/images\/edits$/i.test(base) ? base : `${base}/images/edits`;
}

export async function generatedImageMetadata(root: string, imagePath: string, opts: any = {}) {
  const absolute = path.resolve(root, imagePath);
  const dims = await imageDimensions(absolute);
  return {
    id: opts.id || `generated-review-${(await sha256File(absolute)).slice(0, 10)}`,
    path: path.relative(root, absolute).split(path.sep).join('/'),
    sha256: await sha256File(absolute),
    width: dims.width,
    height: dims.height,
    format: dims.format,
    source_screen_id: opts.source_screen_id || null,
    provider_model: 'gpt-image-2',
    provider_surface: opts.provider_surface || 'codex_app_imagegen',
    requested_fidelity: 'high_fidelity_automatic',
    image_input_fidelity_note: 'high_fidelity_automatic',
    privacy: 'local-only',
    output_id: opts.output_id || null,
    created_at: opts.created_at || nowIso(),
    real_generated: opts.real_generated === true,
    mock: opts.mock === true,
    callout_extraction_required: true,
    source: opts.mock ? 'mock_fixture' : 'real_gpt_image_2_callout'
  };
}

function mimeForPath(file: string) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function redactedImagegenResponse(payload: any, ok: boolean, latencyMs: number) {
  return {
    schema: 'sks.image-ux-gpt-image-2-response.v1',
    created_at: nowIso(),
    provider: 'openai_images_api',
    model: 'gpt-image-2',
    ok,
    status: ok ? 'generated' : 'blocked',
    blocker: ok ? null : imagegenErrorKind(payload),
    redacted_error: payload?.error?.message ? String(payload.error.message).replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_OPENAI_KEY]') : null,
    latency_ms: latencyMs,
    local_only: true
  };
}

function imagegenErrorKind(payload: any) {
  const text = JSON.stringify(payload || {});
  if (/moderation|safety|policy/i.test(text)) return 'imagegen_moderation_blocked';
  if (/api[_ -]?key|auth|401/i.test(text)) return 'openai_api_key_missing_or_invalid';
  return payload?.blocker || 'openai_images_api_error';
}
