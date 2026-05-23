# SKS 1.14.1 Addendum — Scout / Multi-Session Official Syntax Repair · Parallel Engine Stability · Codex Session Semantics

> 적용 대상: 기존 `SKS 1.14.1 Extreme Stabilization Release Goal 지시서`에 **추가로 붙일 addendum**
> 현재 기준 버전: `1.14.0`
> 목표 버전: **`1.14.1`**
> 추가 목표: **Scout / multi-session / parallel subagent 실행 경로를 최신 Codex 공식 문법과 SKS evidence/proof kernel에 맞게 안정화한다.**
> 핵심 원칙: **Scout는 “멀티 세션으로 빠르게 돌린다”가 아니라, 각 세션의 lifecycle, output schema, artifact isolation, read-only guard, consensus, benchmark, proof linkage가 정확해야 한다.**

---

## 0. Addendum Goal Command Payload

```bash
sks goal create "SKS 1.14.1 addendum: Scout multi-session official syntax and parallel engine stability" --from-file docs/goals/sks-1.14.1-scout-multisession-official-syntax-addendum.md
```

Codex App / Codex CLI에는 다음처럼 전달한다.

```text
$Goal 기존 SKS 1.14.1 Extreme Stabilization Release Goal에 이 Scout/Multi-Session addendum을 추가 적용한다. 현재 Scout/Five-Scout/Multi-session 경로를 코드리뷰하여, Codex 0.132+ `codex exec resume --output-schema`, Codex 0.133 compatibility, Codex App Subagent capability descriptor, tmux lane session lifecycle, read-only guard, output artifact isolation, benchmark isolation, proof/trust linkage가 최신 문법과 실제 실행 방식에 맞게 동작하도록 수정한다. 특히 `scouts bench`가 동일 mission artifact를 parallel/sequential run으로 덮어쓰는 문제, Codex exec parallel이 session id/resume/output-schema를 명확히 관리하지 않는 문제, subagent/tmux/codex exec outputs가 schema-bound가 아닌 문제를 P0로 해결한다.
```


## 1. 코드리뷰 기반 문제 요약

- [x] 현재 `scoutsCommand`는 `run`, `bench`, `status`, `validate` 등을 제공하고, `runFiveScoutIntake()`를 통해 `codex-exec-parallel`, `tmux-lanes`, `codex-app-subagents`, `local-static` 엔진을 선택한다.
- [x] `scouts bench`는 동일 mission id에서 parallel run과 sequential run을 연속 실행한다.
- [x] `runFiveScoutIntake()`는 실행 시작 때 scout ledger를 reset하고 canonical artifacts를 다시 쓴다.
- [x] 따라서 `scouts bench`에서 parallel 결과가 sequential fallback 실행에 의해 mission artifact 측면에서 덮어쓰일 수 있다.
- [x] 현재 `codex-exec-parallel-engine`은 role별 `runCodexExec()`를 parallel로 호출하지만, session id, resume id, output-schema, run namespace가 명확히 artifact로 남지 않는다.
- [x] 현재 `codex-app-subagent-engine`은 capability descriptor의 `launch_command`를 사용하지만, descriptor schema가 실제 Codex App 최신 subagent/session lifecycle과 맞는지 검증이 약하다.
- [x] 현재 Scout 결과 parser는 output file을 읽어 structured result로 변환하지만, Codex 0.132+ `--output-schema`를 preferred path로 강제하지 않는다.
- [x] 현재 real_parallel/speedup claim은 존재하지만, parallel/sequential baseline artifacts가 run namespace별로 분리되지 않아 proof graph가 혼동될 수 있다.
- [x] 현재 scout output logs와 mission artifacts는 role별 이름만으로 저장되며, engine run id, session id, lane id가 강하지 않다.
- [x] 현재 read-only guard는 실행 전후 snapshot을 사용하지만, external engine이 root 외부나 remote workspace에서 작업할 때 경계 검증이 더 필요하다.


## 2. 최종 성공 문장

> SKS 1.14.1 Scout/Multi-Session addendum 완료 후 Five-Scout는 Codex exec, Codex App subagent, tmux lane, local-static 엔진 모두에서 session lifecycle과 output schema를 명확히 기록하고, parallel/sequential benchmark artifacts를 서로 덮어쓰지 않으며, Codex 최신 `resume --output-schema` 문법과 SKS proof/evidence/trust graph에 맞춰 warning-free, read-only, schema-bound multi-session intake로 동작한다.


## 3. 절대 원칙

- [x] 같은 mission에서 parallel/sequential benchmark가 canonical scout artifacts를 서로 덮어쓰면 안 된다.
- [x] Scout engine run마다 고유 `engine_run_id`를 가져야 한다.
- [x] Scout role run마다 고유 `scout_session_id` 또는 `lane_id`를 가져야 한다.
- [x] Codex exec real engine은 가능하면 `--output-schema`를 사용해야 한다.
- [x] Codex exec real engine은 가능하면 session id/resume id를 artifact로 기록해야 한다.
- [x] Codex App subagent engine은 capability descriptor 없이는 real_parallel claim을 하면 안 된다.
- [x] tmux lane engine은 lane 이름, socket/session, pane id, command, output path를 artifact로 기록해야 한다.
- [x] mock/local-static run은 real speedup claim을 하면 안 된다.
- [x] source-string check만으로 Scout multi-session 안정성을 pass하지 않는다.
- [x] Scout output schema invalid이면 consensus/proof로 승격하지 않는다.
- [x] read-only guard fail이면 scout gate는 blocked다.
- [x] external engine stderr/stdout에 secret이 남으면 release fail이다.
- [x] multi-session timeout/rejection은 structured blocker로 기록되어야 한다.
- [x] partial scout completion은 `verified_partial` 또는 blocked로 처리한다.
- [x] Scout benchmark는 canonical intake artifacts가 아니라 benchmark-specific artifacts를 써야 한다.


## 4. P0 — Scout Engine Run Namespace / Artifact Isolation

- [x] 새 type `ScoutEngineRunId`를 정의한다.
- [x] 각 `runFiveScoutIntake()` 호출마다 `engine_run_id`를 생성한다.
- [x] engine_run_id format은 `scout-run-<timestamp>-<engine>-<shortHash>`로 한다.
- [x] canonical route run은 `scout-engine-result.json`에 latest engine_run_id를 기록한다.
- [x] benchmark run은 canonical artifacts를 덮어쓰지 않고 `scout-benchmarks/<engine_run_id>/` 아래에 쓴다.
- [x] parallel benchmark output은 `scout-benchmarks/<parallel_run_id>/` 아래에 쓴다.
- [x] sequential benchmark output은 `scout-benchmarks/<sequential_run_id>/` 아래에 쓴다.
- [x] `scouts bench`는 parallel/sequential 둘 다 canonical `scout-gate.json`를 덮어쓰지 않는다.
- [x] `scouts bench`는 `scout-benchmark.json`에 both run ids를 기록한다.
- [x] `scouts bench`는 latest canonical route intake와 benchmark evidence를 분리한다.
- [x] benchmark result는 `schema: sks.scout-benchmark.v3`로 올린다.
- [x] benchmark result는 `parallel_artifacts_dir`, `sequential_artifacts_dir`를 포함한다.
- [x] benchmark result는 `canonical_artifacts_modified:false`를 증명해야 한다.
- [x] release gate는 `scouts:bench-artifact-isolation`을 추가한다.


## 5. P0 — Codex Exec Parallel 최신 문법 / Output Schema

- [x] 새 모듈 `src/core/scouts/engines/codex-exec-session-engine.ts`를 추가하거나 기존 `codex-exec-parallel-engine.ts`를 강화한다.
- [x] Codex 0.132+에서 `codex exec resume --output-schema` 사용 가능 여부를 탐지한다.
- [x] Scout role result schema를 `schemas/codex/scout-result.schema.json`로 사용한다.
- [x] 각 scout role prompt에 output file 요구를 넣되, preferred는 `--output-schema` structured output이다.
- [x] Codex exec runner는 `session_id`를 기록한다.
- [x] Codex exec runner는 `resume_id` 또는 `thread_id`를 얻을 수 있으면 기록한다.
- [x] Codex exec runner는 `output_schema_path`를 기록한다.
- [x] Codex exec runner는 `output_last_message_path`를 기록한다.
- [x] Codex exec runner는 stdout/stderr log path를 기록한다.
- [x] Codex exec runner는 exit code와 timeout status를 기록한다.
- [x] Codex exec runner는 parse result와 schema validation result를 기록한다.
- [x] Codex exec runner는 Codex version과 compatibility policy를 기록한다.
- [x] Codex exec runner는 `--output-schema` unavailable이면 degraded path로 가되 verified cap을 낮춘다.
- [x] Codex exec runner는 degraded path에서 real_parallel speedup claim을 제한한다.
- [x] Codex exec runner는 role별 output file path를 unique하게 한다.
- [x] Codex exec runner는 role별 stdout/stderr path를 unique하게 한다.
- [x] Codex exec runner는 role별 timeout을 명확히 둔다.
- [x] Codex exec runner는 `Promise.allSettled` 결과를 stable role order로 normalize한다.
- [x] Codex exec runner는 rejected job에 scout_id가 없으면 role id를 보존한다.


## 6. P0 — Scout Result Schema v3

- [x] Scout result schema를 v3로 올린다.
- [x] field `engine_run_id`를 추가한다.
- [x] field `scout_session_id`를 추가한다.
- [x] field `engine`을 유지한다.
- [x] field `engine_mode`를 추가한다: local_static, codex_exec, codex_exec_resume_schema, tmux_lane, codex_app_subagent.
- [x] field `real_parallel`을 유지한다.
- [x] field `output_schema_used`를 추가한다.
- [x] field `output_schema_path`를 추가한다.
- [x] field `schema_validation`을 추가한다.
- [x] field `session_lifecycle`을 추가한다.
- [x] field `source_file`을 유지하되 absolute/local-only policy를 기록한다.
- [x] field `stdout_file` / `stderr_file`을 추가한다.
- [x] field `parse_issues`를 강화한다.
- [x] field `blocked_reason`을 명확히 한다.
- [x] field `read_only_confirmed`를 추가한다.
- [x] field `artifact_namespace`를 추가한다.
- [x] v2/v1 result reader는 migration 또는 verified cap을 적용한다.
- [x] schema invalid scout result는 consensus에 들어가지 않는다.


## 7. P0 — Codex App Subagent Capability Descriptor v2

- [x] Codex App subagent capability schema를 v2로 올린다.
- [x] field `schema: sks.codex-app-subagents-capability.v2`를 지원한다.
- [x] field `available`을 유지한다.
- [x] field `launch_command`를 유지한다.
- [x] field `supports_output_files`를 유지한다.
- [x] field `supports_output_schema`를 추가한다.
- [x] field `supports_session_ids`를 추가한다.
- [x] field `supports_parallel_subagents`를 추가한다.
- [x] field `max_parallel_subagents`를 추가한다.
- [x] field `requires_foreground_app_server`를 추가한다.
- [x] field `codex_version`을 추가한다.
- [x] field `protocol_version`을 추가한다.
- [x] v1 descriptor는 degraded_supported로 읽는다.
- [x] descriptor missing이면 real_parallel false.
- [x] supports_output_schema=false이면 verified cap을 낮춘다.
- [x] launch command output은 JSON schema를 통과해야 한다.
- [x] Subagent jobs는 role별 session id / output file / stdout / stderr를 기록한다.


## 8. P0 — tmux Lane Engine Lifecycle

- [x] tmux lane engine이 session/socket name을 artifact로 기록한다.
- [x] tmux lane engine이 pane id를 role별로 기록한다.
- [x] tmux lane engine이 command를 role별로 기록한다.
- [x] tmux lane engine이 start/end timestamp를 role별로 기록한다.
- [x] tmux lane engine이 output file/stdout/stderr를 role별로 기록한다.
- [x] tmux lane engine이 attach/keepTmux policy를 artifact에 기록한다.
- [x] tmux lane engine이 cleanup success/failure를 기록한다.
- [x] tmux lane engine이 stale session을 감지한다.
- [x] tmux lane engine이 rejected/timeout lane을 stable role order로 기록한다.
- [x] tmux lane engine은 output schema unavailable로 인해 verified cap을 낮춘다.
- [x] tmux lane engine은 local-static fallback과 구분된다.


## 9. P0 — Multi-Session Read-only Guard 강화

- [x] read-only snapshot이 mission dir / working tree / git status를 분리해서 기록한다.
- [x] Codex exec engine은 root 내 write violation을 기록한다.
- [x] tmux engine은 root 내 write violation을 기록한다.
- [x] Codex App subagent engine은 root 내 write violation을 기록한다.
- [x] remote workspace engine은 local workspace와 remote workspace를 구분해 기록한다.
- [x] read-only guard artifact를 v2로 올린다.
- [x] read-only guard는 allowed write paths를 명확히 둔다.
- [x] allowed write paths: mission scout artifacts, logs, reports.
- [x] disallowed write paths: source files, package files, docs, tests, config, git state.
- [x] violation 발생 시 scout gate blocked.
- [x] violation 발생 시 wrongness record 생성.
- [x] read-only guard failure는 speedup claim을 차단한다.


## 10. P0 — Scout Consensus / Proof Graph 안정화

- [x] consensus builder는 schema-valid scout results만 사용한다.
- [x] blocked scout result는 consensus blocker로 들어간다.
- [x] missing scout result는 consensus blocker로 들어간다.
- [x] partial completion은 consensus status partial로 표시한다.
- [x] all five scouts done + schema valid + read-only pass일 때만 gate passed.
- [x] proof evidence는 engine_run_id를 포함한다.
- [x] proof evidence는 scout result artifact paths를 포함한다.
- [x] proof evidence는 output_schema_used count를 포함한다.
- [x] proof evidence는 real_parallel 여부를 포함한다.
- [x] proof evidence는 speedup claim allowed 여부를 포함한다.
- [x] Trust Report는 Scout engine status를 표시한다.
- [x] Trust Report는 degraded/fallback/mock state를 표시한다.
- [x] Wrongness Memory는 scout parse mismatch / output schema fail / read-only violation / speedup overclaim을 기록한다.


## 11. P0 — Multi-Session Benchmark 정합성

- [x] `scouts bench`는 separate artifact namespace를 사용한다.
- [x] `scouts bench`는 parallel run과 sequential baseline을 같은 mission 내에서 logical child run으로 기록한다.
- [x] parallel run은 canonical artifacts를 덮어쓰지 않는다.
- [x] sequential run은 canonical artifacts를 덮어쓰지 않는다.
- [x] benchmark는 role별 duration을 기록한다.
- [x] benchmark는 wall-clock duration을 기록한다.
- [x] benchmark는 estimated sequential duration과 actual sequential duration을 구분한다.
- [x] speedup은 actual sequential vs actual parallel이 둘 다 있을 때만 계산한다.
- [x] mock/static benchmark는 real speedup claim false.
- [x] real engine benchmark라도 output schema invalid면 claim false.
- [x] read-only guard fail이면 claim false.
- [x] benchmark summary는 `.sneakoscope/reports/scout-benchmark-summary.json`에 쓰되 latest canonical run과 혼동하지 않는다.


## 12. P0 — Scout Engine Selection 최신화

- [x] engine selection policy를 Codex 0.132/0.133 capability에 맞게 업데이트한다.
- [x] Codex exec with output-schema available이면 preferred real engine으로 선택한다.
- [x] Codex App subagent v2 descriptor available이면 second preferred.
- [x] tmux lane engine은 Codex/CLI unavailable but tmux available이면 fallback.
- [x] local-static은 mock/static fallback.
- [x] `--require-real-parallel`이면 local-static/sequential fallback 불가.
- [x] `--require-output-schema` flag를 추가한다.
- [x] `--require-output-schema`면 output-schema unavailable시 blocked.
- [x] `--engine auto`는 reasoned selection report를 쓴다.
- [x] selection report schema는 `sks.scout-engine-selection.v2`.


## 13. P0 — Scout Command UX / Flags

- [x] `sks scouts run latest --require-output-schema --json` 추가.
- [x] `sks scouts run latest --session-prefix <prefix> --json` 추가.
- [x] `sks scouts run latest --engine-run-id <id> --json` 추가.
- [x] `sks scouts bench latest --isolate-artifacts --json`를 기본으로 한다.
- [x] `sks scouts bench latest --write-canonical`는 explicit opt-in이어야 한다.
- [x] `sks scouts status latest --engine-runs --json` 추가.
- [x] `sks scouts validate latest --strict`는 artifacts를 생성하지 않는다.
- [x] `sks scouts validate latest --strict`는 missing artifacts만 보고한다.
- [x] `sks scouts engines --json`은 output-schema support를 포함한다.
- [x] `sks scouts explain latest`를 추가하거나 docs에 explain path를 추가한다.


## 14. P0 — Official Syntax / Codex 0.132+ Resume Integration

- [x] Codex exec output-schema runner와 Scout engine을 실제 연결한다.
- [x] Scout role output schema는 `schemas/codex/scout-result.schema.json`를 사용한다.
- [x] Codex 0.132+ `exec resume --output-schema` path는 available일 때 preferred.
- [x] Codex 0.133 matrix가 `exec_resume_output_schema` inherited feature를 표시한다.
- [x] Codex output schema unavailable이면 degraded_supported.
- [x] Codex session resume 실패는 structured blocker.
- [x] Codex output parse 실패는 wrongness record.
- [x] Codex stdout/stderr warning은 artifact에 redacted 기록.
- [x] Codex command invocation은 latest syntax docs와 맞춰 docs에 기록.


## 15. P0 — Multi-Session Artifact Graph Blackbox

- [x] 새 script `scripts/scouts-multisession-artifact-graph-check.mjs`를 추가한다.
- [x] fake Codex exec engine을 사용해 5개 role output을 생성한다.
- [x] fake engine은 output-schema-valid scout JSON을 만든다.
- [x] blackbox는 `sks scouts run latest --engine fake-codex-exec --require-output-schema --json` 또는 equivalent를 실행한다.
- [x] blackbox는 five role artifacts를 확인한다.
- [x] blackbox는 engine_run_id를 확인한다.
- [x] blackbox는 scout_session_id를 확인한다.
- [x] blackbox는 scout-team-plan.json을 확인한다.
- [x] blackbox는 scout-consensus.json을 확인한다.
- [x] blackbox는 scout-gate.json을 확인한다.
- [x] blackbox는 scout-readonly-guard.json을 확인한다.
- [x] blackbox는 scout-proof evidence를 확인한다.
- [x] blackbox는 Trust Report linkage를 확인한다.
- [x] blackbox는 mock/real cap을 확인한다.
- [x] blackbox는 output schema validation result를 확인한다.


## 16. P0 — Scout Benchmark Isolation Blackbox

- [x] 새 script `scripts/scouts-benchmark-isolation-check.mjs`를 추가한다.
- [x] temp mission을 만든다.
- [x] parallel benchmark run을 실행한다.
- [x] sequential benchmark run을 실행한다.
- [x] parallel artifacts dir와 sequential artifacts dir가 서로 다른지 확인한다.
- [x] canonical scout artifacts가 benchmark 때문에 덮어쓰이지 않았는지 확인한다.
- [x] scout-benchmark.json에 both run ids가 있는지 확인한다.
- [x] speedup claim이 mock/static이면 false인지 확인한다.
- [x] real_parallel false면 claim_allowed false인지 확인한다.
- [x] benchmark report schema v3를 확인한다.


## 17. P0 — Release Gate Update

`package.json` scripts에 다음을 추가하거나 강화한다.

```json
{
  "scripts": {
    "scouts:multisession-artifact-graph": "node ./scripts/scouts-multisession-artifact-graph-check.mjs",
    "scouts:benchmark-isolation": "node ./scripts/scouts-benchmark-isolation-check.mjs",
    "scouts:output-schema-wiring": "node ./scripts/scouts-output-schema-wiring-check.mjs",
    "scouts:session-lifecycle": "node ./scripts/scouts-session-lifecycle-check.mjs",
    "scouts:readonly-guard-v2": "node ./scripts/scouts-readonly-guard-v2-check.mjs",
    "scouts:no-speedup-overclaim": "node ./scripts/scouts-no-speedup-overclaim-check.mjs"
  }
}
```

`release:check`에는 반드시 다음을 포함한다.

```text
[x] scouts:multisession-artifact-graph
[x] scouts:benchmark-isolation
[x] scouts:output-schema-wiring
[x] scouts:session-lifecycle
[x] scouts:readonly-guard-v2
[x] scouts:no-speedup-overclaim
```


## 18. Required Unit Tests

- [x] test/unit/scout-engine-run-namespace.test.ts
- [x] test/unit/scout-result-schema-v3.test.ts
- [x] test/unit/scout-output-schema-wiring.test.ts
- [x] test/unit/scout-benchmark-isolation.test.ts
- [x] test/unit/scout-engine-selection-v2.test.ts
- [x] test/unit/codex-app-subagent-capability-v2.test.ts
- [x] test/unit/tmux-lane-lifecycle.test.ts
- [x] test/unit/scout-readonly-guard-v2.test.ts
- [x] test/unit/scout-consensus-schema-valid-only.test.ts
- [x] test/unit/scout-speedup-claim-policy.test.ts


## 19. Required Integration Tests

- [x] test/integration/scouts-run-output-schema-fake-codex.test.ts
- [x] test/integration/scouts-bench-isolated-artifacts.test.ts
- [x] test/integration/scouts-require-output-schema-blocked.test.ts
- [x] test/integration/scouts-codex-app-subagent-v2-descriptor.test.ts
- [x] test/integration/scouts-tmux-lane-lifecycle.test.ts
- [x] test/integration/scouts-readonly-guard-violation.test.ts
- [x] test/integration/scouts-proof-trust-graph.test.ts


## 20. Required Black-box Tests

- [x] test/blackbox/scouts-multisession-artifact-graph-packed.test.mjs
- [x] test/blackbox/scouts-benchmark-isolation-packed.test.mjs
- [x] test/blackbox/scouts-output-schema-packed.test.mjs
- [x] test/blackbox/scouts-no-speedup-overclaim-packed.test.mjs


## 21. Docs Update

- [x] docs/five-scout-pipeline.md를 1.14.1 multi-session 기준으로 갱신한다.
- [x] docs/codex-cli-compat.md에 Scout output-schema / resume path를 추가한다.
- [x] docs/release-readiness.md에 Scout multi-session gates를 추가한다.
- [x] README Current Release에 Scout multi-session stability를 한 줄 추가한다.
- [x] docs/testing-hermetic-e2e.md에 fake Codex exec multi-session fixture를 추가한다.
- [x] docs/performance-budgets.md에 Scout parallel/sequential benchmark policy를 추가한다.
- [x] docs/wrongness-learning-loop.md에 Scout output schema fail / speedup overclaim wrongness를 추가한다.


## 22. 대량 세부 Task Bank

- [x] codex-exec-parallel: engine_run_id recorded
- [x] codex-exec-parallel: artifact namespace recorded
- [x] codex-exec-parallel: session lifecycle recorded
- [x] codex-exec-parallel: stdout/stderr redacted
- [x] codex-exec-parallel: timeout recorded
- [x] codex-exec-parallel: schema validation status recorded
- [x] codex-exec-parallel: read-only guard linked
- [x] codex-exec-parallel: proof evidence linked
- [x] codex-exec-parallel: speedup claim policy applied
- [x] codex-exec-parallel: blackbox or integration fixture exists
- [x] codex-app-subagents: engine_run_id recorded
- [x] codex-app-subagents: artifact namespace recorded
- [x] codex-app-subagents: session lifecycle recorded
- [x] codex-app-subagents: stdout/stderr redacted
- [x] codex-app-subagents: timeout recorded
- [x] codex-app-subagents: schema validation status recorded
- [x] codex-app-subagents: read-only guard linked
- [x] codex-app-subagents: proof evidence linked
- [x] codex-app-subagents: speedup claim policy applied
- [x] codex-app-subagents: blackbox or integration fixture exists
- [x] tmux-lanes: engine_run_id recorded
- [x] tmux-lanes: artifact namespace recorded
- [x] tmux-lanes: session lifecycle recorded
- [x] tmux-lanes: stdout/stderr redacted
- [x] tmux-lanes: timeout recorded
- [x] tmux-lanes: schema validation status recorded
- [x] tmux-lanes: read-only guard linked
- [x] tmux-lanes: proof evidence linked
- [x] tmux-lanes: speedup claim policy applied
- [x] tmux-lanes: blackbox or integration fixture exists
- [x] local-static: engine_run_id recorded
- [x] local-static: artifact namespace recorded
- [x] local-static: session lifecycle recorded
- [x] local-static: stdout/stderr redacted
- [x] local-static: timeout recorded
- [x] local-static: schema validation status recorded
- [x] local-static: read-only guard linked
- [x] local-static: proof evidence linked
- [x] local-static: speedup claim policy applied
- [x] local-static: blackbox or integration fixture exists
- [x] sequential-fallback: engine_run_id recorded
- [x] sequential-fallback: artifact namespace recorded
- [x] sequential-fallback: session lifecycle recorded
- [x] sequential-fallback: stdout/stderr redacted
- [x] sequential-fallback: timeout recorded
- [x] sequential-fallback: schema validation status recorded
- [x] sequential-fallback: read-only guard linked
- [x] sequential-fallback: proof evidence linked
- [x] sequential-fallback: speedup claim policy applied
- [x] sequential-fallback: blackbox or integration fixture exists
- [x] fake-codex-exec: engine_run_id recorded
- [x] fake-codex-exec: artifact namespace recorded
- [x] fake-codex-exec: session lifecycle recorded
- [x] fake-codex-exec: stdout/stderr redacted
- [x] fake-codex-exec: timeout recorded
- [x] fake-codex-exec: schema validation status recorded
- [x] fake-codex-exec: read-only guard linked
- [x] fake-codex-exec: proof evidence linked
- [x] fake-codex-exec: speedup claim policy applied
- [x] fake-codex-exec: blackbox or integration fixture exists
- [x] scout-1-code-surface: unique scout_session_id
- [x] scout-1-code-surface: output schema validation
- [x] scout-1-code-surface: output artifact path unique
- [x] scout-1-code-surface: stdout/stderr path unique
- [x] scout-1-code-surface: parse issue handling
- [x] scout-1-code-surface: wrongness mapping
- [x] scout-1-code-surface: consensus contribution policy
- [x] scout-1-code-surface: proof evidence reference
- [x] scout-2-verification: unique scout_session_id
- [x] scout-2-verification: output schema validation
- [x] scout-2-verification: output artifact path unique
- [x] scout-2-verification: stdout/stderr path unique
- [x] scout-2-verification: parse issue handling
- [x] scout-2-verification: wrongness mapping
- [x] scout-2-verification: consensus contribution policy
- [x] scout-2-verification: proof evidence reference
- [x] scout-3-safety-db: unique scout_session_id
- [x] scout-3-safety-db: output schema validation
- [x] scout-3-safety-db: output artifact path unique
- [x] scout-3-safety-db: stdout/stderr path unique
- [x] scout-3-safety-db: parse issue handling
- [x] scout-3-safety-db: wrongness mapping
- [x] scout-3-safety-db: consensus contribution policy
- [x] scout-3-safety-db: proof evidence reference
- [x] scout-4-visual-voxel: unique scout_session_id
- [x] scout-4-visual-voxel: output schema validation
- [x] scout-4-visual-voxel: output artifact path unique
- [x] scout-4-visual-voxel: stdout/stderr path unique
- [x] scout-4-visual-voxel: parse issue handling
- [x] scout-4-visual-voxel: wrongness mapping
- [x] scout-4-visual-voxel: consensus contribution policy
- [x] scout-4-visual-voxel: proof evidence reference
- [x] scout-5-synthesis: unique scout_session_id
- [x] scout-5-synthesis: output schema validation
- [x] scout-5-synthesis: output artifact path unique
- [x] scout-5-synthesis: stdout/stderr path unique
- [x] scout-5-synthesis: parse issue handling
- [x] scout-5-synthesis: wrongness mapping
- [x] scout-5-synthesis: consensus contribution policy
- [x] scout-5-synthesis: proof evidence reference


## 23. Done Definition

- [x] Scout engine run namespace implemented.
- [x] Scout result schema v3 implemented.
- [x] Codex exec output-schema integration implemented.
- [x] Codex App subagent capability v2 implemented.
- [x] tmux lane lifecycle artifacts implemented.
- [x] Scout read-only guard v2 implemented.
- [x] Scout consensus uses schema-valid results only.
- [x] scouts bench artifact isolation implemented.
- [x] Scout command flags updated.
- [x] Multi-session artifact graph blackbox implemented.
- [x] Benchmark isolation blackbox implemented.
- [x] Release gate includes scout multi-session checks.
- [x] Docs updated.
- [x] No P0 gaps remain.


## 24. Final Report Format

작업 완료 후 다음 형식으로 보고한다.

```md
# SKS 1.14.1 Scout Multi-Session Addendum Report

## Scout Engine Namespace
| Engine | Run ID | Isolated Artifacts | Result |
| --- | --- | --- | --- |
| codex-exec-parallel | ... | pass/fail | ... |
| codex-app-subagents | ... | pass/fail | ... |
| tmux-lanes | ... | pass/fail | ... |
| local-static | ... | pass/fail | ... |

## Output Schema
| Role | Schema Valid | Session ID | Artifact |
| --- | --- | --- | --- |

## Benchmark Isolation
- parallel artifacts:
- sequential artifacts:
- canonical overwritten:
- speedup claim allowed:

## Read-only Guard
- before snapshot:
- after snapshot:
- violations:
- gate:

## Release Gate
| Command | Result |
| --- | --- |
| scouts:multisession-artifact-graph | pass/fail |
| scouts:benchmark-isolation | pass/fail |
| scouts:output-schema-wiring | pass/fail |
| scouts:session-lifecycle | pass/fail |
| scouts:readonly-guard-v2 | pass/fail |
| scouts:no-speedup-overclaim | pass/fail |

## Remaining Gaps
- None for P0.
```


## 25. 최종 성공 문장

> Scout/Multi-Session addendum 완료 후 SKS 1.14.1은 Five-Scout parallel intake를 최신 Codex output-schema/session semantics와 artifact isolation 기준에 맞춰 안정화하고, speedup overclaim과 benchmark artifact overwrite를 차단하는 실전 multi-session trust kernel이 된다.
