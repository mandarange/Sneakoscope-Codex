# Legacy-Free Architecture

SKS `0.9.14` removes runtime command fallback to the archived 0.9.13 CLI bundle. `bin/sks.mjs` loads `src/cli/main.mjs`, which loads `src/cli/router.mjs`, which dispatches through `src/cli/command-registry.mjs` to focused modules in `src/commands/`.

The release gate enforces this with:

```bash
npm run cli-entrypoint:check
npm run legacy-free:check
```

The legacy 0.9.13 files are archived under `archive/legacy/` and are not included in the npm `files` allowlist. Runtime source, commands, scripts, and package metadata must not depend on those archived files.

Command wrappers stay thin. Shared implementation moves to `src/core/` or `src/core/commands/`, while command modules expose `run(command, args)` for lazy registry dispatch.
