# Architecture

The active architecture keeps user-facing commands lazy-loaded through `src/cli/command-registry.ts` and keeps `src/core/pipeline.ts` as the single compatibility facade.

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

`config/architecture-budgets.v1.json` is the single source of truth for architecture line budgets. `architecture:check` computes committed changes from `git merge-base HEAD <base-ref>` (preferring `origin/main`) and also includes staged, unstaged, and untracked files. This keeps a clean feature checkout observable instead of relying on `git diff HEAD`. Use `--base-ref <ref>` to seal a comparison target and `--strict-all` for release-wide enforcement.

Hard thresholds in the budget SSOT:

- Menu Bar compatibility facade: `80` lines.
- Menu Bar TypeScript modules: `450` lines.
- Menu Bar AppDelegate: `250` lines.
- Other Menu Bar Swift modules: `500` lines.
- Command modules: `900` lines.
- Pipeline, trust-kernel, evidence, and proof modules: `1200` lines.
- Other handwritten source: `1800` lines.
- Any handwritten file at `3000` lines enters the split-review gate.

Every over-budget legacy waiver is `shrink-only`: it records the merge-base line ceiling and an expiry version, cannot be used for a new file, and fails as soon as the file grows. A waiver never raises the shared budget.
# 1.0.0 Architecture Gates

Architecture warnings are release failures.

Hard thresholds are read from the budget SSOT:

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
