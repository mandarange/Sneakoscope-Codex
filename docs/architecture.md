# Architecture

The active 0.9.x architecture keeps user-facing commands lazy-loaded through `src/cli/command-registry.mjs` and keeps `src/core/pipeline-runtime.mjs` as a compatibility facade.

Core trust modules added in 0.9.20:

- `src/core/trust-kernel/`
- `src/core/evidence/`
- `src/core/managed-paths.mjs`
- `src/core/bench.mjs`

Release architecture gates:

```bash
npm run architecture:check
npm run route-modularity:check
npm run command-budget:check
npm run pipeline-budget:check
npm run pipeline-runtime:check
```

`architecture:check` fails active `src/` files over the 3000-line split-review gate and warns on files over 1500 lines. Existing warnings must be treated as extraction candidates before unrelated logic is added.
