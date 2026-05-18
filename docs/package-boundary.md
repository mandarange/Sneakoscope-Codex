# Package Boundary

`1.0.0` treats the packed npm tarball as the release source of truth.

## Policy

- Publish built `dist` output, Rust crate source, `README.md`, and `LICENSE`.
- Do not publish `src`, `scripts`, `test`, `.sneakoscope`, `.codex`, or `.agents`.
- Package `bin` points to `dist/bin/sks.js` for both `sks` and `sneakoscope`.
- Runtime config needed by packed commands is copied into `dist`.

## Required Checks

- `npm run package-boundary:check` builds, runs `npm pack --dry-run --json --ignore-scripts`, verifies required files, rejects forbidden paths, and checks relative import closure under `dist`.
- `npm run blackbox:command-import-smoke` packs the tarball, installs it into a temp consumer, imports `dist/cli/command-registry.mjs`, and lazy-imports every registered command.
- `npm run blackbox:matrix` runs real pack install, npx one-shot, global shim, no-git, spaces, Unicode, and optional read-only directory scenarios.

## Current Stable Evidence

- Packed file count observed during boundary check: `340`.
- Required bin: `dist/bin/sks.js`.
- Required command registry: `dist/cli/command-registry.mjs`.
- Missing import issues must be zero before publish.
