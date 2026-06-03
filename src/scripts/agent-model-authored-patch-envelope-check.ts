#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { emitGate, root } from './sks-1-18-gate-lib.js';
import { buildFixtureProof } from './lib/real-codex-parallel-proof-fixture.js';

const proof = await buildFixtureProof({ workers: 3, required: false });
if (!proof.ok || proof.model_authored_patch_envelope_count < 3 || proof.fixture_patch_envelope_count !== 0) {
  console.error(JSON.stringify({ ok: false, proof }, null, 2));
  process.exit(1);
}
fs.mkdirSync(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, '.sneakoscope', 'reports', 'agent-model-authored-patch-envelope.json'), `${JSON.stringify({ ok: true, ...proof }, null, 2)}\n`);
emitGate('agent:model-authored-patch-envelope', { model_authored_patch_envelope_count: proof.model_authored_patch_envelope_count });
