import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=';
export const PNG_1X1_SHA256 = 'b8db98b40cf585edc010e103508e120d13708be9d2b655b8c6eb8e09a8a01c6b';

export async function importDist(modulePath) {
  return import(pathToFileURL(path.join(process.cwd(), 'dist', modulePath)));
}

export async function tempImageRoot(prefix = 'sks-ux-108-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const imagePath = path.join(root, 'screen.png');
  const generatedImagePath = path.join(root, 'generated-review-real.png');
  const png = Buffer.from(PNG_1X1, 'base64');
  await fs.writeFile(imagePath, png);
  await fs.writeFile(generatedImagePath, png);
  return { root, imagePath, generatedImagePath, generatedImageSha256: PNG_1X1_SHA256 };
}

export async function capturedInventory(imageUx, root, imagePath) {
  const contract = {
    prompt: 'UX-Review 1.0.8 fixture',
    answers: { IMAGE_UX_REVIEW_SOURCE_IMAGES: [imagePath] }
  };
  const inventory = await imageUx.hydrateImageUxScreenInventory(root, imageUx.buildImageUxScreenInventory(contract));
  return { contract, inventory };
}

export function realGeneratedReviewImage(overrides = {}) {
  return {
    id: 'generated-review-real',
    path: 'generated-review-real.png',
    source_screen_id: 'screen-1',
    provider_model: 'gpt-image-2',
    provider_surface: 'Codex App $imagegen',
    requested_fidelity: 'original',
    privacy: 'local-only',
    width: 1,
    height: 1,
    sha256: PNG_1X1_SHA256,
    real_generated: true,
    mock: false,
    source: 'real_gpt_image_2_callout',
    callout_extraction_status: 'succeeded',
    callouts: [
      {
        id: 'callout-1',
        severity: 'P1',
        bbox: [0, 0, 1, 1],
        title: 'Contrast callout',
        detail: 'Visible generated callout marks a low-contrast control.',
        likely_cause: 'contrast',
        fix_action: 'Increase contrast and recheck the changed control.',
        status: 'fixed',
        confidence: 0.91,
        candidate_files: ['src/ui/example.tsx']
      }
    ],
    ...overrides
  };
}

export function mockGeneratedReviewImage(overrides = {}) {
  return realGeneratedReviewImage({
    id: 'generated-review-mock',
    real_generated: false,
    mock: true,
    source: 'mock_fixture',
    ...overrides
  });
}
