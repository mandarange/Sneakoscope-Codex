# Legacy-Free Architecture

SKS `0.9.17` keeps the 0.9.14 legacy-free CLI path and removes the route-command monolith. `bin/sks.mjs` loads `src/cli/main.mjs`, which loads `src/cli/router.mjs`, which dispatches through `src/cli/command-registry.mjs` to focused wrappers in `src/commands/`. Serious route implementations live in route-specific `src/core/commands/*-command.mjs` modules.

The release gate enforces this with:

```bash
npm run cli-entrypoint:check
npm run legacy-free:check
npm run route-modularity:check
npm run command-budget:check
```

The legacy 0.9.13 files are archived under `archive/legacy/` and are not included in the npm `files` allowlist. Runtime source, commands, scripts, and package metadata must not depend on those archived files.

Command wrappers stay thin. Shared implementation moves to `src/core/` or `src/core/commands/`, while command modules expose `run(command, args)` for lazy registry dispatch. The removed `src/core/commands/route-cli.mjs` file must not reappear in runtime source, and route modules must not import each other as hidden fallback paths.
