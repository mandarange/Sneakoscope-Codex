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

The policy file records the selected collaboration strictness and CI behavior. Inspect the generated policy with `sks git policy --json`; do not hand-edit implementation-level mode values.

Large visual artifacts default to manual/LFS policy. Raw screenshots should not be tracked unless the policy explicitly allows it.
