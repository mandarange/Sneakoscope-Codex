import path from 'node:path';
import fsp from 'node:fs/promises';
import { nowIso } from '../fsx.js';
import { sha256File, imageDimensions } from '../wiki-image/image-hash.js';

export const PPT_FIXED_DECK_ARTIFACT = 'ppt-fixed-deck.json';
export const PPT_RECHECK_REPORT_ARTIFACT = 'ppt-recheck-report.json';

export async function attachFixedDeck({ root, dir, deckPath }: any = {}) {
  if (!deckPath) {
    return {
      schema: 'sks.ppt-fixed-deck.v1',
      created_at: nowIso(),
      ok: false,
      blockers: ['fixed_deck_required']
    };
  }
  const source = path.resolve(root, deckPath);
  const dest = path.join(dir, 'fixed-deck', path.basename(source));
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (source !== dest) await fsp.copyFile(source, dest);
  return {
    schema: 'sks.ppt-fixed-deck.v1',
    schema_version: 1,
    created_at: nowIso(),
    ok: true,
    deck_path: path.relative(root, dest).split(path.sep).join('/'),
    fixed_deck_sha256: await sha256File(dest),
    local_only: true,
    blockers: []
  };
}

export async function attachFixedSlideImage({ root, dir, slideIndex, imagePath }: any = {}) {
  if (!imagePath) {
    return {
      schema: 'sks.ppt-fixed-slide-image.v1',
      ok: false,
      blockers: ['fixed_slide_image_required']
    };
  }
  const source = path.resolve(root, imagePath);
  const dest = path.join(dir, 'fixed-slide-images', `slide-${slideIndex || 1}${path.extname(source) || '.png'}`);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (source !== dest) await fsp.copyFile(source, dest);
  const dimensions = await imageDimensions(dest);
  return {
    schema: 'sks.ppt-fixed-slide-image.v1',
    schema_version: 1,
    created_at: nowIso(),
    ok: true,
    slide_index: Number(slideIndex || 1),
    image_path: path.relative(root, dest).split(path.sep).join('/'),
    sha256: await sha256File(dest),
    width: dimensions.width,
    height: dimensions.height,
    format: dimensions.format,
    local_only: true,
    blockers: []
  };
}

export function buildPptRecheckReport({ patchResult, fixedDeck = null, fixedSlideImage = null, deckIssueLedger, mock = false }: any = {}) {
  const originalBlocking = Number(deckIssueLedger?.p0_p1_open_count || 0);
  const changedSlides = patchResult?.changed_slides || (fixedSlideImage?.ok ? [fixedSlideImage.slide_index] : []);
  const hasFixedEvidence = Boolean(fixedDeck?.ok || fixedSlideImage?.ok || mock);
  const blockers: string[] = [];
  if (patchResult?.re_export_required && !hasFixedEvidence) blockers.push('ppt_slide_recheck_missing');
  if (originalBlocking > 0 && !hasFixedEvidence) blockers.push('ppt_fix_not_reexported');
  return {
    schema: 'sks.ppt-recheck-report.v1',
    schema_version: 1,
    created_at: nowIso(),
    changed_slides: changedSlides,
    fixed_deck_sha256: fixedDeck?.fixed_deck_sha256 || null,
    fixed_slide_images: fixedSlideImage?.ok ? [fixedSlideImage] : [],
    changed_slides_rechecked: hasFixedEvidence || (originalBlocking === 0 && !patchResult?.re_export_required),
    deck_rechecked: Boolean(fixedDeck?.ok || mock || (originalBlocking === 0 && !patchResult?.re_export_required)),
    original_p0_p1_status: originalBlocking > 0 && hasFixedEvidence ? 'requires_re_review_extraction' : originalBlocking > 0 ? 'remains_open' : 'none_open',
    new_p0_p1_regressions: 0,
    blockers: [...new Set(blockers)],
    passed: blockers.length === 0
  };
}
