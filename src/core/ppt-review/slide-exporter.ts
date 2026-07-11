import path from 'node:path';
import fsp from 'node:fs/promises';
import { exists, nowIso, runProcess, which } from '../fsx.js';
import { sha256File, imageDimensions } from '../wiki-image/image-hash.js';

export const PPT_DECK_INVENTORY_ARTIFACT = 'ppt-deck-inventory.json';
export const PPT_SLIDE_EXPORT_LEDGER_ARTIFACT = 'ppt-slide-export-ledger.json';
const MAX_MOCK_SLIDE_EXPORTS = 256;

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
    const inventorySlideCount = Number(inventory?.slide_count);
    const requestedMockSlides = Number.isInteger(inventorySlideCount) && inventorySlideCount > 0 ? inventorySlideCount : 1;
    const mockSlideCount = Math.min(MAX_MOCK_SLIDE_EXPORTS, requestedMockSlides);
    if (requestedMockSlides > MAX_MOCK_SLIDE_EXPORTS) blockers.push('mock_slide_export_limit_exceeded');
    for (let index = 0; index < mockSlideCount; index += 1) {
      const fixture = await writeFixturePng(dir, `slide-${index + 1}.png`);
      const rel = path.relative(root, fixture).split(path.sep).join('/');
      exportedSlides.push({
        slide_id: `slide-${index + 1}`,
        slide_index: index + 1,
        image_path: rel,
        sha256: await sha256File(fixture),
        width: 1,
        height: 1,
        format: 'png',
        fidelity: 'mock_fixture_one_by_one_png',
        source: deckPath ? 'fake_export' : 'mock_fixture',
        local_only: true
      });
    }
  }
  const exportAdapter = manualImages.length ? 'manual_slide_image_attach' : mock ? (deckPath ? 'fake_export' : 'mock_fixture') : await detectSlideExportAdapter();
  if (!manualImages.length && !mock && inventory?.passed === true) {
    const adapterExport = await exportWithDetectedAdapter({ root, dir, deckPath, inventory, adapter: exportAdapter });
    exportedSlides.push(...adapterExport.slides);
    blockers.push(...adapterExport.blockers);
  }
  const deckSlideCount = Number(inventory?.slide_count || 0);
  if (manualImages.length === 0 && !mock && exportedSlides.length === 0) blockers.push('slide_export_unavailable');
  if (deckSlideCount > 0 && exportedSlides.length < deckSlideCount) blockers.push('partial_export');
  if (inventory?.passed !== true) blockers.push(...(inventory?.blockers || []));
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
  const soffice = await which('soffice').catch(() => null) || await which('libreoffice').catch(() => null);
  if (soffice) return `soffice:${soffice}`;
  const osascript = await which('osascript').catch(() => null);
  if (osascript && process.platform === 'darwin') return `powerpoint_osascript:${osascript}`;
  return 'unavailable_in_cli_without_manual_slide_images';
}

async function exportWithDetectedAdapter({ root, dir, deckPath, adapter }: any = {}) {
  if (!deckPath || !adapter || adapter === 'unavailable_in_cli_without_manual_slide_images') {
    return { slides: [], blockers: ['slide_export_unavailable'] };
  }
  if (String(adapter).startsWith('soffice:')) return exportWithSoffice({ root, dir, deckPath, soffice: String(adapter).slice('soffice:'.length) });
  if (String(adapter).startsWith('powerpoint_osascript:')) return exportWithPowerPoint({ root, dir, deckPath, osascript: String(adapter).slice('powerpoint_osascript:'.length) });
  return { slides: [], blockers: ['slide_export_unavailable'] };
}

async function exportWithSoffice({ root, dir, deckPath, soffice }: any = {}) {
  const outDir = path.join(dir, 'slide-export-soffice');
  await fsp.mkdir(outDir, { recursive: true });
  const absoluteDeck = path.resolve(root, deckPath);
  const result = await runProcess(soffice, ['--headless', '--convert-to', 'png', '--outdir', outDir, absoluteDeck], {
    cwd: root,
    timeoutMs: 60_000,
    maxOutputBytes: 64 * 1024
  }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err), timedOut: false }));
  if (result.code !== 0) return { slides: [], blockers: ['slide_export_unavailable', 'soffice_slide_export_failed'] };
  const files = (await fsp.readdir(outDir)).filter((name) => /\.(png|jpg|jpeg)$/i.test(name)).sort();
  const slides = [];
  for (let index = 0; index < files.length; index += 1) {
    const name = files[index];
    if (!name) continue;
    const file = path.join(outDir, name);
    const rel = await stageSlideImage(root, dir, file, `slide-${index + 1}${path.extname(file) || '.png'}`);
    const absolute = path.resolve(root, rel);
    const dimensions = await imageDimensions(absolute);
    slides.push({
      slide_id: `slide-${index + 1}`,
      slide_index: index + 1,
      image_path: rel,
      sha256: await sha256File(absolute),
      width: dimensions.width,
      height: dimensions.height,
      format: dimensions.format,
      fidelity: 'soffice_export_png',
      source: 'soffice_slide_export',
      local_only: true
    });
  }
  return { slides, blockers: slides.length ? [] : ['slide_export_unavailable', 'soffice_slide_export_empty'] };
}

async function exportWithPowerPoint({ root, dir, deckPath, osascript }: any = {}) {
  const outDir = path.join(dir, 'slide-export-powerpoint');
  await fsp.mkdir(outDir, { recursive: true });
  const script = [
    'on run argv',
    'set deckPath to POSIX file (item 1 of argv)',
    'set outPath to POSIX file (item 2 of argv)',
    'tell application "Microsoft PowerPoint"',
    'open deckPath',
    'set activePresentation to active presentation',
    'save activePresentation in outPath as save as PNG',
    'close activePresentation saving no',
    'end tell',
    'end run'
  ].join('\n');
  const result = await runProcess(osascript, ['-e', script, path.resolve(root, deckPath), outDir], {
    cwd: root,
    timeoutMs: 60_000,
    maxOutputBytes: 64 * 1024
  }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err), timedOut: false }));
  if (result.code !== 0) return { slides: [], blockers: ['slide_export_unavailable', 'powerpoint_osascript_export_failed'] };
  const files = (await fsp.readdir(outDir, { recursive: true } as any)).map(String).filter((name) => /\.(png|jpg|jpeg)$/i.test(name)).sort();
  const slides = [];
  for (let index = 0; index < files.length; index += 1) {
    const name = files[index];
    if (!name) continue;
    const file = path.join(outDir, name);
    const rel = await stageSlideImage(root, dir, file, `slide-${index + 1}${path.extname(file) || '.png'}`);
    const absolute = path.resolve(root, rel);
    const dimensions = await imageDimensions(absolute);
    slides.push({
      slide_id: `slide-${index + 1}`,
      slide_index: index + 1,
      image_path: rel,
      sha256: await sha256File(absolute),
      width: dimensions.width,
      height: dimensions.height,
      format: dimensions.format,
      fidelity: 'powerpoint_osascript_png',
      source: 'powerpoint_osascript_slide_export',
      local_only: true
    });
  }
  return { slides, blockers: slides.length ? [] : ['slide_export_unavailable', 'powerpoint_osascript_export_empty'] };
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
