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

## Where they run

The `git-collaboration:e2e` release gate runs the E2E tests in `test/e2e`, and
the architecture-map gates run `test/architecture-map`. Everything else runs in
the canonical suite (`npm test`): compiled `src/**/__tests__` tests plus
`test/unit` and `test/regression`. A test file that none of these runs is
deleted rather than kept as unexecuted coverage.

## Desktop Bridge evidence

Live Desktop Bridge evidence runs separately:

```bash
npm run desktop-bridge:real-evidence
```

The check consumes only explicitly supplied inputs, validates provider
endpoints, and never places a key in argv or report fields. Missing inputs are
reported as `not-run-real`; fixtures never substitute for them. Its report is
diagnostic and non-release-authorizing, so release evidence must still include
the target-bound real macOS, OAuth, provider, WebSocket, and native artifact
receipts required by the implementation report.

Production menu-bar QA is intentionally separate:

```bash
node native/sks-menubar/UITests/run-signed-restart-qa.mjs
```

That runner requires explicit approval, a production Developer ID app, and an
`.xctestrun` bundle. Without them it reports `not_verified` and does not launch
or modify a user app.
