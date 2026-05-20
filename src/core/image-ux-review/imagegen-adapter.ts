import path from 'node:path';
import { nowIso } from '../fsx.js';
import { sha256File, imageDimensions } from '../wiki-image/image-hash.js';

export interface ImageUxReviewImagegenAdapter {
  surface: 'codex_app_imagegen' | 'openai_images_api';
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

export function createCodexAppImagegenAdapter(): ImageUxReviewImagegenAdapter {
  return {
    surface: 'codex_app_imagegen',
    model: 'gpt-image-2',
    available: false,
    async generateCalloutReview() {
      return {
        ok: false,
        status: 'blocked',
        generated_image_path: null,
        output_id: null,
        blocker: 'imagegen_capability_missing'
      };
    }
  };
}

export function imagegenCapabilityBlocker(surface = 'Codex App $imagegen') {
  return {
    schema: 'sks.image-ux-imagegen-blocker.v1',
    status: 'blocked',
    blocker: 'imagegen_capability_missing',
    surface,
    model: 'gpt-image-2',
    guidance: 'Run the request in Codex App with $imagegen/gpt-image-2 and attach the generated annotated review image path; SKS must not fabricate or substitute a text-only review.'
  };
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
    requested_fidelity: 'original',
    privacy: 'local-only',
    output_id: opts.output_id || null,
    created_at: opts.created_at || nowIso(),
    real_generated: opts.real_generated === true,
    mock: opts.mock === true,
    callout_extraction_required: true,
    source: opts.mock ? 'mock_fixture' : 'real_gpt_image_2_callout'
  };
}
