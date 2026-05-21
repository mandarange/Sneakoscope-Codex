import path from 'node:path';
import fsp from 'node:fs/promises';
import { exists, nowIso } from '../fsx.js';
import { sha256File, imageDimensions } from '../wiki-image/image-hash.js';

export const PPT_DECK_INVENTORY_ARTIFACT = 'ppt-deck-inventory.json';
export const PPT_SLIDE_EXPORT_LEDGER_ARTIFACT = 'ppt-slide-export-ledger.json';

export function splitList(value: any = '') {
  if (Array.isArray(value)) return value.map((item: any) => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/[,;\n]/)
    .map((item: any) => item.trim())
    .filter(Boolean);
}

export async function buildPptDeckInventory({ root, deckPath, mock = false }: any = {}) {
  if (!deckPath && mock) {
    return {
      schema: 'sks.ppt-deck-inventory.v1',
      schema_version: 1,
      created_at: nowIso(),
      deck_present: true,
      deck_path: 'mock-fixture.pptx',
      deck_local_only: true,
      deck_sha256: 'mock_fixture_pptx_sha256',
      slide_count: 1,
      slide_count_detection: 'mock_fixture',
      blockers: [],
      passed: true
    };
  }
  const blockers: string[] = [];
  if (!deckPath) blockers.push('deck_required');
  const absoluteDeckPath = deckPath ? path.resolve(root, deckPath) : null;
  const deckExists = Boolean(absoluteDeckPath && await exists(absoluteDeckPath));
  if (deckPath && !deckExists) blockers.push('deck_required');
  const sha256 = deckExists ? await sha256File(absoluteDeckPath as string) : null;
  const slideCount = deckExists ? await detectPptxSlideCount(absoluteDeckPath as string) : 0;
  if (deckExists && slideCount === 0 && !mock) blockers.push('slide_count_unavailable');
  return {
    schema: 'sks.ppt-deck-inventory.v1',
    schema_version: 1,
    created_at: nowIso(),
    deck_present: deckExists,
    deck_path: deckPath || null,
    deck_local_only: true,
    deck_sha256: sha256,
    slide_count: mock && slideCount === 0 && deckExists ? 1 : slideCount,
    slide_count_detection: deckExists ? 'pptx_slide_entry_scan' : 'not_run',
    blockers,
    passed: blockers.length === 0
  };
}

export async function exportSlidesToImages({ root, dir, deckPath = null, deckInventory = null, manualSlideImages = [], manualImages: manualImagesAlias = [], mock = false }: any = {}) {
  const inventory = deckInventory || await buildPptDeckInventory({ root, deckPath, mock });
  const manualImages = splitList(manualSlideImages).length ? splitList(manualSlideImages) : splitList(manualImagesAlias);
  const exportedSlides: any[] = [];
  const blockers: string[] = [];
  for (let index = 0; index < manualImages.length; index += 1) {
    const source = path.resolve(root, manualImages[index]);
    const rel = await stageSlideImage(root, dir, source, `slide-${index + 1}${path.extname(source) || '.png'}`);
    const absolute = path.resolve(root, rel);
    const dimensions = await imageDimensions(absolute);
    exportedSlides.push({
      slide_id: `slide-${index + 1}`,
      slide_index: index + 1,
      image_path: rel,
      sha256: await sha256File(absolute),
      width: dimensions.width,
      height: dimensions.height,
      format: dimensions.format,
      fidelity: 'manual_export_original_resolution_unverified',
      source: 'manual_slide_image_attach',
      local_only: true
    });
  }
  if (mock && exportedSlides.length === 0) {
    const fixture = await writeFixturePng(dir, 'slide-1.png');
    const rel = path.relative(root, fixture).split(path.sep).join('/');
    exportedSlides.push({
      slide_id: 'slide-1',
      slide_index: 1,
      image_path: rel,
      sha256: await sha256File(fixture),
      width: 1,
      height: 1,
      format: 'png',
      fidelity: 'mock_fixture_one_by_one_png',
      source: 'mock_fixture',
      local_only: true
    });
  }
  const deckSlideCount = Number(inventory?.slide_count || 0);
  if (manualImages.length === 0 && !mock) blockers.push('slide_export_unavailable');
  if (manualImages.length > 0 && deckSlideCount > 0 && exportedSlides.length < deckSlideCount) blockers.push('partial_export');
  if (inventory?.passed !== true) blockers.push(...(inventory?.blockers || []));
  const exportAdapter = manualImages.length ? 'manual_slide_image_attach' : mock ? 'mock_fixture' : await detectSlideExportAdapter();
  const exportLedger = {
    schema: 'sks.ppt-slide-export-ledger.v1',
    schema_version: 1,
    created_at: nowIso(),
    deck_sha256: inventory?.deck_sha256 || null,
    deck_path: inventory?.deck_path || null,
    export_method: exportAdapter,
    export_adapter_candidates: ['manual_slide_image_attach', 'LibreOffice/soffice', 'PowerPoint/osascript', 'Codex App manual export'],
    local_only: true,
    slide_count: exportedSlides.length || deckSlideCount,
    exported_slide_images_count: exportedSlides.length,
    exported_count: exportedSlides.length,
    slide_images: exportedSlides.map((slide: any) => ({ ...slide, path: slide.image_path })),
    slides: exportedSlides,
    blockers: [...new Set(blockers)],
    passed: exportedSlides.length > 0 && blockers.length === 0,
    next_action: blockers.includes('slide_export_unavailable')
      ? 'Attach slide PNG/JPEG exports with --manual-slide-images, or install/use a real deck export adapter before rerunning.'
      : null
  };
  return {
    ...exportLedger,
    inventory,
    export_ledger: exportLedger
  };
}

async function detectPptxSlideCount(file: string) {
  const buf = await fsp.readFile(file);
  const text = buf.toString('latin1');
  const ids = new Set<number>();
  for (const match of text.matchAll(/ppt\/slides\/slide(\d+)\.xml/g)) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) ids.add(n);
  }
  return ids.size;
}

async function detectSlideExportAdapter() {
  return 'unavailable_in_cli_without_manual_slide_images';
}

async function stageSlideImage(root: string, dir: string, source: string, preferredName: string) {
  const dest = path.join(dir, 'slide-images', preferredName);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (source !== dest) await fsp.copyFile(source, dest);
  return path.relative(root, dest).split(path.sep).join('/');
}

async function writeFixturePng(dir: string, name: string) {
  const file = path.join(dir, 'slide-images', name);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=', 'base64'));
  return file;
}
