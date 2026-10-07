# Jev acceptance evidence

This evidence is bound to baseline `ce6203869b83fd729be08cfb2f74ec2c632c41ba`, package `10.5.6`, Node `v24.19.0`, and npm `11.9.0`. The repository default remains Jev off. No live OpenRouter request or quality claim is included.

| Area | Command or artifact | Result |
|---|---|---|
| Baseline reproduction | exact-base `npm run typecheck`, `npm run build:clean`, `npm run architecture:check`, `npm run test:release` | pass; release baseline 198/198 |
| TypeScript and build | `npm run typecheck`, `npm run build:clean` | pass |
| Architecture and runtime schemas | `npm run architecture:check`, `npm run schema:check`, `npm run runtime:no-src-mjs`, `npm run runtime:ts-source-of-truth` | pass |
| Jev plan, memory, task leases, authority, sibling relay | three new compiled suites under `dist/core/{memory,pipeline-internals,hooks-runtime}/__tests__` | 10/10 pass |
| Image, shared-memory, and voxel contracts | five existing image/shared-memory tests plus `dist/core/__tests__/triwiki-voxel-integrity.test.js` | 9/9 pass |
| Mission promotion smoke | staged durable preference, explicit promotion, index rebuild, intake status, bounded overlay | pass; one canonical claim recalled |
| Canonical release suite | `npm run test:release` | 198/198 pass |
| Retention and rollback | `npm run retention:budget`, `npm run retention:dry-run`, `npm run retention:apply-smoke`, `npm run recovery:rollback-smoke` | pass |
| Migration safety | `npm run migration:upgrade-safety` | pass |
| Affected/fast release DAG | `npm run release:check:affected`, `npm run release:check:fast` | 14/16 gates pass; 2 environment-blocked, SLA met |
| Exhaustive canonical runner | `npm test` | 3,868/3,926 pass, 46 skipped, 12 pre-existing/environment failures in process reaping, permissions, signals, and doctor symlink fixtures |
| Route intent regression | `npm run route:intent-regression` | 3 baseline failures: implicit Naruto prompts resolve to SKS in the existing parent-owned routing contract |
| Migration matrix | `npm run upgrade:migration-matrix` | blocked by fixture doctor/update environment; migration and safety postconditions remained true |
| High-risk/performance probes | `npm run security:high-risk-contracts`, `npm run perf:budgets` | security negative smokes closed; installed-version probe unavailable; existing command/help latency cohorts exceed configured budgets |
| Named optional scripts | shared-memory/context-graph script names from the work order | not available in `package.json`; corresponding compiled tests and available gates were run |
| Live connectivity/performance | no live probe or workload authorization | unavailable by design |

Receipts and reports contain digests, counters, paths, and blocker codes only. Raw prompts, tool output, image bytes, secrets, credentials, and full session IDs are excluded. Release-DAG blockers are environmental (`locked_installed_version_probe_failed`); they do not authorize a release claim.
