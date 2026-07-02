# Polyglot Runtime Story

`src/**` is the TypeScript product surface. The non-TypeScript directories are not imported by TypeScript modules directly:

- `crates/sks-core/`: Rust package material shipped for native/runtime packaging experiments and boundary checks.
- `pytools/`: Python Codex SDK bridge utilities used by process-level adapters and diagnostics.

These directories must stay out of release gate sprawl. A gate may cover them only when the user concern is the TS/Rust boundary, Python SDK bridge behavior, packaging, or an explicitly changed file in those directories.

Removal criteria:

- no release/package artifact references the directory;
- no documented CLI/doctor/update path invokes it;
- a release audit confirms the package `files` list and runtime checks no longer need it.
