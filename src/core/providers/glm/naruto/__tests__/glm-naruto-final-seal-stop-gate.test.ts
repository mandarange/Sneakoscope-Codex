import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { writeFinalStopGate } from '../../../../stop-gate/stop-gate-writer.js';

test('stop-gate evidence records final seal path and pass bit', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-final-seal-stop-gate-'));
  const finalSealPath = path.join(root, '.sneakoscope', 'glm-naruto', 'M-test', 'final-seal.json');
  const gate = await writeFinalStopGate({
    root,
    missionId: 'M-test',
    route: 'GLM_NARUTO',
    routeCommand: '$Naruto',
    status: 'passed',
    terminal: true,
    terminalState: 'completed',
    evidence: {
      build_passed: true,
      tests_passed: true,
      route_evidence_passed: true,
      per_worker_artifacts: true,
      verifier_wave_run: true,
      model_guard_enforced: true,
      final_seal_passed: true,
      final_seal_path: finalSealPath,
      proof_required: false,
      proof_passed: true,
      reflection_required: false,
      reflection_passed: 'not_required'
    }
  });
  assert.equal(gate.passed, true);
  assert.equal(gate.evidence.final_seal_passed, true);
  assert.equal(gate.evidence.final_seal_path, finalSealPath);
});
