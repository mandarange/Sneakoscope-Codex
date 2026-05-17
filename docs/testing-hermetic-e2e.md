# Hermetic E2E Testing

SKS 0.9.18 route E2E tests run in temp project roots instead of the source checkout.

## Helper

`test/e2e/route-real-command-helper.mjs` exposes:

- `createHermeticProjectRoot({ fixtureName, files, setup })`
- `runSksInRoot(root, args, opts)`
- `assertCompletionProofInRoot(root, missionId, route)`
- `assertImageAnchorsInRoot(root, missionId, opts)`
- `assertNoSourceRepoStateMutation(before, after)`

The default `runSks()` helper now creates a temp root, writes a minimal `package.json` and `README.md`, copies deterministic image fixtures, runs `sks setup --local-only --json`, and executes the route with `cwd=tempRoot`.

## Rule

Route tests must inspect the temp root `.sneakoscope/missions/<id>` path. They must not read source checkout latest mission state or rely on `process.cwd()` `.sneakoscope` artifacts.
