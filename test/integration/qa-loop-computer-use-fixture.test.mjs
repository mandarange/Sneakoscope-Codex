import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateQaGate, qaReportFilename } from '../../dist/core/qa-loop.js';
import { writeRouteCompletionProof } from '../../dist/core/proof/route-adapter.js';
import { validateRouteCompletionProof } from '../../dist/core/proof/route-proof-gate.js';
import { emptyImageVoxelLedger } from '../../dist/core/wiki-image/image-voxel-schema.js';
import { addVisualAnchor, writeImageVoxelLedger } from '../../dist/core/wiki-image/image-voxel-ledger.js';

test('QA-LOOP fixture requires Codex Chrome Extension evidence for web UI verification', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-qa-fixture-'));
  const missionId = 'M-qa-fixture';
  const dir = path.join(root, '.sneakoscope/missions', missionId);
  await fs.mkdir(dir, { recursive: true });
  const reportFile = qaReportFilename(new Date('2026-05-17T00:00:00Z'), '0.9.13');
  await fs.writeFile(path.join(dir, reportFile), '# QA-LOOP Report\n\nFixture pass.\n');
  await fs.writeFile(path.join(dir, 'qa-ledger.json'), JSON.stringify({ schema_version: 1, checklist: [{ id: 'ui.chrome_extension_first', status: 'passed' }] }, null, 2));
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
    chrome_extension_preflight_passed: true,
    ui_chrome_extension_evidence: true,
    ui_computer_use_evidence: false,
    ui_evidence_source: 'codex_chrome_extension',
    corrective_loop_enabled: true,
    safe_remediation_required: true,
    unresolved_findings: 0,
    unresolved_fixable_findings: 0,
    unsafe_external_side_effects: false,
    post_fix_verification_complete: true,
    honest_mode_complete: true,
    evidence: ['codex_chrome_extension fixture screen ledger']
  }, null, 2));
  const gate = await evaluateQaGate(dir);
  assert.equal(gate.passed, true);
  await writeImageVoxelLedger(root, emptyImageVoxelLedger({
    mission_id: missionId,
    images: [{ id: 'qa-screen-after', path: 'fake-after-screen.png', sha256: 'fixture', width: 1440, height: 900, source: 'codex-chrome-extension' }]
  }));
  const anchor = await addVisualAnchor(root, {
    missionId,
    imageId: 'qa-screen-after',
    bbox: [160, 220, 420, 96],
    label: 'QA fixture checked visual state',
    source: 'codex-chrome-extension',
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
    evidence: {
      image_voxels: { anchors: 1, anchor_count: 1, images: 1, status: 'fixture' },
      agents: {
        schema: 'sks.agent-proof-evidence.v1',
        ok: true,
        status: 'passed',
        mission_id: missionId,
        route: '$QA-LOOP',
        backend: 'fixture',
        agent_count: 5,
        all_sessions_closed: true,
        no_overlap_ok: true,
        ledger_hash_chain_ok: true,
        consensus_ok: true,
        janitor_ok: true,
        blockers: []
      }
    },
    claims: [{ id: 'qa-chrome-fixture', status: 'fixture', text: 'QA fixture passed with Codex Chrome Extension evidence source.' }]
  });
  const proofGate = await validateRouteCompletionProof(root, { missionId, route: '$QA-LOOP' });
  assert.equal(proofGate.ok, true);
});

test('QA-LOOP gate rejects Computer Use as web UI evidence even when Chrome Extension fields are also set', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-qa-cu-reject-'));
  const missionId = 'M-qa-cu-reject';
  const dir = path.join(root, '.sneakoscope/missions', missionId);
  await fs.mkdir(dir, { recursive: true });
  const reportFile = qaReportFilename(new Date('2026-05-17T00:00:00Z'), '0.9.13');
  await fs.writeFile(path.join(dir, reportFile), '# QA-LOOP Report\n\nFixture pass.\n');
  await fs.writeFile(path.join(dir, 'qa-ledger.json'), JSON.stringify({ schema_version: 1, checklist: [{ id: 'ui.chrome_extension_first', status: 'passed' }] }, null, 2));
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
    chrome_extension_preflight_passed: true,
    ui_chrome_extension_evidence: true,
    ui_computer_use_evidence: true,
    ui_evidence_source: 'codex_chrome_extension',
    corrective_loop_enabled: true,
    safe_remediation_required: true,
    unresolved_findings: 0,
    unresolved_fixable_findings: 0,
    unsafe_external_side_effects: false,
    post_fix_verification_complete: true,
    honest_mode_complete: true,
    evidence: ['Codex Computer Use screenshot evidence was used for browser UI.']
  }, null, 2));
  const gate = await evaluateQaGate(dir);
  assert.equal(gate.passed, false);
  assert.ok(gate.reasons.includes('ui_computer_use_evidence_forbidden_for_web'));
  assert.ok(gate.reasons.includes('computer_use_web_evidence_forbidden'));
});
