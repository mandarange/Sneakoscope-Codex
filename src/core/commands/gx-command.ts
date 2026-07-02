import path from 'node:path';
import { readJson, sksRoot, writeJsonAtomic } from '../fsx.js';
import { createMission } from '../mission.js';
import { driftCartridge, renderCartridge, snapshotCartridge, validateCartridge } from '../gx-renderer.js';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { flag, positionalArgs, readFlagValue } from './command-utils.js';
import { context7EvidenceStatus } from './route-success-helpers.js';

export async function gxCommand(sub: any, args: any = []) {
  const root = await sksRoot();
  const name = cartridgeName(args);
  const dir = cartridgeDir(root, name);
  if (sub === 'init') {
    const vgraphPath = path.join(dir, 'vgraph.json');
    const betaPath = path.join(dir, 'beta.json');
    const created: any[] = [];
    const { exists, writeJsonAtomic: writeJson } = await import('../fsx.js');
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
    const vgraph = await readJson(path.join(dir, 'vgraph.json'), null);
    const context7 = await context7EvidenceStatus(root);
    const schemaBlockers = validateGxVGraph(vgraph);
    const blockers = [
      ...(Array.isArray((validation as any).issues) ? (validation as any).issues : []),
      ...schemaBlockers,
      ...(context7.ok ? [] : [context7.blocker])
    ].filter(Boolean);
    const result = {
      ...(validation as any),
      ok: (validation as any).ok === true && blockers.length === 0,
      status: (validation as any).ok === true && blockers.length === 0 ? 'pass' : 'blocked',
      context7_policy: context7.policy,
      context7_evidence: context7.evidence,
      vgraph_schema_valid: schemaBlockers.length === 0,
      blockers
    };
    const gate = {
      schema: 'sks.gx-gate.v1',
      schema_version: 1,
      passed: result.ok,
      ok: result.ok,
      status: result.ok ? 'pass' : 'blocked',
      gx_validation: 'gx-validation.json',
      context7_policy: context7.policy,
      vgraph_schema_valid: schemaBlockers.length === 0,
      blockers
    };
    await writeJsonAtomic(path.join(dir, 'gx-validation.json'), result);
    await writeJsonAtomic(path.join(dir, 'gx-gate.json'), gate);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 2;
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

async function gxValidateFixture(root: any, args: any) {
  const { id, dir } = await createMission(root, { mode: 'gx', prompt: 'GX validate fixture' });
  const validation = {
    schema: 'sks.gx-validation.v1',
    ok: false,
    status: 'blocked',
    execution_class: 'mock_fixture',
    fixture: true,
    cartridge: 'fixture',
    blockers: ['gx_fixture_mode_cannot_claim_real']
  };
  await writeJsonAtomic(path.join(dir, 'gx-validation.json'), validation);
  const gate = {
    schema: 'sks.gx-gate.v1',
    schema_version: 1,
    passed: false,
    ok: false,
    status: 'blocked',
    execution_class: 'mock_fixture',
    gx_validation: 'gx-validation.json',
    visual_claim: false,
    blockers: ['gx_fixture_mode_cannot_claim_real']
  };
  await writeJsonAtomic(path.join(dir, 'gx-gate.json'), gate);
  const proof = await maybeFinalizeRoute(root, { missionId: id, route: '$GX', gateFile: 'gx-gate.json', gate, mock: true, visual: true, statusHint: 'blocked', blockers: gate.blockers, artifacts: ['gx-validation.json', 'image-voxel-ledger.json', 'completion-proof.json'], claims: [{ id: 'gx-validate-fixture', status: 'blocked' }], command: { cmd: 'sks gx validate fixture --mock', status: 1 } });
  const result = { schema: 'sks.gx-validate-fixture.v1', ok: false, mission_id: id, validation, gate, proof: proof.validation };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}

function validateGxVGraph(vgraph: any) {
  const blockers: string[] = [];
  if (!vgraph || typeof vgraph !== 'object') return ['vgraph_missing_or_invalid_json'];
  if (!String(vgraph.id || vgraph.name || '').trim()) blockers.push('vgraph_id_missing');
  if (!Array.isArray(vgraph.nodes) || vgraph.nodes.length === 0) blockers.push('vgraph_nodes_missing');
  if (!Array.isArray(vgraph.edges)) blockers.push('vgraph_edges_missing');
  const ids = new Set((Array.isArray(vgraph.nodes) ? vgraph.nodes : []).map((node: any) => String(node?.id || '').trim()).filter(Boolean));
  if (ids.size !== (Array.isArray(vgraph.nodes) ? vgraph.nodes.length : 0)) blockers.push('vgraph_node_ids_missing_or_duplicate');
  for (const edge of Array.isArray(vgraph.edges) ? vgraph.edges : []) {
    const from = String(edge?.from || edge?.source || '').trim();
    const to = String(edge?.to || edge?.target || '').trim();
    if (!from || !to || !ids.has(from) || !ids.has(to)) blockers.push('vgraph_edge_endpoint_invalid');
  }
  return [...new Set(blockers)];
}

function cartridgeName(args: any, fallback: any = 'architecture-atlas') {
  const raw = positionalArgs(args)[0] || fallback;
  return String(raw).trim().replace(/[\\/]+/g, '-').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function cartridgeDir(root: any, name: any) {
  return path.join(root, '.sneakoscope', 'gx', 'cartridges', name);
}

export function defaultVGraph(name: any) {
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

export function defaultBeta(name: any) {
  return { id: name, version: 1, read_order: ['title', 'layers', 'nodes', 'edges', 'invariants', 'tests'], renderer: 'sneakoscope-codex-deterministic-svg' };
}
