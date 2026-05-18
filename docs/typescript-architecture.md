# TypeScript Architecture

`1.0.0` introduces a TypeScript-first trust-contract spine while keeping the existing `.mjs` runtime as thin compatibility surfaces where a full migration would be risky.

## Release Invariants

- `tsconfig.json` uses NodeNext, ES2022, `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- `src/bin/sks.ts` builds the published `dist/bin/sks.js` binary.
- `src/cli/command-registry.ts` defines the typed command contract and mirrors critical runtime command entries.
- Trust Kernel, route contracts, Completion Proof, evidence records, Trust Reports, Image Voxel ledgers, Scout outputs, and feature fixtures have exported TypeScript interfaces and runtime guards.
- `npm run build`, `npm run typecheck`, `npm run typecheck:contracts`, `npm run test:types`, and `npm run schema:check` are required before publish.

## Contract Modules

- `src/core/trust-kernel/*.ts`: Trust status, kernel metadata, route completion contract, Trust Report, and route state machine contracts.
- `src/core/evidence/evidence-schema.ts`: typed evidence records and evidence index.
- `src/core/proof/proof-schema.ts` and `validation.ts`: Completion Proof schema and type guards.
- `src/core/wiki-image/image-voxel-schema.ts`: Image Voxel ledger types.
- `src/core/scouts/scout-schema.ts`: Scout result contracts.
- `src/core/features/*.ts`: feature fixture and registry contracts.

## Build Output

The npm package uses `files: ["dist", ...]`; source-only implementation files are not relied on by consumers. `scripts/build-dist.mjs` copies runtime `.mjs` compatibility modules and runtime config into `dist`, while TypeScript emits declarations and source maps.

## Type Contract Tests

`test/types/*.test.ts` compiles the command registry, Trust Kernel, evidence, Completion Proof, Image Voxel, and Scout contracts under the same strict compiler rules as the source tree. These tests are type-only and run through `npm run test:types`.
