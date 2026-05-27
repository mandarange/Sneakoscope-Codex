# Migration 1.18.7 to 1.18.8

SKS 1.18.8 is the strategy/Appshots release for the Codex 0.134 surface.

- Version metadata moves from `1.18.7` to `1.18.8`.
- Native agent runs write strategy-first artifacts before scheduling.
- Appshots evidence is recorded through Source Intelligence for visual proof.
- MCP readOnlyHint concurrency is release-gated as advisory only.
- Parallel patch proof now records queue events, ownership ledger entries, after-hashes, rollback digests, parallel batches, and serial conflicts.

Recommended checks:

```bash
npm run build
npm run strategy:adhd-orchestrating-gate
npm run appshots:source-intelligence
npm run agent:parallel-write-kernel
npm run release:metadata
```
