# Black-Box Package Tests

SKS 0.9.19 treats packed package behavior as release evidence, not a publish-time assumption.

## Scripts

```bash
npm run blackbox:pack-install
npm run blackbox:npx
npm run blackbox:global-shim
npm run blackbox:check
```

## Coverage

- `blackbox:pack-install` runs `npm pack`, installs the tarball into a temp consumer project, then checks `npx sks --version`, `root --json`, `setup --local-only --json`, `selftest --mock`, local-static scouts, QA Loop prepare/run, and `completion-proof.json`.
- `blackbox:npx` uses the packed tarball with one-shot `npm exec --package <tarball>` commands for `sks --version`, `sks root --json`, and `sks selftest --mock`.
- `blackbox:global-shim` installs the tarball into a temp npm prefix and verifies both `sks` and `sneakoscope` shims plus `sks root --json`.

All scripts use an isolated npm cache and temp roots. They remove generated tarballs unless `--keep` is passed. `--dry-run --json` is available for unit/shape tests.
