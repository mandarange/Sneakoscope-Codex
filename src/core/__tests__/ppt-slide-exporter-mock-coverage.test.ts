import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportSlidesToImages } from '../ppt-review/slide-exporter.js';

test('mock PPT exporter covers every detected slide without partial success', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ppt-mock-export-'));
  const dir = path.join(root, '.sneakoscope', 'missions', 'M-fixture');
  try {
    await fs.mkdir(dir, { recursive: true });
    const result = await exportSlidesToImages({
      root,
      dir,
      deckPath: 'synthetic-two-slide.pptx',
      deckInventory: {
        passed: true,
        deck_sha256: 'fixture',
        deck_path: 'synthetic-two-slide.pptx',
        slide_count: 2,
        blockers: []
      },
      mock: true
    });
    assert.equal(result.passed, true);
    assert.equal(result.exported_slide_images_count, 2);
    assert.deepEqual(result.slides.map((slide: any) => slide.slide_index), [1, 2]);
    assert.deepEqual(result.blockers, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
