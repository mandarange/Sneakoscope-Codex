#!/usr/bin/env node
// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const mod = await import(pathToFileURL(path.join(root, 'dist/core/image-ux-review.js')));
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-image-fidelity-'));
const pngPath = path.join(tmp, 'one-by-one.png');
await fs.writeFile(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=', 'base64'));

const contract = {
  prompt: 'image fidelity fixture',
  answers: { IMAGE_UX_REVIEW_SOURCE_IMAGES: [pngPath] }
};
const inventory = await mod.hydrateImageUxScreenInventory(root, mod.buildImageUxScreenInventory(contract));
const screen = inventory.source_screens[0];
assert.equal(screen.width, 1);
assert.equal(screen.height, 1);
assert.match(screen.sha256, /^[a-f0-9]{64}$/);
assert.equal(screen.original_resolution.preserved, true);

console.log(JSON.stringify({ schema: 'sks.image-fidelity-fixture.v1', ok: true, screen }, null, 2));
