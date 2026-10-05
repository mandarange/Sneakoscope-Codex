# Contributing to Sneakoscope Codex

Thanks for helping make agent-assisted development easier to verify. Contributions should keep the project deterministic, local-first, and honest about what was tested.

## Before you start

1. Read the [product contract](docs/PRODUCT-CONTRACT.md) and the relevant design or release guide.
2. Search existing issues before opening a new one.
3. Keep a change focused. Separate documentation, behavior, and release work when they can be reviewed independently.
4. Never include credentials, private source, generated runtime state, or machine-specific paths in a commit.

## Local setup

Requirements: Node.js 20.11 or newer, npm, and Git.

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
```

The build is the source of truth for `dist/`; do not hand-edit generated output. Follow the repository's release-readiness guide before changing version files or publishing.

## Pull requests

A good pull request explains the user-visible problem, the resulting behavior, and the evidence that supports it. Include:

- a short problem statement and scope;
- the exact commands you ran and whether they passed;
- migration or compatibility notes when behavior changes;
- documentation updates for new commands or flags;
- screenshots only when they show a real, reproducible UI state.

Keep claims proportional to evidence. A passing unit test does not prove a live provider route, a release, or search visibility.

## Tests and fixtures

Prefer real tests and deterministic fixtures. Do not add a mock or fallback path to make a check pass. If a feature depends on a live Codex host or provider, document the boundary and keep the offline contract testable.

## Commit and review guidance

Use an imperative subject line that names the change, for example `docs: clarify bridge recovery`. Keep unrelated formatting churn out of the diff. Review the rendered README and any changed documentation before requesting review.

## Reporting security issues

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md) so the report can be handled privately.
