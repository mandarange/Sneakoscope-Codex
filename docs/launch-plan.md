# Launch and distribution plan

This plan is designed to grow authentic usage and stars through useful releases, reproducible examples, and opt-in community sharing. It does not use paid ads, automated starring, mass follows, scraping, sockpuppets, or unsolicited messages.

## Baseline captured 2026-10-05

- Repository: [mandarange/Sneakoscope-Codex](https://github.com/mandarange/Sneakoscope-Codex)
- Public stars: 16
- Forks: 2
- Watchers: 0
- Open issues: 0
- Open pull requests: 0
- Releases shown by GitHub: 20; the repository page currently labels `v10.3.3` as latest while the README and changelog identify `10.5.1` as current.
- Packages shown by GitHub: none
- Languages shown by GitHub: TypeScript 91.6%, JavaScript 5.1%, Swift 3.0%

The release/version mismatch should be fixed before promotion. A new visitor should see one current version everywhere: `package.json`, lockfile, README, changelog, npm, GitHub tags, and the latest GitHub release.

## Before launch

1. Merge the README, FAQ, troubleshooting, contribution guide, templates, and CI workflow after running the real checks.
2. Fix release metadata drift and publish the intended stable version to npm, then create or edit the matching GitHub release.
3. Set the GitHub About description to: `Local trust layer for Codex: bounded context, machine-verifiable evidence, and test-backed release gates.`
4. Add focused repository topics: `codex`, `codex-cli`, `chatgpt-desktop`, `ai-coding-agents`, `agent-orchestration`, `developer-tools`, `release-verification`, `proof-gates`, `typescript`, `macos`.
5. Set the repository website to the most useful maintained documentation or project page. Do not use a placeholder URL.
6. Enable Discussions only if someone will answer them. Pin one discussion that explains the quick start and one that collects reproducible integrations.
7. Confirm the CI badge resolves to a passing workflow on `main`.

## Two-week loop

### Week 1: make the project easy to try

- Publish the version-aligned release and add a short release note explaining the user-visible change.
- Share one real, redacted proof artifact or terminal transcript that demonstrates the plan → build → verify → review loop.
- Ask three people who already use Codex or agent tooling to try the quick start and report the first confusing step. Fix those issues before broader promotion.
- Respond to every issue or discussion within two business days, even when the answer is “not supported.”

### Week 2: distribute where the problem is discussed

- Post one concise announcement to a relevant developer community where self-promotion is allowed. Link to the README and invite concrete feedback; do not ask for a star as the only action.
- Publish one technical note about a real design boundary, such as why SKS refuses unsupported release claims or how bounded context is refreshed.
- Submit the project to one appropriate directory or newsletter only when its submission rules permit it.
- Review traffic, clones, npm downloads, issues, and successful first-run reports. Treat stars as a lagging signal, not the goal by itself.

## Measurement loop

Track weekly:

- README-to-install clicks (GitHub traffic and npm referrers when available);
- successful `sks doctor --json` reports from testers;
- time from install to first reviewable artifact;
- new issues, discussions, forks, and repeat contributors;
- stars as a secondary outcome.

Use the results to change one onboarding element at a time. Keep a dated note in the release or discussion so claims stay auditable.

## Draft outreach copy

### Short post

> I built Sneakoscope Codex (`sks`), a local trust layer for Codex CLI and ChatGPT Desktop. It keeps agent work bounded, records machine-verifiable evidence, and makes release claims depend on current tests and artifacts. The first run is one npm command, followed by `sks bootstrap` in a project. I’m looking for people who care about deterministic, inspectable AI coding workflows to try it and tell me where the setup is unclear.
>
> https://github.com/mandarange/Sneakoscope-Codex

### Technical post

> AI coding tools are useful, but “done” is hard to audit after a long session. Sneakoscope Codex adds a local plan → build → verify → review loop around Codex, with bounded context and evidence-backed release gates. It does not claim better models or search rankings; it makes the process inspectable. Feedback on the quick start and failure recovery is welcome.
>
> https://github.com/mandarange/Sneakoscope-Codex/blob/main/docs/launch-plan.md

### Maintainer reply template

> Thanks for trying SKS. Could you share the smallest command sequence that reproduces this, your OS, Node.js version, SKS version, and redacted output from `sks doctor --json`? Please remove credentials, private source, and personal paths. If the behavior is unsupported today, I’ll label it clearly and capture the request for follow-up.

These drafts are for review only. Send them manually and only in communities whose rules allow the post.
