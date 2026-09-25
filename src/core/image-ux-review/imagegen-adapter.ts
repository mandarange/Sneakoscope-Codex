import { CODEX_BUILTIN_IMAGEGEN_MODEL, IMAGEGEN_QUALITIES } from '../imagegen/imagegen-model-policy.js';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, exists, nowIso, projectRoot, readJson, writeJsonAtomic } from '../fsx.js';
import { sha256File, imageDimensions } from '../wiki-image/image-hash.js';
import { NON_CODEX_API_FALLBACK_EVIDENCE_CLASS } from '../imagegen/imagegen-evidence.js';
import { validateImagegenRequest } from '../imagegen/imagegen-request-validator.js';
import { CODEX_DEFAULT_IMAGEGEN_LABEL } from '../imagegen/imagegen-config.js';
import { generateSksImage } from '../imagegen/imagegen-generate.js';
import { parseResponsesSsePayload } from '../responses-stream.js';
import { withResponsesRetry } from '../responses-retry-policy.js';
import { writeImageArtifactPathContract } from '../image/image-artifact-path-contract.js';
import { registerImageArtifact } from '../image/image-artifact-registry.js';

const DEFAULT_OPENAI_IMAGE_EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits';
/** Hermetic fixture label; never a real model. */
const FAKE_IMAGEGEN_MODEL = 'mock-imagegen';
/** The explicit OpenAI Images API fallback needs a concrete model: the engine Codex documents today. */
const API_FALLBACK_IMAGEGEN_MODEL = String(process.env.SKS_IMAGEGEN_API_MODEL || CODEX_BUILTIN_IMAGEGEN_MODEL);
export const DEFAULT_IMAGEGEN_FETCH_TIMEOUT_MS = 180000;
const responseDeadlines = new WeakMap<Response, {
  controller: AbortController;
  startedAt: number;
  timeoutMs: number;
  timer: ReturnType<typeof setTimeout>;
}>();

export interface ImageUxReviewImagegenAdapter {
  surface: 'openai_images_api' | 'fake_imagegen_adapter' | 'sks_imagegen';
  model: string;
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
  output_source?: 'manual_attach' | 'auto_discovered_generated_images' | null;
  request_artifact?: string | null;
  response_artifact?: string | null;
  latency_ms?: number | null;
  image_artifact_path_contract?: string | null;
}

export function buildCalloutPrompt(sourceScreenId: string, context: any = {}) {
  return [
    'Review this UI screenshot as a senior Toss UI/UX product designer.',
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

export function createFakeImagegenAdapter(opts: any = {}): ImageUxReviewImagegenAdapter {
  return {
    surface: 'fake_imagegen_adapter',
    model: FAKE_IMAGEGEN_MODEL,
    available: opts.available !== false,
    async generateCalloutReview(input: ImageUxReviewImagegenRequest) {
      const started = Date.now();
      await ensureDir(input.output_dir);
      const requestArtifact = path.join(input.output_dir, 'image-ux-imagegen-request.json');
      const responseArtifact = path.join(input.output_dir, 'image-ux-imagegen-response.json');
      if (!imagegenMockContext(opts)) {
        await writeJsonAtomic(responseArtifact, {
          schema: 'sks.image-ux-imagegen-response.v1',
          created_at: nowIso(),
          provider: 'fake_imagegen_adapter',
          fake_adapter: true,
          execution_class: 'mock_fixture',
          evidence_class: 'mock_fixture',
          model: FAKE_IMAGEGEN_MODEL,
          ok: false,
          status: 'blocked',
          blocker: 'fake_imagegen_requires_test_or_mock_context',
          local_only: true
        });
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: 'fake_imagegen_requires_test_or_mock_context', provider: 'fake_imagegen_adapter', request_artifact: null, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
      const validation = await validateImagegenRequest({
        provider: 'fake_imagegen_adapter',
        endpoint: 'local hermetic fixture',
        model: FAKE_IMAGEGEN_MODEL,
        prompt: input.prompt,
        source_image_path: input.source_image_path,
        output_dir: input.output_dir,
        params: { size: 'auto' },
        privacy: input.privacy
      });
      await writeJsonAtomic(requestArtifact, {
        schema: 'sks.image-ux-imagegen-request.v1',
        created_at: nowIso(),
        provider: 'fake_imagegen_adapter',
        endpoint: 'local hermetic fixture',
        model: FAKE_IMAGEGEN_MODEL,
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
          schema: 'sks.image-ux-imagegen-response.v1',
          created_at: nowIso(),
          provider: 'fake_imagegen_adapter',
          fake_adapter: true,
          execution_class: 'mock_fixture',
          evidence_class: 'mock_fixture',
          model: FAKE_IMAGEGEN_MODEL,
          ok: false,
          status: 'blocked',
          blocker: 'imagegen_request_validation_failed',
          validation_blockers: validation.blockers,
          local_only: true
        });
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: 'imagegen_request_validation_failed', provider: 'fake_imagegen_adapter', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
      const sourcePath = path.resolve(input.source_image_path);
      const out = sourcePath;
      const meta = await generatedImageMetadata(process.cwd(), out, {
        source_screen_id: input.source_screen_id,
        provider_surface: 'fake_imagegen_adapter',
        output_id: `fake-${Date.now()}`,
        real_generated: false,
        mock: true
      });
      const imageContract = await writeGeneratedImagePathContract(input, out, 'fake_imagegen_adapter').catch(() => null);
      await writeJsonAtomic(responseArtifact, {
        schema: 'sks.image-ux-imagegen-response.v1',
        created_at: nowIso(),
        provider: 'fake_imagegen_adapter',
        fake_adapter: true,
        execution_class: 'mock_fixture',
        evidence_class: 'mock_fixture',
        model: FAKE_IMAGEGEN_MODEL,
        ok: true,
        status: 'generated',
        output_image_path: out,
        output_image_sha256: meta.sha256,
        output_sha256: meta.sha256,
        output_id: meta.output_id,
        output_source: 'mock_fixture',
        image_artifact_path_contract: imageContract?.artifact_path || null,
        dimensions: { width: meta.width, height: meta.height, format: meta.format },
        latency_ms: Date.now() - started,
        source: 'mock_like_fixture',
        real_generated: false,
        mock: true,
        local_only: true
      });
      return { ok: true, status: 'generated', generated_image_path: out, output_id: meta.output_id, blocker: null, provider: 'fake_imagegen_adapter', request_artifact: requestArtifact, response_artifact: responseArtifact, image_artifact_path_contract: imageContract?.artifact_path || null, latency_ms: Date.now() - started };
    }
  };
}

export function createOpenAIImagesApiAdapter(opts: any = {}): ImageUxReviewImagegenAdapter {
  const apiKey = opts.apiKey || process.env.OPENAI_API_KEY || null;
  return {
    surface: 'openai_images_api',
    model: API_FALLBACK_IMAGEGEN_MODEL,
    available: Boolean(apiKey),
    async generateCalloutReview(input: ImageUxReviewImagegenRequest) {
      const started = Date.now();
      await ensureDir(input.output_dir);
      const requestArtifact = path.join(input.output_dir, 'image-ux-imagegen-request.json');
      const responseArtifact = path.join(input.output_dir, 'image-ux-imagegen-response.json');
      const sourcePath = path.resolve(input.source_image_path);
      const sourceSha = await sha256File(sourcePath);
      const auth = resolveImagesApiAuth({ ...opts, apiKey });
      const validation = await validateImagegenRequest({
        provider: 'openai_images_api',
        endpoint: auth.endpoint,
        model: API_FALLBACK_IMAGEGEN_MODEL,
        prompt: input.prompt,
        source_image_path: sourcePath,
        output_dir: input.output_dir,
        params: { size: 'auto' },
        privacy: input.privacy
      });
      await writeJsonAtomic(requestArtifact, {
        schema: 'sks.image-ux-imagegen-request.v1',
        created_at: nowIso(),
        provider: 'openai_images_api',
        endpoint: auth.endpoint,
        auth_source: auth.auth_source,
        auth_transport: 'authorization-bearer',
        model: API_FALLBACK_IMAGEGEN_MODEL,
        source_screen_id: input.source_screen_id,
        source_image_path: sourcePath,
        source_screenshot_sha256: sourceSha,
        prompt: input.prompt,
        validation,
        image_input_fidelity_note: 'reference_image_input',
        unsupported_parameters_omitted: ['input_fidelity'],
        privacy: input.privacy
      });
      if (!validation.ok) {
        await writeJsonAtomic(responseArtifact, {
          schema: 'sks.image-ux-imagegen-response.v1',
          created_at: nowIso(),
          provider: 'openai_images_api',
          evidence_class: NON_CODEX_API_FALLBACK_EVIDENCE_CLASS,
          model: API_FALLBACK_IMAGEGEN_MODEL,
          ok: false,
          status: 'blocked',
          blocker: 'imagegen_request_validation_failed',
          validation_blockers: validation.blockers,
          local_only: true
        });
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: 'imagegen_request_validation_failed', provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
      if (!auth.apiKey) {
        const blocked = {
          schema: 'sks.image-ux-imagegen-response.v1',
          created_at: nowIso(),
          provider: 'openai_images_api',
          evidence_class: NON_CODEX_API_FALLBACK_EVIDENCE_CLASS,
          model: API_FALLBACK_IMAGEGEN_MODEL,
          ok: false,
          status: 'blocked',
          blocker: 'openai_api_key_missing',
          setup_guidance: 'Set OPENAI_API_KEY only for an explicit non-Codex Images API fallback. `sks imagegen generate` is the SKS image path.',
          local_only: true
        };
        await writeJsonAtomic(responseArtifact, blocked);
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: 'openai_api_key_missing', provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
      try {
        const sourceBytes = await fsp.readFile(sourcePath);
        const qualityParam = imagegenQualityParam(opts);
        const { result: attemptResult, attempts, retry_log } = await withResponsesRetry(async () => {
          const form = new FormData();
          form.append('model', API_FALLBACK_IMAGEGEN_MODEL);
          form.append('prompt', input.prompt);
          if (qualityParam.quality) form.append('quality', String(qualityParam.quality));
          form.append('image', new Blob([sourceBytes], { type: mimeForPath(sourcePath) }), path.basename(sourcePath));
          const response = await fetchWithTimeout(auth.endpoint, {
            method: 'POST',
            headers: { authorization: `Bearer ${auth.apiKey}` },
            body: form
          }, imagegenFetchTimeoutMs(opts));
          const payload = await readResponsePayload(response, imagegenFetchTimeoutMs(opts));
          return { value: { response, payload }, status: response.ok ? null : response.status, code: payloadRetryCode(payload) };
        }, imagegenRetryOptions(opts));
        const { response, payload } = attemptResult;
        if (!response.ok) {
          await writeJsonAtomic(responseArtifact, redactedImagegenResponse(payload, false, Date.now() - started, { attempts, retry_log }));
          return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: imagegenErrorKind(payload), provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
        }
        const image = Array.isArray(payload?.data) ? payload.data[0] : null;
        const b64 = image?.b64_json || image?.b64 || null;
        if (!b64) {
          await writeJsonAtomic(responseArtifact, redactedImagegenResponse({ ...payload, blocker: 'missing_b64_image_output' }, false, Date.now() - started));
          return { ok: false, status: 'blocked', generated_image_path: null, output_id: image?.id || null, blocker: 'missing_b64_image_output', provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
        }
        const out = path.join(input.output_dir, `imagegen-callout-${Date.now()}.png`);
        await fsp.writeFile(out, Buffer.from(String(b64), 'base64'));
        const meta = await generatedImageMetadata(process.cwd(), out, {
          source_screen_id: input.source_screen_id,
          provider_surface: 'openai_images_api',
          output_id: image?.id || payload?.id || null,
          real_generated: true
        });
        const imageContract = await writeGeneratedImagePathContract(input, out, 'openai_images_api').catch(() => null);
        await writeJsonAtomic(responseArtifact, {
          schema: 'sks.image-ux-imagegen-response.v1',
          created_at: nowIso(),
          provider: 'openai_images_api',
          evidence_class: NON_CODEX_API_FALLBACK_EVIDENCE_CLASS,
          model: API_FALLBACK_IMAGEGEN_MODEL,
          auth_source: auth.auth_source,
          ok: true,
          status: 'generated',
          output_image_path: out,
          output_image_sha256: meta.sha256,
          output_sha256: meta.sha256,
          output_id: meta.output_id,
          image_artifact_path_contract: imageContract?.artifact_path || null,
          dimensions: { width: meta.width, height: meta.height, format: meta.format },
          latency_ms: Date.now() - started,
          token_cost_metadata: payload?.usage || null,
          local_only: true
        });
        return { ok: true, status: 'generated', generated_image_path: out, output_id: meta.output_id, blocker: null, provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, image_artifact_path_contract: imageContract?.artifact_path || null, latency_ms: Date.now() - started };
      } catch (err: unknown) {
        const payload = { error: { message: err instanceof Error ? err.message : String(err) } };
        const response = redactedImagegenResponse(payload, false, Date.now() - started);
        await writeJsonAtomic(responseArtifact, response);
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: imagegenErrorKind(payload), provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
    }
  };
}

async function writeGeneratedImagePathContract(input: ImageUxReviewImagegenRequest, outputPath: string, provider: string) {
  const root = await resolveImageArtifactRoot(input);
  const skipNativeInvocationPlan = provider !== 'codex_app_imagegen';
  if (input.mission_id) {
    await registerImageArtifact(root, {
      missionId: input.mission_id,
      id: `${provider}-${input.source_screen_id || 'screen'}`,
      kind: 'generated_image',
      filePath: outputPath,
      route: '$Image-UX-Review',
      stage: provider,
      skipNativeInvocationPlan
    });
  }
  return writeImageArtifactPathContract(root, {
    missionId: input.mission_id || 'unassigned',
    images: [{
      id: `${provider}-${input.source_screen_id || 'screen'}`,
      kind: 'generated_image',
      filePath: outputPath,
      route: '$Image-UX-Review',
      stage: provider
    }],
    artifactPath: path.join(input.output_dir, 'image-artifact-path-contract.json'),
    skipNativeInvocationPlan
  });
}

async function resolveImageArtifactRoot(input: ImageUxReviewImagegenRequest): Promise<string> {
  const cwdRoot = await projectRoot(process.cwd()).catch(() => process.cwd());
  const resolvedCwd = path.resolve(process.cwd());
  if (path.resolve(cwdRoot) !== resolvedCwd) return cwdRoot;
  return projectRoot(input.output_dir || process.cwd()).catch(() => cwdRoot);
}

/**
 * The default adapter: `generateSksImage`, which follows the active SKS image
 * mode (Codex default through the bridge route of the Codex model, or the
 * custom OpenRouter model through the bridge). The screenshot goes in as the
 * reference image. Request and response artifacts keep the shapes the UX and
 * PPT gates already read.
 */
export function createSksImagegenAdapter(opts: any = {}): ImageUxReviewImagegenAdapter {
  return {
    surface: 'sks_imagegen',
    model: 'active-sks-image-mode',
    available: true,
    async generateCalloutReview(input: ImageUxReviewImagegenRequest) {
      const started = Date.now();
      await ensureDir(input.output_dir);
      const requestArtifact = path.join(input.output_dir, 'image-ux-imagegen-request.json');
      const responseArtifact = path.join(input.output_dir, 'image-ux-imagegen-response.json');
      const sourcePath = path.resolve(input.source_image_path);
      const validation = await validateImagegenRequest({
        provider: 'sks_imagegen',
        endpoint: 'sks imagegen generate',
        model: 'active-sks-image-mode',
        prompt: input.prompt,
        source_image_path: sourcePath,
        output_dir: input.output_dir,
        params: { size: 'auto' },
        privacy: input.privacy
      });
      await writeJsonAtomic(requestArtifact, {
        schema: 'sks.image-ux-imagegen-request.v1',
        created_at: nowIso(),
        provider: 'sks_imagegen',
        source_screen_id: input.source_screen_id,
        source_image_path: sourcePath,
        source_screenshot_sha256: await sha256File(sourcePath).catch(() => null),
        prompt: input.prompt,
        validation,
        image_input_fidelity_note: 'reference_image_input',
        privacy: input.privacy
      });
      const blocked = async (provider: string, blocker: string, extra: Record<string, unknown> = {}) => {
        await writeJsonAtomic(responseArtifact, {
          schema: 'sks.image-ux-imagegen-response.v1',
          created_at: nowIso(),
          provider,
          ok: false,
          status: 'blocked',
          blocker,
          setup_guidance: 'Check `sks imagegen status --json`: Codex default mode needs the bridge route of your Codex model; custom mode needs an OpenRouter key and a chosen image model in SKS Control Center.',
          local_only: true,
          ...extra
        });
        return { ok: false, status: 'blocked' as const, generated_image_path: null, output_id: null, blocker, provider, request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      };
      if (!validation.ok) return blocked('sks_imagegen', 'imagegen_request_validation_failed', { validation_blockers: validation.blockers });
      const generated = await (opts.generateImpl || generateSksImage)({
        prompt: input.prompt,
        outPath: path.join(input.output_dir, `imagegen-callout-${Date.now()}.png`),
        references: [sourcePath],
        ...(opts.env ? { env: opts.env } : {})
      });
      const provider = `sks_imagegen_${generated.mode}`;
      const output = generated.outputs[0];
      if (!generated.ok || !output) {
        return blocked(provider, generated.blockers[0] || 'imagegen_output_missing', {
          imagegen_mode: generated.mode,
          model: generated.model,
          blockers: generated.blockers,
          warnings: generated.warnings
        });
      }
      const meta = await generatedImageMetadata(process.cwd(), output.path, {
        source_screen_id: input.source_screen_id,
        provider_surface: provider,
        provider_model: generated.model,
        evidence_class: generated.evidence_class,
        output_source: generated.output_source,
        real_generated: true
      });
      const imageContract = await writeGeneratedImagePathContract(input, output.path, provider).catch(() => null);
      await writeJsonAtomic(responseArtifact, {
        schema: 'sks.image-ux-imagegen-response.v1',
        created_at: nowIso(),
        provider,
        evidence_class: generated.evidence_class,
        model: generated.model,
        imagegen_mode: generated.mode,
        via: generated.via,
        route_model: generated.route_model,
        ok: true,
        status: 'generated',
        output_image_path: output.path,
        output_image_sha256: meta.sha256,
        output_sha256: meta.sha256,
        output_id: null,
        output_source: generated.output_source,
        image_output_partial_frame: false,
        image_artifact_path_contract: imageContract?.artifact_path || null,
        dimensions: { width: meta.width, height: meta.height, format: meta.format },
        latency_ms: Date.now() - started,
        token_cost_metadata: generated.usage,
        warnings: generated.warnings,
        local_only: true
      });
      return { ok: true, status: 'generated', generated_image_path: output.path, output_id: null, blocker: null, provider, request_artifact: requestArtifact, response_artifact: responseArtifact, image_artifact_path_contract: imageContract?.artifact_path || null, latency_ms: Date.now() - started };
    }
  };
}

export async function generateImagegenCalloutReview(input: ImageUxReviewImagegenRequest, opts: any = {}) {
  if ((opts.fake === true || process.env.SKS_TEST_FAKE_IMAGEGEN === '1') && imagegenMockContext(opts)) {
    return createFakeImagegenAdapter({ ...(opts.fakeAdapter || {}), mockContext: true }).generateCalloutReview(input);
  }
  const sksResult = await createSksImagegenAdapter({
    ...(opts.env ? { env: opts.env } : {}),
    ...(opts.generateImpl ? { generateImpl: opts.generateImpl } : {})
  }).generateCalloutReview(input);
  if (sksResult.ok) return sksResult;
  // A non-Codex OpenAI Images API call stays an explicit, opt-in fallback.
  const allowApiFallback = opts.allowApiFallback === true || process.env.SKS_IMAGEGEN_ALLOW_API_FALLBACK === '1';
  if (!allowApiFallback) return sksResult;
  return createOpenAIImagesApiAdapter(opts.openai || {}).generateCalloutReview(input);
}

function imagegenMockContext(opts: any = {}) {
  return opts.mockContext === true
    || opts.testContext === true
    || process.env.NODE_ENV === 'test'
    || process.env.SKS_SELFTEST_MOCK === '1'
    || process.env.SKS_MOCK === '1';
}

export function imagegenCapabilityBlocker(surface = 'Codex App $imagegen') {
  return {
    schema: 'sks.image-ux-imagegen-blocker.v1',
    status: 'blocked',
    blocker: 'imagegen_capability_missing',
    surface,
    model: 'active-sks-image-mode',
    guidance: 'Run `sks imagegen generate` (it follows the active SKS image mode: Codex default, or the custom OpenRouter model chosen in SKS Control Center). Direct provider credentials remain non-Codex fallback evidence. SKS must not fabricate or substitute a text-only review.'
  };
}

function resolveImagesApiAuth(opts: any = {}) {
  const apiKey = String(opts.apiKey || process.env.OPENAI_API_KEY || '').trim() || null;
  return {
    apiKey,
    auth_source: apiKey ? 'OPENAI_API_KEY' : null,
    endpoint: imageEditsEndpoint(opts.baseUrl || 'https://api.openai.com/v1')
  };
}

function imageEditsEndpoint(baseUrl: any = '') {
  const base = String(baseUrl || DEFAULT_OPENAI_IMAGE_EDITS_ENDPOINT).trim().replace(/\/+$/, '');
  return /\/images\/edits$/i.test(base) ? base : `${base}/images/edits`;
}

function imagegenFetchTimeoutMs(opts: any = {}) {
  const value = Number(opts.fetchTimeoutMs || process.env.SKS_IMAGEGEN_FETCH_TIMEOUT_MS || DEFAULT_IMAGEGEN_FETCH_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_IMAGEGEN_FETCH_TIMEOUT_MS;
}

async function fetchWithTimeout(url: any, init: any, timeoutMs: number) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(new Error(`imagegen_fetch_timeout_${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    responseDeadlines.set(response, { controller, startedAt, timeoutMs, timer: timeout });
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function readResponsePayload(response: Response, timeoutMs = DEFAULT_IMAGEGEN_FETCH_TIMEOUT_MS) {
  const text = await textWithTimeout(response, timeoutMs);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const sse = parseResponsesSsePayload(text);
    if (sse) return sse;
    return { error: { message: text.slice(0, 2000) } };
  }
}

async function textWithTimeout(response: Response, timeoutMs: number) {
  const deadline = responseDeadlines.get(response);
  if (deadline) clearTimeout(deadline.timer);
  const remainingMs = deadline
    ? Math.max(1, deadline.timeoutMs - (Date.now() - deadline.startedAt))
    : timeoutMs;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      response.text(),
      new Promise<string>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(`imagegen_response_read_timeout_${timeoutMs}ms`);
          deadline?.controller.abort(error);
          void response.body?.cancel(error).catch(() => {});
          reject(error);
        }, remainingMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    responseDeadlines.delete(response);
  }
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
    provider_model: opts.provider_model || (opts.provider_surface === 'fake_imagegen_adapter' ? FAKE_IMAGEGEN_MODEL : opts.provider_surface === 'openai_images_api' ? API_FALLBACK_IMAGEGEN_MODEL : CODEX_DEFAULT_IMAGEGEN_LABEL),
    provider_surface: opts.provider_surface || 'codex_app_imagegen',
    evidence_class: opts.evidence_class || (opts.mock ? 'mock_fixture' : 'codex_app_imagegen'),
    output_source: opts.output_source || (opts.mock ? 'mock_fixture' : 'manual_attach'),
    output_sha256: opts.output_sha256 || await sha256File(absolute),
    requested_fidelity: 'reference_image_input',
    image_input_fidelity_note: 'reference_image_input',
    privacy: 'local-only',
    output_id: opts.output_id || null,
    created_at: opts.created_at || nowIso(),
    real_generated: opts.real_generated === true,
    mock: opts.mock === true,
    callout_extraction_required: true,
    source: opts.mock ? 'mock_fixture' : 'real_imagegen_callout'
  };
}

function mimeForPath(file: string) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function redactedImagegenResponse(payload: any, ok: boolean, latencyMs: number, retry: { attempts?: number; retry_log?: any[] } = {}) {
  return {
    schema: 'sks.image-ux-imagegen-response.v1',
    created_at: nowIso(),
    provider: 'openai_images_api',
    evidence_class: NON_CODEX_API_FALLBACK_EVIDENCE_CLASS,
    model: API_FALLBACK_IMAGEGEN_MODEL,
    ok,
    status: ok ? 'generated' : 'blocked',
    blocker: ok ? null : imagegenErrorKind(payload),
    redacted_error: payload?.error?.message ? String(payload.error.message).replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_OPENAI_KEY]') : null,
    payload_summary: summarizeImagegenPayload(payload),
    latency_ms: latencyMs,
    attempts: retry.attempts ?? null,
    retry_log: retry.retry_log ?? null,
    local_only: true
  };
}

// Classify a parsed image-API/Responses payload into a retryable error code so a
// 200-with-server_error SSE body or an `error.code` of rate_limit/overloaded is
// retried, not just non-2xx HTTP statuses. Returns null when not retryable.
function payloadRetryCode(payload: any): string | null {
  if (!payload) return null;
  const status = String(payload?.status || '');
  const errorType = String(payload?.error?.type || payload?.error?.code || '');
  const haystack = `${status} ${errorType} ${JSON.stringify(payload?.error || '')}`.toLowerCase();
  if (/rate[_ -]?limit|too many requests|429/.test(haystack)) return 'rate_limit_exceeded';
  if (/overloaded|proxy_overloaded|server[_ -]?error|temporarily unavailable|unavailable|5\d\d/.test(haystack)) return 'server_error';
  if (/timeout|timed out|aborted/.test(haystack)) return 'ETIMEDOUT';
  if (status === 'failed' && /server|overload|unavailable|rate/.test(haystack)) return 'server_error';
  // A stream that ended without a terminal event and without a single output
  // item was cut short server-side, which is transient — observed against
  // codex-lb mid-generation. Retry rather than reporting a missing image.
  if (status === 'unknown' && String(payload?.object || '') === 'response.sse') return 'server_error';
  return null;
}

// Keep review callouts legible while accepting the current documented quality options.
function imagegenQualityParam(opts: any = {}): { quality?: string } {
  const raw = String(opts.quality || process.env.SKS_IMAGEGEN_QUALITY || 'high').trim().toLowerCase();
  if (raw === 'none' || raw === 'off' || raw === '') return {};
  return (IMAGEGEN_QUALITIES as readonly string[]).includes(raw) ? { quality: raw } : { quality: 'high' };
}

// Wire imagegen fetches into the centralized responses retry policy: exponential
// backoff on 429/5xx/timeout and transient network errors, classifying a thrown
// fetch error (abort/timeout/network) into a retryable code.
function imagegenRetryOptions(opts: any = {}) {
  return {
    sleep: opts.retrySleep,
    classifyError: (err: unknown) => {
      const row = err as { code?: string; name?: string; message?: string } | null;
      const code = [row?.code, row?.name, row?.message].filter(Boolean).join(' ');
      if (/AbortError|timeout|abort/i.test(code)) return { code: 'ETIMEDOUT', status: null };
      if (/ECONNRESET|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|fetch failed/i.test(code)) return { code: 'ECONNRESET', status: null };
      return { code: 'request_failed', status: null };
    }
  };
}

function summarizeImagegenPayload(payload: any) {
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  return {
    id: payload?.id || null,
    object: payload?.object || null,
    status: payload?.status || null,
    model: payload?.model || null,
    error_type: payload?.error?.type || null,
    error_code: payload?.error?.code || null,
    image_output_partial_frame: payload?.image_output_partial_frame === true,
    partial_image_output_present: payload?.partial_image_output_present === true,
    image_output_provenance: payload?.image_output_provenance || null,
    output_count: outputs.length,
    output: outputs.slice(0, 8).map((output: any) => ({
      id: output?.id || null,
      type: output?.type || null,
      status: output?.status || null,
      action: output?.action || null,
      role: output?.role || null,
      result_present: typeof output?.result === 'string' || Boolean(output?.result?.b64_json || output?.b64_json),
      result_kind: typeof output?.result,
      result_chars: typeof output?.result === 'string' ? output.result.length : null,
      content_types: Array.isArray(output?.content) ? output.content.map((item: any) => item?.type || null) : []
    })),
    output_text: outputs.flatMap((output: any) => Array.isArray(output?.content) ? output.content : [])
      .filter((item: any) => typeof item?.text === 'string')
      .map((item: any) => item.text.slice(0, 500))
      .slice(0, 3)
  };
}

function imagegenErrorKind(payload: any) {
  const text = JSON.stringify(payload || {});
  if (/moderation|safety|policy/i.test(text)) return 'imagegen_moderation_blocked';
  if (/rate_limit|overloaded|proxy_overloaded|429/i.test(text)) return 'imagegen_remote_rate_limited';
  if (/timeout|AbortError|aborted/i.test(text)) return 'imagegen_remote_timeout';
  if (/api[_ -]?key|auth|401/i.test(text)) return 'openai_api_key_missing_or_invalid';
  return payload?.blocker || 'openai_images_api_error';
}
