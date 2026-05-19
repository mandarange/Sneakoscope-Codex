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

Git policy view:

```bash
sks paths git-policy --json
```
