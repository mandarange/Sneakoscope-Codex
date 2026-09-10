/** Current official recommendation. Keep model selection separate from artifact schemas. */
export const IMAGEGEN_MODEL = 'gpt-image-2.5-sunburst' as const;
export const IMAGEGEN_MODEL_NAME = 'GPT Image 2.5 Sunburst';
export const IMAGEGEN_MODEL_DOC_URL = `https://developers.openai.com/api/docs/models/${IMAGEGEN_MODEL}`;
export const IMAGEGEN_GUIDE_URL = 'https://developers.openai.com/api/docs/guides/image-generation';
export const IMAGEGEN_MODEL_CATALOG_URL = 'https://developers.openai.com/api/docs/models';
export const IMAGEGEN_MODEL_VERIFIED_AT = '2026-09-10';

// The host tool exposes no model selector. Its documented engine must never
// be relabeled as the requested API model merely because a prompt names it.
export const CODEX_BUILTIN_IMAGEGEN_MODEL = 'gpt-image-2' as const;
export const CODEX_BUILTIN_IMAGEGEN_MODEL_SELECTABLE = false;

export const IMAGEGEN_MODEL_POLICY = `Use the latest officially documented GPT Image model for every SKS image generation/editing, UX callout, and PPT asset/review request. The current recommendation is ${IMAGEGEN_MODEL_NAME} (${IMAGEGEN_MODEL}), verified ${IMAGEGEN_MODEL_VERIFIED_AT}: ${IMAGEGEN_MODEL_DOC_URL}. Check ${IMAGEGEN_MODEL_CATALOG_URL} and ${IMAGEGEN_GUIDE_URL} before image work when newer model information is requested or available; update this shared policy and verify its request contract before adopting a successor. Do not use dated snapshots, deprecated chatgpt-image-latest, or an older-model fallback. In the Image API set model=${IMAGEGEN_MODEL}; in Responses set image_generation.model=${IMAGEGEN_MODEL} while preserving the user's mainline model/provider. A prompt naming a model does not switch the Codex built-in image engine. If the host cannot select or prove the required model, use the user's already-selected ready bridge/API path or report imagegen_model_unavailable. Never label an older or unknown output as ${IMAGEGEN_MODEL}.`;

export const IMAGEGEN_QUALITIES = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'] as const;

export function isImagegenSize(value: unknown): boolean {
  if (value === 'auto') return true;
  const match = /^(\d+)x(\d+)$/.exec(String(value));
  if (!match) return false;
  const width = Number(match[1]); const height = Number(match[2]);
  return width > 0 && height > 0 && width % 16 === 0 && height % 16 === 0
    && width <= 3840 && height <= 3840 && width <= height * 3 && height <= width * 3
    && width * height >= 655_360 && width * height <= 8_294_400;
}
