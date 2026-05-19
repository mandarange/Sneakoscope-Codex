# Git Hygiene

SKS git hygiene prevents two failure modes: accidentally committing runtime noise and accidentally hiding shared memory behind a broad `.sneakoscope/` ignore.

## Commands

```bash
sks git install
sks git doctor --fix
sks git status --json
sks git precommit --json
```

`sks git install` writes managed `.gitignore` and `.gitattributes` blocks plus the policy/manifest JSON files. It does not install Git hooks automatically. Teams that want a hook can call `sks git precommit` from a human-owned hook.

## Precommit Policy

`sks git precommit` blocks:

- staged local runtime files under `.sneakoscope/missions`, reports, tmp, cache, logs, state, memory, proof, and related runtime paths
- invalid shared-memory JSON records
- plaintext secrets in shared records
- oversized tracked files beyond `.sneakoscope/git-policy.json`

Generated indexes are warnings by default and blockers in `strict-team` mode.
