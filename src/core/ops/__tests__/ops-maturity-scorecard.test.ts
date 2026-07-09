import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildOpsMaturityScorecard, invalidEvidenceBlockers } from '../ops-maturity-scorecard.js';

test('ops maturity scorecard rejects ok true evidence with blockers', () => {
  assert.deepEqual(invalidEvidenceBlockers({ ok: true, blockers: ['blocked'] }), ['ok_true_with_blockers']);
});

test('ops maturity scorecard gives missing evidence zero score', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ops-scorecard-test-'));
  try {
    const report = await buildOpsMaturityScorecard(root);
    assert.equal(report.ok, false);
    assert.equal(report.total_score, 0);
    assert.ok(report.blockers.some((blocker) => blocker.includes('evidence_missing')));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
