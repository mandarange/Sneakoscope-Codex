import { IMAGEGEN_MODEL, CODEX_BUILTIN_IMAGEGEN_MODEL, IMAGEGEN_QUALITIES } from '../imagegen/imagegen-model-policy.js';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, exists, nowIso, projectRoot, readJson, writeJsonAtomic } from '../fsx.js';
import { sha256File, imageDimensions } from '../wiki-image/image-hash.js';
import { detectImagegenCapability } from '../imagegen/imagegen-capability.js';
import {
  DESKTOP_BRIDGE_IMAGEGEN_RECOVERY_GUIDANCE,
  resolveDesktopBridgeImagegenTarget,
  type DesktopBridgeImagegenTarget
} from '../imagegen/desktop-bridge-imagegen-target.js';
import {
  CODEX_LB_PROVIDER_IMAGEGEN_EVIDENCE_CLASS,
  CODEX_LB_PROVIDER_OUTPUT_SOURCE,
  MOCK_FIXTURE_EVIDENCE_CLASS,
  NON_CODEX_API_FALLBACK_EVIDENCE_CLASS
} from '../imagegen/imagegen-evidence.js';
import { validateImagegenRequest } from '../imagegen/imagegen-request-validator.js';
import { parseResponsesSsePayload } from '../responses-stream.js';
import { withResponsesRetry } from '../responses-retry-policy.js';
import { writeImageArtifactPathContract } from '../image/image-artifact-path-contract.js';
import { registerImageArtifact } from '../image/image-artifact-registry.js';

const DEFAULT_OPENAI_IMAGE_EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits';
export const DEFAULT_IMAGEGEN_FETCH_TIMEOUT_MS = 180000;
const responseDeadlines = new WeakMap<Response, {
  controller: AbortController;
  startedAt: number;
  timeoutMs: number;
  timer: ReturnType<typeof setTimeout>;
}>();
const runtimeDesktopBridgeTargets = new WeakSet<object>();

export interface ImageUxReviewImagegenAdapter {
  surface: 'codex_app_imagegen' | 'openai_images_api' | 'fake_imagegen_adapter';
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
  return {
    surface: 'codex_app_imagegen',
    model: CODEX_BUILTIN_IMAGEGEN_MODEL,
    available: false,
    async generateCalloutReview(input: ImageUxReviewImagegenRequest) {
      const blocker = opts.available === true ? 'imagegen_model_unavailable' : 'imagegen_capability_missing';
      const responseArtifact = input?.output_dir ? path.join(input.output_dir, 'image-ux-imagegen-response.json') : null;
      if (responseArtifact) await writeJsonAtomic(responseArtifact, {
        schema: 'sks.image-ux-imagegen-response.v1', created_at: nowIso(),
        provider: 'codex_app_imagegen', evidence_class: 'codex_app_imagegen',
        model: CODEX_BUILTIN_IMAGEGEN_MODEL, requested_model: IMAGEGEN_MODEL,
        ok: false, status: 'blocked', blocker, local_only: true,
        setup_guidance: 'The built-in image tool exposes no model selector. Use the selected ready Desktop Bridge or an explicitly authorized Images API request. A prompt or attached file cannot prove a different engine.'
      });
      return { ok: false, status: 'blocked', generated_image_path: null, output_id: null,
        blocker, provider: 'codex_app_imagegen', response_artifact: responseArtifact, latency_ms: null };
    }
  };
}

export function createFakeImagegenAdapter(opts: any = {}): ImageUxReviewImagegenAdapter {
  return {
    surface: 'fake_imagegen_adapter',
    model: IMAGEGEN_MODEL,
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
          model: IMAGEGEN_MODEL,
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
        model: IMAGEGEN_MODEL,
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
        model: IMAGEGEN_MODEL,
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
          model: IMAGEGEN_MODEL,
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
        model: IMAGEGEN_MODEL,
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
  const desktopBridgeTarget = trustedDesktopBridgeTarget(opts.desktopBridgeTarget);
  return {
    surface: 'openai_images_api',
    model: IMAGEGEN_MODEL,
    available: Boolean(apiKey || desktopBridgeTarget?.selected || desktopBridgeTarget?.model),
    async generateCalloutReview(input: ImageUxReviewImagegenRequest) {
      const started = Date.now();
      await ensureDir(input.output_dir);
      const requestArtifact = path.join(input.output_dir, 'image-ux-imagegen-request.json');
      const responseArtifact = path.join(input.output_dir, 'image-ux-imagegen-response.json');
      const sourcePath = path.resolve(input.source_image_path);
      const sourceSha = await sha256File(sourcePath);
      const auth = await resolveImagesApiAuth({ ...opts, apiKey, desktopBridgeTarget });
      const useResponsesImageTool = auth.auth_source === 'DESKTOP_BRIDGE_LOOPBACK' && Boolean(auth.responses_endpoint);
      const effectiveEndpoint = useResponsesImageTool ? auth.responses_endpoint : auth.endpoint;
      const responsesModel = String(auth.responses_model || '');
      const desktopBridgeSelected = useResponsesImageTool && auth.desktop_bridge_selected === true;
      const responsesEvidenceClass = desktopBridgeSelected
        ? auth.live_evidence_allowed === true
          ? CODEX_LB_PROVIDER_IMAGEGEN_EVIDENCE_CLASS
          : MOCK_FIXTURE_EVIDENCE_CLASS
        : NON_CODEX_API_FALLBACK_EVIDENCE_CLASS;
      const responsesOutputSource = desktopBridgeSelected && auth.live_evidence_allowed === true
        ? CODEX_LB_PROVIDER_OUTPUT_SOURCE
        : null;
      const validation = await validateImagegenRequest({
        provider: 'openai_images_api',
        endpoint: String(effectiveEndpoint || ''),
        model: IMAGEGEN_MODEL,
        prompt: input.prompt,
        source_image_path: sourcePath,
        output_dir: input.output_dir,
        params: { size: 'auto' },
        privacy: input.privacy
      });
      await writeJsonAtomic(requestArtifact, {
        schema: 'sks.image-ux-imagegen-request.v1',
        created_at: nowIso(),
        provider: useResponsesImageTool ? 'desktop_bridge_responses_image_generation' : 'openai_images_api',
        endpoint: effectiveEndpoint,
        auth_source: auth.auth_source,
        auth_transport: auth.auth_transport,
        model: IMAGEGEN_MODEL,
        responses_model: useResponsesImageTool ? responsesModel : null,
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
          evidence_class: 'non_codex_api_fallback',
          model: IMAGEGEN_MODEL,
          ok: false,
          status: 'blocked',
          blocker: 'imagegen_request_validation_failed',
          validation_blockers: validation.blockers,
          local_only: true
        });
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: 'imagegen_request_validation_failed', provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
      if (auth.blocker || (!useResponsesImageTool && !auth.apiKey)) {
        const blocked = {
          schema: 'sks.image-ux-imagegen-response.v1',
          created_at: nowIso(),
          provider: 'openai_images_api',
          evidence_class: 'non_codex_api_fallback',
          model: IMAGEGEN_MODEL,
          ok: false,
          status: 'blocked',
          blocker: auth.blocker,
          setup_guidance: auth.auth_source === 'DESKTOP_BRIDGE_LOOPBACK'
            ? auth.setup_guidance || DESKTOP_BRIDGE_IMAGEGEN_RECOVERY_GUIDANCE
            : 'Set OPENAI_API_KEY only for an explicit non-Codex Images API fallback, or attach a real Codex App $imagegen output image for full SKS verification.',
          local_only: true
        };
        await writeJsonAtomic(responseArtifact, blocked);
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: auth.blocker, provider: 'openai_images_api', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
      if (useResponsesImageTool && !responsesModel) {
        const blocker = 'imagegen_responses_model_missing';
        await writeJsonAtomic(responseArtifact, {
          schema: 'sks.image-ux-imagegen-response.v1',
          created_at: nowIso(),
          provider: 'desktop_bridge_responses_image_generation',
          evidence_class: 'non_codex_api_fallback',
          model: IMAGEGEN_MODEL,
          ok: false,
          status: 'blocked',
          blocker,
          setup_guidance: DESKTOP_BRIDGE_IMAGEGEN_RECOVERY_GUIDANCE,
          local_only: true
        });
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker, provider: 'desktop_bridge_responses_image_generation', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
      }
      try {
        if (useResponsesImageTool) {
          const imageDataUrl = `data:${mimeForPath(sourcePath)};base64,${await fsp.readFile(sourcePath, 'base64')}`;
          const { result: attemptResult, attempts, retry_log } = await withResponsesRetry(async () => {
            const response = await fetchWithTimeout(effectiveEndpoint, {
              method: 'POST',
              headers: {
                'x-sks-model': responsesModel,
                'content-type': 'application/json'
              },
              body: JSON.stringify({
                model: responsesModel,
                input: [{
                  role: 'user',
                  content: [
                    { type: 'input_text', text: input.prompt },
                    { type: 'input_image', image_url: imageDataUrl }
                  ]
                }],
                tools: [{ type: 'image_generation', model: IMAGEGEN_MODEL, action: 'edit', size: 'auto', ...imagegenQualityParam(opts) }],
                tool_choice: { type: 'image_generation' }
              })
            }, imagegenFetchTimeoutMs(opts));
            const payload = await readResponsePayload(response, imagegenFetchTimeoutMs(opts));
            // Retry on transient HTTP status OR an SSE/JSON server_error/rate_limit payload.
            return { value: { response, payload }, status: response.ok ? null : response.status, code: payloadRetryCode(payload) };
          }, imagegenRetryOptions(opts));
          const { response, payload } = attemptResult;
          if (!response.ok) {
            await writeJsonAtomic(responseArtifact, redactedImagegenResponse(payload, false, Date.now() - started, 'desktop_bridge_responses_image_generation', { attempts, retry_log }));
            return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: imagegenErrorKind(payload), provider: 'desktop_bridge_responses_image_generation', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
          }
          if (payload?.error) {
            await writeJsonAtomic(responseArtifact, redactedImagegenResponse(payload, false, Date.now() - started, 'desktop_bridge_responses_image_generation'));
            return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: imagegenErrorKind(payload), provider: 'desktop_bridge_responses_image_generation', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
          }
          const generated = findResponsesImageGenerationOutput(payload);
          if (!generated?.b64) {
            await writeJsonAtomic(responseArtifact, redactedImagegenResponse({ ...payload, blocker: 'missing_b64_image_output' }, false, Date.now() - started, 'desktop_bridge_responses_image_generation'));
            return { ok: false, status: 'blocked', generated_image_path: null, output_id: generated?.id || null, blocker: 'missing_b64_image_output', provider: 'desktop_bridge_responses_image_generation', request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
          }
          const out = path.join(input.output_dir, `imagegen-callout-${Date.now()}.png`);
          await fsp.writeFile(out, Buffer.from(String(generated.b64), 'base64'));
          const meta = await generatedImageMetadata(process.cwd(), out, {
            source_screen_id: input.source_screen_id,
            provider_surface: 'desktop_bridge_responses_image_generation',
            output_id: generated.id || payload?.id || null,
            evidence_class: responsesEvidenceClass,
            output_source: responsesOutputSource,
            real_generated: auth.live_evidence_allowed === true,
            mock: auth.live_evidence_allowed !== true
          });
          const imageContract = await writeGeneratedImagePathContract(input, out, 'desktop_bridge_responses_image_generation').catch(() => null);
          await writeJsonAtomic(responseArtifact, {
            schema: 'sks.image-ux-imagegen-response.v1',
            created_at: nowIso(),
            provider: 'desktop_bridge_responses_image_generation',
            evidence_class: responsesEvidenceClass,
            model: IMAGEGEN_MODEL,
            responses_model: responsesModel,
            responses_model_source: auth.responses_model_source || null,
            auth_source: auth.auth_source,
            desktop_bridge_selected: desktopBridgeSelected,
            desktop_bridge_route_provider: auth.route_provider_id || null,
            ok: true,
            status: 'generated',
            output_image_path: out,
            output_image_sha256: meta.sha256,
            output_sha256: meta.sha256,
            output_id: meta.output_id,
            output_source: responsesOutputSource,
            image_output_recovered_from_stream: payload?.image_output_recovered_from_stream === true,
            image_output_provenance: payload?.image_output_provenance || 'response.output',
            image_output_partial_frame: false,
            image_artifact_path_contract: imageContract?.artifact_path || null,
            dimensions: { width: meta.width, height: meta.height, format: meta.format },
            latency_ms: Date.now() - started,
            token_cost_metadata: payload?.usage || null,
            local_only: true
          });
          return { ok: true, status: 'generated', generated_image_path: out, output_id: meta.output_id, blocker: null, provider: 'desktop_bridge_responses_image_generation', request_artifact: requestArtifact, response_artifact: responseArtifact, image_artifact_path_contract: imageContract?.artifact_path || null, latency_ms: Date.now() - started };
        }
        const sourceBytes = await fsp.readFile(sourcePath);
        const qualityParam = imagegenQualityParam(opts);
        const { result: attemptResult, attempts, retry_log } = await withResponsesRetry(async () => {
          const form = new FormData();
          form.append('model', IMAGEGEN_MODEL);
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
          await writeJsonAtomic(responseArtifact, redactedImagegenResponse(payload, false, Date.now() - started, 'openai_images_api', { attempts, retry_log }));
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
          evidence_class: 'non_codex_api_fallback',
          model: IMAGEGEN_MODEL,
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
        const provider = useResponsesImageTool ? 'desktop_bridge_responses_image_generation' : 'openai_images_api';
        const payload = { error: { message: err instanceof Error ? err.message : String(err) } };
        const response = redactedImagegenResponse(payload, false, Date.now() - started, provider);
        await writeJsonAtomic(responseArtifact, response);
        return { ok: false, status: 'blocked', generated_image_path: null, output_id: null, blocker: imagegenErrorKind(payload), provider, request_artifact: requestArtifact, response_artifact: responseArtifact, latency_ms: Date.now() - started };
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

export async function generateImagegenCalloutReview(input: ImageUxReviewImagegenRequest, opts: any = {}) {
  if ((opts.fake === true || process.env.SKS_TEST_FAKE_IMAGEGEN === '1') && imagegenMockContext(opts)) {
    return createFakeImagegenAdapter({ ...(opts.fakeAdapter || {}), mockContext: true }).generateCalloutReview(input);
  }
  const capability = await detectImagegenCapability(opts.capability || {}).catch(() => null);
  const suppliedTarget = opts.desktopBridgeTarget
    ? trustedDesktopBridgeTarget(opts.desktopBridgeTarget)
    : null;
  const desktopBridgeTarget = suppliedTarget || await resolveDesktopBridgeImagegenTarget(
    desktopBridgeTargetInputs(opts.capability, opts.openai || opts)
  ).catch(() => null);
  if (!suppliedTarget && desktopBridgeTarget?.status_source === 'runtime') {
    runtimeDesktopBridgeTargets.add(desktopBridgeTarget);
  }
  const managedBridgeRequested = Boolean(desktopBridgeTarget?.selected || desktopBridgeTarget?.model);
  const allowApiFallback = (
    opts.allowApiFallback === true
    || process.env.SKS_IMAGEGEN_ALLOW_API_FALLBACK === '1'
    || managedBridgeRequested
  );
  const openaiOptions = {
    ...(opts.openai || {}),
    desktopBridgeTarget
  };
  const codexAdapter = createCodexAppImagegenAdapter({
    ...(opts.codexApp || {}),
    available: opts.codexApp?.available === true || capability?.codex_app?.available === true
  });
  const codexResult = await codexAdapter.generateCalloutReview(input);
  if (codexResult.ok || !allowApiFallback) return codexResult;
  return createOpenAIImagesApiAdapter(openaiOptions).generateCalloutReview(input);
}

function desktopBridgeTargetInputs(source: any = {}, request: any = {}) {
  const inputs: Record<string, unknown> = {
    explicitModel: String(request.responsesModel || source?.env?.SKS_IMAGEGEN_RESPONSES_MODEL || '').trim() || null
  };
  if (source?.home) inputs.home = source.home;
  if (source?.env) inputs.env = source.env;
  if (source?.desktopBridgeStatus !== undefined) inputs.desktopBridgeStatus = source.desktopBridgeStatus;
  if (source?.desktopBridgeStatusImpl) inputs.desktopBridgeStatusImpl = source.desktopBridgeStatusImpl;
  return inputs;
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
    model: IMAGEGEN_MODEL,
    guidance: ("Run the request with " + IMAGEGEN_MODEL + " through Codex App $imagegen, or provide an explicit model routed by the verified managed Desktop Bridge. Direct provider credentials remain non-Codex fallback evidence. SKS must not fabricate or substitute a text-only review.")
  };
}

async function resolveImagesApiAuth(opts: any = {}) {
  const target = trustedDesktopBridgeTarget(opts.desktopBridgeTarget);
  // Managed routing is authoritative. Even a blocked bridge target must not be
  // detoured to an ambient provider key.
  if (target && (target.selected || target.model)) return desktopBridgeImagesApiAuth(target);

  const openAiKey = String(opts.apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (openAiKey) {
    return {
      apiKey: openAiKey,
      auth_source: 'OPENAI_API_KEY',
      auth_transport: 'authorization-bearer',
      responses_model: responsesImagegenModel(opts),
      responses_model_source: responsesImagegenModel(opts) ? 'explicit' : null,
      endpoint: imageEditsEndpoint(opts.baseUrl || 'https://api.openai.com/v1'),
      responses_endpoint: responsesEndpoint(opts.baseUrl || 'https://api.openai.com/v1'),
      blocker: null,
      desktop_bridge_selected: false,
      route_provider_id: null,
      live_evidence_allowed: false,
      setup_guidance: null
    };
  }
  return {
    apiKey: null,
    auth_source: null,
    auth_transport: 'authorization-bearer',
    responses_model: responsesImagegenModel(opts),
    responses_model_source: null,
    endpoint: imageEditsEndpoint(opts.baseUrl || 'https://api.openai.com/v1'),
    responses_endpoint: responsesEndpoint(opts.baseUrl || 'https://api.openai.com/v1'),
    blocker: 'openai_api_key_missing',
    desktop_bridge_selected: false,
    route_provider_id: null,
    live_evidence_allowed: false,
    setup_guidance: null
  };
}

function desktopBridgeImagesApiAuth(target: DesktopBridgeImagegenTarget) {
  return {
    apiKey: null,
    auth_source: 'DESKTOP_BRIDGE_LOOPBACK',
    auth_transport: 'loopback-route',
    responses_model: target.model || '',
    responses_model_source: target.model_source,
    endpoint: null,
    responses_endpoint: target.endpoint,
    blocker: target.blocker,
    desktop_bridge_selected: target.selected,
    route_provider_id: target.provider_id,
    live_evidence_allowed: target.live_evidence_allowed,
    setup_guidance: target.setup_guidance
  };
}

function trustedDesktopBridgeTarget(value: unknown): DesktopBridgeImagegenTarget | null {
  if (!value || typeof value !== 'object') return null;
  const target = value as DesktopBridgeImagegenTarget;
  const runtimeTrusted = runtimeDesktopBridgeTargets.has(target);
  if (runtimeTrusted
    && target.status_source === 'runtime'
    && target.bridge_verified === true
    && target.live_evidence_allowed === true) return target;
  return {
    ...target,
    status_source: 'injected_fixture',
    live_evidence_allowed: false
  };
}

function imageEditsEndpoint(baseUrl: any = '') {
  const base = String(baseUrl || DEFAULT_OPENAI_IMAGE_EDITS_ENDPOINT).trim().replace(/\/+$/, '');
  return /\/images\/edits$/i.test(base) ? base : `${base}/images/edits`;
}

function responsesEndpoint(baseUrl: any = '') {
  const base = String(baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  return /\/responses$/i.test(base) ? base : `${base}/responses`;
}

function responsesImagegenModel(opts: any = {}) {
  return String(opts.responsesModel || process.env.SKS_IMAGEGEN_RESPONSES_MODEL || '').trim();
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


function findResponsesImageGenerationOutput(payload: any): { b64: string | null, id: string | null } | null {
  if (payload?.image_output_partial_frame === true) return null;
  for (const output of Array.isArray(payload?.output) ? payload.output : []) {
    if (String(output?.type || '') === 'image_generation_call') {
      if (String(output?.status || '') === 'partial') continue;
      const b64 = typeof output?.result === 'string' ? output.result : output?.result?.b64_json || output?.b64_json || null;
      if (b64) return { b64: String(b64), id: output?.id || payload?.id || null };
    }
  }
  return null;
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
    provider_model: opts.provider_model || (['openai_images_api', 'desktop_bridge_responses_image_generation', 'fake_imagegen_adapter'].includes(opts.provider_surface) ? IMAGEGEN_MODEL : CODEX_BUILTIN_IMAGEGEN_MODEL),
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

function redactedImagegenResponse(payload: any, ok: boolean, latencyMs: number, provider = 'openai_images_api', retry: { attempts?: number; retry_log?: any[] } = {}) {
  return {
    schema: 'sks.image-ux-imagegen-response.v1',
    created_at: nowIso(),
    provider,
    evidence_class: provider === 'codex_app_imagegen' ? 'codex_app_imagegen' : 'non_codex_api_fallback',
    model: IMAGEGEN_MODEL,
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
