# Codex integration delivery and acceptance plan

This is the scoped implementation plan for the
[selected ADR](codex-native-integration-adr.md). All broker-specific files,
schemas, flags, service behavior, and tests below are **planned new work** unless
the [evidence inventory](codex-native-integration-evidence.md) says otherwise.
Merging a strategy document must not mark a runtime phase complete.

## Delivery slices and accountable components

Each slice is a separately reviewable implementation PR. “Owner” means component
accountability, not a commitment by a named individual. Preserve current
CLI/Center ownership and current latest-stable host checks throughout.

| Slice / phase | Owner and bounded change | Exit evidence | Rollback / dependency |
| --- | --- | --- | --- |
| S0: compatibility and baseline | `codex-control`, compatibility gates, benchmark maintainer tooling. Capture resolved runtime identity/schema, versioned event/approval fixtures, actual launch/metadata/context costs; inventory callers | Required fields/semantics validated; baseline/fault reports reproducible; real local handshake and read-only turn on target host | No transport change; independent of #33 except consumers must honor unknown config state |
| S1: shadow lifecycle | `codex-control` + existing task/pipeline owner. Add broker interface, task-to-thread bindings, bounded private journal/reducer; observe baseline events without sending competing turns | Replay/fault tests, authority mapping, no change to baseline task/output/gate results; zero shadow model calls or shadow writes | Disable observer and preserve baseline; requires S0 |
| S2: one SKS-owned read-only session | `codex-control` + CLI. Reuse client for multiple turns in one mission process; implement explicit approvals/input/interrupt/deadline policy and history reconciliation | Real handshake → start → terminal → next turn → interrupt → resume, one writer, exact model/policy, no unauthorized writes; benchmark acceptance | Choose baseline only for future/reconciled tasks, never automatic replay; requires S1 |
| S3: bounded writes and memory | Permission/mission owner + memory owners. Admit isolated project writes; connect narrow read-only MCP context/recall; use existing intake/promotion writers separately | Denied/approved write, crash-at-send/after-apply, path confinement, stale-memory, promotion and rollback fixtures; real safe write and read-back | Stop admission, reconcile/diff, preserve artifacts, explicit baseline handoff; requires S2 |
| S4: bounded multi-lane work | `subagents` + pipeline owner. Bind native child lifecycle to existing task keys/waves/leases and deterministic finite-stage admission; capacity/backpressure and isolated worktrees | Actual official-child start/stop/parent summary, recursion denial, conflict exclusion, duplicate-request test, cancellation and integration verification | Reduce to one admitted lane after reconciliation; requires S3 and a proven native API/tool lifecycle contract |
| S5: Center cutover | Native Center + CLI/control plane. Add authenticated local service/IPC only if needed for shared ownership; streaming projections, request-bound approvals, restart/quit semantics | macOS UI/CLI concurrent-client tests, relaunch during run, stale callbacks, accessibility, no status-triggered model calls, rollback drill | Restore previous Center adapter for new operations; service drains owned sessions; requires S4 or separately approved single-lane-only release |
| S6: consolidation | Same component owners + release gates. Remove measured duplicate work on the broker path; update product contract, compatibility and migration docs | Old/new parity matrix, installed-package/platform evidence, no duplicate writer, measured benefit and lower/equal failure rate | Keep a tested explicit baseline until rollback/support window closes; requires all promoted scope evidence |

Do not parallelize implementation by creating new orchestration engines. S0/S1
must first map `runtime-core`/`pipeline-stage-builder` helpers to broker bindings.
If durable task ownership needs repair, fix it there before layering transport
state on it. Keep private journals bounded and under the existing ignored SKS
state boundary. New schemas receive a revision and corruption/migration tests.
The current `ACTIVE_TASKS` map is process-local; snapshot/restore is not a
cross-process lock. S1 must add/reuse locked durable ownership in that component
and fence a restarted owner before S2 admits a turn. S2 also extends synchronous
approval callbacks into bounded asynchronous human-response handling.

S4 has a hard feasibility gate: ordinary `thread/start`/`thread/fork` sessions
cannot substitute for official native children. Probe the actual supported host
tool/lifecycle contract. If it cannot enforce admission, single-depth delegation,
effective permissions, and evidence closure, stop S4 and retain host-owned
delegation. An upstream extension request is preferable to undocumented runtime
attachment. Do not block the measured S2 single-lane benefit on an unproven
multi-lane capability, or market S2 as complete Naruto integration.

## Contract and acceptance scenarios

The test implementation belongs to the listed slices; these criteria are
executable specifications, not passing tests shipped by this strategy PR. Use
fixture processes for deterministic faults and separately tagged real-host tests
for behavior that fixtures cannot establish. Every scenario must assert both
returned state and filesystem/journal side effects.

| ID / slice | Arrange and action | Required assertion |
| --- | --- | --- |
| A01 / S0 | Resolve package/runtime, generate exact-binary schema; remove a required response field or add an unknown approval variant | Capability error before admission; no turn sent; requested/effective runtime and schema hash recorded; no host auto-update |
| A02 / S1–S2 | Submit the same task/idempotency key concurrently from 20 clients; then send different tasks for one thread | One admitted intent and at most one upstream turn for the duplicate; distinct turns serialized; all observers converge on same result |
| A03 / S1 | Crash before send, after send before acknowledgment, after acknowledgment, after effect before terminal event; restart owner | Proven-unsent may retry; acknowledged/ambiguous mutations never automatically replay; history reconciliation or `terminal_uncertain`; dependencies blocked |
| A04 / S1–S2 | Deliver duplicate/reordered events and a late prior-owner completion; overflow/disconnect the bounded event buffer | Terminal state never regresses; artifacts not duplicated; fenced event cannot commit; gap visible and history read/reconciliation required |
| A05 / S2–S3 | Reject approval, grant a narrower scope, expire approval, change owner/policy before answer, request managed human checkpoint | No unauthorized command/write/network effect; exact request binding; fresh human response where required; unknown/unsupported variant fails closed |
| A06 / S2 | Exercise RPC timeout, idle timeout, task deadline, approval expiry, user cancel; provider ignores cancellation | Distinct reason/state; exact interrupt target; owned work aborts where supported; bounded shutdown and uncertain state if termination unproved; no false success |
| A07 / S2 | Two sequential turns in one scope; then change workspace/auth-binding/provider/policy/MCP revision | One initialized process reused for compatible turns; incompatible scope never reuses a thread; no secret values in identity/status/logs |
| A08 / S2–S3 | Request unsupported model/effort/tier/tool, unready provider, or cross-provider compacted history | Explicit blocker and recovery; no silent fallback, extra privilege, or foreign-history replay; actual parent selection preserved |
| A09 / S3 | Recall missing/stale/secret-bearing memory; request excessive tokens; child requests promotion/forget/align or symlink escape | Bounded, provenance-bound recall or explicit unavailable; no canonical mutation by child; tombstones take effect; confined path and redaction enforcement |
| A10 / S3–S4 | Two writers overlap a path/worktree or canonical store; independent reads have known side-effect-free contracts | Conflict serializes/blocks; only isolated writes run together; read-only hints cannot override tool classification; integration verifies exact artifact hashes |
| A11 / S4 | Root requests admitted native children and child requests another child; exhaust provider quota and reserve a GUI surface | Real official child evidence closes every requested child; nested spawn denied; backpressure does not invent success/counts; one GUI owner; independent stage schedule is repeatable |
| A12 / S5 | Launch CLI and Center together, relaunch Center during approval/write, close/quit it, replay stale callback and double click retry | Shared owner or explicit ownership refusal; no duplicate turn; approval not reused; state/quit semantics visible; resume requires current authorization; keyboard/accessibility flow works |
| A13 / S3–S6 | Roll back during queued, running, uncertain and terminal states; restore older reader after additive state migration | Admission stops; pending state preserved; no implicit re-execution; backup/downgrade reader compatibility proven; config/credentials/canonical memory preserved |
| A14 / every slice | Run existing scoped evidence/gate suites and compare baseline result | No fixture can be promoted to live evidence; SKS success still requires official lifecycle where requested, parent integration, scoped tests, valid artifacts and zero blockers |

Implement the new test files in existing directories. Once implemented, the
following is the intended maintainer invocation contract (the two new suites
must be added before treating this block as runnable):

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm run schema:check
node --test dist/core/codex-control/__tests__/codex-app-server-v2-client.test.js
node --test dist/core/codex-control/__tests__/codex-session-broker.test.js
node --test dist/core/codex-control/__tests__/codex-session-broker-recovery.test.js
node dist/scripts/codex-current-app-server-v2-check.js --require-real
npm test
```

The existing `--require-real` gate only initializes/lists threads today. S0/S2
must extend or accompany it with the real turn/approval/interrupt/resume cases
above, using a disposable fixture repository and explicit live-run consent.
New native acceptance cases belong in `native/sks-menubar/Tests` and `UITests`;
run them with the repository's macOS build/test tooling and attach real results.
Linux checks must not stand in for native execution or a live provider.

## Benchmark method and promotion thresholds

Measure baseline and candidate against identical task snapshots, runtime/model/
effort/service-tier/route/policy/MCP settings, host hardware/OS, project size,
network conditions and provider quota window. Record the exact SKS head,
upstream binary identity, schema/config revisions and cache policy. Keep cold
and warm runs separate; explicitly define a cold run as a fresh owned process
and empty candidate projection cache. Never clear real user state to simulate
it. Warm runs reuse one scope with validated caches.

Use public/synthetic fixture repositories, including: status/metadata-only;
one read-only turn; several sequential turns; bounded write plus verification;
missing/stale memory; interrupted turn/reconnect; denied permission; small and
wider admitted native DAGs. Include the existing benchmark tasks and maintainer
bench tooling where applicable; neither currently measures this broker end to
end. Live child benchmarks are deferred until S4's feasibility gate passes.

For local deterministic overhead collect at least 100 repetitions per case.
For live model cases collect at least 30 paired baseline/candidate runs per task
class, interleave/randomize order and report failed/censored/time-limited runs.
Publish sample counts, median/p95, dispersion and paired confidence intervals;
when the provider/noise window prevents a reliable conclusion, mark inconclusive
and do not make a speed claim. Preserve task-level quality scores with the same
scoped tests/artifact validator, and compare cost at equal successful outcomes.

Instrument separate timings for launch, handshake, metadata, policy/context
preparation, queue, provider request, first event/token, model/tool execution,
approval wait, verification and recovery. Record process/handshake/model-call
counts, cache hits/misses, prompt/output/cached tokens when reported, peak RSS,
CPU/I/O, queue depth, retries, duplicate work, orphan processes and failure class.
Do not sum overlapping spans as wall time. Report unknown usage as unknown.
Exclude approval wait from overhead while still reporting total user wait.

Promotion thresholds below are **design gates, not measured improvements**:

- Zero unauthorized effects, duplicate mutations, false-success claims,
  stale-owner writes, or secret leaks across all acceptance cases.
- All paired quality/gate outcomes meet baseline requirements. An unknown or
  skipped live/platform case blocks promotion of that capability.
- Warm compatible sequential turns use one process/initialize per scope, zero
  metadata-only model calls, and zero new model calls from status subscribers.
  Read-only shadow mode adds zero model calls and zero execution writes.
- Candidate local overhead p95 and peak RSS stay within 105% and 110% of their
  corresponding baseline case respectively. If reuse materially raises idle
  memory, bound idle eviction and rerun the affected cases before promotion.
- Live successful-outcome latency and token/cost distributions show no material
  regression (predeclare a 5% latency/cost margin); the paired interval must not
  leave a regression beyond that margin unresolved. Rate-limit outages and
  censored failures are reported, not discarded as outliers.
- Deterministic fault suite reconciles within its configured deadline, leaves
  zero owned orphans, and never converts uncertain work into a retry automatically.
  Absolute production timeout/SLO values require S0 data and host/provider tests.

A speed claim requires a measured paired benefit with task quality preserved;
meeting a non-regression gate alone is not a speedup. If process savings disappear
under model latency, ship only if measured reliability/UX benefit justifies the
stateful maintenance cost. Do not invent percentages from the architecture.

## Rollout, rollback, and support

Persist the selected transport per mission, defaulting to the current baseline
until its phase is promoted. Add an explicit operator-selectable experimental
transport setting through the existing command manifest/Center settings in S2;
its name/schema is to be reviewed there. Do not overload today's
`auto/current-session/standalone` preference to silently change transport.

For each promotion: record eligible scope, exact runtime/schema, A01–A14
applicable results, benchmark report, rollback receipt and unresolved cases.
Start with opt-in disposable workspaces, then bounded single-lane project work,
then separately admitted writes and native multi-lane work, then Center cutover.
The product contract's current best-effort multi-process guarantee only changes
after shared-owner acceptance passes. Source build success is not rollout proof.

On protocol drift, ownership conflict, permission mismatch, event gap with
uncertain effects, or quality/safety regression, stop new broker admission and
show the reason. Interrupt/drain only owned runs. Reconcile upstream history,
changed files, worktree checkpoints, and task evidence before releasing leases.
An uncertainty that cannot be resolved stays paused for operator review.

Disable the experimental transport for future tasks; resume the exact verified
scope or explicitly create a baseline task with a bounded handoff only after
reconciliation. Never auto-run the original prompt again. Preserve additive
journals and prior-reader compatibility; backup owned configuration before any
future migration and restore only unchanged, provably SKS-owned fields. Do not
overwrite newer OAuth state, credentials, user config, or canonical memory.
Do not conflate reverting an adapter with reverting filesystem or external effects.

Delete duplicate code only after an explicit support/rollback window and an
installed-package rollback drill. Keep evidence readers for retained records.
No merge, deployment, package publication, host upgrade, or wholesale runtime
rewrite is part of this strategy PR.
