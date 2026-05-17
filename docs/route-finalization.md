# Route Finalization

SKS `0.9.14` uses `src/core/proof/route-finalizer.mjs` as the central completion path for serious routes. The finalizer accepts a mission id, route, gate/artifact evidence, command/test evidence, claims, unverified items, blockers, and optional visual evidence policy.

For visual routes, the finalizer calls Image Voxel evidence automation before writing proof. When a visual route claims a fix, the finalizer requires a `before_after` relation or lowers/blocks the proof status.

Useful commands:

```bash
sks proof finalize latest --json
sks proof finalize latest --route '$Team' --json
sks proof finalize latest --route '$Image-UX-Review' --mock --require-relation --json
sks proof route latest --json
```

`sks proof repair latest` remains an emergency repair command. Normal route completion should go through the route finalizer and write both mission-local proof and `.sneakoscope/proof/latest.*`.
