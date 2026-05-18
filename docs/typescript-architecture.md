# TypeScript Architecture

`1.0.1` completes the TypeScript-first runtime. The published CLI entrypoint, router, command registry, Trust Kernel, Evidence Router, Completion Proof, Image Voxel, Scout, and route command runtime are built from TypeScript into `dist`.

## Release Invariants

- `tsconfig.json` uses NodeNext, ES2022, `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- `src/bin/sks.ts` builds the published `dist/bin/sks.js` binary.
- `src/cli/command-registry.ts` is the actual typed runtime command registry used by the CLI.
- Trust Kernel, route contracts, Completion Proof, evidence records, Trust Reports, Image Voxel ledgers, Scout outputs, and feature fixtures have exported TypeScript interfaces and runtime guards.
- `npm run build`, `npm run typecheck`, `npm run typecheck:contracts`, `npm run test:types`, `npm run schema:check`, and `npm run dist:check` are required before publish.

## Contract Modules

- `src/core/trust-kernel/*.ts`: Trust status, kernel metadata, route completion contract, Trust Report, and route state machine contracts.
- `src/core/evidence/evidence-schema.ts`: typed evidence records and evidence index.
- `src/core/proof/proof-schema.ts` and `validation.ts`: Completion Proof schema and type guards.
- `src/core/wiki-image/image-voxel-schema.ts`: Image Voxel ledger types.
- `src/core/scouts/scout-schema.ts`: Scout result contracts.
- `src/core/features/*.ts`: feature fixture and registry contracts.

## Build Output

The npm package uses `files: ["dist", ...]`; source implementation files are not published. `npm run build` cleans `dist`, compiles TypeScript, copies only runtime config assets, writes `dist/build-manifest.json`, and blocks copied `.mjs` runtime files through `npm run dist:check`.

## Type Contract Tests

`test/types/*.test.ts` compiles the command registry, Trust Kernel, evidence, Completion Proof, Image Voxel, and Scout contracts under the same strict compiler rules as the source tree. These tests are type-only and run through `npm run test:types`.
