# Legacy-Free Architecture

SKS `1.17.0` keeps the legacy-free CLI path, removes the route-command monolith, and keeps `src/core/pipeline.ts` as a compatibility facade for split pipeline modules. `bin/sks.mjs` loads the compiled `dist/bin/sks.js`, which dispatches from TypeScript source through focused wrappers in `src/commands/`. Serious route implementations live in route-specific `src/core/commands/*-command.ts` modules.

The release gate enforces this with:

```bash
npm run cli-entrypoint:check
npm run legacy-free:check
npm run route-modularity:check
npm run command-budget:check
npm run pipeline-budget:check
```

The legacy 0.9.13 archive files have been removed from the repository instead of retained as a compatibility surface. Runtime source, commands, scripts, package metadata, release gates, and documentation must not depend on or recreate those archived files.

Command wrappers stay thin. Shared implementation moves to `src/core/` or `src/core/commands/`, while command modules expose `run(command, args)` for lazy registry dispatch. The removed route CLI monolith must not reappear in runtime source, and route modules must not import each other as hidden fallback paths.
