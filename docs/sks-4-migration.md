# SKS 4.0.0 Migration

SKS 4.0.0 is a destructive verification-pipeline release. The default foreground path is affected-scope, release-equivalent proof backed by TriWiki proof cards, gate packs, resource budgets, and SLA certificates.

## Operational Changes

- Use `sks check --tier confidence --sla 5m` for normal foreground verification.
- Use `sks task run --sla 5m` for task-shaped affected verification.
- Use `sks release affected` for release-equivalent changed-scope proof.
- Use `sks release full` for the full foreground release graph.
- Use `sks check --tier real-check` only for explicit real environment, app, browser, network, OAuth, or registry verification.
- Use `sks triwiki index`, `sks triwiki affected`, and `sks proof bank status` to inspect the new proof bank surface.

## Removed Runtime Migration

Removed runtime migration is explicit. `tmux` remains only as a removed-runtime notice. SKS 4.0.0 does not silently route removed runtimes, old compatibility aliases, or legacy fallback command names to replacement behavior.

## No Silent Legacy Fallback

No silent legacy fallback is allowed. Users must call the canonical command names (`sks naruto`, `sks computer-use`, `sks image-ux-review`, `sks dollar-commands`, `sks gc`, and related first-class commands) rather than relying on compatibility aliases.

<!-- sks-legacy-allowlist
id: team:*
reason: documented transition gates verify Team aliases route to Naruto and must expire after 4.0.x compatibility proof is no longer needed
owner: release
expires: 4.1.0
-->

<!-- sks-legacy-allowlist
id: codex:0139*
reason: kept until codex:0140 real probes replace all 0.139 compatibility coverage
owner: release
expires: 4.1.0
-->

<!-- sks-legacy-allowlist
id: doctor:codex-0139-real-probes
reason: doctor bridge remains as coverage for 0.139 real probes until codex:0140 doctor coverage is complete
owner: release
expires: 4.1.0
-->

<!-- sks-legacy-allowlist
id: docs:codex-0139*
reason: documentation wording checks remain until 0.139 terminology is replaced by the 0.140 capability line
owner: release
expires: 4.1.0
-->

<!-- sks-legacy-allowlist
id: legacy:upgrade-zero-break
reason: upgrade compatibility proof remains through 4.0.x while old command compatibility gates are removed from release selection
owner: release
expires: 4.1.0
-->

## Release Proof

The 4.0.0 release graph requires:

- TriWiki proof cards and proof bank reuse checks.
- Affected graph and gate impact map checks.
- Gate-pack manifest and runner checks.
- Extreme parallel scheduler and five-minute SLA checks.
- Build-once, probe memoization, and `sksd` cache-warming checks.
- Doctor dirty repair and transaction skip checks.
- Legacy gate inventory, legacy purge, orphan detection, and all-feature regression checks.
