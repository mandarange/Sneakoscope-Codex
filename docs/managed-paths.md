# Managed Paths

SKS-owned project paths are declared by:

```bash
sks paths managed --json
```

The manifest lives at:

```text
.sneakoscope/managed-paths.json
```

Default managed path planes:

- shared memory, tracked: `.sneakoscope/git-policy.json`, `.sneakoscope/shared-memory-manifest.json`, `.sneakoscope/wiki/records`, `.sneakoscope/wiki/wrongness`, `.sneakoscope/wiki/image-voxels`, `.sneakoscope/wiki/avoidance-rules`
- generated indexes, ignored: `.sneakoscope/wiki/indexes`, `.sneakoscope/wiki/context-packs`
- local runtime, ignored: `.sneakoscope/missions`, `.sneakoscope/reports`, `.sneakoscope/tmp`, `.sneakoscope/cache`, `.sneakoscope/logs`, `.sneakoscope/state`, `.sneakoscope/memory`, `.sneakoscope/proof`
- harness surface: `.codex`, `.agents/skills`, `AGENTS.md`

`AGENTS.md` is documented as SKS-managed but not automatically removed by rollback because it can contain user-visible repository policy.

Shared memory paths are also preserved by rollback. Deleting shared memory requires explicit human intent outside the ordinary rollback list.

## Retention Cleanup

Retention cleanup uses the same two-plane model. Some ignored local runtime files are still retention-protected because they are the learning/audit record: `.sneakoscope/memory/**`, shared TriWiki records, `.sneakoscope/wiki/context-pack.json`, wrongness/image-voxel/avoidance records, Completion Proof, trust reports, evidence indexes, reflections, and agent proof summaries. Generated indexes and `.sneakoscope/wiki/context-packs/` can be rebuilt.

After a route is closed enough to preserve its proof chain, SKS removes closed-route scratch that has served its purpose: `.sneakoscope/tmp/*`, closed mission `team-inbox/`, `bus/`, `cycles/`, `arenas/`, agent lane/worktree temp dirs, mission raw stdout/stderr logs, and release-parallel logs after inline summaries replace file paths in the report. Post-route cleanup is bounded to the completed route, while `sks gc` performs the full old/excess mission sweep. Active missions, blocked-route diagnostics, and terminal transcripts are preserved. Old/excess missions with durable proof or learning files are compacted rather than deleted wholesale. Preview cleanup with `sks gc --dry-run --json`; inspect storage with `sks stats --json`.

Git policy view:

```bash
sks paths git-policy --json
```
