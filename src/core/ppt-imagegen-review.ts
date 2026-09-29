import { pptReviewProofEvidence, writePptImagegenReviewArtifacts } from './ppt-review/index.js';

export async function writePptImagegenReviewFixture(root: any, dir: string, missionId: string, opts: any = {}) {
  const artifacts = await writePptImagegenReviewArtifacts({
    root,
    dir,
    missionId,
    mock: true,
    fixRequested: opts.fixRequested === true
  });
  return {
    schema: 'sks.ppt-imagegen-review-fixture.v1',
    ok: artifacts.gate?.passed === true,
    artifacts,
    proof_evidence: pptReviewProofEvidence(artifacts.gate, artifacts)
  };
}
