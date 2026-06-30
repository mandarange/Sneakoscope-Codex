# Architecture

The active 1.17.0 architecture keeps user-facing commands lazy-loaded through `src/cli/command-registry.ts` and keeps `src/core/pipeline-runtime.ts` as a compatibility facade.

Core trust modules added in 0.9.20:

- `src/core/trust-kernel/`
- `src/core/evidence/`
- `src/core/managed-paths.ts`
- `src/core/bench.ts`

Release architecture gates:

```bash
npm run architecture:check
npm run route-modularity:check
npm run command-budget:check
npm run pipeline-budget:check
npm run pipeline-runtime:check
```

`architecture:check` fails active `src/` files over the 3000-line split-review gate and warns on files over 1500 lines. Existing warnings must be treated as extraction candidates before unrelated logic is added.
# 1.0.0 Architecture Gates

Architecture warnings are release failures.

Hard thresholds:

- any handwritten file above `1800` lines fails;
- core pipeline/trust-kernel/evidence/proof files above `1200` lines fail;
- command modules above `900` lines fail;
- files that directly import five or more unrelated route domains fail unless they are explicit route-domain aggregators.

The pipeline runtime compatibility surface stays split: `src/core/pipeline-internals/runtime-core.ts` remains under the 1200-line pipeline gate, while stop/gate evaluation lives in `src/core/pipeline-internals/runtime-gates.ts`.

## 4.0.3 GLM Provider Split

GLM MAD mode is intentionally split by side-effect boundary:

- `src/cli/global-mode-router.ts` detects top-level `--mad --glm` before normal command dispatch.
- `src/core/providers/glm/glm-52-request.ts` builds pure OpenRouter request payloads.
- `src/core/providers/glm/glm-52-response-guard.ts` rejects missing, GPT/OpenAI, or unknown actual model ids before mutation.
- `src/core/providers/openrouter/openrouter-secret-store.ts` owns the user-scoped OpenRouter key lifecycle outside project files.
- `src/core/providers/openrouter/openrouter-client.ts` is the only OpenRouter network adapter.
- `src/core/codex-app/glm-profile-installer.ts` writes GLM model profile metadata plus Codex Desktop provider/profile config and avoids duplicate Codex App/MCP declarations.

This keeps provider policy testable without routing around the existing SKS proof-first pipeline.
