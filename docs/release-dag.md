# Release DAG

`release-gates.v2.json` is the source of truth for public release checks. `npm run release:check` runs the change-aware affected DAG for ordinary local checks. Publish-authorizing verification is `npm run release:check:full`; it builds the project, runs the full release preset DAG, and writes the release stamp only after the DAG completes.

Gates declare resources, side-effect class, cache inputs, timeout, isolation, and preset. Hermetic gates run in temporary home and Codex home directories. Real checks use the `real-check` preset and require operator-controlled environment variables.

The full-coverage gate verifies that important package scripts are represented in the release DAG and that required 2.0.12 hardening gates are release-preset members.

Use `npm run release:check:dag:explain` to inspect the planned DAG, and use `npm run release:real-check` only on a host where the required real dependencies are installed and intentionally enabled.
