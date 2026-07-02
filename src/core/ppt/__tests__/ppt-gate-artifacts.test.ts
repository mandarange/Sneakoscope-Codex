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
