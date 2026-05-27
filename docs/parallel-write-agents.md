# Parallel Write Agents

SKS 1.18.8 preserves the proof-safe agent patch kernel and extends its evidence. Patch proof now includes queue transition events, ownership ledger rows, after-hashes, rollback digests, merge parallel batches, serial conflicts, and wall-clock parallel evidence labels.

Run:

```bash
npm run agent:parallel-write-kernel
npm run agent:parallel-write-blackbox
npm run team:parallel-write-blackbox
npm run dfix:parallel-write-blackbox
npm run agent:patch-proof
npm run agent:patch-rollback
```

Parallel writes stay bounded by leases and protected path checks. `.codex`, generated agent skills, AGENTS.md, `.sneakoscope/*policy*.json`, and `node_modules/sneakoscope` remain protected.
