# Release Proof Truth

SKS 3.1.12 keeps release proof truth aligned with the MAD right-column `stack-panes` reconciliation evidence and the `doctor --fix` `node_repl` parent/child MCP repair evidence.

SKS 3.1.11 keeps release proof truth aligned with the MAD repair evidence for Zellij stacked-pane minimum enforcement, Context7 remote MCP migration, and Codex startup config repair reports.

SKS 3.1.10 keeps release proof truth aligned with the hardening evidence for release wiring parity, immutable core skills, native capability postchecks, duplicate skill proof, and secret rollback.

SKS 3.1.8 extends release proof truth to immutable core skills, duplicate skill dedupe, native capability repair, doctor repair output, Supabase/secret preservation, update secret migration journals, and 3.1.8 release DAG coverage.

SKS 3.1.7 extends release proof truth to Codex Native hardening evidence: five real route blackboxes, bounded reference-cache artifacts, read-only broker proof, explicit repair-transaction reports, read/repair split blackboxes, generated-artifact neutrality, and 3.1.7 release DAG coverage must be traceable from release checks and generated reports.

SKS 3.1.6 extends release proof truth to the Codex-native harness brand-neutrality evidence: external reference branding leakage checks, Codex-native feature broker reports, invocation router/default proof, route-map coverage, reference-source evidence, init-deep backup and memory-scope safety, doctor readiness UX, and release-script type-safety gates must be traceable from release checks and generated reports.

SKS 3.1.4 extends release proof truth to the Doctor/Zellij and Codex App harness closure evidence: Zellij self-heal decisions, Homebrew install consent, doctor/MAD repair outcomes, headless fallback markers, Codex Native reference interop policy, Codex App Harness Matrix status, skill/agent sync reports, hook lifecycle checks, loop continuation enforcement, and execution-profile decisions must be traceable from release gates and generated reports.

SKS 3.1.3 keeps release proof truth aligned with Loop Mesh production-hardening evidence: fixture-policy decisions, finalizer-owned GPT Final Arbiter contracts, merge-strategy summaries, mutation ledgers, side-effect reports, interrupt results, and concurrency budgets must be traceable from loop proof artifacts instead of being inferred from prose.

SKS 3.1.1 writes `.sneakoscope/release-proof-truth.json` and `dist/release-proof-truth.json` as source-truth evidence for release review. The artifact records the package version, Git commit, dirty-worktree status, npm packlist count, dist manifest version, and source digest so release notes can distinguish the intended package from stale local or built output.

`npm run release:proof-truth` refreshes the artifact, and `npm run release:github-body-helper` includes its path, commit, dirty status, bundled `@openai/codex-sdk` version, external Codex CLI capability summary, Codex 0.139 real-probe summary, and Zellij stacked-pane summary when available. A dirty worktree is reported as a warning for local review; version or proof-truth mismatches remain release blockers.
