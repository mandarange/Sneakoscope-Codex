# Sneakoscope Codex GitHub presentation audit

Captured 2026-10-05 from the public repository page and the current `main` README/package metadata.

## Baseline

| Surface | Current state | Impact |
| --- | --- | --- |
| Stars | 16 | Early proof of interest; growth should come from successful users. |
| Forks | 2 | Some reuse signal, but the first-run path should be easier to validate. |
| Watchers | 0 | No ongoing notification audience yet. |
| Issues / pull requests | 0 / 0 | No visible feedback loop for new users. |
| Releases | 20 shown; GitHub labels `v10.3.3` latest | Conflicts with README/changelog/package reporting `10.5.1`. Fix before promotion. |
| Packages | None shown | npm is the actual install surface; keep npm and GitHub release metadata aligned. |
| About description | `Deterministic Codex Harness for Zero-Hallucination Autonomous Development` | Memorable but broad and not as actionable as the current product contract. |
| README | Detailed, current, but advanced routing/provider material arrives before an end-to-end first-run loop | New visitors must infer the product's immediate payoff. |
| Visuals | Real logo only; no screenshot or GIF | Avoid adding placeholders. Add a real, reproducible terminal or Center capture only after one is available. |
| Automation | Release/evidence workflows visible; no general build/typecheck/test CI workflow | Contributors have no default status signal for ordinary changes. |
| Community entry points | No visible issue forms or contribution guide | Reporting and first contributions require too much guesswork. |

## Highest-impact changes

1. Make the first screen explain the user problem and the trust loop in plain language.
2. Put one install path and one project bootstrap path before provider and orchestration details.
3. Add FAQ/troubleshooting guidance that tells users what to collect and what to redact.
4. Add a real CI badge and workflow for build, typecheck, and test.
5. Add issue forms, a PR template, a contribution guide, and security reporting guidance.
6. Align GitHub About metadata, npm description/keywords, tags, changelog, lockfile, and latest release before launch.
7. Use real artifacts in outreach, with honest claims and a feedback request rather than a generic star request.

## Limits of this local audit

The original task workspace did not contain a checkout, and shell network access could not resolve GitHub. The public repository was audited through the available GitHub/web surfaces, then the changes were applied to an isolated clone at `/tmp/sneakoscope-growth` on branch `docs/authentic-growth-2026-10-05`. The branch is publish-ready but remains unpushed; the owner should rerun the full checks on a normal maintainer machine before publication.
