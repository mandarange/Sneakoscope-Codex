# Release Readiness

SKS 4.7.0 is the Codex worker model, GLM 5.2 Desktop profile, Fast Mode TOML, and doctor TOML repair minor release after 4.6.5. It requires package, lockfile, CLI constants, README, changelog, version-gated release docs, built output, managed asset metadata, Codex model guard coverage, dynamic agent model-tier coverage, GLM profile/key setup coverage, Fast Mode packed-command coverage, managed role repair coverage, doctor duplicate TOML repair coverage, and `npm publish --ignore-scripts` dry-run evidence to agree on 4.7.0 before publication.

4.7.0 release readiness adds proof that `gpt-5.4-mini` is accepted as a supported Codex worker model; GPT-mode workers can dynamically choose `gpt-5.4-mini`, `gpt-5.5` low, or `gpt-5.5` high; GLM-mode workers remain on `z-ai/glm-5.2` with GLM effort tiers; managed native/agent TOML roles are bounded write-capable; `sks doctor --fix` removes duplicate managed tables while preserving external MCP settings such as Context7 and Supabase; Codex App GLM profiles and OpenRouter key setup are installable; and lifecycle-disabled `npm publish --ignore-scripts` packages the freshly built 4.7.0 dist surface.

SKS 4.6.5 is the doctor null-safety patch after 4.6.4. It requires package, lockfile, CLI constants, Rust helper metadata, README, changelog, version-gated release docs, built output, release metadata, npm unpublished-version checks, doctor console status regression coverage, default `sks doctor --fix --yes` smoke evidence, and `npm publish --ignore-scripts` dry-run evidence to agree on 4.6.5 before publication.

4.6.5 release readiness adds proof that default doctor repair handles a skipped optional Codex Doctor bridge as `unavailable` instead of dereferencing `null`, while preserving full/required Codex Doctor diagnostics for deep doctor profiles.

SKS 4.6.4 is the mission-retention cleanup patch after 4.6.3. It requires package, lockfile, CLI constants, Rust helper metadata, README, changelog, version-gated release docs, built output, release metadata, provenance, npm unpublished-version checks, publish auth evidence, retention cleanup safety coverage, update migration cleanup coverage, postinstall side-effect safety, and `npm publish --ignore-scripts` dry-run evidence to agree on 4.6.4 before publication.

4.6.4 release readiness adds proof that closed mission session trees are disposable, terminal inactive agent sessions drop heavy `codex-sdk-home` runtime homes without deleting blocked diagnostics, update migration receipts run mission retention cleanup, project-scoped postinstall cleanup is best-effort and disableable, and direct `npm publish --ignore-scripts` packages the freshly built `4.6.4` dist surface while npm lifecycle scripts remain disabled.

SKS 4.6.3 is a forward patch release carrying the InsaneSearch public command rename, the unified SEO/GEO optimizer, Lean Engineering Policy evidence surface, MadDB direct `apply_migration` hook fix, MadDB Supabase transport diagnostics hardening, and global npm update detection hardening. It requires package, lockfile, CLI constants, Rust helper metadata, README, changelog, version-gated release docs, built output, release stamp, provenance, npm registry unpublished-version checks, the `insane-search` source-intelligence gate, the `seo-geo-optimizer` mode-specific gate suite, the MadDB direct apply-migration hook gate, the MadDB Supabase transport diagnostics gate, update-check global-install regression coverage, and the `publish:ignore-scripts` wrapper to agree on 4.6.3 before publication.

4.6.3 release readiness adds proof that `sks insane-search`, `$Insane-Search`, and `$InsaneSearch` are the primary source-intelligence surface while legacy UltraSearch names remain compatibility aliases; that `sks seo-geo-optimizer` and `$SEO-GEO-OPTIMIZER` are the single public Search Engine Optimization and Generative Engine Optimization surface; that old split `seo`/`geo` public commands are removed; that Lean Engineering Policy evidence reaches planning, workers, code-structure, GPT final review, and Completion Proof; that direct Supabase MCP `apply_migration` is allowed only through the active MadDB capability; that active MadDB can use an explicit write-capable Supabase MCP URL without being shadowed by project-local read-only config; that SQL-plane timeout, interrupted connection, auth, transport, and read-only-denial failures are reported distinctly; that `sks update-check` uses the replaceable global npm install before source checkout versions when deciding updateability; and that `npm publish --ignore-scripts` packages the prebuilt dist surface with the latest dist-tag.

SKS 4.4.0 is the UltraSearch source-intelligence replacement release after 4.2.1. It requires package, lockfile, CLI constants, Rust helper metadata, README, changelog, version-gated release docs, built output, release stamp, provenance, npm registry unpublished-version checks, UltraSearch provider-interface gates, Source Intelligence Policy v2 gates, and the `publish:ignore-scripts` wrapper to agree on 4.4.0 before publication.

4.4.0 release readiness adds proof that xAI/Grok is not a runtime dependency, X public discovery is not promoted to full parity without a real corpus, and `npm publish --ignore-scripts` packages the prebuilt dist surface.

SKS 4.2.1 is the publish-path hardening patch after 4.2.0. It requires package, lockfile, CLI constants, Rust helper metadata, README, changelog, version-gated release docs, built output, release stamp, provenance, npm registry unpublished-version checks, and the `publish:ignore-scripts` wrapper to agree on 4.2.1 before publication.

4.2.1 release readiness adds proof that `npm publish --ignore-scripts` is reached only after the explicit full `prepublishOnly` gate has run, so disabling npm lifecycle scripts at publish time does not bypass SKS release checks.

SKS 4.2.0 is the MadDB execution stabilization release after 4.1.1. It requires package, lockfile, CLI constants, Rust helper metadata, README, changelog, version-gated release docs, built output, release stamp, provenance, npm registry unpublished-version checks, first-class MadDB route metadata, capability v2 evidence, runtime profile lifecycle proof, and real disposable Supabase E2E status to agree on 4.2.0 before publication.

4.2.0 release readiness adds proof that `$MAD-DB` is no longer a `$MAD-SKS` alias, normal Supabase MCP config remains read-only, mission-local write profiles close in `finally`, `execute_sql` and `apply_migration` inventory is checked inside a bound cycle, lifecycle correlation uses canonical `tool_call_id`, destructive SQL-plane classes are covered by policy tests, and a missing disposable Supabase E2E is reported as unverified rather than passed.

SKS 4.1.1 is the Doctor/update migration readiness patch after 4.1.0. It requires package, lockfile, CLI constants, Rust helper metadata, README, changelog, version-gated release docs, built output, release stamp, provenance, npm registry unpublished-version checks, v2 migration receipts, and core-vs-route readiness checks to agree on 4.1.1 before publication.

4.1.1 release readiness adds proof that optional Computer Use and Chrome/web review capability gaps are route blockers rather than core blockers, first-command migration uses an installation epoch plus per-project receipt, stale migration locks recover without blocking ordinary commands, the migration Doctor profile stays fast and machine-readable, MAD startup defers optional UI/provider/native proof work, and managed release verifier role filenames remain unique.

SKS 4.1.0 is the Codex `rust-v0.142.0` Doctor/update readiness patch after 4.0.15. It requires package, lockfile, CLI constants, Rust helper metadata, docs, built output, release stamp, provenance, npm registry unpublished-version checks, semantic Doctor readiness, managed asset manifest parity, and update migration lifecycle checks to agree on 4.1.0 before publication.

4.1.0 release readiness adds proof that Codex Doctor warnings do not block core readiness, post-repair Doctor status is authoritative, managed native assets are repaired from plain `sks doctor --fix`, update/postinstall paths run the correct package-local Doctor lifecycle, first-command migration receipts are current, and local machine evidence is not tracked in the release commit.

SKS 4.0.15 is the Codex `rust-v0.142.0` compatibility-preparation patch after 4.0.14. It requires package, lockfile, CLI constants, Codex release manifest, generated app-server schema hash, app-server-v2 client proof, thread-store concurrency proof, runtime binary identity, SDK child-env isolation, package script contract evidence, built output, provenance, and npm registry unpublished-version checks to agree on 4.0.15 before publication.

4.0.15 release readiness adds proof that `@openai/codex-sdk` is exactly pinned to `0.142.0`, the resolved Codex binary is identified by realpath/version/SHA-256, generated app-server schemas come from that binary, app-server-v2 can initialize and list native threads, 0.142 capability gates do not use `assumed_by_version`, SDK execution policy keeps sandbox/approval/network/web/git/mutation axes separate, Codex thread registry writes are lock/journal protected, and the published tarball includes public script targets.

SKS 4.0.14 is the GLM Naruto parallelism-seal patch after 4.0.13. It requires package, lockfile, CLI constants, Rust helper metadata, docs, built output, provenance, npm registry unpublished-version checks, and GLM Naruto parallelism-seal metadata to agree on 4.0.14 before publication.

4.0.14 release readiness adds proof that GLM Naruto records real parallel-stage execution metrics, uses bounded parallel queues for candidate gate, worktree, and verifier phases, tracks requirement coverage so parallel workers do not miss task details, preserves `sks --mad` GPT/Codex/MAD route isolation from GLM/OpenRouter mode, and repairs benchmark/proof metadata regressions carried over from 4.0.13.

SKS 4.0.12 is the GLM Naruto final-seal patch after 4.0.11. It requires package, lockfile, CLI constants, Rust helper metadata, docs, built output, provenance, npm registry unpublished-version checks, and GLM Naruto final-seal metadata to agree on 4.0.12 before publication.

4.0.12 release readiness adds proof that worktree workers apply only extracted unified diffs, patch workers launch through a bounded adaptive scheduler with provider backpressure, live bench separates true direct GLM from Naruto 1/4/8/12 worker cases, final apply blocks dirty touched paths and runs targeted checks, and stop-gates reference `final-seal.json`.

SKS 4.0.8 is the GLM speed/stability/loop-fix patch after 4.0.5. It requires package, lockfile, CLI constants, docs, built output, release stamp, provenance, npm registry unpublished-version checks, and GLM speed-profile metadata to agree on 4.0.8 before publication.

4.0.8 release readiness adds proof that bare `sks --mad --glm` exits with readiness/status, speed mode does not use high/xhigh reasoning or `require_parameters: true`, explicit interactive/Zellij launch remains opt-in, and GLM request/profile/launch artifacts record compact context, disabled default tools, no GPT fallback, OpenRouter fallback blocking, redacted traces, terminal run artifacts, and bench diagnostics.

SKS 4.0.4 is the GLM 5.2 MAD launch-fix patch after 4.0.3. It requires package, lockfile, CLI constants, Rust helper metadata, docs, built output, release stamp, provenance, npm registry unpublished-version checks, and OpenRouter GLM launch metadata to agree on 4.0.4 before publication.

4.0.4 release readiness adds proof that `sks --mad --glm` continues past readiness into the MAD launcher, injects Codex OpenRouter `z-ai/glm-5.2` launch args, uses a secret-safe wrapper for stored OpenRouter keys, writes `mad-glm-launch.json`, and blocks GPT fallback native swarm panes by default.

SKS 4.0.3 is the GLM 5.2 MAD publication patch after 4.0.2. It requires package, lockfile, CLI constants, Rust helper metadata, docs, built output, release stamp, provenance, npm registry unpublished-version checks, and OpenRouter GLM metadata to agree on 4.0.3 before publication.

4.0.3 release readiness adds strict `sks --mad --glm` routing, OpenRouter `z-ai/glm-5.2` request locking, disabled GPT/OpenAI fallback, response model guarding, OpenRouter key repair guidance, Codex App profile metadata, and Codex `rust-v0.141.0` compatibility evidence.

SKS 4.0.2 completes the TriWiki Turbo production path after 4.0.1. It requires package, lockfile, CLI constants, Rust helper metadata, docs, built output, release stamp, provenance, and npm registry unpublished-version checks to agree on 4.0.2 before publication.

4.0.2 release readiness adds build-once proof reuse, TriWiki-first affected/confidence release selection, proof-bank to release-cache-v2 bridging, resource-aware gate pack execution, semantic dirty-doctor proofs, sksd protocol/warm cache checks, final legacy/orphan purge gates, and the 4.0.2 five-minute all-feature regression blackboxes.

SKS 4.0.1 completes the TriWiki Turbo architecture after 4.0.0. It requires package, lockfile, CLI constants, Rust helper metadata, docs, built output, release stamp, provenance, and npm registry unpublished-version checks to agree on 4.0.1 before publication.

4.0.1 release readiness adds TriWiki-first release runner wiring, full proof-card invalidation material, shared-fixture parallel gate packs, executable scheduler metrics, semantic doctor dirty repair, optional sksd cache warming, actual SLA certificate metrics, and the 4.0.1 all-feature regression blackbox.

SKS 4.0.0 is the destructive TriWiki Parallel Turbo release after 3.1.16. It requires package, lockfile, CLI constants, Rust helper metadata, docs, built output, release stamp, provenance, and npm registry unpublished-version checks to agree on 4.0.0 before publication.

4.0.0 release readiness adds reusable TriWiki proof cards, affected-scope release-equivalent graphs, gate packs, resource budgets, five-minute SLA certificates, build-once proof, probe memoization, doctor dirty repair planning, orphan gate detection, legacy alias purge checks, and the 4.0.0 all-feature regression blackbox.

SKS 3.1.16 is the doctor-reliability patch after 3.1.15. It keeps the Codex 0.140 production-hardening surface intact while requiring package, lockfile, CLI constants, Rust helper metadata, docs, built output, release stamp, provenance, and npm registry unpublished-version checks to agree on 3.1.16 before publication.

SKS 3.1.13 is the production-hardening release for Codex 0.140 evidence, transactional doctor repair, MCP readiness, native capability proof, and protected-secret rollback. It requires release wiring for Codex 0.140 deep probes, real usage parsing, goal attachment roundtrip evidence, doctor transaction/postcheck evidence, managed startup TOML repair, Context7/Supabase MCP repair blackboxes, native capability postcheck proof, secret line rollback, and the 3.1.13 all-feature regression gate.

SKS 3.1.12 is the doctor production, Codex 0.140 coverage, and MAD launch repair release. It keeps the Zellij stacked-pane minimum at 0.43.0, reconciles visible MAD worker panes with Zellij `stack-panes`, keeps `doctor --fix` recovery for local stdio Context7 MCP stalls, and repairs stale Codex startup config by fixing SKS agent role paths, removing unsupported managed role fields, preserving optional `supabase_sauron`, and either restoring `node_repl` to a valid Codex App command or removing the whole stale parent/child MCP block. It also requires release wiring for Codex 0.140 hermetic probes, optional strict real probes, doctor production transaction/postcheck evidence, Context7/Supabase MCP repair blackboxes, and protected secret rollback checks.

SKS 3.1.10 is the release-ready hardening follow-up. It closes release wiring parity, core skill immutability, duplicate skill active-name proof, capability-specific native postchecks, protected secret rollback, and the all-feature regression blackbox.

SKS 3.1.8 is the core skill/native capability/secret preservation hardening release. It adds immutable core-skill manifest and no-drift gates, duplicate skill canonicalization and dedupe checks, native capability repair/postcheck evidence for doctor output, and Supabase/secret preservation guards for setup/update/doctor paths.

SKS 3.1.7 is the Codex-native harness runtime-proof hardening release. It keeps external reference branding out of user-visible release surfaces, routes Codex-native feature decisions through a read-only broker plus explicit repair transaction, adds neutral reference cache refresh, and upgrades Loop, QA, Research, Image, MAD, and Doctor checks to runtime fixture artifacts with selected strategy proof.

SKS 3.1.4 is the Doctor/Zellij and Codex App harness hardening release. It adds a policy-gated Zellij self-heal path with Homebrew consent controls, wires `doctor --fix` and `sks --mad` through consistent Zellij repair/headless behavior, removes contradictory optional-vs-blocking Zellij output, records Codex Native reference adoption and interop decisions, and adds Codex App Harness Matrix coverage for skill sync, agent role sync, deep project initialization, hook lifecycle, loop continuation, execution profiles, and skill-agent blackbox evidence.

SKS 3.1.3 keeps the Loop Mesh production hardening release metadata aligned. It blocks production fixture misuse across worker, gate, and GPT Final paths; records a finalizer-owned GPT Final Arbiter contract for deferred gate handling; applies loop worktrees through an audited merge ladder before handoff; writes mutation-ledger and side-effect-scan evidence into completion proof; interrupts active worker handles when kill or resume safety requires it; and bounds loop concurrency with a global budget surfaced in runtime and proof artifacts.

SKS 3.1.1 is the Naruto Loop Mesh hardening release. It keeps the Loop Graph as the execution SSOT for goals and loop commands, removes the runtime fixture shortcut from real checker execution, derives loop worker counts from scope/risk/parallelism instead of a fixed two-worker cap, adds configurable visible loop panes, and blocks problem-bearing completion proofs unless root-cause analysis plus corrective evidence is recorded.

SKS 3.1.0 is the Naruto Loop Mesh release. It makes the Loop Graph the execution SSOT for goals and loop commands, adds loop-local maker/checker mini swarms, owner leases, affected gate selection, durable loop state/proof artifacts, compact Zellij loop observability, goal-to-loop compatibility, and release DAG coverage for the new loop runtime.

SKS 3.0.4 is the actual Codex 0.139 real-probe closure release on top of 3.0.3. It keeps the hermetic 0.139 fixture gates and adds `codex:0139-real-probes`, `codex:0139-real-probe-summary`, `doctor:codex-0139-real-probes`, and strict real-check gates for web search, rich schema capture, doctor redaction, plugin marketplace/cache behavior, `-P` profile alias proof, interrupt-agent events, image referenced-path routing, and sandbox/proxy preservation. Publish readiness now surfaces the real-probe summary in doctor/release body output and blocks strict release when actual high-value probes are skipped or failed.

SKS 3.0.3 is the final Codex 0.139 micro-hardening release on top of 3.0.2. It makes Codex 0.139 capability coverage mandatory in the release DAG, replaces version-only assumptions for high-value 0.139 surfaces with hermetic fixtures and optional real probes, proves Zellij pane creation locks through the real `openWorkerPane()` path with a fake Zellij adapter, surfaces stacked/fallback pane proof in runtime summaries, and clarifies that SKS bundles `@openai/codex-sdk` 0.138.0 while detecting 0.139 features from an external Codex CLI when available.

The 3.0.3 release gate adds `codex:0139-feature-probes`, `codex:0139-interrupt-agent`, `codex:0139-rich-tool-schema`, `codex:0139-doctor-env-redaction`, `codex:0139-code-mode-web-search`, `codex:0139-marketplace-source`, `codex:0139-sandbox-profile-alias`, `zellij:fake-adapter`, `zellij:pane-lock-open-worker-integration`, `zellij:stacked-fallback-integration`, `runtime:proof-zellij-stacked-summary`, `naruto:proof-zellij-stacked-summary`, and `docs:codex-0139-wording`. Publish readiness still requires fresh release checks, version/provenance alignment, release proof truth, and operator-run publication after review.

SKS 3.0.2 tracks Codex CLI rust-v0.139.0 and closes the 3.0.0 micro-hardening gaps: it adds the `codex:0139-capability` gate and root/mission capability artifacts (code-mode web search, preserved `oneOf`/`allOf` tool schemas, doctor env details, plugin marketplace `source` field with cached catalog, `-P` sandbox profile alias, multi-agent v2 `interrupt_agent` rename), accepts `interrupt_agent` in cockpit subagent-stage classification, gates Zellij stacked panes by the `>=0.43` version matrix, proves pane creation locks do not serialize worker execution, hardens release cache version-neutral hashing, surfaces agent message bus history in runtime proof summaries, and writes release proof source-truth artifacts. The Codex baseline remains rust-v0.136.0.

SKS 3.0.0 is the parallel-runtime stabilization release. It fixes the frozen Zellij slot-pane renderer (telemetry snapshot reads are mtime-aware and multi-process flushes merge instead of clobbering), serializes SLOTS anchor creation so concurrent workers share one right column, stacks worker panes vertically with native Zellij stacked panes, defaults worker panes to the live compact-slots renderer, adds a Zellij latest-stable version check/upgrade flow (`sks zellij update`, launch prompt), parallelizes scheduler dispatch telemetry writes, reports naruto backpressure throttling instead of staying silent, wires the naruto finalizer and agent message bus into the production run, and removes dead swarm code (`naruto-work-stealing`, `zellij-right-column-layout-proof`).

The 3.0.0 release gate keeps the full 2.0.x gate surface and adds `zellij:slot-pane-stale-detection` semantics for merged snapshots, stacked-pane placement metadata (`worker_stacked_requested` / `worker_stacked_applied`), and renderer-backed pane counting in the swarm summary. Publish readiness still requires a fresh full `release:check:full` stamp, `publish:dry`, provenance/registry checks, and operator-run publication after review.

SKS 2.0.19 is the Codex 0.138 deep-integration polishing release for the 2.0 line. It adds optional Codex Desktop `/app` launch attempts, QA-LOOP Desktop handoff confirmation lifecycle, parallel plugin detail fetch, plugin inventory cache/diff, global image saved-path registry enforcement, Codex model effort metadata auto-discovery, account usage auto-discovery, and feature probes that can override coarse version-only 0.138 capability assumptions.

The 2.0.19 release gate adds `codex-app:launcher`, `codex-app:handoff-launch`, QA `/app` lifecycle gates, `codex-plugin:parallel-detail-fetch`, `codex-plugin:cache`, `codex-plugin:diff`, `image:artifact-registry`, `image:global-path-contract`, `qa-loop:image-path-prompt-injection`, `codex:model-metadata`, `codex:effort-auto-discovery`, `codex:account-usage-autodiscovery`, and `codex:0138-feature-probes`. Publish readiness still requires a fresh full `release:check:full` stamp, `publish:dry`, provenance/registry checks, and operator-run publication after review.

SKS 2.0.18 is the Codex 0.138 integration release for the 2.0 line. It adds capability artifacts for Codex 0.138 surfaces, QA-LOOP Codex Desktop `/app` handoff, Codex plugin JSON inventory, candidate-only plugin MCP policy, image saved-path contracts, model-advertised effort order, account usage budget policy, and Codex 0.138 doctor checks.

The 2.0.18 release gate adds `codex:0138-capability`, `codex:0138-capability-artifact`, `codex-sdk:version-compat`, `codex-app:handoff`, QA `/app` handoff gates, plugin inventory/MCP gates, image path contract gates, effort/account-usage gates, Naruto parallel gate consistency, and Codex 0.138 doctor/fix checks. Publish readiness still requires a fresh full `release:check:full` stamp, `publish:dry`, provenance/registry checks, and operator-run publication after review.

SKS 2.0.17 is the micro-hardening release for the 2.0 parallel-runtime line. It makes production parallel proof require real worker PIDs, limits missing-PID acceptance to explicit in-process fixtures, computes scheduler utilization from active slot-time instead of completed-count estimates, and records proof consistency against the scheduler active-time integral.

The 2.0.17 release gate adds strict PID rejection, scheduler active-time consistency, live Zellij slot telemetry flushing with stale-pane JSON/status output, Mad-DB decision-to-result lifecycle hooks, runtime proof summaries, Team alias isolation, and release speed/DAG coverage checks while retaining the 2.0.16 real parallelism closure gates. Publish readiness still requires a fresh full `release:check` stamp, `publish:dry`, provenance/registry checks, and operator-run publication after review.

SKS 2.0.16 is the real parallelism closure patch for the 2.0 line. It proves actual tens-of-workers concurrency with PID, launch-overlap, active timeline, wall-clock speedup, model-call semaphore, worktree allocation, visible-pane, and headless-worker evidence instead of relying on pane count or scheduler counters alone.

The 2.0.16 release gate adds `parallel:runtime-proof`, `parallel:runtime-proof-events`, `parallel:runtime-real-blackbox`, `parallel:claim-enforcement`, `scheduler:batch-dispatch`, `scheduler:utilization-proof`, `native-swarm:process-spawn-proof`, `native-swarm:zellij-does-not-block-workers`, `model-call:concurrency`, Naruto parallelism mode/UX/proof gates, `naruto:real-parallelism-blackbox`, worktree batch/prewarm checks, `release:full-parallelism-blackbox`, incremental Zellij telemetry checks, Team legacy-create removal proof, and bounded Mad-DB operation lifecycle checks. Publish readiness still requires a fresh full `release:check` stamp, `publish:dry`, provenance/registry checks, and operator-run publication after review.

SKS 2.0.15 is the ultra-stabilization patch for the 2.0 research runtime. It turns the research synthesis stage into an evidence-bound writer path, rejects repeated/template-like reports, preserves deterministic rendering only for explicit mock fixtures, strengthens repository-aware implementation blueprints, and expands downstream Team handoff artifacts so implementation agents receive claims, sources, work items, tests, and rollback context instead of thin prose.

The 2.0.15 release gate adds `research:synthesis-writer`, `research:synthesis-prompt-contract`, `research:synthesis-writer-blackbox`, `research:repetition-detector`, `research:template-report-rejection`, `research:real-synthesis-no-deterministic-renderer`, and `research:handoff-consumability` coverage while retaining the 2.0.14 stage-cycle runtime and final-reviewer checks. Publish readiness still requires a fresh full `release:check` stamp, `publish:dry`, and operator-run npm publication after review.

SKS 2.0.14 is the quantum research runtime closure patch for the 2.0 line. It promotes Research from a linear final-report path into a stage-aware runtime with parallel source shards, source-ledger merging, claim/evidence matrix construction, repository-aware implementation blueprint densification, experiment planning, synthesis, and static plus Codex final-review evidence.

The 2.0.14 release gate adds stage-cycle runtime blackbox checks, parallel source-shard proof, source-ledger merge checks, claim-builder checks, blueprint densifier checks, short-report rejection, complete-package fixture proof, final-reviewer blackbox proof, and `codex-sdk:research-pipeline` coverage for the new default cycle runner. Publish readiness still requires a fresh full `release:check` stamp, `publish:dry`, and operator-run npm publication after review.

SKS 2.0.13 is the research pipeline quality-contract closure patch for the 2.0 line. It promotes Research from a report-only route into a handoff-ready pipeline with claim/evidence matrices, source-quality scoring, implementation blueprints, experiment plans, replication packs, falsification checks, and final-review evidence that can be validated before downstream implementation work.

The 2.0.13 release gate adds research schema checks, `research:quality-gates`, `codex-sdk:research-pipeline`, expanded `release-gates.v2.json` coverage, and version/provenance alignment across Node, Rust, docs, and package metadata. Publish readiness still requires a fresh full `release:check` stamp, `publish:dry`, and operator-run npm publication after the pushed commit is reviewed.

SKS 2.0.12 is the public-ready parallel runtime stabilization patch for the 2.0 line. It closes the Zellij first-slot down-stack real proof, distinguishes slot renderer panes from Codex worker panes, wires Naruto allocation/rebalance into production scheduler ownership, keeps pre-run smoke out of production source-of-truth claims, and protects local/worktree candidate apply with GPT Final approval.

The 2.0.12 release gate adds `zellij:slot-renderer-proof-semantics`, `naruto:allocation-runtime-wiring`, `local-collab:worktree-gpt-final-apply-policy`, and cache-glob release DAG coverage while retaining the 2.0.11 Zellij/Naruto/Git worktree gates. Publish readiness requires a fresh full `release:check` stamp, version/provenance alignment, and operator-run real-environment checks where policy requires them.

SKS 2.0.11 is the external-parallelism and release-gate cleanup patch for the 2.0 line. It removes automatic npm update prompts from launch/doctor paths, adds the Zellij SLOTS anchor command with first-slot-down worker stacking, routes Naruto actual workers through the Codex Control Plane, and adds allocation/rebalance plus Git worktree checkpoint/cross-rebase release gates.

The 2.0.11 release gate adds `zellij:slot-column-anchor`, `zellij:first-slot-down-stack`, `naruto:allocation-policy`, `naruto:rebalance-policy`, `naruto:actual-worker-control-plane`, `naruto:orchestrator-runtime-source`, `git:worktree-checkpoint`, and `git:worktree-cross-rebase`. Publish readiness still requires a fresh full `release:check` stamp, version/provenance alignment, and operator-run deployment.

SKS 2.0.10 is the slot-only Zellij and Naruto runtime stabilization patch for the 2.0 line. It makes compact slot panes the default visual worker surface, keeps the initial Zellij session main-only until the first visible worker is spawned, sends overflow workers to headless runtime evidence instead of opening more panes, and keeps dashboard panes opt-in.

The 2.0.10 release gate adds compact slot renderer checks, slot-only UI checks, right-column headless overflow proof, real Naruto active-pool runtime proof, extreme real parallelism proof, worktree integration primary-runtime proof, and agent role-config repair proof. Publish readiness still requires a fresh full `release:check` stamp, version-truth alignment, release metadata, and the optional real-environment checks where required.

SKS 2.0.9 is the dynamic Zellij worker-pane and Naruto extreme parallelism patch for the 2.0 line. It keeps `release:check` on the manifest-backed `release-gate-dag-runner`, adds dynamic right-column worker placement, and makes high-fanout Naruto runs use a bounded visible-pane cap with headless overflow workers.

The 2.0.9 release gate adds initial-main-only Zellij proof, right-column manager state/schema checks, geometry proof, dynamic pane lifecycle checks, developer controls for worker focus/logs/dashboard/close-drained, real active-pool lifecycle checks, extreme parallelism checks, dynamic Zellij right-column checks, recursive release cache glob hashing, and full DAG coverage proof. Publish readiness still requires a fresh full release check, with `publish:dry` retaining the version/provenance/dist freshness/npm dry-run checks before a human runs the real publish.

SKS 2.0.8 is the DAG-parallel release-check and worktree proof hardening patch for the 2.0 line. It makes `release:check` execute the manifest-backed `release-gate-dag-runner` by default, while preserving the historical full chain as `release:check:legacy` for audit coverage and long-form regression runs.

The 2.0.8 release gate adds `release-gates.v2.json`, release gate node/schema/report/cache/scheduler infrastructure, resource-aware parallel scheduling, per-gate hermetic environments, release stability scoring, real Zellij dashboard/worker-pane proof, and targeted Git worktree regression gates for manifest appends, dirty main detection, untracked diffs, single `git_apply_patch` envelopes, integration worktree application, dirty worktree locks, and Naruto worktree coding blackbox behavior. Publish readiness now requires the generic metadata gate to accept either the legacy parallel chain or the new DAG runner, with `publish:dry` retaining the version/provenance/dist freshness/npm dry-run checks before a human runs the real publish.

SKS 2.0.7 is the Git worktree parallel coding closure patch for the 2.0 line. It adds Git worktree capability detection, safe out-of-repo worktree allocation, worktree diff export into patch envelopes, integration worktree merge queues, cleanup/retention policy, and Naruto worker/runtime evidence for write-capable parallel coding while preserving patch-envelope-only fallback for non-Git projects.

The 2.0.7 release gate adds `release:worktree-gates`, Git worktree capability/manager/diff/merge/cleanup/cache/pool checks, Naruto worktree coding/Zellij/GPT-final checks, and command-path runtime proof that write-capable Naruto workers receive real worktree allocations. It also keeps release readiness honest: full publish readiness still requires a fresh `release:check`, `release:real-check` where required, and publication/tag steps outside this local implementation pass.

SKS 2.0.6 is the Product Design plugin and Naruto read-only routing closure patch for the 2.0 line. It makes design routes discover the remote `product-design@openai-curated-remote` Codex App plugin, auto-install it when the app-server reports it missing, and prefer its Product Design skill surface across UI, PPT, and design-adjacent pipeline stages.

The 2.0.6 release gate adds Product Design plugin routing and auto-install checks, records the remote plugin id `Plugin_fa77aec24fc08191bc6e57f377126d76`, and adds a Naruto read-only routing check that proves read-only runs force write mode off while write-capable runs still schedule write work. It also keeps native proof from failing on pre-existing dirty files when no write leases, no writes, and no patch envelope exist.

SKS 2.0.5 is the local collaboration closure patch for the 2.0 line. It turns `sks with-local-llm on` from a saved toggle into a verified worker state by requiring a fresh schema-valid Ollama generation smoke before `verified`, promotes Local LLM and Python Codex SDK to Codex Control Plane backend surfaces, and pins `@openai/codex-sdk` to the 0.137 compatibility baseline.

The 2.0.5 release gate adds hermetic Local LLM structured-output/tool-repair/all-pipeline checks, GPT Final Arbiter enforcement for any local-participating pipeline, Python SDK capability/stream/sandbox/all-pipeline checks, Codex 0.137 plugin/runtime/approval compatibility checks, and real optional checks for Local LLM smoke/throughput/cache, Python SDK, Codex 0.137, and Zellij worker-pane proof.

SKS 2.0.4 is the local LLM / publish-readiness closure patch for the 2.0 line. It keeps the 2.0.2 MAD, Codex App Fast UI, provider, and Zellij release surface, then closes the new release DAG gaps for `sks update`, `$with-local-llm-on`, and `$with-local-llm-off` fixture coverage while keeping package-install mutation safety guarded and ledgered.

The 2.0.4 release gate requires all-feature completion/deep-completion to include the local LLM command fixtures, mutation callsite coverage to report zero uncovered risky package-install callsites, release metadata to mention 2.0.4 across versioned docs, and the package/lockfile/TypeScript/Rust/dist version surfaces to agree before publish checks proceed.

SKS 2.0.2 is the P0 closure patch for the Codex App Fast UI and MAD Zellij worker-pane release. Native worker execution routes through `runCodexTask`, UltraRouter records orchestrator/worker profile decisions, Reliability Shield hardens SDK streams, and Zellij remains the pane-level visual proof surface that links slot/generation/session records to SDK thread/provider/service-tier evidence.

The 2.0.2 release gate keeps the 2.0.0 `codex-control:*` and `ultra-router:*` coverage, keeps the 2.0.1 Codex App UI snapshot/preservation/clobber-guard/doctor repair checks, and adds actual `sks --mad` no-mutation proof, config.toml-backed provider context checks, MAD Zellij default pane-worker proof, WorkerPaneManager single-owner proof, no-production-MJS runtime checks including `bin/*.mjs`, and the TypeScript/Python boundary check.

SKS 1.21.8 continues to use OpenAI Codex CLI `rust-v0.136.0` as the current compatibility baseline while preserving the 0.135 routing/readiness fixes and inherited 0.134/0.133 matrices. Readiness records 0.136 session archive/unarchive commands, app-server `--stdio` and resumed-turn/status behavior, `CODEX_API_KEY` remote registration, short-lived remote-control server tokens, elevated Windows sandbox setup, feature-gated image-generation extension support, ChatGPT auth refresh/relogin-required handling, command-safety hardening, sandbox cleanup, Bedrock region fallback, and rmcp 1.7.0 compatibility. The local Codex App readiness check still reports user-config Fast UI blockers separately when `~/.codex/config.toml` contains top-level `model_reasoning_effort`.

The current `sks.release-readiness.v1` report covers actual Codex config-load truth, Codex config EPERM self-heal, doctor real-fix readiness, MAD launch preflight, Zellij readiness/proof, install-time Zellij dependency repair, Zellij socket-dir launch metadata, MAD attach-command visibility, Zellij clipboard/mouse-mode launch evidence, native-agent visual lane count evidence, and official Fast mode service-tier propagation. `ok: true` in the 1.21.3 readiness report means config readability, actual/fake Codex config-load proof, project config policy splitting, EPERM repair proof, MAD preflight, Zellij-only runtime checks, background-layout launch wiring, socket-dir fallback evidence, attach-command output evidence, clipboard command/mouse-mode evidence, native-agent right-pane lane evidence, and `-c service_tier=fast` propagation evidence have no remaining blockers.

Historical, live, or broader Codex/MAD/UX/PPT/DFix/Hook trust gates are reported when evidence exists, but they are marked `not_in_1_18_parallel_gate` when not run by this closure DAG. They are not silently treated as passed.

## Version, provenance, and side-effect readiness (1.21.0)

`release:version-truth` is the version surface gate. It verifies
`package.json`, `package-lock.json`, `src/core/version.ts`, `src/core/fsx.ts`,
`src/bin/sks.ts`, Cargo metadata/lockfile state, `dist/build-manifest.json`,
CHANGELOG, README display text when present, and the generic
`dist/scripts/release-metadata-check.js` entrypoint built from `src/scripts/release-metadata-check.ts`.

`release:provenance` writes `.sneakoscope/reports/release-provenance.json` with
`reviewed_ref`, current commit, package/dist/src/Cargo versions, latest versioned
CHANGELOG section, `origin/main` version when available, npm registry version, and
`v<version>` tag status. Dev review mode reports `main_out_of_date` as a warning.
Publish mode treats main/tag/npm mismatches as blockers.

`side-effect:runtime-report` is included in readiness and reports mutation-ledger
runtime totals. Readiness blocks on unexpected applied mutations, global mutations
without confirmation, or config/auth/skill mutations without backup or no-op proof.

## Publish authorization policy (2.0.15)

Publishing to npm requires `npm run release:check:full` (the complete hermetic gate
set) **plus** `npm run release:real-check` for environment-dependent proof when that
proof is required. Ordinary `npm run release:check` is now the change-aware affected
gate for local checks; it cannot authorize a publish on its own. `npm run publish:dry`
runs `release:check:full`, verifies the fresh
`.sneakoscope/reports/release-check-stamp.json`, and then runs provenance/registry
checks before the dry-run publish step. `prepublishOnly` uses
`prepublish-release-check-or-fast` to accept that current stamp before the real
publish; if the stamp is missing or stale, it runs `release:check:full` once before
continuing. The dynamic runners
`npm run release:check:dynamic` and `npm run release:check:dynamic:execute` remain
local/CI accelerations only — they narrow the gate set to changed inputs and cached
results, so they **cannot** authorize a publish on their own. See
`docs/dynamic-release-pipeline.md` for the two-tier model.

`prepublishOnly` also runs `release-registry-check.mjs --require-publish-auth`
before `prepack`. That check uses the documented npm `whoami` identity and the
published package maintainer list to prove the current shell can publish
`sneakoscope`; otherwise it fails early with an `npm login --registry
https://registry.npmjs.org/` instruction instead of allowing the final registry
`PUT` to fail after the package build. If npm config already contains a token but
`whoami` returns `E401`, the token is treated as stale/revoked/wrong-scope and
the gate reports the redacted config location. Token-based publishing must be
configured through npm itself, for example an npmrc entry such as
`//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` plus an exported
publish-capable token; a raw `NPM_TOKEN` environment variable alone is not enough
unless npm config references it.

The operator-facing publish entrypoint is `npm run publish:npm` (or
`npm run release:publish`), which runs `prepublishOnly` and then calls
`npm publish --ignore-scripts`. That keeps the publish path strict even when the
final npm lifecycle hooks are disabled on purpose.

```bash
npm run insane-search:provider-interface
npm run source-intelligence:policy
npm run source-intelligence:all-modes
npm run codex-web:adapter
npm run goal-mode:official-default
npm run agent:main-no-scout
npm run agent:worker-scout-limited
npm run agent:background-terminals
npm run zellij:layout-valid
npm run zellij:spawn-on-demand-layout
npm run zellij:worker-pane-manager
npm run zellij:worker-pane-spawn-order
npm run agent:slot-pane-binding-proof
npm run agent:worker-pane-communication-contract
npm run agent:zellij-dynamic-backfill-panes
npm run agent:task-graph-expansion
npm run agent:follow-up-work-schema
npm run agent:dynamic-pool-route-blackbox
npm run agent:backfill-route-blackbox
npm run agent:cli-options-to-task-graph
npm run agent:route-truth-backfill
npm run team:backfill-route-blackbox
npm run team:actual-route-backfill
npm run research:backfill-route-blackbox
npm run research:actual-route-backfill
npm run qa:backfill-route-blackbox
npm run qa:actual-route-backfill
npm run zellij:lane-renderer
npm run zellij:pane-proof
npm run zellij:screen-proof
npm run agent:zellij-runtime
npm run agent:proof-contract-reconciled
npm run agent:scheduler-proof-hardening
npm run zellij:pane-proof
npm run zellij:screen-proof
npm run agent:cleanup-executor
npm run agent:cleanup-executor-v2
npm run agent:cleanup-command-ux
npm run retention:cleanup-safety
npm run agent:intelligent-work-graph
npm run agent:ast-aware-work-graph
npm run proof:fake-vs-real-policy
npm run proof:fake-real-policy-v2
npm run release:runtime-truth-matrix
npm run imagegen:capability
npm run imagegen:gpt-image-2-request-validator
npm run codex-control:capability
npm run codex-control:no-legacy-fallback
npm run codex-control:structured-output
npm run codex-control:event-stream-ledger
npm run codex-control:thread-registry
npm run codex-control:side-effect-scope
npm run codex-control:all-pipelines
npm run codex-control:empty-result-retry
npm run codex-control:stream-idle-watchdog
npm run codex-control:tool-call-sequence-repair
npm run codex-control:keepalive-no-cot-leak
npm run ultra-router:classification
npm run ultra-router:auto-router
npm run codex:0.136-compat
npm run codex:0.135-compat
npm run codex:0.134-official-compat
npm run codex:profile-primary
npm run codex:managed-proxy-env
npm run strategy:adhd-orchestrating-gate
npm run strategy:parallel-modification-plan
npm run strategy:file-ownership-plan
npm run strategy:verification-rollback-dag
npm run appshots:capability
npm run appshots:operator-policy
npm run appshots:evidence
npm run appshots:source-intelligence
npm run appshots:thread-attachment-discovery
npm run appshots:triwiki-voxel
npm run appshots:privacy-safety
npm run mcp:0.134-modernization
npm run mcp:readonly-runtime-scheduler
npm run codex:0.134-runner-truth
npm run source-intelligence:codex-history-search
npm run hooks:0.134-context-parity
npm run agent:parallel-write-kernel
npm run agent:parallel-write-blackbox
npm run team:parallel-write-blackbox
npm run dfix:parallel-write-blackbox
npm run agent:patch-envelope-extraction
npm run agent:patch-queue-runtime
npm run agent:strategy-to-lease-wiring
npm run agent:patch-swarm-runtime
npm run agent:patch-swarm-runtime-truth
npm run agent:patch-transaction-journal
npm run agent:patch-conflict-rebase
npm run agent:strategy-to-patch-strict
npm run agent:rollback-command
npm run agent:native-cli-session-swarm
npm run agent:native-cli-session-swarm-10
npm run agent:native-cli-session-swarm-20
npm run agent:no-subagent-scaling
npm run agent:native-cli-session-proof
npm run agent:worker-backend-router
npm run agent:codex-child-overlap
npm run agent:model-authored-patch-envelope
npm run zellij:layout-valid
npm run zellij:pane-proof
npm run zellij:screen-proof
npm run mad-sks:zellij-launch
npm run agent:fast-mode-default
npm run agent:fast-mode-worker-propagation
npm run codex:fast-mode-profile-propagation
npm run mad-sks:fast-mode-propagation
npm run agent:patch-verification-dag
npm run agent:patch-rollback-dag
npm run agent:patch-proof-runtime
npm run agent:patch-swarm-route-blackbox
npm run team:patch-swarm-route-blackbox
npm run dfix:patch-swarm-route-blackbox
npm run agent:patch-proof
npm run agent:patch-rollback
npm run agent:real-codex-patch-envelope-smoke
npm run agent:real-codex-parallel-workers
npm run agent:real-codex-parallel-workers-5
npm run agent:real-codex-parallel-workers-10
npm run agent:real-codex-parallel-workers-20
npm run release:gate-existence-audit
npm run route:blackbox-realism
npm run agent:visual-consistency
npm run release:real-check
npm run release:parallel-full-coverage
npm run priority:full-closure
npm run release:metadata
npm run official-docs:compat
npm run release:readiness
```

`release:readiness` writes current-version reports such as:

- `.sneakoscope/reports/release-readiness-2.0.10.json`
- `.sneakoscope/reports/release-readiness-2.0.10.md`
- `.sneakoscope/reports/all-feature-completion-2.0.10.json`
- `.sneakoscope/reports/all-feature-completion-2.0.10.md`
- `.sneakoscope/reports/official-docs-compat-2.0.10.json`
- `.sneakoscope/reports/official-docs-compat-2.0.10.md`
- `.sneakoscope/reports/agent-real-codex-dynamic-smoke-2.0.10.json`
- `.sneakoscope/reports/agent-real-codex-patch-envelope-smoke.json`
- `.sneakoscope/reports/agent-real-codex-parallel-workers.json`
- `.sneakoscope/reports/zellij-real-session-launch.json`
- `.sneakoscope/reports/runtime-truth-matrix-1.21.8.json`
- `.sneakoscope/reports/codex-0.136-compat.json`
- `.sneakoscope/reports/codex-0-134-official-compat.json`
- `.sneakoscope/reports/codex-0-134-runner-truth.json`
- `.sneakoscope/reports/mcp-0-134-modernization.json`
- `.sneakoscope/reports/mcp-readonly-runtime-scheduler.json`
- `.sneakoscope/reports/strategy-adhd-orchestrating-gate.json`
- `.sneakoscope/reports/appshots-evidence.json`
- `.sneakoscope/reports/appshots-thread-attachment-discovery.json`
- `.sneakoscope/reports/agent-parallel-write-kernel.json`
- `.sneakoscope/reports/agent-patch-envelope-extraction.json`
- `.sneakoscope/reports/agent-patch-queue-runtime.json`
- `.sneakoscope/reports/agent-strategy-to-lease-wiring.json`
- `.sneakoscope/reports/agent-patch-swarm-runtime.json`
- `.sneakoscope/reports/agent-patch-swarm-runtime-truth.json`
- `.sneakoscope/reports/agent-patch-transaction-journal.json`
- `.sneakoscope/reports/agent-patch-conflict-rebase.json`
- `.sneakoscope/reports/agent-strategy-to-patch-strict.json`
- `.sneakoscope/reports/agent-rollback-command.json`
- `.sneakoscope/reports/agent-native-cli-session-swarm.json`
- `.sneakoscope/reports/agent-native-cli-session-swarm-10.json`
- `.sneakoscope/reports/agent-native-cli-session-swarm-20.json`
- `.sneakoscope/reports/agent-no-subagent-scaling.json`
- `.sneakoscope/reports/agent-native-cli-session-proof.json`
- `.sneakoscope/reports/agent-fast-mode-default.json`
- `.sneakoscope/reports/agent-fast-mode-worker-propagation.json`
- `.sneakoscope/reports/codex-fast-mode-profile-propagation.json`
- `.sneakoscope/reports/mad-sks-fast-mode-propagation.json`
- `.sneakoscope/reports/agent-patch-proof-runtime.json`
- `.sneakoscope/reports/agent-patch-swarm-route-blackbox.json`
- `.sneakoscope/reports/team-patch-swarm-route-blackbox.json`
- `.sneakoscope/reports/dfix-patch-swarm-route-blackbox.json`
- `.sneakoscope/reports/retention-cleanup-safety.json`

The report covers version drift, release metadata freshness, stale `dist` prevention, native proof artifact structure, Codex App cockpit artifacts, official docs compatibility, docs truthfulness, Source Intelligence proof, runtime truth matrix, Codex 0.136 release compatibility, inherited Codex 0.135/0.134 runner deltas, optional real Codex patch smoke next action, managed proxy propagation, MCP modernization, MCP readOnly runtime scheduling, Appshots thread provenance, proof-safe parallel patches, transaction journaling, conflict rebase, rollback command proof, native CLI worker process scaling, no-subagent scaling, Fast mode propagation, real Codex parallel worker proof, Zellij spawn-on-demand worker-pane proof, and the current 1.21.8 release closure gaps.

## Priority Closure

| Priority | Status Surface |
| --- | --- |
| P0 | Source Intelligence, safety, release, proof, runtime, task graph, follow-up schema, route backfill, no-Scout, terminal, real Zellij proof, cleanup executor, retention cleanup, fake-vs-real policy, and Goal blockers |
| P1 | Codex App dashboard/operator visibility for active slots, total work items, pending/active/completed counts, backfill, generation history, source, UltraSearch, Codex Web, Goal, terminal, Zellij physical proof, cleanup status, and work graph score |
| P2 | Parallel provider queries, release DAG groups, local-only caches, refill latency, queue metrics, janitor throttling, capture-pane caps, bounded work graph scans, and worker-pool speed summaries |
| P3 | README, policy docs, migration, troubleshooting, CLI help, `--work-items`, active-slot semantics, real smoke envs, cleanup commands, retention cleanup wording, and onboarding |
| P4 | Human-readable summaries for source intelligence, UltraSearch proof, Goal fallback, terminal close, Zellij persistence, physical pane proof, cleanup, scheduler health, and worker Scout evidence |
| P5 | Regression catalog for fake pane rejection, missing capture/list-panes, output-last-message absence, cleanup dry-run/apply, retention preserve/remove safety, work graph partial quality, non-agent route stand-ins, source refs, and Goal refs |
| P6 | Codex 0.136 compatibility, inherited Codex 0.135/0.134 compatibility, MCP 0.134 policy, managed proxy propagation, local Codex history search, strategy-first orchestration, Appshots evidence, parallel write kernel proof, and release gate existence audit |
| P7 | Patch swarm runtime truth, transaction journal, conflict rebase, strict strategy-to-patch coverage, rollback command proof, and real Codex patch smoke optional/required state |
| P8 | Dashboard, Trust Report, runtime truth, and human summary surfaces for patch swarm status, rollback command, changed files by agent, MCP scheduler status, and real Codex patch smoke next action |
| P9 | Native CLI Session Swarm proof, no-subagent scaling proof, and Fast mode default propagation across worker CLI, Codex exec, Zellij, and MAD paths |

MAD-SKS readiness remains high-friction: full-system authority requires explicit user authorization, scoped target roots, separate consent for system access, DB writes, package installation, service control, admin operations, network, Computer Use, destructive delete, and generated-asset edits. The SKS harness protected core remains immutable even under MAD-SKS.

Imagegen readiness is core: `npm run imagegen:capability` must detect the official Codex App `$imagegen`/`gpt-image-2` surface and explicitly report that capability detection is not output proof. Full visual verification still requires a real generated output file with path, hash, dimensions, and provider/output metadata. OpenAI Images API, Responses image-generation, codex-lb, and `CODEX_LB_API_KEY` routes are non-Codex API fallbacks; they may be used only for explicitly requested API fallback work and do not satisfy Codex App imagegen evidence. `npm run imagegen:gpt-image-2-request-validator` must prove SKS omits unsupported `input_fidelity` while preserving local-only generated-image artifacts. Fake adapters remain fixture-only and cannot satisfy full visual verification.

README architecture image replacement uses the same evidence policy but is a project asset handoff rather than a generic release gate. `npm run imagegen:readme-architecture` writes the official prompt/report, rejects stale or non-Codex output, and replaces the asset only when a real Codex App `$imagegen`/`gpt-image-2` output path and metadata prove the selected file belongs to the current prompt contract.

Computer Use truthfulness remains bounded: `probe_only` is a capability probe, `live_capture_success` is local-only captured evidence, and `live_capture_blocked` records Codex App, macOS permission, or official capture-surface blockers. SKS does not fabricate screenshots and does not claim universal Computer Use availability.

UX-Review truthfulness is bounded the same way: a real verified UX claim requires a source screenshot, a generated gpt-image-2 annotated callout image, schema-bound issue extraction from generated image pixels, bounded safe fixes when requested, and recapture/re-review evidence for changed screens. Attached generated images start with `callout_extraction_status: pending`; mock fixtures remain `verified_partial`, and prose-only screenshot critique or generic fake callouts cannot pass the gate.

codex-lb truthfulness remains bounded: `durable_env_file`, `durable_keychain`, `durable_launchctl`, and `shell_profile` are durable setup modes, while `process_only_ephemeral` means the supplied key is only effective in the current process. Recovery command:

```bash
sks codex-lb setup --write-env-file --keychain --launchctl
```

Privacy statement: secrets are redacted, Codex Chrome Extension screenshots, native Computer Use screenshots, UltraSearch raw/source artifacts, Codex Web raw responses, and generated gpt-image-2 review images are local-only by default.
