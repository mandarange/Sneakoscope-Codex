/**
 * SKS image generation policy. SKS no longer pins an image model:
 * - custom mode off (default): Codex's own image generation, whose engine
 *   Codex chooses (the built-in tool exposes no model selector);
 * - custom mode on: the OpenRouter image model chosen in SKS Control Center,
 *   reached through the SKS Desktop Bridge by `sks imagegen generate`.
 * The mode lives in `~/.sneakoscope/imagegen/config.json` (see
 * imagegen-config.ts); this file holds only mode-independent text and limits.
 */

export const IMAGEGEN_GUIDE_URL = 'https://developers.openai.com/api/docs/guides/image-generation';
export const IMAGEGEN_MODEL_CATALOG_URL = 'https://developers.openai.com/api/docs/models';
/** Kept for artifact fields that link the image-generation reference. */
export const IMAGEGEN_MODEL_DOC_URL = IMAGEGEN_GUIDE_URL;

/**
 * The engine Codex documents for its built-in image tool today. Informational
 * only: SKS never requires it, and a newer Codex engine is equally valid.
 */
export const CODEX_BUILTIN_IMAGEGEN_MODEL = 'gpt-image-2' as const;
export const CODEX_BUILTIN_IMAGEGEN_MODEL_SELECTABLE = false;

export const IMAGEGEN_MODEL_POLICY = 'SKS image generation follows the image mode in SKS Control Center (`sks imagegen status --json`). Custom image model off, the default: use Codex\'s own image generation, meaning the built-in image tool inside a Codex turn or `sks imagegen generate` outside one; Codex chooses its current image model and SKS never pins one. Custom image model on: make every image with `sks imagegen generate --prompt <text> --out <file>` (add `--reference <file>` to edit an image); it goes through the SKS Desktop Bridge to the OpenRouter image model chosen in Control Center, so do not use the built-in image tool then. Record the model the tool reports with each output and never relabel an output as another model. Report imagegen_capability_missing only after the active mode\'s path fails.';

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
