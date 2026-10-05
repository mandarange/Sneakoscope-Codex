# Release notes draft: onboarding and trust surfaces

## Highlights

- Reworked the README around the first five minutes: value proposition, one-command install, bootstrap, doctor, and the plan → build → verify → review loop.
- Added FAQ and troubleshooting guidance with redaction and recovery instructions.
- Added contribution, security, issue-form, and pull-request templates.
- Added a deterministic CI workflow that runs install, build, typecheck, and the canonical test command.
- Added an ethical launch plan with baseline metrics, metadata checklist, and review-only outreach copy.

## Verification

Run the repository's real checks before publishing:

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
```

Do not publish these notes until the GitHub release, npm package, README, lockfile, and changelog all agree on the same version.
