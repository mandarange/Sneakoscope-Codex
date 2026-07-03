import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import {
  PPT_FACT_LEDGER_ARTIFACT,
  PPT_IMAGE_ASSET_LEDGER_ARTIFACT,
  PPT_REVIEW_LEDGER_ARTIFACT,
  PPT_SOURCE_HTML_DIR,
  writePptBuildArtifacts
} from '../../ppt.js';
import { readJson, writeJsonAtomic } from '../../fsx.js';
import { evaluatePptGateArtifacts } from '../../commands/ppt-command.js';

async function builtPptDir() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-ppt-test-'));
  await fsp.writeFile(path.join(dir, 'decision-contract.json'), JSON.stringify({
    schema: 'sks.decision-contract.v1',
    prompt: '$PPT fixture',
    answers: {
      PRESENTATION_AUDIENCE_PROFILE: 'Release reviewer',
      PRESENTATION_STP_STRATEGY: 'Segment: maintainers. Target: reviewers. Positioning: proof-first.',
      PRESENTATION_DELIVERY_CONTEXT: 'Artifact gate test',
      PRESENTATION_PAINPOINT_SOLUTION_MAP: ['Missing proof -> blocked gate']
    }
  }, null, 2));
  await writePptBuildArtifacts(dir);
  return dir;
}

for (const artifact of [
  PPT_FACT_LEDGER_ARTIFACT,
  PPT_IMAGE_ASSET_LEDGER_ARTIFACT,
  PPT_REVIEW_LEDGER_ARTIFACT,
  path.join(PPT_SOURCE_HTML_DIR, 'artifact.html')
]) {
  test(`PPT gate fails when ${artifact} is missing`, async () => {
    const dir = await builtPptDir();
    await fsp.rm(path.join(dir, artifact), { force: true });
    const gate = await evaluatePptGateArtifacts(dir, {});

    assert.equal(gate.passed, false);
    assert.ok(gate.blockers.includes(`missing_artifact:${artifact}`));
  });
}

test('PPT gate fails closed when image-asset-ledger has raster assets but omits imagegen_evidence', async () => {
  const dir = await builtPptDir();
  const ledgerPath = path.join(dir, PPT_IMAGE_ASSET_LEDGER_ARTIFACT);
  const ledger: any = await readJson(ledgerPath, null);
  assert.ok(ledger, 'expected image-asset-ledger fixture to exist before mutation');

  // Simulate a ledger-writer bug: raster assets are present but the imagegen_evidence
  // section was omitted entirely from the ledger.
  delete ledger.imagegen_evidence;
  ledger.assets = [
    {
      id: 'ppt-image-1',
      slide: 1,
      role: 'hero_visual',
      status: 'generated',
      output_path: 'assets/ppt-image-1.png',
      output_source: 'manual_attach',
      output_sha256: 'deadbeef',
      evidence_class: 'codex_app_imagegen',
      evidence_verified: true,
      evidence_blockers: []
    }
  ];
  await writeJsonAtomic(ledgerPath, ledger);

  const gate = await evaluatePptGateArtifacts(dir, {});

  assert.equal(gate.passed, false);
  assert.ok(gate.blockers.includes('ppt_imagegen_evidence_not_passed'));
  assert.equal(gate.imagegen_evidence.required, true);
  assert.equal(gate.imagegen_evidence.passed, false);
  assert.ok(gate.imagegen_evidence.blockers.includes('imagegen_evidence_missing'));
  assert.equal(gate.imagegen_evidence.derivation_basis.raster_asset_count, 1);
});

test('PPT gate derived default remains a pass when image-asset-ledger has zero raster assets and omits imagegen_evidence', async () => {
  const dir = await builtPptDir();
  const ledgerPath = path.join(dir, PPT_IMAGE_ASSET_LEDGER_ARTIFACT);
  const ledger: any = await readJson(ledgerPath, null);
  assert.ok(ledger, 'expected image-asset-ledger fixture to exist before mutation');

  delete ledger.imagegen_evidence;
  ledger.assets = [];
  await writeJsonAtomic(ledgerPath, ledger);

  const gate = await evaluatePptGateArtifacts(dir, {});

  assert.ok(!gate.blockers.includes('ppt_imagegen_evidence_not_passed'));
  assert.equal(gate.imagegen_evidence.required, false);
  assert.equal(gate.imagegen_evidence.passed, true);
  assert.equal(gate.imagegen_evidence.derivation_basis.raster_asset_count, 0);
});
