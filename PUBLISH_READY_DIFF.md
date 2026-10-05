# Publish-ready local diff manifest

The isolated branch `docs/authentic-growth-2026-10-05` is checked out at `/tmp/sneakoscope-growth` from the audited repository commit. It contains the publish-ready working-tree diff. Publication is limited to the approved draft PR; merge, deployment, and outreach remain separate actions.

## Replace

- `README.md` — use the local version in this workspace. It keeps the real logo and existing command surface, but moves the value proposition and first-run loop ahead of advanced integrations.

## Add

- `CONTRIBUTING.md`
- `SECURITY.md`
- `AUDIT.md`
- `RELEASE_NOTES_DRAFT.md`
- `docs/faq.md`
- `docs/troubleshooting.md`
- `docs/launch-plan.md`
- `.github/workflows/ci.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`

## Apply after checking current metadata

- `patches/changelog-unreleased.md` is the entry to place under the existing `[Unreleased]` heading.
- `patches/package-json-discoverability.json` records the two added npm keywords. The branch already applies them to the existing `package.json` without changing its description, scripts, or dependency ranges.
- `patches/github-settings.md` lists owner-only GitHub About, topics, release, Actions, Discussions, and Security settings.

## Verification in a real checkout

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
```

Build and typecheck completed in the isolated checkout. The full canonical test runner executed but ended with environment-sensitive failures (for example, restricted loopback sockets, npm cache ownership, missing Codex/auth fixtures, and the repository's existing docs-truthfulness fixture expectation). See the final report for the exact limits; rerun `npm ci --ignore-scripts && npm test` on a normal maintainer machine before publication.
