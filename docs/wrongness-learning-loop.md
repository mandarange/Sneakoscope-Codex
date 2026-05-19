# Wrongness Learning Loop

The wrongness loop is intentionally small:

1. Detect a mismatch or failed assumption.
2. Store it as a schema-backed wrongness record.
3. Attach an avoidance rule and corrective action.
4. Retrieve active rules during TriWiki pack, scout intake, proof finalization, and trust validation.
5. Resolve the record only after current evidence supports the correction.

Automatic sources now include trust validation blockers, image voxel validation failures, DB safety expectation mismatches, hook replay expectation mismatches, and test failure fixtures. Manual entries use `sks wrongness add`.

Release gates run:

```bash
npm run wrongness:fixtures
npm run wrongness:check
```

`wrongness:fixtures` exercises the runtime CLI and the automatic source adapters. `wrongness:check` validates the project ledger and runs a hermetic fixture root that writes test, DB, hook, and image wrongness records.
