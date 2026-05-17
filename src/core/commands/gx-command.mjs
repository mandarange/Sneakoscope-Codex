import path from 'node:path';
import { sksRoot, writeJsonAtomic } from '../fsx.mjs';
import { createMission } from '../mission.mjs';
import { driftCartridge, renderCartridge, snapshotCartridge, validateCartridge } from '../gx-renderer.mjs';
import { maybeFinalizeRoute } from '../proof/auto-finalize.mjs';
import { flag, positionalArgs, readFlagValue } from './command-utils.mjs';

export async function gxCommand(sub, args = []) {
  const root = await sksRoot();
  const name = cartridgeName(args);
  const dir = cartridgeDir(root, name);
  if (sub === 'init') {
    const vgraphPath = path.join(dir, 'vgraph.json');
    const betaPath = path.join(dir, 'beta.json');
    const created = [];
    const { exists, writeJsonAtomic: writeJson } = await import('../fsx.mjs');
    if (!(await exists(vgraphPath)) || flag(args, '--force')) {
      await writeJson(vgraphPath, defaultVGraph(name));
      created.push('vgraph.json');
    }
    if (!(await exists(betaPath)) || flag(args, '--force')) {
      await writeJson(betaPath, defaultBeta(name));
      created.push('beta.json');
    }
    const render = await renderCartridge(dir, { format: 'all' });
    const validation = await validateCartridge(dir);
    const drift = await driftCartridge(dir);
    console.log(JSON.stringify({ cartridge: path.relative(root, dir), created, render, validation: validation.ok, drift: drift.status }, null, 2));
    return;
  }
  if (sub === 'render') {
    const format = readFlagValue(args, '--format', 'all');
    console.log(JSON.stringify(await renderCartridge(dir, { format }), null, 2));
    return;
  }
  if (sub === 'validate') {
    if (name === 'fixture' && flag(args, '--mock')) return gxValidateFixture(root, args);
    const validation = await validateCartridge(dir);
    console.log(JSON.stringify(validation, null, 2));
    process.exitCode = validation.ok ? 0 : 2;
    return;
  }
  if (sub === 'drift') {
    const drift = await driftCartridge(dir);
    console.log(JSON.stringify(drift, null, 2));
    process.exitCode = drift.status === 'low' ? 0 : 2;
    return;
  }
  if (sub === 'snapshot') {
    await renderCartridge(dir, { format: 'all' });
    console.log(JSON.stringify(await snapshotCartridge(dir), null, 2));
    return;
  }
  console.error('Usage: sks gx init|render|validate|drift|snapshot');
  process.exitCode = 1;
}

async function gxValidateFixture(root, args) {
  const { id, dir } = await createMission(root, { mode: 'gx', prompt: 'GX validate fixture' });
  const validation = { schema: 'sks.gx-validation.v1', ok: true, status: 'pass', fixture: true, cartridge: 'fixture' };
  await writeJsonAtomic(path.join(dir, 'gx-validation.json'), validation);
  const gate = { schema_version: 1, passed: true, ok: true, gx_validation: 'gx-validation.json', visual_claim: true };
  await writeJsonAtomic(path.join(dir, 'gx-gate.json'), gate);
  const proof = await maybeFinalizeRoute(root, { missionId: id, route: '$GX', gateFile: 'gx-gate.json', gate, mock: true, visual: true, artifacts: ['gx-validation.json', 'image-voxel-ledger.json', 'completion-proof.json'], claims: [{ id: 'gx-validate-fixture', status: 'verified_partial' }], command: { cmd: 'sks gx validate fixture --mock', status: 0 } });
  console.log(JSON.stringify({ schema: 'sks.gx-validate-fixture.v1', ok: proof.ok, mission_id: id, validation, proof: proof.validation }, null, 2));
}

function cartridgeName(args, fallback = 'architecture-atlas') {
  const raw = positionalArgs(args)[0] || fallback;
  return String(raw).trim().replace(/[\\/]+/g, '-').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function cartridgeDir(root, name) {
  return path.join(root, '.sneakoscope', 'gx', 'cartridges', name);
}

export function defaultVGraph(name) {
  return {
    id: name,
    title: 'Sneakoscope Context Map',
    version: 1,
    nodes: [
      { id: 'source', label: 'vgraph source', kind: 'source', layer: 'input', status: 'safe' },
      { id: 'contract', label: 'decision contract', kind: 'guard', layer: 'policy', status: 'safe' },
      { id: 'proof', label: 'H-Proof gate', kind: 'guard', layer: 'verification', status: 'safe' }
    ],
    edges: [
      { from: 'source', to: 'contract', label: 'constrains' },
      { from: 'contract', to: 'proof', label: 'verifies' }
    ],
    invariants: ['vgraph.json remains the source of truth', 'rendered SVG hash must match source hash'],
    tests: ['sks gx validate', 'sks gx drift'],
    risks: []
  };
}

export function defaultBeta(name) {
  return { id: name, version: 1, read_order: ['title', 'layers', 'nodes', 'edges', 'invariants', 'tests'], renderer: 'sneakoscope-codex-deterministic-svg' };
}
