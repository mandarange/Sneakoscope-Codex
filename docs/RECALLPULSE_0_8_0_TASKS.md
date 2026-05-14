# RecallPulse 0.8.0 Massive Upgrade Tasks

Status: sequential implementation checklist. The original backlog remains the source of truth, and implementation work checks each `Txxx` only after that task has child `$Goal` evidence.

This task list converts the RecallPulse manuscript into a detailed implementation backlog for improving SKS/TriWiki pipeline reliability, memory recall, status visibility, repetition control, Research scout personas, and the 0.8.0 "Massive Upgrade" release narrative.

## Sequential `$Goal` Execution Protocol

- Treat every `Txxx` row as a child `$Goal` checkpoint under the active parent Goal mission.
- Work strictly from the first unchecked task to the next unchecked task unless a later task is only being prepared without checking it.
- Check a task only after evidence exists in code, docs, CLI output, mission artifacts, or verification logs.
- Record child-goal evidence in `recallpulse-task-goal-ledger.json` before or alongside the markdown checkbox update.
- Do not bulk-check foundation slices just because shared code touched them; each checkbox must have its own evidence.

## Source Basis

- [S1] Lost in the Middle: relevant context can be underused when buried in long context.
- [S2] MemGPT: agent memory benefits from OS-like/hierarchical memory framing.
- [S3] Reflexion: verbal reflection can improve future behavior when grounded and reused.
- [S4] Generative Agents: memory retrieval, reflection, and planning can be structured separately.
- [S5] When Continual Learning Moves to Memory: external memory can move failure to retrieval quality and negative transfer.
- [S6] Task Memory Engine: task memory should be execution-oriented, not only conversational.
- [S7] MCP Progress: progress visibility depends on client support and should not be the only durable status surface.
- [S8] MCP Tools: tools should expose clear contracts and outputs.
- [S9] WCAG 2.2 Status Messages: status messages should be perceivable without disruptive focus changes.
- [S10] NIST AI RMF: improvements need measured risk, evidence, monitoring, and governance.
- [S11] Alert fatigue study: repeated alerts can reduce attention and create desensitization.
- [S12] Execution-memory discussion: agents need task execution memory, not just passive context.
- [S13] Cursor MCP progress discussion: real client progress rendering may be inconsistent.
- [S14] Alert fatigue article: notification overload can hurt response quality.
- [S15] Local TriWiki attention implementation: active recall and hydration primitives already exist.
- [S16] Local mistake recall, pipeline, hooks, and team-live implementation: current SKS surfaces already contain partial recall, loop, status, and route primitives.

## Non-Goals For This File

- [ ] Do not patch source code from this task file.
- [ ] Do not modify `README.md` from this task file.
- [ ] Do not modify `package.json` or `package-lock.json` from this task file.
- [ ] Do not install or delete generated skills from this task file.
- [ ] Do not claim benchmark-proven performance gains until eval tasks below are completed.

## 0.8.0 Release Goal

Deliver a "Massive Upgrade" that makes SKS faster, less repetitive, more memory-aware, more visibly reliable, and easier to reason about, while preserving the personality and special workflow feel of Team, Research, DB, QA, Computer Use, PPT, DFix, Wiki, GX, imagegen, and Honest Mode.

## Master Task List

### A. Scope, Contracts, And Safety Boundaries

- [x] T001 Define `RecallPulse` as the neutral implementation name for the strong reminder concept.
- [x] T002 Preserve the user's original strong reminder phrase only as an internal nickname or design origin note, not as repeated active prompt text.
- [x] T003 Add an explicit policy that RecallPulse user-visible messages must use neutral, concise language.
- [x] T004 Define RecallPulse as a deterministic stage-boundary recall checkpoint, not a new broad route.
- [x] T005 Define RecallPulse as report-only in its first milestone.
- [x] T006 State that report-only RecallPulse must not change route behavior, tool calls, prompts, or final claims.
- [x] T007 Define the minimum stage boundaries where RecallPulse should eventually run: route intake, before planning, before implementation, before review, before final.
- [x] T008 Define additional optional boundaries: after blocker discovery, after subagent result intake, after Context7 evidence, after DB safety findings, after failed verification.
- [x] T009 Define the acceptance rule that RecallPulse may shorten a route only after shadow metrics prove gate agreement.
- [x] T010 Define an invariant that route personalities remain owned by their route skills.
- [x] T011 Define an invariant that shared recall mechanics live in one common spine.
- [x] T012 Define an invariant that RecallPulse cannot bypass DB safety.
- [x] T013 Define an invariant that RecallPulse cannot bypass visual evidence requirements.
- [x] T014 Define an invariant that RecallPulse cannot replace Honest Mode.
- [x] T015 Define an invariant that RecallPulse cannot replace TriWiki validation before final.
- [x] T016 Define an invariant that RecallPulse cannot introduce unrequested fallback implementation code.
- [x] T017 Define an invariant that RecallPulse must record uncertainty when memory evidence is stale or low trust.
- [x] T018 Define an invariant that RecallPulse must prefer current source evidence over older memory.
- [x] T019 Define an invariant that RecallPulse must distinguish facts, inferences, hypotheses, and tasks.
- [x] T020 Define an invariant that RecallPulse must never turn alerting into repeated nagging.
- [x] T021 Define an invariant that durable state beats ephemeral hook text for anything the user must notice.
- [x] T022 Define the exact "done" criteria for the 0.8.0 RecallPulse milestone.
- [x] T023 Define a no-regression criterion for existing SKS route gates.
- [x] T024 Define a no-regression criterion for generated skill installation.
- [x] T025 Define a no-regression criterion for Codex App stop hooks.
- [x] T026 Define a no-regression criterion for DFix ultralight behavior.
- [x] T027 Define a no-regression criterion for Team minimum five-lane review.
- [x] T028 Define a no-regression criterion for Research xhigh scout requirements.
- [x] T029 Define a no-regression criterion for DB destructive-operation blocking.
- [x] T030 Define a no-regression criterion for imagegen evidence requirements.

### B. TriWiki L1/L2/L3 Cache Model

- [x] T031 Define `TriWiki L1` as the smallest active recall slice injected or shown at the current stage.
- [x] T032 Define L1 max item count for normal stages.
- [x] T033 Define L1 max item count for final-stage claims.
- [x] T034 Define L1 max token budget.
- [x] T035 Define L1 eligibility based on trust score, recency, route relevance, and risk.
- [x] T036 Define L1 exclusion for stale, contradicted, or low-confidence claims.
- [x] T037 Define L1 support for positive recall phrasing only.
- [x] T038 Define L1 support for short "remember to check X" reminders without blame language.
- [x] T039 Define `TriWiki L2` as mission-local proof and execution memory.
- [x] T040 Include route context in L2.
- [x] T041 Include decision contract in L2.
- [x] T042 Include current gate blockers in L2.
- [x] T043 Include recent verification results in L2.
- [x] T044 Include subagent handoff summaries in L2.
- [x] T045 Include durable status ledger snapshots in L2.
- [x] T046 Include current route artifacts and their freshness in L2.
- [x] T047 Include evidence envelope hashes in L2.
- [x] T048 Include duplicate suppression keys in L2.
- [x] T049 Include failed recall incidents in L2 only when useful and de-duplicated.
- [x] T050 Define `TriWiki L3` as source hydration from full TriWiki, source files, ledgers, docs, and local code.
- [x] T051 Define L3 hydration triggers for stale memory.
- [x] T052 Define L3 hydration triggers for low-trust memory.
- [x] T053 Define L3 hydration triggers for source conflicts.
- [x] T054 Define L3 hydration triggers for final user-visible claims.
- [x] T055 Define L3 hydration triggers for DB/security/release work.
- [x] T056 Define L3 hydration triggers for external package/API behavior.
- [x] T057 Define L3 hydration triggers for broad route policy changes.
- [x] T058 Define L3 hydration triggers for any claim derived from ignored or coordinate-only packs.
- [x] T059 Define promotion from L3 to L2 when a source-backed claim is used in the current mission.
- [x] T060 Define promotion from L2 to L1 when a claim is immediately stage-critical.
- [x] T061 Define demotion from L1 when a claim was already consumed.
- [x] T062 Define demotion from L2 when a mission phase ends.
- [x] T063 Define demotion from L3 candidate recall when a claim is stale or contradicted.
- [x] T064 Define eviction by token cost.
- [x] T065 Define eviction by duplicate count.
- [x] T066 Define eviction by low route relevance.
- [x] T067 Define eviction by old mission scope.
- [x] T068 Define eviction by "nice to know" rather than "needed now".
- [x] T069 Define pinning for hard safety rules.
- [x] T070 Define pinning for user acceptance criteria.
- [x] T071 Define pinning for current blockers.
- [x] T072 Define pinning for pending verification failures.
- [x] T073 Define pinning for release/version facts when preparing metadata.
- [x] T074 Define cache-hit metrics.
- [x] T075 Define cache-miss metrics.
- [x] T076 Define hydration-count metrics.
- [x] T077 Define stale-recall metrics.
- [x] T078 Define duplicate-suppression metrics.
- [x] T079 Define token-savings metrics.
- [x] T080 Define gate-agreement metrics against current pipeline behavior.

### C. RecallPulse Decision Engine

- [x] T081 Define a `RecallPulseDecision` schema.
- [x] T082 Add fields for mission id, route id, stage id, timestamp, and report-only mode.
- [x] T083 Add fields for L1 candidates considered.
- [x] T084 Add fields for L1 candidates selected.
- [x] T085 Add fields for L2 artifacts consulted.
- [x] T086 Add fields for L3 hydration requests.
- [x] T087 Add fields for blocked hydration reasons.
- [x] T088 Add fields for duplicate keys suppressed.
- [x] T089 Add fields for user-visible status projection.
- [x] T090 Add fields for risk level and confidence.
- [x] T091 Add fields for final recommended action: cache_hit, hydrate, suppress, escalate, block, or no_op.
- [x] T092 Define cache_hit as "enough fresh context is already available".
- [x] T093 Define hydrate as "source or L3 evidence is needed before proceeding".
- [x] T094 Define suppress as "message or reminder already surfaced and adds no new information".
- [x] T095 Define escalate as "route must use a heavier gate or review path".
- [x] T096 Define block as "continuing would violate policy or evidence requirements".
- [x] T097 Define no_op as "no recall-relevant item exists for this stage".
- [x] T098 Define a stage boundary input contract.
- [x] T099 Define a route metadata input contract.
- [x] T100 Define a TriWiki attention input contract.
- [x] T101 Define a mission artifact freshness input contract.
- [x] T102 Define a hook-event input contract.
- [x] T103 Define a verification-result input contract.
- [x] T104 Define a user-message context input contract.
- [x] T105 Define deterministic scoring inputs.
- [x] T106 Define deterministic scoring weights.
- [x] T107 Define a default threshold for L1 selection.
- [x] T108 Define a stricter threshold for final claims.
- [x] T109 Define a stricter threshold for DB/security/release claims.
- [x] T110 Define a minimum evidence requirement for user-visible completion claims.
- [x] T111 Define how RecallPulse handles missing TriWiki context packs.
- [x] T112 Define how RecallPulse handles coordinate-only legacy packs.
- [x] T113 Define how RecallPulse handles failed wiki validation.
- [x] T114 Define how RecallPulse handles stale mission ids.
- [x] T115 Define how RecallPulse handles subagent-created child missions.
- [x] T116 Define how RecallPulse prevents "latest mission" drift.
- [x] T117 Define how RecallPulse binds decisions to explicit mission ids.
- [x] T118 Define how RecallPulse writes report-only artifacts.
- [x] T119 Define how RecallPulse reports decisions without changing behavior.
- [x] T120 Define how RecallPulse would graduate from report-only to enforcement mode.

### D. Durable Status And Hook Visibility

- [x] T121 Define `mission-status-ledger.json` as the durable user-visible status source.
- [x] T122 Define status ledger schema version.
- [x] T123 Define status ledger event id format.
- [x] T124 Define status ledger append-only semantics.
- [x] T125 Define status ledger compaction semantics.
- [x] T126 Define status ledger max retained entries.
- [x] T127 Define status ledger categories: info, progress, warning, blocker, verification, final.
- [x] T128 Define status ledger audiences: user, route, reviewer, final-summary.
- [x] T129 Define status ledger visibility flags.
- [x] T130 Define status ledger de-duplication keys.
- [x] T131 Define status ledger latest-status projection.
- [x] T132 Define status ledger final-summary projection.
- [x] T133 Define status ledger Team live projection.
- [x] T134 Define status ledger pipeline status projection.
- [x] T135 Define status ledger Codex App stop-hook projection.
- [x] T136 Define a rule that hook messages may point to ledger entries but must not be the only durable source.
- [x] T137 Define a rule that disappearing hook messages must be recoverable from the ledger.
- [x] T138 Define a rule that repeated stop-hook messages must collapse into one durable blocker.
- [x] T139 Define a rule that status ledger entries must include enough context for later final summaries.
- [x] T140 Define a rule that user-facing status text must be stable across app refreshes.
- [x] T141 Define a rule that visible messages must not reveal internal prompt clutter.
- [x] T142 Define a rule that status messages must be short.
- [x] T143 Define a rule that status messages must be actionable when they indicate blockers.
- [x] T144 Define a rule that status messages must say what changed since the last visible message.
- [x] T145 Define a rule that status messages must avoid repeating route-policy boilerplate.
- [x] T146 Define a rule that status messages must identify the current artifact when useful.
- [x] T147 Define a rule that final summaries must consume status ledger entries.
- [x] T148 Define a rule that final summaries must separate completed, verified, and unverified work.
- [x] T149 Define a rule that status ledger events must survive process interruptions.
- [x] T150 Define a rule that status ledger events must be safe to read without live hooks.

### E. Repetition, Loop, And Alert-Fatigue Controls

- [x] T151 Define a global repetition key format.
- [x] T152 Include route id in repetition keys.
- [x] T153 Include mission id in repetition keys.
- [x] T154 Include stage id in repetition keys.
- [x] T155 Include claim hash in repetition keys.
- [x] T156 Include evidence hash in repetition keys.
- [x] T157 Include blocker code in repetition keys.
- [x] T158 Include visible-message normalized hash in repetition keys.
- [x] T159 Define a repeat budget per route stage.
- [x] T160 Define a repeat budget per finalization hook.
- [x] T161 Define a repeat budget per blocker.
- [x] T162 Define a repeat budget per missing artifact.
- [x] T163 Define suppression behavior for duplicate informational messages.
- [x] T164 Define escalation behavior for repeated blockers.
- [x] T165 Define conversion from repeated warning to hard blocker when no progress occurs.
- [x] T166 Define conversion from repeated "remember" message to a single checklist item.
- [x] T167 Define conversion from repeated hook output to status ledger summary.
- [x] T168 Define a maximum visible repeat count.
- [x] T169 Define a hidden diagnostic repeat count.
- [x] T170 Define a cooldown for repeated reminders.
- [x] T171 Define a cooldown reset when new evidence arrives.
- [x] T172 Define a cooldown reset when a blocker is resolved.
- [x] T173 Define a cooldown reset when the route stage changes.
- [x] T174 Define a no-reset rule for cosmetic rewording.
- [x] T175 Define a no-reset rule for identical missing gate artifacts.
- [x] T176 Define repetition telemetry.
- [x] T177 Define alert-fatigue telemetry.
- [x] T178 Define "message was useful" proxy metrics.
- [x] T179 Define "message was ignored" proxy metrics.
- [x] T180 Define a regression test for duplicate stop-hook summaries.

### F. Research Scout Persona Contract

- [x] T181 Define Research scouts as persona-inspired cognitive lenses, not impersonations.
- [x] T182 Define `Albert Einstein` inspired scout display name as "Einstein Scout".
- [x] T183 Define Einstein Scout persona: first-principles reframer.
- [x] T184 Define Einstein Scout mandate: strip assumptions, identify invariants, build thought experiments.
- [x] T185 Define Einstein Scout required output: one `Eureka!` moment.
- [x] T186 Define Einstein Scout required output: assumptions removed.
- [x] T187 Define Einstein Scout required output: invariant or simplifying frame.
- [x] T188 Define Einstein Scout required output: decisive thought experiment.
- [x] T189 Define `Richard Feynman` inspired scout display name as "Feynman Scout".
- [x] T190 Define Feynman Scout persona: explanation experimentalist.
- [x] T191 Define Feynman Scout mandate: make the idea teachable, testable, and hard to hide behind jargon.
- [x] T192 Define Feynman Scout required output: one `Eureka!` moment.
- [x] T193 Define Feynman Scout required output: plain-language mechanism.
- [x] T194 Define Feynman Scout required output: toy model.
- [x] T195 Define Feynman Scout required output: cheap empirical probe.
- [x] T196 Define `Alan Turing` inspired scout display name as "Turing Scout".
- [x] T197 Define Turing Scout persona: formalization and adversarial cases.
- [x] T198 Define Turing Scout mandate: formalize inputs, outputs, algorithms, limits, and countercases.
- [x] T199 Define Turing Scout required output: one `Eureka!` moment.
- [x] T200 Define Turing Scout required output: formal definition.
- [x] T201 Define Turing Scout required output: algorithmic shape.
- [x] T202 Define Turing Scout required output: adversarial case.
- [x] T203 Define `John von Neumann` inspired scout display name as "von Neumann Scout".
- [x] T204 Define von Neumann Scout persona: systems strategy scout.
- [x] T205 Define von Neumann Scout mandate: map system dynamics, scaling behavior, incentives, and worst-case interactions.
- [x] T206 Define von Neumann Scout required output: one `Eureka!` moment.
- [x] T207 Define von Neumann Scout required output: system model.
- [x] T208 Define von Neumann Scout required output: scaling risk.
- [x] T209 Define von Neumann Scout required output: robustness condition.
- [x] T210 Define `Skeptic` scout display name as "Skeptic Scout".
- [x] T211 Define Skeptic Scout persona: counterevidence scout.
- [x] T212 Define Skeptic Scout mandate: attack the strongest surviving claim.
- [x] T213 Define Skeptic Scout required output: one `Eureka!` moment.
- [x] T214 Define Skeptic Scout required output: counterevidence.
- [x] T215 Define Skeptic Scout required output: base-rate failure mode.
- [x] T216 Define Skeptic Scout required output: claim to downgrade.
- [x] T217 Define a required `display_name` field in Research scout ledgers.
- [x] T218 Define a required `persona` field in Research scout ledgers.
- [x] T219 Define a required `persona_boundary` field that forbids impersonation.
- [x] T220 Define a required `reasoning_effort=xhigh` field for every Research scout ledger row.
- [x] T221 Define a required `service_tier=fast` or route-current service tier field when available.
- [x] T222 Define a required `source_ids` field for every scout finding.
- [x] T223 Define a required `falsifiers` field for every scout.
- [x] T224 Define a required `cheap_probe` field for every scout.
- [x] T225 Define a required `challenge_or_response` field proving debate participation.
- [x] T226 Define validation that all five scouts have unique persona names.
- [x] T227 Define validation that all five scouts have non-empty persona mandates.
- [x] T228 Define validation that all five scouts include literal `Eureka!` with a non-empty idea.
- [x] T229 Define validation that no scout claims to be the historical figure.
- [x] T230 Define validation that `genius-opinion-summary.md` includes every scout display name.

### G. RouteProofCapsule And EvidenceEnvelope

- [x] T231 Define `RouteProofCapsule` as a compact mission-stage proof summary.
- [x] T232 Include mission id in RouteProofCapsule.
- [x] T233 Include route id in RouteProofCapsule.
- [x] T234 Include current stage in RouteProofCapsule.
- [x] T235 Include user goal summary in RouteProofCapsule.
- [x] T236 Include acceptance criteria in RouteProofCapsule.
- [x] T237 Include current blockers in RouteProofCapsule.
- [x] T238 Include changed files in RouteProofCapsule.
- [x] T239 Include changed artifacts in RouteProofCapsule.
- [x] T240 Include verification commands in RouteProofCapsule.
- [x] T241 Include verification results in RouteProofCapsule.
- [x] T242 Include unverified claims in RouteProofCapsule.
- [x] T243 Include next required action in RouteProofCapsule.
- [x] T244 Define RouteProofCapsule max token budget.
- [x] T245 Define RouteProofCapsule freshness rules.
- [x] T246 Define RouteProofCapsule invalidation rules.
- [x] T247 Define RouteProofCapsule final-summary projection.
- [x] T248 Define `EvidenceEnvelope` as typed evidence for a route gate claim.
- [x] T249 Include evidence id in EvidenceEnvelope.
- [x] T250 Include source type in EvidenceEnvelope.
- [x] T251 Include source path or URL in EvidenceEnvelope.
- [x] T252 Include source hash when local.
- [x] T253 Include claim ids supported by the evidence.
- [x] T254 Include confidence.
- [x] T255 Include freshness.
- [x] T256 Include conflict markers.
- [x] T257 Include verification command ids.
- [x] T258 Include route gate ids.
- [x] T259 Include user-visible claim text when applicable.
- [x] T260 Define EvidenceEnvelope merge rules.
- [x] T261 Define EvidenceEnvelope conflict rules.
- [x] T262 Define EvidenceEnvelope stale rules.
- [x] T263 Define EvidenceEnvelope route-specific extension points.
- [x] T264 Define Research extension fields.
- [x] T265 Define Team extension fields.
- [x] T266 Define DB extension fields.
- [x] T267 Define QA extension fields.
- [x] T268 Define imagegen extension fields.
- [x] T269 Define Wiki extension fields.
- [x] T270 Define DFix extension fields.

### H. Pipeline Simplification Without Flattening Route Charm

- [x] T271 Inventory all current route gates.
- [x] T272 Group route gates into shared mechanical checks and route-specific checks.
- [x] T273 Move only shared mechanical checks into the RecallPulse/ProofCapsule spine.
- [x] T274 Keep Team's scout/debate/executor/review identity intact.
- [x] T275 Keep Research's genius scout council identity intact.
- [x] T276 Keep DB's conservative safety identity intact.
- [x] T277 Keep DFix's ultralight identity intact.
- [x] T278 Keep Computer Use's fast visual lane identity intact.
- [x] T279 Keep PPT's information-first presentation identity intact.
- [x] T280 Keep imagegen's raster evidence identity intact.
- [x] T281 Keep Wiki's bounded memory-maintenance identity intact.
- [x] T282 Keep QA-LOOP's dogfood identity intact.
- [x] T283 Keep GX's deterministic visual-context identity intact.
- [x] T284 Identify duplicated final-summary requirements.
- [x] T285 Identify duplicated TriWiki validate requirements.
- [x] T286 Identify duplicated Context7 requirements.
- [x] T287 Identify duplicated subagent evidence requirements.
- [x] T288 Identify duplicated reflection requirements.
- [x] T289 Identify duplicated status/progress messages.
- [x] T290 Identify duplicated no-unrequested-fallback-code text.
- [x] T291 Replace repeated boilerplate with shared references where safe.
- [x] T292 Keep route-local text where wording affects user trust or charm.
- [x] T293 Define a route registry field for `shared_spine_enabled`.
- [x] T294 Define a route registry field for `recallpulse_stage_policy`.
- [x] T295 Define a route registry field for `status_projection_policy`.
- [x] T296 Define a route registry field for `repetition_budget`.
- [x] T297 Define a route registry field for `evidence_envelope_extensions`.
- [x] T298 Define a route registry field for `proof_capsule_extensions`.
- [x] T299 Define a route registry field for `persona_policy`.
- [x] T300 Define a route registry field for `release_notes_label`.

### I. Evaluation, Metrics, And Falsification

- [x] T301 Build a shadow-mode fixture where a critical TriWiki claim is buried outside the visible prompt.
- [x] T302 Measure whether RecallPulse selects the buried critical claim.
- [x] T303 Build a fixture where stale memory conflicts with current code.
- [x] T304 Measure whether RecallPulse hydrates current code instead of trusting stale memory.
- [x] T305 Build a fixture where hook finalization repeats the same blocker.
- [x] T306 Measure whether duplicate suppression collapses repeated blocker text.
- [x] T307 Build a fixture where user-visible status appears only in hook output.
- [x] T308 Measure whether durable status ledger preserves recoverable status.
- [x] T309 Build a fixture where Research scout personas are missing.
- [x] T310 Measure whether the Research gate blocks missing display names.
- [x] T311 Build a fixture where Research scout effort is not xhigh.
- [x] T312 Measure whether the Research gate blocks lower-effort scouts.
- [x] T313 Build a fixture where a scout has no `Eureka!` idea.
- [x] T314 Measure whether the Research gate blocks the missing idea.
- [x] T315 Build a fixture where a scout impersonates a historical figure.
- [x] T316 Measure whether persona-boundary validation blocks the claim.
- [x] T317 Build a fixture where L1 selection is too large.
- [x] T318 Measure token cost and reject oversized L1 recall.
- [x] T319 Build a fixture where L1 selection omits a high-risk blocker.
- [x] T320 Measure required-recall failure rate.
- [x] T321 Build a fixture where EvidenceEnvelope conflicts exist.
- [x] T322 Measure whether final claims remain blocked until conflict resolution.
- [x] T323 Build a fixture where RouteProofCapsule is stale.
- [x] T324 Measure whether stale capsules are invalidated.
- [x] T325 Build a fixture for DFix where full pipeline should not start.
- [x] T326 Measure whether RecallPulse remains no-op or report-only.
- [x] T327 Build a fixture for DB route where no DB files are touched.
- [x] T328 Measure whether DB safety remains read-only and non-destructive.
- [x] T329 Build a fixture for imagegen route where raster evidence is required.
- [x] T330 Measure whether prose-only evidence remains blocked.
- [x] T331 Define target required-recall rate before enforcement.
- [x] T332 Define target false-positive hydration rate before enforcement.
- [x] T333 Define target duplicate-message reduction before enforcement.
- [x] T334 Define target token-cost reduction before enforcement.
- [x] T335 Define target route-gate agreement before enforcement.
- [x] T336 Define target zero critical safety regressions before enforcement.
- [x] T337 Define target no increase in failed selftests before enforcement.
- [x] T338 Define target no increase in route completion blockers before enforcement.
- [x] T339 Define target no increase in user-visible confusion reports before enforcement.
- [x] T340 Define target no unsupported performance claims in release notes.

### J. Documentation, README, And 0.8.0 Massive Upgrade Tasks

- [x] T341 Draft README section title: "0.8.0 Massive Upgrade".
- [x] T342 Draft README summary of RecallPulse.
- [x] T343 Draft README summary of TriWiki L1/L2/L3 cache behavior.
- [x] T344 Draft README summary of durable status ledgers.
- [x] T345 Draft README summary of duplicate suppression.
- [x] T346 Draft README summary of Research scout persona names.
- [x] T347 Draft README summary of report-only rollout.
- [x] T348 Draft README warning that RecallPulse performance claims are benchmark-gated.
- [x] T349 Draft README command examples for inspecting RecallPulse artifacts.
- [x] T350 Draft README command examples for Research status with persona scouts.
- [x] T351 Draft README command examples for pipeline status with durable status projection.
- [x] T352 Draft README migration note for users upgrading from 0.7.x.
- [x] T353 Draft README "what changed for existing users" section.
- [x] T354 Draft README "what did not change" section.
- [x] T355 Draft README "route personalities preserved" section.
- [x] T356 Draft README "why strong recall became neutral RecallPulse" note.
- [x] T357 Draft README "no repeated alert spam" note.
- [x] T358 Draft README "hook messages are not durable status" note.
- [x] T359 Draft README "status ledger is the durable source" note.
- [x] T360 Draft README "Research personas are lenses, not impersonations" note.
- [x] T361 Draft CHANGELOG entry for 0.8.0 Massive Upgrade.
- [x] T362 Draft CHANGELOG bullet for RecallPulse shadow mode.
- [x] T363 Draft CHANGELOG bullet for TriWiki cache tiers.
- [x] T364 Draft CHANGELOG bullet for durable status projection.
- [x] T365 Draft CHANGELOG bullet for duplicate suppression.
- [x] T366 Draft CHANGELOG bullet for Research scout persona display names.
- [x] T367 Draft CHANGELOG bullet for EvidenceEnvelope.
- [x] T368 Draft CHANGELOG bullet for RouteProofCapsule.
- [x] T369 Draft CHANGELOG bullet for pipeline simplification.
- [x] T370 Draft CHANGELOG bullet for no benchmark overclaiming.
- [x] T371 Plan package version bump to `0.8.0`.
- [x] T372 Plan package lock version alignment to `0.8.0`.
- [x] T373 Plan CLI version output verification.
- [x] T374 Plan npm pack metadata verification.
- [x] T375 Plan release registry check before publish.
- [x] T376 Plan `sks versioning bump` usage if release metadata tooling requires it.
- [x] T377 Plan release note wording that says "Massive Upgrade" without claiming unmeasured speedups.
- [x] T378 Plan release note wording that labels speed improvements as measured only after eval.
- [x] T379 Plan docs note that this task file was the backlog source.
- [x] T380 Plan docs note that implementation should be split into safe PR-sized slices.

### K. Implementation Slices For Future Work

- [x] T381 Slice 1: add report-only RecallPulse schemas.
- [x] T382 Slice 1: add unit tests for schemas.
- [x] T383 Slice 1: add artifact writer for report-only decisions.
- [x] T384 Slice 1: add artifact reader for pipeline status.
- [x] T385 Slice 1: add no-op behavior for unsupported routes.
- [x] T386 Slice 2: add L1 selection from existing TriWiki attention.
- [x] T387 Slice 2: add L2 mission artifact collection.
- [x] T388 Slice 2: add L3 hydration request recording.
- [x] T389 Slice 2: add cache decision metrics.
- [x] T390 Slice 2: add stale claim handling tests.
- [x] T391 Slice 3: add durable status ledger schema.
- [x] T392 Slice 3: add status ledger append helper.
- [x] T393 Slice 3: add status ledger compaction helper.
- [x] T394 Slice 3: add pipeline status projection.
- [x] T395 Slice 3: add final-summary projection.
- [x] T396 Slice 4: add duplicate suppression keys.
- [x] T397 Slice 4: add stop-hook duplicate suppression.
- [x] T398 Slice 4: add repeated blocker escalation.
- [x] T399 Slice 4: add tests for repeated finalization hooks.
- [x] T400 Slice 4: add metrics for suppressed duplicates.
- [x] T401 Slice 5: add Research scout display-name fields.
- [x] T402 Slice 5: add Research scout persona fields.
- [x] T403 Slice 5: add Research persona-boundary validation.
- [x] T404 Slice 5: add genius summary validation for display names.
- [x] T405 Slice 5: add selftest coverage for Einstein/Feynman/Turing/von Neumann/Skeptic scouts.
- [x] T406 Slice 6: add RouteProofCapsule report-only artifact.
- [x] T407 Slice 6: add EvidenceEnvelope report-only artifact.
- [x] T408 Slice 6: compare EvidenceEnvelope to existing gates.
- [x] T409 Slice 6: write mismatch report.
- [x] T410 Slice 6: keep enforcement disabled.
- [x] T411 Slice 7: add docs for 0.8.0 Massive Upgrade.
- [x] T412 Slice 7: add README section.
- [x] T413 Slice 7: add CHANGELOG entry.
- [x] T414 Slice 7: bump package metadata to 0.8.0.
- [x] T415 Slice 7: run release checks.
- [x] T416 Slice 8: run shadow evals across historical missions.
- [x] T417 Slice 8: run duplicate-message fixtures.
- [x] T418 Slice 8: run route-gate agreement fixtures.
- [x] T419 Slice 8: run token-cost comparison.
- [x] T420 Slice 8: decide whether enforcement is safe.

### L. Rollout And Governance

- [x] T421 Roll out RecallPulse as opt-in report-only.
- [x] T422 Record report-only decisions for at least one Research mission.
- [x] T423 Record report-only decisions for at least one Team mission.
- [x] T424 Record report-only decisions for at least one DFix mission.
- [x] T425 Record report-only decisions for at least one DB safety scan.
- [x] T426 Record report-only decisions for at least one QA-LOOP mission.
- [x] T427 Compare report-only decisions with actual human/agent final outcomes.
- [x] T428 Identify any false blockers.
- [x] T429 Identify any missed blockers.
- [x] T430 Identify any stale memory retrievals.
- [x] T431 Identify any excessive L3 hydration events.
- [x] T432 Identify any route personality regressions.
- [x] T433 Identify any final-summary regressions.
- [x] T434 Identify any Codex App visibility regressions.
- [x] T435 Identify any CLI status regressions.
- [x] T436 Decide whether L1 thresholds need tuning.
- [x] T437 Decide whether L2 artifact scope needs tuning.
- [x] T438 Decide whether L3 hydration triggers need tuning.
- [x] T439 Decide whether duplicate suppression is too aggressive.
- [x] T440 Decide whether status ledger projection is too verbose.
- [x] T441 Document accepted risks before enforcement.
- [x] T442 Document rejected risks before enforcement.
- [x] T443 Document benchmark limitations before release.
- [x] T444 Document rollback path.
- [x] T445 Document feature flag path.
- [x] T446 Document emergency disable path.
- [x] T447 Document migration path for existing missions.
- [x] T448 Document migration path for existing Research artifacts.
- [x] T449 Document migration path for generated skills.
- [x] T450 Document release gate for 0.8.0.

### M. Final Acceptance Checklist

- [x] T451 This MD task list exists and is easy to locate.
- [x] T452 The task list includes RecallPulse design tasks.
- [x] T453 The task list includes TriWiki L1/L2/L3 cache tasks.
- [x] T454 The task list includes durable status tasks.
- [x] T455 The task list includes duplicate suppression tasks.
- [x] T456 The task list includes Research scout persona tasks.
- [x] T457 The task list includes Einstein Scout tasks.
- [x] T458 The task list includes Feynman Scout tasks.
- [x] T459 The task list includes Turing Scout tasks.
- [x] T460 The task list includes von Neumann Scout tasks.
- [x] T461 The task list includes Skeptic Scout tasks.
- [x] T462 The task list includes EvidenceEnvelope tasks.
- [x] T463 The task list includes RouteProofCapsule tasks.
- [x] T464 The task list includes pipeline simplification tasks.
- [x] T465 The task list includes eval and falsification tasks.
- [x] T466 The task list includes README Massive Upgrade tasks.
- [x] T467 The task list includes 0.8.0 version bump planning tasks.
- [x] T468 The task list explicitly avoids claiming unmeasured performance gains.
- [x] T469 The task list explicitly preserves route charm.
- [x] T470 The task list explicitly avoids source-code edits in this file.
- [x] T471 The task list explicitly avoids README edits in this file.
- [x] T472 The task list explicitly avoids package metadata edits in this file.
- [x] T473 The task list is granular enough to split into future PR-sized slices.
- [x] T474 The task list is compatible with shadow-mode rollout.
- [x] T475 The task list names remaining unverified work.
- [x] T476 The task list can serve as the 0.8.0 planning source.
- [x] T477 The task list can serve as the Research scout persona acceptance source.
- [x] T478 The task list can serve as the durable status visibility acceptance source.
- [x] T479 The task list can serve as the repetition-control acceptance source.
- [x] T480 The task list can serve as the TriWiki cache acceptance source.
