# Rust Accelerator

SKS `0.9.12` chooses source-in-package packaging for the Rust accelerator. The npm package includes `crates/sks-core/Cargo.toml`, `Cargo.lock`, and `src/`, but excludes `target/` build output.

Prebuilt binary packages are deferred. Until they exist, SKS runs JS fallbacks unless one of these is available:

- `SKS_RS_BIN` points to a compatible `sks-rs` binary.
- A source checkout has `crates/sks-core/target/release/sks-rs`.

## Commands

```bash
sks-rs --version
sks-rs secret-scan <path>
sks-rs jsonl-tail <path> --bytes 262144
```

`src/core/rust-accelerator.mjs` exposes JS fallbacks for image hashing, voxel validation, secret scanning, and JSONL tailing so missing Rust never blocks core SKS operation.
