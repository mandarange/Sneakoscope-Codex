# Release Proof Truth

SKS 3.0.3 writes `.sneakoscope/release-proof-truth.json` and `dist/release-proof-truth.json` as source-truth evidence for release review. The artifact records the package version, Git commit, dirty-worktree status, npm packlist count, dist manifest version, and source digest so release notes can distinguish the intended package from stale local or built output.

`npm run release:proof-truth` refreshes the artifact, and `npm run release:github-body-helper` includes its path, commit, dirty status, bundled `@openai/codex-sdk` version, external Codex CLI capability summary when available, and Zellij stacked-pane summary when available. A dirty worktree is reported as a warning for local review; version or proof-truth mismatches remain release blockers.
