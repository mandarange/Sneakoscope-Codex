import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  WIKI_TAU,
  buildWikiCoordinateIndex,
  buildWikiVoxelOverlay,
  validateWikiCoordinateIndex,
  validateWikiVoxelOverlay
} from '../wiki-coordinate.js';

function fixtureIndex() {
  return buildWikiCoordinateIndex({
    mission: { id: 'voxel-integrity', coord: { rgba: [48, 132, 212, 240] } },
    claims: [
      { id: 'claim-a', text: 'alpha', status: 'supported', freshness: 'fresh', risk: 'high', evidence_count: 2 },
      { id: 'claim-b', text: 'beta', status: 'weak', freshness: 'stale', risk: 'medium', evidence_count: 1 }
    ],
    maxAnchors: 2
  });
}

test('coordinate and voxel overlay remain a one-to-one SSOT', () => {
  const index = fixtureIndex();
  assert.equal(validateWikiCoordinateIndex(index).ok, true);

  const missing = structuredClone(index);
  missing.vx.v.pop();
  assert.ok(validateWikiCoordinateIndex(missing).issues.some((issue: any) => issue.id === 'vx_missing_anchor'));

  const duplicate = structuredClone(index);
  duplicate.vx.v.push(structuredClone(duplicate.vx.v[0]));
  assert.ok(validateWikiCoordinateIndex(duplicate).issues.some((issue: any) => issue.id === 'vx_duplicate_anchor'));

  const mismatched = structuredClone(index);
  const originalKey = mismatched.vx.v[0][0];
  mismatched.vx.v[0][0] = originalKey === '0:0:0' ? '1:0:0' : '0:0:0';
  assert.ok(validateWikiCoordinateIndex(mismatched).issues.some((issue: any) => issue.id === 'vx_coord_mismatch'));
});

test('voxel quantization metadata is authoritative and zero semantic weight stays zero', () => {
  const anchor = {
    id: 'edge-anchor',
    c: [WIKI_TAU - 0.0001, 1, WIKI_TAU - 0.0001, 0],
    sim: 0,
    st: 'supported',
    r: 'low',
    tc: 1
  };
  const overlay = buildWikiVoxelOverlay({
    anchors: [anchor],
    claimsById: new Map([['edge-anchor', { text: 'edge', status: 'supported', freshness: 'fresh', risk: 'low' }]]),
    quantization: { domain: 8, radius: 4, phase: 8 }
  });
  assert.equal(overlay.v[0][0], '7:3:7');
  assert.equal(overlay.v[0][2][0], 0, 'zero concentration/similarity must not be replaced by fallback defaults');
  assert.equal(validateWikiVoxelOverlay(overlay, new Map([['edge-anchor', anchor]])).ok, true);

  const invalid = structuredClone(overlay);
  invalid.q.domain = 0;
  assert.ok(validateWikiVoxelOverlay(invalid, new Map([['edge-anchor', anchor]])).issues.some((issue: any) => issue.id === 'vx_quantization'));
});

test('hydration citations exist inside the project root while files and directories are accepted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-triwiki-hydration-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-triwiki-outside-'));
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'claim.ts'), 'export const claim = true;\n');
    const valid = buildWikiCoordinateIndex({
      mission: { id: 'hydration-valid' },
      claims: [
        { id: 'file-claim', text: 'file', status: 'supported', file: 'src/claim.ts' },
        { id: 'directory-claim', text: 'directory', status: 'supported', file: 'docs' }
      ],
      maxAnchors: 2
    });
    assert.equal(validateWikiCoordinateIndex(valid, { root }).ok, true);

    const missing = structuredClone(valid);
    missing.anchors[0].p = 'src/missing.ts';
    assert.ok(validateWikiCoordinateIndex(missing, { root }).issues.some((issue: any) => issue.id === 'hydration_path_missing'));

    const traversal = structuredClone(valid);
    traversal.anchors[0].p = path.join('..', path.basename(outside));
    assert.ok(validateWikiCoordinateIndex(traversal, { root }).issues.some((issue: any) => issue.id === 'hydration_path_outside_root'));

    fs.symlinkSync(outside, path.join(root, 'escaped-link'));
    const escapedSymlink = structuredClone(valid);
    escapedSymlink.anchors[0].p = 'escaped-link';
    assert.ok(validateWikiCoordinateIndex(escapedSymlink, { root }).issues.some((issue: any) => issue.id === 'hydration_path_outside_root'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('release gate explicitly executes the compiled Voxel TriWiki integrity test', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'release-gates.v2.json'), 'utf8'));
  const gate = manifest.gates.find((entry: any) => entry.id === 'test:triwiki-voxel-integrity');
  assert.ok(gate, 'dedicated Voxel TriWiki release gate must exist');
  assert.match(gate.command, /dist\/core\/__tests__\/triwiki-voxel-integrity\.test\.js/);
});
