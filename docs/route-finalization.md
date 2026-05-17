# Route Finalization

SKS `0.9.18` uses `src/core/proof/route-finalizer.mjs` as the central completion path for serious routes, with `src/core/proof/auto-finalize.mjs` as the command-facing helper. The finalizer accepts a mission id, route, gate/artifact evidence, command/test evidence, claims, unverified items, blockers, and optional visual evidence policy.

Route fixture commands call `maybeFinalizeRoute` directly. The release-gated set includes Team, QA-LOOP, Research, PPT, Image UX Review, Computer Use, DB, Wiki, and GX. Their E2E tests execute actual route commands and then inspect mission-local `completion-proof.json` rather than using `sks proof finalize latest` as the route test itself.

Before `maybeFinalizeRoute` writes proof for a serious route, it ensures the five-scout intake gate has passed. That creates `scout-team-plan.json`, five read-only scout result pairs, `scout-consensus.json`, `scout-handoff.md`, `scout-gate.json`, `scout-engine-result.json`, `scout-readonly-guard.json`, and `scout-performance.json`, then attaches `evidence.scouts` to Completion Proof.

For visual routes, the finalizer calls Image Voxel evidence automation before writing proof. When a visual route claims a fix, the finalizer requires a `before_after` relation or lowers/blocks the proof status.

Useful commands:

```bash
sks proof finalize latest --json
sks proof finalize latest --route '$Team' --json
sks proof finalize latest --route '$Image-UX-Review' --mock --require-relation --json
sks proof route latest --json
```

`sks proof repair latest` remains an emergency repair command. Normal route completion should go through the route finalizer and write both mission-local proof and `.sneakoscope/proof/latest.*`.
