import { PPT_REVIEW_ARTIFACT_PATHS, pptReviewProofEvidence, writePptImagegenReviewArtifacts } from './ppt-review/index.js';

export const PPT_IMAGEGEN_REVIEW_ARTIFACTS = Object.values(PPT_REVIEW_ARTIFACT_PATHS);

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
