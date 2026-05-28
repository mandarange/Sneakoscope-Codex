#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { emitGate, root } from './sks-1-18-gate-lib.mjs';
import { buildFixtureProof } from './lib/real-codex-parallel-proof-fixture.mjs';

const proof = await buildFixtureProof({ workers: 5, required: false });
if (!proof.ok || proof.max_observed_codex_child_process_overlap < 5) {
  console.error(JSON.stringify({ ok: false, proof }, null, 2));
  process.exit(1);
}
fs.mkdirSync(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, '.sneakoscope', 'reports', 'agent-codex-child-overlap.json'), `${JSON.stringify({ ok: true, ...proof }, null, 2)}\n`);
emitGate('agent:codex-child-overlap', { overlap: proof.max_observed_codex_child_process_overlap, codex_child_process_count: proof.codex_child_process_count });
