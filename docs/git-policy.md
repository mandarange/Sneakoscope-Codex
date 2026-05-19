# Git Policy

The SKS git policy is stored at:

```text
.sneakoscope/git-policy.json
```

The shared/local plane manifest is stored at:

```text
.sneakoscope/shared-memory-manifest.json
```

Inspect them with:

```bash
sks git policy --json
sks paths git-policy --json
```

Modes:

- `solo`: relaxed local development
- `team`: default collaboration mode
- `strict-team`: generated indexes become precommit blockers
- `ci`: CI-oriented validation mode

Large visual artifacts default to manual/LFS policy. Raw screenshots should not be tracked unless the policy explicitly allows it.

