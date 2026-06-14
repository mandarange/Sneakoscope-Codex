# Release Proof Truth

SKS 3.1.6 extends release proof truth to the Codex-native harness brand-neutrality evidence: external reference branding leakage checks, Codex-native feature broker reports, invocation router/default proof, route-map coverage, reference-source evidence, init-deep backup and memory-scope safety, doctor readiness UX, and release-script type-safety gates must be traceable from release checks and generated reports.

SKS 3.1.4 extends release proof truth to the Doctor/Zellij and Codex App harness closure evidence: Zellij self-heal decisions, Homebrew install consent, doctor/MAD repair outcomes, headless fallback markers, Codex Native reference interop policy, Codex App Harness Matrix status, skill/agent sync reports, hook lifecycle checks, loop continuation enforcement, and execution-profile decisions must be traceable from release gates and generated reports.

SKS 3.1.3 keeps release proof truth aligned with Loop Mesh production-hardening evidence: fixture-policy decisions, finalizer-owned GPT Final Arbiter contracts, merge-strategy summaries, mutation ledgers, side-effect reports, interrupt results, and concurrency budgets must be traceable from loop proof artifacts instead of being inferred from prose.

SKS 3.1.1 writes `.sneakoscope/release-proof-truth.json` and `dist/release-proof-truth.json` as source-truth evidence for release review. The artifact records the package version, Git commit, dirty-worktree status, npm packlist count, dist manifest version, and source digest so release notes can distinguish the intended package from stale local or built output.

`npm run release:proof-truth` refreshes the artifact, and `npm run release:github-body-helper` includes its path, commit, dirty status, bundled `@openai/codex-sdk` version, external Codex CLI capability summary, Codex 0.139 real-probe summary, and Zellij stacked-pane summary when available. A dirty worktree is reported as a warning for local review; version or proof-truth mismatches remain release blockers.
