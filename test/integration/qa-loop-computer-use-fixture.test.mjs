import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateQaGate, qaReportFilename } from '../../src/core/qa-loop.mjs';
import { writeRouteCompletionProof } from '../../src/core/proof/route-adapter.mjs';
import { validateRouteCompletionProof } from '../../src/core/proof/route-proof-gate.mjs';
import { emptyImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-schema.mjs';
import { addVisualAnchor, writeImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-ledger.mjs';

test('QA-LOOP fixture requires Computer Use evidence for UI verification', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-qa-fixture-'));
  const missionId = 'M-qa-fixture';
  const dir = path.join(root, '.sneakoscope/missions', missionId);
  await fs.mkdir(dir, { recursive: true });
  const reportFile = qaReportFilename(new Date('2026-05-17T00:00:00Z'), '0.9.13');
  await fs.writeFile(path.join(dir, reportFile), '# QA-LOOP Report\n\nFixture pass.\n');
  await fs.writeFile(path.join(dir, 'qa-ledger.json'), JSON.stringify({ schema_version: 1, checklist: [{ id: 'ui.computer_use_only', status: 'passed' }] }, null, 2));
  await fs.writeFile(path.join(dir, 'qa-gate.json'), JSON.stringify({
    passed: true,
    clarification_contract_sealed: true,
    qa_report_written: true,
    qa_report_file: reportFile,
    qa_ledger_complete: true,
    checklist_completed: true,
    safety_reviewed: true,
    deployed_destructive_tests_blocked: true,
    credentials_not_persisted: true,
    ui_e2e_required: true,
    ui_computer_use_evidence: true,
    ui_evidence_source: 'codex_computer_use',
    corrective_loop_enabled: true,
    safe_remediation_required: true,
    unresolved_findings: 0,
    unresolved_fixable_findings: 0,
    unsafe_external_side_effects: false,
    post_fix_verification_complete: true,
    honest_mode_complete: true,
    evidence: ['codex_computer_use fixture screen ledger']
  }, null, 2));
  const gate = await evaluateQaGate(dir);
  assert.equal(gate.passed, true);
  await writeImageVoxelLedger(root, emptyImageVoxelLedger({
    mission_id: missionId,
    images: [{ id: 'qa-screen-after', path: 'fake-after-screen.png', sha256: 'fixture', width: 1440, height: 900, source: 'codex-computer-use' }]
  }));
  const anchor = await addVisualAnchor(root, {
    missionId,
    imageId: 'qa-screen-after',
    bbox: [160, 220, 420, 96],
    label: 'QA fixture checked visual state',
    source: 'codex-computer-use',
    route: '$QA-LOOP',
    evidencePath: 'screen-capture-ledger.json'
  });
  assert.equal(anchor.ok, true);
  await writeRouteCompletionProof(root, {
    missionId,
    route: '$QA-LOOP',
    status: 'verified',
    gate,
    artifacts: ['qa-gate.json', 'qa-ledger.json', reportFile, 'completion-proof.json'],
    evidence: { image_voxels: { anchors: 1, anchor_count: 1, images: 1, status: 'fixture' } },
    claims: [{ id: 'qa-cu-fixture', status: 'fixture', text: 'QA fixture passed with Codex Computer Use evidence source.' }]
  });
  const proofGate = await validateRouteCompletionProof(root, { missionId, route: '$QA-LOOP' });
  assert.equal(proofGate.ok, true);
});
