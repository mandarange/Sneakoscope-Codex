#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateGptImage2Request } from '../core/imagegen/gpt-image-2-request-validator.js';
import { writeValidPngFixture } from './lib/valid-png-fixture.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-gpt-image-2-validator-'));
const source = path.join(root, 'source.png');
writeValidPngFixture(source);
const good = await validateGptImage2Request({
  provider: 'fake_imagegen_adapter',
  endpoint: 'local hermetic fixture',
  model: 'gpt-image-2',
  prompt: 'Annotate the image with numbered callouts.',
  source_image_path: source,
  output_dir: root,
  params: { size: 'auto' },
  privacy: 'local-only'
});
const bad = await validateGptImage2Request({
  provider: 'openai_images_api',
  endpoint: '/v1/images/edits',
  model: 'gpt-image-2',
  prompt: 'Bad request.',
  source_image_path: source,
  output_dir: root,
  params: { input_fidelity: 'high' },
  privacy: 'local-only'
});
const ok = good.ok === true && bad.ok === false && bad.blockers.includes('input_fidelity_must_be_omitted_for_gpt_image_2');
console.log(JSON.stringify({ schema: 'sks.gpt-image-2-request-validator-check.v1', ok, good, bad }, null, 2));
if (!ok) process.exitCode = 1;
