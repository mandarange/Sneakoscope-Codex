import path from 'node:path';
import { exists, nowIso, sha256, writeJsonAtomic } from '../fsx.js';
import { sha256File } from '../wiki-image/image-hash.js';

export interface GptImage2RequestValidationInput {
  provider: string;
  endpoint: string;
  model: string;
  prompt: string;
  source_image_path: string;
  output_dir: string;
  params?: Record<string, unknown>;
  privacy?: string;
}

const ALLOWED_SIZES = new Set(['auto', '1024x1024', '1024x1536', '1536x1024']);

export async function validateGptImage2Request(input: GptImage2RequestValidationInput) {
  const blockers: string[] = [];
  const source = path.resolve(input.source_image_path || '');
  const params = input.params || {};
  if (input.model !== 'gpt-image-2') blockers.push('model_must_be_gpt_image_2');
  if (!String(input.prompt || '').trim()) blockers.push('prompt_required');
  if (!await exists(source)) blockers.push('source_image_missing');
  if ('input_fidelity' in params || 'inputFidelity' in params) blockers.push('input_fidelity_must_be_omitted_for_gpt_image_2');
  if (params.background === 'transparent') blockers.push('transparent_background_not_supported_for_this_callout_route');
  if (params.size != null && !ALLOWED_SIZES.has(String(params.size))) blockers.push('unsupported_image_size');
  if (input.privacy !== 'local-only') blockers.push('privacy_must_be_local_only');
  const sourceSha = blockers.includes('source_image_missing') ? null : await sha256File(source).catch(() => null);
  const promptHash = sha256(String(input.prompt || ''));
  return {
    schema: 'sks.gpt-image-2-request-validation.v1',
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
    gpt_image_2_input_fidelity_automatic: true,
    privacy: input.privacy || null,
    blockers
  };
}

export async function writeGptImage2RequestValidationArtifact(input: GptImage2RequestValidationInput, artifactPath: string) {
  const validation = await validateGptImage2Request(input);
  await writeJsonAtomic(artifactPath, validation);
  return validation;
}
