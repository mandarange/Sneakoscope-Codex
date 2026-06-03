#!/usr/bin/env node
// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const ledgerMod = await import(pathToFileURL(path.join(root, 'dist/core/wiki-image/image-voxel-ledger.js')));
const validationMod = await import(pathToFileURL(path.join(root, 'dist/core/wiki-image/validation.js')));

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ux-rel-'));
await fs.mkdir(path.join(tmp, 'img'), { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=', 'base64');
await fs.writeFile(path.join(tmp, 'img/source.png'), png);
await fs.writeFile(path.join(tmp, 'img/generated.png'), png);
await ledgerMod.ingestImage(tmp, 'img/source.png', { id: 'source-screen', missionId: 'M-fixture' });
await ledgerMod.ingestImage(tmp, 'img/generated.png', { id: 'generated-callout', missionId: 'M-fixture' });
const relation = await ledgerMod.addImageRelation(tmp, {
  missionId: 'M-fixture',
  type: 'generated_callout_review_of',
  beforeImageId: 'source-screen',
  afterImageId: 'generated-callout',
  sourceImageId: 'source-screen',
  generatedImageId: 'generated-callout',
  verification: 'fixture',
  status: 'verified_partial'
});
const validation = validationMod.validateImageVoxelLedger(relation.ledger, { requireRelations: true });
assert.equal(validation.ok, true, validation.issues.join(', '));

console.log(JSON.stringify({ schema: 'sks.ux-review-image-voxel-relations.v1', ok: true, relations: relation.ledger.relations.length }, null, 2));
