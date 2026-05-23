import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateFlagshipProofGraph } from '../../dist/core/evidence/flagship-proof-graph-validator.js';

test('flagship proof graph rejects proof/trust schema-only evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-proof-graph-'));
  const reports = path.join(root, '.sneakoscope', 'reports');
  await fs.mkdir(reports, { recursive: true });
  await fs.writeFile(path.join(reports, 'ppt-full-e2e-blackbox.json'), `${JSON.stringify({
    schema: 'sks.ppt-full-e2e-blackbox.v1',
    ok: true,
    artifacts: {
      proof_schema: 'sks.completion-proof.v1',
      trust_schema: 'sks.trust-report.v1'
    },
    wrongness_linked: true,
    mock_fake_not_verified_real: true
  })}\n`);
  await fs.writeFile(path.join(reports, 'evidence-flagship-coverage.json'), `${JSON.stringify({
    schema: 'sks.evidence-flagship-coverage.v1',
    ok: true,
    evidence_index_linked: true,
    completion_proof_linked: true,
    trust_linked: true,
    wrongness_behavior_defined: true
  })}\n`);

  const result = await validateFlagshipProofGraph(root, { routes: ['ppt_review'] });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('artifact:ppt_review:.sneakoscope/reports/ppt-full-e2e-blackbox.json:completion_proof_status_missing'));
  assert.ok(result.blockers.includes('artifact:ppt_review:.sneakoscope/reports/ppt-full-e2e-blackbox.json:trust_report_status_missing'));
});
