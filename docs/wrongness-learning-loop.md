# Wrongness Learning Loop

The wrongness loop is intentionally small:

1. Detect a mismatch or failed assumption.
2. Store it as a schema-backed wrongness record.
3. Attach an avoidance rule and corrective action.
4. Retrieve active rules during TriWiki pack, scout intake, proof finalization, and trust validation.
5. Resolve the record only after current evidence supports the correction.

Automatic sources now include trust validation blockers, image voxel validation failures, DB safety expectation mismatches, hook replay expectation mismatches, and test failure fixtures. Manual entries use `sks wrongness add`.

In 1.14.1, DFix and Scout stabilization both feed wrongness memory through `.sneakoscope/cache/dfix/` and mission wrongness ledgers. Error signatures carry redacted command/cwd/file/line/error-code data, successful patch hints, failed patch avoidance rules, verification command hints, file hash, project hash, and recurrence counts. A repeated no-op patch, failed verification, trust hook warning, modified hook state, schema drift, unsupported handler, Scout schema failure, read-only violation, or dual hook representation must produce a structured blocker or wrongness record instead of being retried silently.

Release gates run:

```bash
npm run wrongness:fixtures
npm run wrongness:check
```

`wrongness:fixtures` exercises the runtime CLI and the automatic source adapters. `wrongness:check` validates the project ledger and runs a hermetic fixture root that writes test, DB, hook, and image wrongness records.
