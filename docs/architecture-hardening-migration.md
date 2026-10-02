# Desktop Bridge migration and recovery

Sneakoscope 8.1.3 has one managed Desktop routing runtime: the loopback
Desktop Bridge. Codex-LB and OpenRouter are independent provider profiles
inside that runtime. ChatGPT OAuth remains owned by Codex and is never moved
into a provider profile.

There is no alternate legacy runtime, legacy command, or legacy-only source
directory. Historical SKS-authored configuration is decoded only inside the
current migration implementation so it can be converted or rejected safely.

## Current contract

- `sks bridge` is the only public management surface.
- `sks codex-lb` is removed and returns `unknown_command`.
- The combined catalog and route index activate as one generation.
- Requests use an explicit route or a validated session pin; model spelling and
  slash prefixes never select a provider.
- Codex-LB and OpenRouter credentials can coexist and are never copied into
  receipts, catalogs, route indexes, launchd configuration, or UI JSON.
- There is no automatic provider fallback.

## Inspect, migrate, and roll back

[`desktop-bridge-migration.ts`](../src/core/codex-lb/desktop-bridge-migration.ts)
owns the migration transaction:

1. Inspect exact configuration bytes and classify only recognized SKS-authored
   historical state.
2. Fail closed on ambiguous or user-owned values.
3. Build current provider profiles, route policy, catalog binding, and service
   metadata without moving secret values.
4. Publish a checksummed, redacted receipt only after read-back succeeds.
5. On rollback, restore receipt-owned metadata while preserving credentials
   and OAuth state that changed after migration.

Running the migration twice produces a no-op receipt. A failed write or
generation activation preserves the previous verified generation. Credential
removal is a separate, explicitly confirmed operation.

## Verification

Run the focused contracts:

```bash
npm run typecheck --silent
npm run build:incremental --silent
node --test dist/core/architecture-hardening/__tests__/integration.test.js
node dist/scripts/desktop-bridge-unification-check.js
```

These contracts run with isolated homes and sentinel credentials; they are not
live provider evidence. `npm run
desktop-bridge:real-evidence` reports whether explicitly supplied real inputs
were exercised, but its receipt is non-release-authorizing. macOS launchd,
Codex Desktop restart, real OAuth identity, real providers, WebSocket exchange,
and native deep artifacts require separately attached real-environment
receipts. Missing inputs remain `not-run-real`.
