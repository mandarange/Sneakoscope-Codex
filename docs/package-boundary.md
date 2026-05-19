# Package Boundary

`1.0.3` continues to treat the packed npm tarball as the release source of truth and expects a TypeScript-built, `.mjs`-free `dist` runtime keyed by manifest schema `sks.dist-build.v2`.

## Policy

- Publish built `dist` output, Rust crate source, `README.md`, and `LICENSE`.
- Do not publish `src`, `scripts`, `test`, `.sneakoscope`, `.codex`, or `.agents`.
- Package `bin` points to `dist/bin/sks.js` for both `sks` and `sneakoscope`.
- Runtime config needed by packed commands is copied into `dist`; runtime code is not copied from `src/**/*.mjs`.

## Required Checks

- `npm run package-boundary:check` builds, runs `npm pack --dry-run --json --ignore-scripts`, verifies required files, rejects forbidden paths, and checks relative import closure under `dist`.
- `npm run dist:check` rejects `dist/**/*.mjs`, `.mjs` imports, missing build manifest, volatile build-manifest timestamps, missing executable bin, and contract-only runtime markers.
- `npm run blackbox:command-import-smoke` packs the tarball, installs it into a temp consumer, imports `dist/cli/command-registry.js`, and lazy-imports every registered command.
- `npm run blackbox:matrix` runs real pack install, npx one-shot, global shim, no-git, spaces, Unicode, and optional read-only directory scenarios.
- `npm run git-hygiene:check`, `npm run shared-memory:check`, and `npm run git-collaboration:e2e` validate the new shared-memory git collaboration surface before release.

## Current Stable Evidence

- Packed file count observed during boundary check: `1140`.
- Required bin: `dist/bin/sks.js`.
- Required command registry: `dist/cli/command-registry.js`.
- Missing import issues must be zero before publish.
