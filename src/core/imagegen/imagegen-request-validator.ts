import { IMAGEGEN_MODEL, IMAGEGEN_QUALITIES, isImagegenSize } from './imagegen-model-policy.js';
import path from 'node:path';
import { exists, nowIso, sha256, writeJsonAtomic } from '../fsx.js';
import { sha256File } from '../wiki-image/image-hash.js';

export interface ImagegenRequestValidationInput {
  provider: string;
  endpoint: string;
  model: string;
  prompt: string;
  source_image_path: string;
  output_dir: string;
  params?: Record<string, unknown>;
  privacy?: string;
}

export async function validateImagegenRequest(input: ImagegenRequestValidationInput) {
  const blockers: string[] = [];
  const source = path.resolve(input.source_image_path || '');
  const params = input.params || {};
  if (input.model !== IMAGEGEN_MODEL) blockers.push('imagegen_model_not_current');
  if (!String(input.prompt || '').trim()) blockers.push('prompt_required');
  if (!await exists(source)) blockers.push('source_image_missing');
  if ('input_fidelity' in params || 'inputFidelity' in params) blockers.push('input_fidelity_must_be_omitted_for_imagegen');
  if (params.background === 'transparent' && !['png', 'webp'].includes(String(params.output_format || 'png'))) blockers.push('transparent_background_requires_png_or_webp');
  if (params.size != null && !isImagegenSize(params.size)) blockers.push('unsupported_image_size');
  if (params.quality != null && !(IMAGEGEN_QUALITIES as readonly unknown[]).includes(params.quality)) blockers.push('unsupported_image_quality');
  if (input.privacy !== 'local-only') blockers.push('privacy_must_be_local_only');
  const sourceSha = blockers.includes('source_image_missing') ? null : await sha256File(source).catch(() => null);
  const promptHash = sha256(String(input.prompt || ''));
  return {
    schema: 'sks.imagegen-request-validation.v1',
    ok: blockers.length === 0,
    created_at: nowIso(),
    provider: input.provider,
    endpoint: input.endpoint,
    model: input.model,
    source_image_path: source,
    source_image_sha256: sourceSha,
    output_dir: path.resolve(input.output_dir || '.'),
    prompt_hash: promptHash,
    prompt_chars: String(input.prompt || '').length,
    params_checked: {
      size: params.size || 'auto',
      input_fidelity_present: 'input_fidelity' in params || 'inputFidelity' in params,
      transparent_background_requested: params.background === 'transparent'
    },
    unsupported_parameters_omitted: ['input_fidelity'],
    privacy: input.privacy || null,
    blockers
  };
}

export async function writeImagegenRequestValidationArtifact(input: ImagegenRequestValidationInput, artifactPath: string) {
  const validation = await validateImagegenRequest(input);
  await writeJsonAtomic(artifactPath, validation);
  return validation;
}
