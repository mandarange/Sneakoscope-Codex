# Route Finalization

SKS `1.17.0` uses `src/core/proof/route-finalizer.ts` as the central completion path for serious routes, with `src/core/proof/auto-finalize.ts` as the command-facing helper. The finalizer accepts a mission id, route, gate/artifact evidence, command/test evidence, claims, unverified items, blockers, and optional visual evidence policy.

Route fixture commands call `maybeFinalizeRoute` directly. The release-gated set includes Team, QA-LOOP, Research, PPT, Image UX Review, Computer Use, DB, Wiki, and GX. Their E2E tests execute actual route commands and then inspect mission-local `completion-proof.json` rather than using `sks proof finalize latest` as the route test itself.

In 0.9.20, `maybeFinalizeRoute` and `writeRouteCompletionProof` also bind finalization to the Trust Kernel. A route finalization path is incomplete unless the mission has:

- `completion-proof.json`
- `route-completion-contract.json`
- `evidence-index.json`
- `trust-report.json`

Before `maybeFinalizeRoute` writes proof for a serious route, it ensures native multi-session agent evidence is present. That creates `agents/agent-central-ledger.json`, `agents/agent-task-board.json`, `agents/agent-leases.json`, `agents/agent-no-overlap-proof.json`, `agents/agent-session-cleanup.json`, `agents/agent-proof-evidence.json`, and `agents/agent-effort-policy.json`, then attaches `evidence.agents` to Completion Proof. Removed legacy multi-agent artifacts do not satisfy default serious-route proof.

For visual routes, the finalizer calls Image Voxel evidence automation before writing proof. When a visual route claims a fix, the finalizer requires a `before_after` relation or lowers/blocks the proof status.

Useful commands:

```bash
sks proof finalize latest --json
sks proof finalize latest --route '$Team' --json
sks proof finalize latest --route '$Image-UX-Review' --mock --require-relation --json
sks proof route latest --json
sks trust report latest --json
sks trust explain latest
```

`sks proof repair latest` remains an emergency repair command. Normal route completion should go through the route finalizer and write both mission-local proof and `.sneakoscope/proof/latest.*`.
