# Managed Paths

SKS-owned project paths are declared by:

```bash
sks paths managed --json
```

The manifest lives at:

```text
.sneakoscope/managed-paths.json
```

Default managed paths:

- `.sneakoscope`
- `.codex`
- `.agents/skills`
- `AGENTS.md`

`AGENTS.md` is documented as SKS-managed but not automatically removed by rollback because it can contain user-visible repository policy.
