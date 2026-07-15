# Black-Box Package Tests

SKS 1.0.0 treats packed package behavior as release evidence, not a publish-time assumption.

## Scripts

```bash
npm run blackbox:pack-install
npm run blackbox:npx
npm run blackbox:global-shim
npm run blackbox:check
```

## Coverage

- `blackbox:pack-install` runs `npm pack`, installs the tarball into a temp consumer project, then checks `npx sks --version`, `root --json`, `setup --local-only --json`, `selftest --mock`, `sks run --execute --mock`, the official-subagent workflow fixture, QA Loop prepare/run, and `completion-proof.json`.
- `blackbox:npx` uses the packed tarball with one-shot `npm exec --package <tarball>` commands for `sks --version`, `sks root --json`, and `sks selftest --mock`.
- `blackbox:global-shim` installs the tarball into a temp npm prefix and verifies both `sks` and `sneakoscope` shims plus `sks root --json`.

All scripts use an isolated npm cache and temp roots. They remove generated tarballs unless `--keep` is passed. `--dry-run --json` is available for unit/shape tests.
## 0.9.20 Matrix Surface

`npm run blackbox:matrix` writes `.sneakoscope/reports/blackbox-matrix.json` and tracks the install integrity matrix:

- npm pack local tarball
- temp npm install
- npx one-shot
- global shim with temp prefix
- fresh HOME
- project-local install
- no git repo directory
- read-only project directory
- path with spaces
- Korean/unicode path

By default the matrix records the contract surface and relies on the existing package scripts in `blackbox:check`. Set `SKS_REAL_BLACKBOX_MATRIX=1` to execute the package-install rows through the black-box scripts.
# 1.0.0 Real Matrix

`blackbox:matrix` now defaults to real mode. Contract mode remains available only as `npm run blackbox:matrix:contract` for quick local shape checks.

Required real rows:

- local `npm pack`
- temp npm install from tarball
- npx one-shot version/root/selftest
- global shim install into a temp prefix
- fresh HOME/no-git execution
- packed `sks run --execute --mock`
- path with spaces
- Korean/Unicode path
- optional read-only project directory

The matrix invokes the underlying blackbox scripts with `--json`, validates required step labels, and writes `.sneakoscope/reports/blackbox-matrix.json`. `npm run test:blackbox` keeps the package test files named in the stable release goal as fast contract tests; the real install/runtime proof remains `blackbox:matrix` and `blackbox:check`.
