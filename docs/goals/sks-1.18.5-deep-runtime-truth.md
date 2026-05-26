# SKS 1.18.5 Goal 지시서 — Deep Physical Runtime Wiring · Real-Smoke Reliability · Cleanup Escalation · AST-Aware Work Graph

> 대상 저장소: `mandarange/Sneakoscope-Codex`
> 현재 기준 버전: `1.18.4`
> 목표 버전: **`1.18.5`**
> 릴리스 성격: **1.18.4의 real-proof 도구들을 실제 orchestrator lifecycle에 완전 결합하고, fake/real 경계를 더 엄격히 하며, cleanup과 work graph를 실전 수준으로 끌어올리는 극단적 안정화 릴리스**
>
> 1.18.4 현재 상태 요약:
> - version은 1.18.4로 배포되어 있다.
> - real tmux physical proof, real Codex dynamic smoke, cleanup executor, intelligent work graph, fake-vs-real proof policy가 들어왔다.
> - 하지만 다음 릴리스에서는 “도구가 존재한다”를 넘어, **실제 route runtime / orchestrator lifecycle / release:real-check / Trust Report가 모두 같은 truth를 강제**해야 한다.
>
> 1.18.5 핵심 목표:
> - `writeTmuxPhysicalProof()`를 orchestrator lifecycle에 phase별로 연결한다.
> - real tmux smoke가 실제 pane/list/capture/drain-close를 검증하도록 만든다.
> - real Codex dynamic smoke의 신뢰도를 높이고 synthetic/fallback 경로를 더 엄격히 차단한다.
> - `sks agent cleanup/close`를 process-tree/tmux/session namespace aware executor로 강화한다.
> - intelligent work graph를 basename heuristic에서 AST/import/test ownership/changed-file criticality 기반으로 확장한다.
> - release readiness가 fake, fixture, integration_optional, proven을 한 화면에서 명확히 보여주게 한다.
> - P0~P5를 모두 닫는다.

---

## 0. Goal Command Payload

```bash
sks goal create "SKS 1.18.5 deep physical runtime wiring, real smoke reliability, cleanup escalation, AST-aware work graph" --from-file docs/goals/sks-1.18.5-deep-runtime-truth.md
```

Codex App / Codex CLI에는 다음처럼 전달한다.

```text
$Goal SKS 1.18.5 Deep Physical Runtime Wiring 업데이트를 수행한다. 1.18.4에는 real tmux physical proof, real codex dynamic smoke, cleanup executor, intelligent work graph, fake-vs-real proof policy가 들어왔지만, 아직 writeTmuxPhysicalProof가 orchestrator lifecycle에 직접 연결되어 before_drain/after_drain physical truth를 항상 생성하는지, real tmux pane id가 supervisor/manifest/launch ledger와 완전히 reconcile되는지, cleanup executor가 process tree와 tmux pane을 graceful->force escalation으로 실제 정리하는지, intelligent work graph가 AST/import/test ownership 수준으로 충분히 깊은지 개선이 필요하다. 1.18.5에서는 모든 real-proof 도구를 route runtime과 release readiness에 완전 결합하고, fake/real 경계를 절대 흐리지 않으며, P0~P5를 모두 닫는다.
```


## 1. 코드리뷰 기반 현재 1.18.4 평가

- [x] package.json version은 1.18.4다.
- [x] CHANGELOG.md는 1.18.4에서 real tmux physical proof, real Codex dynamic smoke, cleanup executor, intelligent work graph, fake-vs-real policy를 명시한다.
- [x] package.json release:real-check에는 agent:real-tmux-physical-proof, agent:tmux-pane-reconciliation, agent:tmux-lane-content-truth, agent:real-codex-dynamic-smoke가 포함되어 있다.
- [x] tmux-physical-proof.ts는 list-panes, capture-pane, pane reconciliation, lane content truth를 구현한다.
- [x] agent-cleanup-executor.ts는 stale process, tmux pane, temp dir, lock cleanup을 수행할 수 있다.
- [x] agent-command.ts는 close/cleanup action에서 runAgentCleanupExecutor를 호출한다.
- [x] intelligent-work-graph.ts는 test ownership, critical path, bottlenecks, route priority, quality score를 만든다.
- [x] fake-real-proof-policy.ts는 fake/proven/integration_optional/blocked proof levels를 구분한다.
- [x] agent-proof-evidence.ts는 tmux physical proof, cleanup proof, intelligent work graph, fake-real report를 읽는다.
- [x] 그러나 agent-orchestrator.ts의 import/flow에는 writeTmuxPhysicalProof가 직접 보이지 않는다.
- [x] 따라서 physical tmux proof artifact가 real tmux route lifecycle에서 항상 생성된다고 보기 어렵다.
- [x] real tmux smoke script는 agent-tmux-physical-proof.json을 읽는 구조이므로 orchestrator가 해당 artifact를 생성하지 않으면 실패할 수 있다.
- [x] cleanup executor는 SIGTERM 중심이며 process tree/grace period/SIGKILL escalation이 약하다.
- [x] intelligent work graph는 많이 좋아졌지만 test ownership은 basename heuristic 위주이며 AST-level symbol ownership은 아직 약하다.
- [x] real codex dynamic smoke는 opt-in이지만 fixture env를 사용하므로 proven vs fixture-instrumented 상태를 더 명확히 구분해야 한다.


## 2. 최종 성공 문장

SKS 1.18.5는 1.18.4에서 추가된 real-proof 도구들을 실제 orchestrator lifecycle에 완전히 결합한다. real tmux mode에서는 before/during/after drain physical pane proof가 자동 생성되고, real Codex dynamic smoke는 output-schema/result-file/terminal/process cleanup까지 proven 또는 integration_optional으로 정직하게 보고된다. cleanup은 process tree와 tmux panes를 실제로 정리하고, work graph는 AST/import/test ownership 기반으로 더 정확해진다.


## 3. 우선순위 체계

- [x] P0: physical runtime truth, real smoke correctness, cleanup safety, proof blockers.
- [x] P1: operator UX, dashboard, tmux/codex app visibility.
- [x] P2: performance, bounded real smoke, cleanup latency, graph computation budget.
- [x] P3: docs, migration, CLI help, troubleshooting.
- [x] P4: polish, summaries, trust report readability.
- [x] P5: regression catalog, long-tail fixtures, future compatibility.
- [x] P0~P5 모두 release readiness matrix에 완료 증거가 있어야 한다.
- [x] P0를 통과했어도 P1~P5가 누락되면 release readiness에서 경고가 아니라 blocker로 처리한다.


## 4. 절대 원칙

- [x] fake pane id를 real tmux proof로 인정하지 않는다.
- [x] agent-tmux-physical-proof.json이 없는데 tmux proof passed 금지.
- [x] writeTmuxPhysicalProof가 orchestrator lifecycle 밖에서만 실행되면 안 된다.
- [x] real tmux mode는 before_drain과 after_drain proof가 모두 있어야 한다.
- [x] capture-pane 없는 real tmux proof는 blocked 또는 integration_optional이다.
- [x] list-panes 없는 real tmux proof는 blocked 또는 integration_optional이다.
- [x] real Codex smoke에서 synthetic stdout fallback은 pass 금지.
- [x] real Codex smoke에서 output-last-message JSON parse failure는 pass 금지.
- [x] cleanup apply는 active session을 죽이면 안 된다.
- [x] cleanup apply는 foreign project namespace를 건드리면 안 된다.
- [x] cleanup은 SIGTERM 후 확인 없이 성공 처리하면 안 된다.
- [x] process tree cleanup은 child process까지 고려해야 한다.
- [x] intelligent work graph가 basename만 쓰면서 AST-aware라고 주장하면 안 된다.
- [x] fixture env를 사용한 real smoke는 fixture-instrumented-real로 명시한다.
- [x] integration_optional은 honest status여야 하며 fake pass로 대체하면 안 된다.


## 5. Version / Metadata

- [x] package.json version을 1.18.5로 올린다.
- [x] package-lock.json이 있으면 1.18.5로 정렬한다.
- [x] src/core/version.ts를 1.18.5로 올린다.
- [x] src/core/fsx.ts PACKAGE_VERSION을 1.18.5로 올린다.
- [x] crates/sks-core/Cargo.toml version을 1.18.5로 올린다.
- [x] crates/sks-core/src/main.rs --version 출력을 1.18.5로 정렬한다.
- [x] CHANGELOG.md에 [1.18.5] 섹션을 추가한다.
- [x] README.md Current Release를 1.18.5로 갱신한다.
- [x] docs/real-tmux-pane-proof.md를 1.18.5 lifecycle-wired 기준으로 갱신한다.
- [x] docs/real-codex-dynamic-smoke.md를 1.18.5 기준으로 갱신한다.
- [x] docs/agent-cleanup-executor.md를 process-tree escalation 기준으로 갱신한다.
- [x] docs/intelligent-work-graph.md를 AST-aware 기준으로 갱신한다.
- [x] docs/fake-vs-real-proof-policy.md를 fixture-instrumented-real 구분 기준으로 갱신한다.
- [x] release metadata check가 1.18.5를 요구하게 한다.


## 6. CHANGELOG 필수 섹션

```md
## [1.18.5] - YYYY-MM-DD

### Added
- Wire real tmux physical proof into the native agent orchestrator lifecycle with before-drain, drain, and after-drain phases.
- Add tmux physical proof phase artifacts: `agent-tmux-physical-proof-before-drain.json`, `agent-tmux-physical-proof-after-drain.json`, and reconciliation summary.
- Add real tmux pane id reconciliation across supervisor, lane manifest, launch ledger, list-panes, and capture-pane.
- Add real Codex dynamic smoke reliability checks for result-file parsing, output-schema validation, process cleanup, and fixture-instrumented-real status.
- Add process-tree-aware cleanup executor with graceful SIGTERM, bounded wait, SIGKILL escalation, tmux pane close verification, temp/lock cleanup, and namespace protection.
- Add AST/import/test ownership expansion for intelligent work graph.
- Add release readiness runtime truth matrix separating fixture_only, fixture_instrumented_real, proven, integration_optional, and blocked.

### Fixed
- Prevent real tmux smoke from depending on artifacts that the orchestrator did not create.
- Prevent cleanup executor from claiming success before process termination is verified.
- Prevent route work graph quality from being overclaimed when AST/test ownership evidence is shallow.
- Prevent real smoke fixture instrumentation from being reported as unqualified proven real runtime.
- Prevent fake-vs-real policy from missing cleanup and work graph proof quality.

### Changed
- Treat real-proof modules as part of orchestrator lifecycle, not standalone reports only.
- Treat cleanup as a safe, verifiable resource cleanup transaction.
- Treat intelligent work graph quality as a first-class trust signal.
```


## 7. P0 — Orchestrator-Lifecycle Tmux Physical Proof Wiring

- [x] agent-orchestrator.ts imports writeTmuxPhysicalProof.
- [x] Before scheduler starts, orchestrator writes tmux physical snapshot if backend tmux or tmux cockpit enabled.
- [x] On scheduler_draining event, orchestrator writes before_drain physical proof.
- [x] After drainTmuxLaneSupervisor, orchestrator writes after_drain physical proof.
- [x] After final tmux lane manifest update, orchestrator writes final physical proof summary.
- [x] Physical proof artifacts are linked in agent-proof-evidence.json.
- [x] Physical proof artifacts are linked in Trust Report.
- [x] Physical proof artifacts are linked in release readiness report.
- [x] If backend is tmux and real mode, missing before_drain proof blocks proof.
- [x] If backend is tmux and real mode, missing after_drain proof blocks proof.
- [x] If backend is fake/non-tmux, physical proof status is not_applicable or fake_fixture, never proven.
- [x] Orchestrator writes phase-specific files: before-drain, after-drain, final.
- [x] Orchestrator propagates realTmux=true only when backend tmux and opts.real true.
- [x] Orchestrator propagates required=true only in real smoke/release:real-check context.


## 8. P0 — Tmux Pane ID Reconciliation Hardening

- [x] Supervisor pane ids are reconciled with launch ledger pane ids.
- [x] Supervisor pane ids are reconciled with agent-tmux-lanes.json pane ids.
- [x] Supervisor pane ids are reconciled with tmux list-panes pane ids.
- [x] Capture-pane target pane ids must be listed in list-panes before drain.
- [x] Fake pane ids are blocked in real mode.
- [x] Real pane id format must match tmux pane id pattern.
- [x] Pane id mismatch creates `tmux_pane_id_reconciliation_failed` blocker.
- [x] Reconciliation report includes per-slot status.
- [x] Reconciliation report includes per-generation status.
- [x] Reconciliation report includes drain-before and drain-after state.
- [x] After drain, panes are either closed or explicitly marked drained.
- [x] After drain, remaining live panes create blocker unless orchestrator pane only is allowed.


## 9. P0 — Tmux Lane Content Truth

- [x] capture-pane content must include slot id.
- [x] capture-pane content must include current generation id or drained/idle state.
- [x] capture-pane content must include queue/pending/backfill summary.
- [x] capture-pane content must match lane.md for slot id.
- [x] capture-pane content must match lane.md for generation or status.
- [x] capture-pane content must not be stale after backfill event.
- [x] Lane content truth report includes stale_content boolean.
- [x] Lane content truth report includes capture artifact path per slot.
- [x] Capture artifacts are redacted and local-only.
- [x] Real mode capture missing blocks or integration_optional.
- [x] Fake mode capture is marked fake_capture.
- [x] Trust Report shows lane content truth summary.


## 10. P0 — Real Codex Dynamic Smoke Reliability

- [x] Real Codex dynamic smoke uses SKS_TEST_REAL_DYNAMIC_AGENTS=1.
- [x] Real Codex dynamic smoke report name updated to 1.18.5.
- [x] Real Codex smoke marks fixture delay env as fixture_instrumented_real, not plain proven.
- [x] Real Codex smoke requires codex exec --output-schema support.
- [x] Real Codex smoke requires output-last-message support.
- [x] Real Codex smoke requires every worker process report to have output_schema_used true.
- [x] Real Codex smoke requires every worker resultFile to exist.
- [x] Real Codex smoke parses every output-last-message JSON.
- [x] Real Codex smoke validates every agent result schema.
- [x] Real Codex smoke checks scheduler backfill count.
- [x] Real Codex smoke checks terminal close reports.
- [x] Real Codex smoke checks process cleanup after run.
- [x] Real Codex smoke checks no changed files in read-only mode.
- [x] Real Codex smoke checks source refs and goal refs.
- [x] Real Codex smoke writes result to .sneakoscope/reports/agent-real-codex-dynamic-smoke-1.18.5.json.
- [x] release:real-check includes this smoke.
- [x] If codex is missing, status is integration_optional.
- [x] If codex output schema unsupported, status is integration_optional unless required env is set.


## 11. P0 — Real Smoke Required Mode

- [x] Add env SKS_REQUIRE_REAL_DYNAMIC_AGENTS=1.
- [x] When SKS_REQUIRE_REAL_DYNAMIC_AGENTS=1, integration_optional becomes blocker.
- [x] Add env SKS_REQUIRE_REAL_TMUX=1.
- [x] When SKS_REQUIRE_REAL_TMUX=1, tmux missing/list-panes missing becomes blocker.
- [x] release:real-check default remains honest integration_optional.
- [x] CI can opt into required real mode.
- [x] Reports clearly show optional vs required real mode.


## 12. P0 — Process-Tree-Aware Cleanup Executor

- [x] cleanup executor records process tree per stale process.
- [x] cleanup executor sends SIGTERM first.
- [x] cleanup executor waits bounded grace period.
- [x] cleanup executor verifies process exited.
- [x] cleanup executor escalates to SIGKILL if process remains and apply mode enabled.
- [x] cleanup executor records SIGKILL escalation.
- [x] cleanup executor does not kill active sessions.
- [x] cleanup executor does not kill foreign namespace processes.
- [x] cleanup executor closes stale tmux panes and verifies with list-panes.
- [x] cleanup executor removes stale locks only after namespace check.
- [x] cleanup executor removes orphan temp dirs only after namespace check.
- [x] cleanup executor preserves terminal transcripts.
- [x] cleanup executor writes per-action before/after evidence.
- [x] cleanup executor supports --dry-run.
- [x] cleanup executor supports --apply.
- [x] cleanup executor supports --drain.
- [x] sks agent close latest --drain --apply --json executes cleanup executor.
- [x] sks agent cleanup latest --apply --json executes cleanup executor.


## 13. P0 — Cleanup Command UX and Safety

- [x] agent-command parser supports --apply.
- [x] agent-command parser supports --dry-run.
- [x] agent-command parser supports --drain.
- [x] agent-command parser supports --stale-ms.
- [x] close/cleanup output includes action count.
- [x] close/cleanup output includes applied count.
- [x] close/cleanup output includes skipped active sessions.
- [x] close/cleanup output includes skipped foreign namespace.
- [x] close/cleanup output includes blockers.
- [x] cleanup proof is linked to Trust Report.
- [x] cleanup proof is linked to fake-real proof policy.


## 14. P0 — AST-Aware Intelligent Work Graph

- [x] Add AST-aware lightweight parser for TypeScript/JavaScript import/export symbols.
- [x] Build file-to-symbol map.
- [x] Build symbol-to-file map.
- [x] Build exported API ownership map.
- [x] Build command-to-module ownership map.
- [x] Build route-to-module ownership map.
- [x] Build test-to-source relation beyond basename heuristic.
- [x] Use tsconfig paths if available.
- [x] Use package exports if available.
- [x] Use imports from dependency graph.
- [x] Detect critical command surface files.
- [x] Detect proof/agent/tmux/cleanup modules as high-priority domains.
- [x] Detect changed files from git diff.
- [x] Propagate changed file criticality into work item priority.
- [x] Assign verifier work to relevant tests.
- [x] Assign integrator work to bottleneck modules.
- [x] Record AST parser limitations honestly.
- [x] Quality score includes AST coverage.
- [x] Quality score includes test ownership confidence.
- [x] Quality score includes critical path confidence.
- [x] Quality score below threshold creates partial proof.


## 15. P0 — Work Graph → Task Graph Integration

- [x] Intelligent work graph influences task graph priority.
- [x] Intelligent work graph influences required persona category.
- [x] Intelligent work graph influences dependencies.
- [x] Intelligent work graph influences lease requirements.
- [x] Critical path tasks are scheduled early.
- [x] Integration bottleneck tasks go to integrator/release persona.
- [x] Test ownership tasks go to verifier/test-runner persona.
- [x] Changed-file tasks get higher priority.
- [x] Work graph artifacts are linked in agent-task-graph.json.
- [x] Work graph artifacts are linked in agent-proof-evidence.json.
- [x] Work graph quality score appears in Trust Report.


## 16. P0 — Fake vs Real Proof Policy v2

- [x] Add proof level fixture_instrumented_real.
- [x] Add proof level real_required_missing.
- [x] Fake backend remains fixture_only.
- [x] Mock route blackbox remains fixture_only.
- [x] Real Codex smoke with fixture delay env becomes fixture_instrumented_real.
- [x] Real Codex smoke without fixture delay but real backend becomes proven if all conditions pass.
- [x] Real tmux proof with list/capture/reconcile becomes proven.
- [x] Integration optional remains honest.
- [x] If required real env is set and real unavailable, proof becomes blocked.
- [x] Fake-vs-real report includes cleanup proof level.
- [x] Fake-vs-real report includes work graph proof level.
- [x] Release readiness shows proof level per subsystem.


## 17. P1 — Operator UX

- [x] Agent dashboard shows real/fake/integration_optional/proven status per subsystem.
- [x] Agent dashboard shows tmux physical pane status.
- [x] Agent dashboard shows real Codex smoke status if available.
- [x] Agent dashboard shows cleanup executor latest action.
- [x] Agent dashboard shows work graph quality score and warnings.
- [x] Tmux lane displays physical pane verified marker.
- [x] Trust Report groups runtime truth into Fake, Optional, Proven, Blocked.
- [x] CLI final output includes cleanup next action if stale resources remain.
- [x] CLI final output includes real smoke next action if optional.


## 18. P2 — Performance / Bounded Cost

- [x] Real Codex smoke defaults to 2 active / 3 work items.
- [x] Full real Codex smoke gated by explicit --full or env.
- [x] Real tmux smoke bounded by timeout env.
- [x] AST work graph has file budget.
- [x] AST work graph caches inventory within mission.
- [x] Cleanup process tree scan has max process budget.
- [x] Capture-pane output capped.
- [x] Release real-check has configurable timeout.


## 19. P3 — Documentation / Troubleshooting

- [x] Docs explain proof levels.
- [x] Docs explain real tmux required env.
- [x] Docs explain real Codex required env.
- [x] Docs explain cleanup dry-run/apply.
- [x] Docs explain AST work graph quality score.
- [x] Docs explain integration_optional vs proven.
- [x] Troubleshooting for tmux list-panes missing.
- [x] Troubleshooting for capture-pane mismatch.
- [x] Troubleshooting for Codex output-last-message missing.
- [x] Troubleshooting for cleanup skipped active sessions.


## 20. P4/P5 — Polish / Regression Catalog

- [x] Regression: fake pane id cannot satisfy real tmux.
- [x] Regression: capture-pane stale content blocks proof.
- [x] Regression: real codex missing result file blocks required mode.
- [x] Regression: cleanup SIGTERM success verified.
- [x] Regression: cleanup SIGKILL escalation recorded.
- [x] Regression: AST parser limitation lowers work graph quality.
- [x] Regression: integration optional shown honestly.
- [x] Release readiness includes subsystem proof levels.
- [x] Maintainer guide updated with 1.18.5 gates.


## 21. Release Gates

`package.json` scripts에 다음을 추가/강화한다.

```json
{
  "scripts": {
    "agent:tmux-physical-lifecycle-wired": "node ./scripts/agent-tmux-physical-lifecycle-wired-check.mjs",
    "agent:tmux-physical-proof-v2": "node ./scripts/agent-tmux-physical-proof-v2-check.mjs",
    "agent:real-codex-dynamic-smoke-v2": "node ./scripts/agent-real-codex-dynamic-smoke-v2-check.mjs",
    "agent:cleanup-executor-v2": "node ./scripts/agent-cleanup-executor-v2-check.mjs",
    "agent:cleanup-command-ux": "node ./scripts/agent-cleanup-command-ux-check.mjs",
    "agent:ast-aware-work-graph": "node ./scripts/agent-ast-aware-work-graph-check.mjs",
    "proof:fake-real-policy-v2": "node ./scripts/fake-real-proof-policy-v2-check.mjs",
    "release:runtime-truth-matrix": "node ./scripts/release-runtime-truth-matrix-check.mjs"
  }
}
```

`release:check`에 포함한다.

```text
[x] agent:cleanup-executor-v2
[x] agent:cleanup-command-ux
[x] agent:ast-aware-work-graph
[x] proof:fake-real-policy-v2
[x] release:runtime-truth-matrix
```

`release:real-check`에 포함한다.

```text
[x] agent:tmux-physical-lifecycle-wired
[x] agent:tmux-physical-proof-v2
[x] agent:real-codex-dynamic-smoke-v2
```


## 22. Required Tests

- [x] test/unit/tmux-physical-proof-v2.test.ts
- [x] test/unit/fake-real-proof-policy-v2.test.ts
- [x] test/unit/agent-cleanup-executor-v2.test.ts
- [x] test/unit/ast-aware-work-graph.test.ts
- [x] test/unit/runtime-truth-matrix.test.ts
- [x] test/integration/agent-cleanup-apply.test.ts
- [x] test/integration/tmux-physical-lifecycle-wired.test.ts
- [x] test/integration/ast-work-graph-route.test.ts
- [x] test/integration/fake-real-policy-v2.test.ts
- [x] test/blackbox/agent-cleanup-command-ux-packed.test.mjs
- [x] test/blackbox/ast-aware-work-graph-packed.test.mjs
- [x] test/blackbox/runtime-truth-matrix-packed.test.mjs
- [x] test/real/agent-tmux-physical-proof-v2.test.mjs
- [x] test/real/agent-real-codex-dynamic-smoke-v2.test.mjs


## 23. 상세 Task Matrix

- [x] tmux-physical-lifecycle: design 구현/검증
- [x] tmux-physical-lifecycle: schema 구현/검증
- [x] tmux-physical-lifecycle: module 구현/검증
- [x] tmux-physical-lifecycle: artifact 구현/검증
- [x] tmux-physical-lifecycle: unit-test 구현/검증
- [x] tmux-physical-lifecycle: integration-test 구현/검증
- [x] tmux-physical-lifecycle: blackbox-test 구현/검증
- [x] tmux-physical-lifecycle: real-smoke-test 구현/검증
- [x] tmux-physical-lifecycle: negative-fixture 구현/검증
- [x] tmux-physical-lifecycle: positive-fixture 구현/검증
- [x] tmux-physical-lifecycle: release-gate 구현/검증
- [x] tmux-physical-lifecycle: docs 구현/검증
- [x] tmux-physical-lifecycle: proof-link 구현/검증
- [x] tmux-physical-lifecycle: trust-link 구현/검증
- [x] tmux-physical-lifecycle: wrongness 구현/검증
- [x] tmux-physical-lifecycle: next-action 구현/검증
- [x] tmux-physical-lifecycle: performance-budget 구현/검증
- [x] tmux-pane-reconcile-v2: design 구현/검증
- [x] tmux-pane-reconcile-v2: schema 구현/검증
- [x] tmux-pane-reconcile-v2: module 구현/검증
- [x] tmux-pane-reconcile-v2: artifact 구현/검증
- [x] tmux-pane-reconcile-v2: unit-test 구현/검증
- [x] tmux-pane-reconcile-v2: integration-test 구현/검증
- [x] tmux-pane-reconcile-v2: blackbox-test 구현/검증
- [x] tmux-pane-reconcile-v2: real-smoke-test 구현/검증
- [x] tmux-pane-reconcile-v2: negative-fixture 구현/검증
- [x] tmux-pane-reconcile-v2: positive-fixture 구현/검증
- [x] tmux-pane-reconcile-v2: release-gate 구현/검증
- [x] tmux-pane-reconcile-v2: docs 구현/검증
- [x] tmux-pane-reconcile-v2: proof-link 구현/검증
- [x] tmux-pane-reconcile-v2: trust-link 구현/검증
- [x] tmux-pane-reconcile-v2: wrongness 구현/검증
- [x] tmux-pane-reconcile-v2: next-action 구현/검증
- [x] tmux-pane-reconcile-v2: performance-budget 구현/검증
- [x] tmux-capture-truth-v2: design 구현/검증
- [x] tmux-capture-truth-v2: schema 구현/검증
- [x] tmux-capture-truth-v2: module 구현/검증
- [x] tmux-capture-truth-v2: artifact 구현/검증
- [x] tmux-capture-truth-v2: unit-test 구현/검증
- [x] tmux-capture-truth-v2: integration-test 구현/검증
- [x] tmux-capture-truth-v2: blackbox-test 구현/검증
- [x] tmux-capture-truth-v2: real-smoke-test 구현/검증
- [x] tmux-capture-truth-v2: negative-fixture 구현/검증
- [x] tmux-capture-truth-v2: positive-fixture 구현/검증
- [x] tmux-capture-truth-v2: release-gate 구현/검증
- [x] tmux-capture-truth-v2: docs 구현/검증
- [x] tmux-capture-truth-v2: proof-link 구현/검증
- [x] tmux-capture-truth-v2: trust-link 구현/검증
- [x] tmux-capture-truth-v2: wrongness 구현/검증
- [x] tmux-capture-truth-v2: next-action 구현/검증
- [x] tmux-capture-truth-v2: performance-budget 구현/검증
- [x] real-codex-smoke-v2: design 구현/검증
- [x] real-codex-smoke-v2: schema 구현/검증
- [x] real-codex-smoke-v2: module 구현/검증
- [x] real-codex-smoke-v2: artifact 구현/검증
- [x] real-codex-smoke-v2: unit-test 구현/검증
- [x] real-codex-smoke-v2: integration-test 구현/검증
- [x] real-codex-smoke-v2: blackbox-test 구현/검증
- [x] real-codex-smoke-v2: real-smoke-test 구현/검증
- [x] real-codex-smoke-v2: negative-fixture 구현/검증
- [x] real-codex-smoke-v2: positive-fixture 구현/검증
- [x] real-codex-smoke-v2: release-gate 구현/검증
- [x] real-codex-smoke-v2: docs 구현/검증
- [x] real-codex-smoke-v2: proof-link 구현/검증
- [x] real-codex-smoke-v2: trust-link 구현/검증
- [x] real-codex-smoke-v2: wrongness 구현/검증
- [x] real-codex-smoke-v2: next-action 구현/검증
- [x] real-codex-smoke-v2: performance-budget 구현/검증
- [x] cleanup-executor-v2: design 구현/검증
- [x] cleanup-executor-v2: schema 구현/검증
- [x] cleanup-executor-v2: module 구현/검증
- [x] cleanup-executor-v2: artifact 구현/검증
- [x] cleanup-executor-v2: unit-test 구현/검증
- [x] cleanup-executor-v2: integration-test 구현/검증
- [x] cleanup-executor-v2: blackbox-test 구현/검증
- [x] cleanup-executor-v2: real-smoke-test 구현/검증
- [x] cleanup-executor-v2: negative-fixture 구현/검증
- [x] cleanup-executor-v2: positive-fixture 구현/검증
- [x] cleanup-executor-v2: release-gate 구현/검증
- [x] cleanup-executor-v2: docs 구현/검증
- [x] cleanup-executor-v2: proof-link 구현/검증
- [x] cleanup-executor-v2: trust-link 구현/검증
- [x] cleanup-executor-v2: wrongness 구현/검증
- [x] cleanup-executor-v2: next-action 구현/검증
- [x] cleanup-executor-v2: performance-budget 구현/검증
- [x] cleanup-command-ux: design 구현/검증
- [x] cleanup-command-ux: schema 구현/검증
- [x] cleanup-command-ux: module 구현/검증
- [x] cleanup-command-ux: artifact 구현/검증
- [x] cleanup-command-ux: unit-test 구현/검증
- [x] cleanup-command-ux: integration-test 구현/검증
- [x] cleanup-command-ux: blackbox-test 구현/검증
- [x] cleanup-command-ux: real-smoke-test 구현/검증
- [x] cleanup-command-ux: negative-fixture 구현/검증
- [x] cleanup-command-ux: positive-fixture 구현/검증
- [x] cleanup-command-ux: release-gate 구현/검증
- [x] cleanup-command-ux: docs 구현/검증
- [x] cleanup-command-ux: proof-link 구현/검증
- [x] cleanup-command-ux: trust-link 구현/검증
- [x] cleanup-command-ux: wrongness 구현/검증
- [x] cleanup-command-ux: next-action 구현/검증
- [x] cleanup-command-ux: performance-budget 구현/검증
- [x] ast-aware-work-graph: design 구현/검증
- [x] ast-aware-work-graph: schema 구현/검증
- [x] ast-aware-work-graph: module 구현/검증
- [x] ast-aware-work-graph: artifact 구현/검증
- [x] ast-aware-work-graph: unit-test 구현/검증
- [x] ast-aware-work-graph: integration-test 구현/검증
- [x] ast-aware-work-graph: blackbox-test 구현/검증
- [x] ast-aware-work-graph: real-smoke-test 구현/검증
- [x] ast-aware-work-graph: negative-fixture 구현/검증
- [x] ast-aware-work-graph: positive-fixture 구현/검증
- [x] ast-aware-work-graph: release-gate 구현/검증
- [x] ast-aware-work-graph: docs 구현/검증
- [x] ast-aware-work-graph: proof-link 구현/검증
- [x] ast-aware-work-graph: trust-link 구현/검증
- [x] ast-aware-work-graph: wrongness 구현/검증
- [x] ast-aware-work-graph: next-action 구현/검증
- [x] ast-aware-work-graph: performance-budget 구현/검증
- [x] fake-real-policy-v2: design 구현/검증
- [x] fake-real-policy-v2: schema 구현/검증
- [x] fake-real-policy-v2: module 구현/검증
- [x] fake-real-policy-v2: artifact 구현/검증
- [x] fake-real-policy-v2: unit-test 구현/검증
- [x] fake-real-policy-v2: integration-test 구현/검증
- [x] fake-real-policy-v2: blackbox-test 구현/검증
- [x] fake-real-policy-v2: real-smoke-test 구현/검증
- [x] fake-real-policy-v2: negative-fixture 구현/검증
- [x] fake-real-policy-v2: positive-fixture 구현/검증
- [x] fake-real-policy-v2: release-gate 구현/검증
- [x] fake-real-policy-v2: docs 구현/검증
- [x] fake-real-policy-v2: proof-link 구현/검증
- [x] fake-real-policy-v2: trust-link 구현/검증
- [x] fake-real-policy-v2: wrongness 구현/검증
- [x] fake-real-policy-v2: next-action 구현/검증
- [x] fake-real-policy-v2: performance-budget 구현/검증
- [x] runtime-truth-matrix: design 구현/검증
- [x] runtime-truth-matrix: schema 구현/검증
- [x] runtime-truth-matrix: module 구현/검증
- [x] runtime-truth-matrix: artifact 구현/검증
- [x] runtime-truth-matrix: unit-test 구현/검증
- [x] runtime-truth-matrix: integration-test 구현/검증
- [x] runtime-truth-matrix: blackbox-test 구현/검증
- [x] runtime-truth-matrix: real-smoke-test 구현/검증
- [x] runtime-truth-matrix: negative-fixture 구현/검증
- [x] runtime-truth-matrix: positive-fixture 구현/검증
- [x] runtime-truth-matrix: release-gate 구현/검증
- [x] runtime-truth-matrix: docs 구현/검증
- [x] runtime-truth-matrix: proof-link 구현/검증
- [x] runtime-truth-matrix: trust-link 구현/검증
- [x] runtime-truth-matrix: wrongness 구현/검증
- [x] runtime-truth-matrix: next-action 구현/검증
- [x] runtime-truth-matrix: performance-budget 구현/검증
- [x] operator-ux: design 구현/검증
- [x] operator-ux: schema 구현/검증
- [x] operator-ux: module 구현/검증
- [x] operator-ux: artifact 구현/검증
- [x] operator-ux: unit-test 구현/검증
- [x] operator-ux: integration-test 구현/검증
- [x] operator-ux: blackbox-test 구현/검증
- [x] operator-ux: real-smoke-test 구현/검증
- [x] operator-ux: negative-fixture 구현/검증
- [x] operator-ux: positive-fixture 구현/검증
- [x] operator-ux: release-gate 구현/검증
- [x] operator-ux: docs 구현/검증
- [x] operator-ux: proof-link 구현/검증
- [x] operator-ux: trust-link 구현/검증
- [x] operator-ux: wrongness 구현/검증
- [x] operator-ux: next-action 구현/검증
- [x] operator-ux: performance-budget 구현/검증
- [x] docs: design 구현/검증
- [x] docs: schema 구현/검증
- [x] docs: module 구현/검증
- [x] docs: artifact 구현/검증
- [x] docs: unit-test 구현/검증
- [x] docs: integration-test 구현/검증
- [x] docs: blackbox-test 구현/검증
- [x] docs: real-smoke-test 구현/검증
- [x] docs: negative-fixture 구현/검증
- [x] docs: positive-fixture 구현/검증
- [x] docs: release-gate 구현/검증
- [x] docs: docs 구현/검증
- [x] docs: proof-link 구현/검증
- [x] docs: trust-link 구현/검증
- [x] docs: wrongness 구현/검증
- [x] docs: next-action 구현/검증
- [x] docs: performance-budget 구현/검증
- [x] regressions: design 구현/검증
- [x] regressions: schema 구현/검증
- [x] regressions: module 구현/검증
- [x] regressions: artifact 구현/검증
- [x] regressions: unit-test 구현/검증
- [x] regressions: integration-test 구현/검증
- [x] regressions: blackbox-test 구현/검증
- [x] regressions: real-smoke-test 구현/검증
- [x] regressions: negative-fixture 구현/검증
- [x] regressions: positive-fixture 구현/검증
- [x] regressions: release-gate 구현/검증
- [x] regressions: docs 구현/검증
- [x] regressions: proof-link 구현/검증
- [x] regressions: trust-link 구현/검증
- [x] regressions: wrongness 구현/검증
- [x] regressions: next-action 구현/검증
- [x] regressions: performance-budget 구현/검증
- [x] tmux physical truth fixture 1: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 1: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 1: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 1: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 2: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 2: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 2: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 2: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 3: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 3: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 3: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 3: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 4: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 4: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 4: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 4: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 5: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 5: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 5: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 5: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 6: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 6: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 6: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 6: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 7: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 7: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 7: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 7: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 8: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 8: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 8: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 8: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 9: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 9: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 9: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 9: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 10: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 10: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 10: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 10: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 11: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 11: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 11: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 11: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 12: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 12: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 12: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 12: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 13: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 13: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 13: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 13: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 14: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 14: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 14: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 14: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 15: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 15: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 15: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 15: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 16: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 16: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 16: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 16: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 17: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 17: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 17: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 17: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 18: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 18: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 18: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 18: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 19: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 19: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 19: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 19: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 20: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 20: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 20: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 20: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 21: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 21: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 21: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 21: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 22: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 22: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 22: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 22: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 23: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 23: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 23: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 23: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 24: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 24: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 24: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 24: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 25: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 25: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 25: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 25: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 26: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 26: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 26: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 26: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 27: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 27: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 27: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 27: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 28: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 28: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 28: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 28: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 29: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 29: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 29: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 29: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 30: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 30: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 30: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 30: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 31: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 31: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 31: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 31: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 32: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 32: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 32: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 32: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 33: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 33: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 33: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 33: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 34: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 34: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 34: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 34: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 35: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 35: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 35: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 35: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 36: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 36: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 36: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 36: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 37: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 37: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 37: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 37: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 38: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 38: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 38: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 38: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 39: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 39: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 39: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 39: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 40: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 40: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 40: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 40: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 41: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 41: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 41: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 41: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 42: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 42: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 42: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 42: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 43: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 43: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 43: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 43: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 44: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 44: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 44: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 44: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 45: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 45: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 45: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 45: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 46: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 46: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 46: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 46: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 47: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 47: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 47: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 47: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 48: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 48: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 48: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 48: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 49: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 49: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 49: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 49: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 50: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 50: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 50: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 50: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 51: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 51: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 51: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 51: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 52: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 52: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 52: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 52: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 53: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 53: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 53: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 53: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 54: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 54: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 54: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 54: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 55: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 55: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 55: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 55: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 56: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 56: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 56: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 56: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 57: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 57: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 57: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 57: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 58: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 58: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 58: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 58: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 59: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 59: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 59: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 59: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 60: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 60: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 60: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 60: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 61: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 61: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 61: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 61: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 62: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 62: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 62: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 62: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 63: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 63: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 63: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 63: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 64: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 64: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 64: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 64: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 65: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 65: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 65: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 65: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 66: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 66: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 66: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 66: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 67: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 67: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 67: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 67: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 68: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 68: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 68: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 68: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 69: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 69: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 69: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 69: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 70: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 70: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 70: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 70: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 71: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 71: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 71: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 71: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 72: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 72: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 72: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 72: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 73: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 73: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 73: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 73: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 74: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 74: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 74: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 74: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 75: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 75: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 75: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 75: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 76: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 76: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 76: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 76: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 77: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 77: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 77: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 77: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 78: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 78: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 78: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 78: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 79: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 79: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 79: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 79: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 80: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 80: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 80: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 80: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 81: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 81: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 81: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 81: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 82: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 82: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 82: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 82: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 83: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 83: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 83: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 83: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 84: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 84: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 84: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 84: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 85: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 85: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 85: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 85: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 86: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 86: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 86: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 86: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 87: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 87: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 87: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 87: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 88: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 88: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 88: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 88: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 89: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 89: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 89: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 89: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 90: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 90: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 90: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 90: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 91: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 91: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 91: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 91: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 92: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 92: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 92: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 92: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 93: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 93: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 93: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 93: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 94: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 94: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 94: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 94: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 95: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 95: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 95: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 95: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 96: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 96: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 96: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 96: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 97: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 97: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 97: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 97: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 98: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 98: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 98: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 98: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 99: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 99: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 99: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 99: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 100: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 100: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 100: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 100: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 101: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 101: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 101: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 101: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 102: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 102: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 102: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 102: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 103: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 103: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 103: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 103: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 104: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 104: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 104: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 104: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 105: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 105: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 105: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 105: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 106: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 106: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 106: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 106: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 107: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 107: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 107: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 107: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 108: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 108: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 108: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 108: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 109: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 109: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 109: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 109: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 110: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 110: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 110: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 110: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 111: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 111: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 111: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 111: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 112: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 112: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 112: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 112: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 113: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 113: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 113: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 113: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 114: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 114: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 114: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 114: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 115: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 115: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 115: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 115: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 116: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 116: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 116: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 116: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 117: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 117: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 117: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 117: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 118: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 118: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 118: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 118: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 119: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 119: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 119: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 119: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 120: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 120: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 120: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 120: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 121: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 121: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 121: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 121: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 122: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 122: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 122: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 122: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 123: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 123: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 123: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 123: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 124: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 124: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 124: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 124: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 125: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 125: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 125: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 125: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 126: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 126: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 126: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 126: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 127: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 127: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 127: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 127: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 128: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 128: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 128: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 128: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 129: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 129: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 129: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 129: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 130: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 130: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 130: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 130: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 131: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 131: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 131: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 131: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 132: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 132: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 132: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 132: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 133: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 133: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 133: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 133: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 134: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 134: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 134: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 134: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 135: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 135: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 135: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 135: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 136: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 136: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 136: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 136: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 137: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 137: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 137: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 137: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 138: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 138: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 138: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 138: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 139: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 139: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 139: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 139: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 140: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 140: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 140: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 140: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 141: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 141: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 141: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 141: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 142: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 142: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 142: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 142: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 143: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 143: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 143: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 143: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 144: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 144: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 144: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 144: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 145: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 145: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 145: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 145: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 146: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 146: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 146: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 146: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 147: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 147: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 147: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 147: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 148: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 148: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 148: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 148: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 149: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 149: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 149: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 149: symbol/test/critical-path ownership 검증
- [x] tmux physical truth fixture 150: before/after drain list/capture/reconcile 검증
- [x] real codex truth fixture 150: result file/schema/process cleanup 검증
- [x] cleanup escalation fixture 150: SIGTERM/wait/SIGKILL/namespace safety 검증
- [x] work graph AST fixture 150: symbol/test/critical-path ownership 검증


## 24. Done Definition

- [x] version 1.18.5 everywhere.
- [x] tmux physical proof is orchestrator-lifecycle wired.
- [x] real tmux proof has before-drain and after-drein phase artifacts.
- [x] pane reconciliation v2 implemented.
- [x] lane content truth v2 implemented.
- [x] real Codex dynamic smoke v2 implemented.
- [x] fixture_instrumented_real proof level implemented.
- [x] cleanup executor v2 implemented.
- [x] cleanup command UX supports apply/dry-run/drain/stale-ms.
- [x] AST-aware work graph implemented.
- [x] fake-real policy v2 implemented.
- [x] runtime truth matrix implemented.
- [x] release:check passes.
- [x] release:real-check honest reports proven/integration_optional/blocked.


## 25. Final Report Format

```md
# SKS 1.18.5 Runtime Truth Report

## Version
- Previous: 1.18.4
- New: 1.18.5

## Proof Levels
| Subsystem | Level | Evidence |
| --- | --- | --- |
| tmux physical | proven/integration_optional/blocked | ... |
| codex dynamic | proven/fixture_instrumented_real/integration_optional/blocked | ... |
| cleanup | proven/blocked | ... |
| work graph | proven/partial/blocked | ... |

## Tmux Physical
- before drain proof:
- capture-pane:
- list-panes:
- pane reconciliation:
- after drain proof:

## Real Codex Smoke
- output schema:
- output-last-message:
- scheduler backfill:
- terminal close:
- cleanup:

## Cleanup Executor
- SIGTERM:
- SIGKILL:
- tmux panes:
- temp dirs:
- locks:
- skipped active:
- skipped foreign:

## Work Graph
- AST coverage:
- test ownership:
- critical path:
- bottlenecks:
- quality score:

## Release Gates
| Command | Result |
| --- | --- |
| agent:cleanup-executor-v2 | pass/fail |
| agent:ast-aware-work-graph | pass/fail |
| proof:fake-real-policy-v2 | pass/fail |
| release:runtime-truth-matrix | pass/fail |
| release:real-check | pass/fail/integration_optional |
```
