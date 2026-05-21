# SKS 1.13.0 Goal 지시서 — DFix Extreme Speed Kernel · Ultra-Stable Fast Fix Loop · UX/PPT/All-Feature Final Hardening

> 대상 저장소: `mandarange/Sneakoscope-Codex`  
> 현재 기준 버전: `1.12.0`  
> 목표 버전: **`1.13.0`**  
> 목표 성격: **DFix 속도·정확도·안정성 극한 개선 + 남은 UX/PPT/All-Feature 실제성 한계 보강**  
> 핵심 원칙: **DFix는 속도가 생명이다. 하지만 빠르다는 이유로 근거 없는 patch, broad refactor, mock-as-real, verification skip은 절대 허용하지 않는다.**  
> 최종 목표: **DFix를 “빠른 진단 → 최소 범위 root cause → 안전한 patch → 최소 검증 → proof/trust/wrongness”까지 1-shot으로 이어지는 초고속 direct fix kernel로 완성한다.**

---

## 0. Goal Command Payload

```bash
sks goal create "SKS 1.13.0 DFix extreme speed kernel and final execution hardening" --from-file docs/goals/sks-1.13.0-dfix-extreme-speed-kernel.md
```

Codex App / Codex CLI에는 다음처럼 전달한다.

```text
$Goal SKS 1.13.0 DFix Extreme Speed Kernel 업데이트를 수행한다. DFix는 속도가 생명이므로, 1.12.0에서 남은 한계인 Codex patch handoff의 실제 runner 부족, verification command 자동 추천/선택의 속도 부족, broad diagnosis 가능성, repeated diagnostic 비용, all-feature/UX/PPT 일부 source-string 중심 gate를 전부 P0로 개선한다. DFix는 4단계 fast path(L0 deterministic, L1 local static, L2 Codex patch handoff, L3 human review)로 나누고, error signature cache, minimal impacted test selection, git diff snapshot, rollback plan, no-op detection, wrongness memory, blackbox E2E를 통해 가장 빠르면서도 가장 안전한 fix loop가 되게 한다. UX/PPT도 남은 실제 execution 한계를 fake adapter blackbox와 artifact graph validation으로 보강한다.
```


## 1. 최상위 철학

- [x] DFix는 빠르지 않으면 실패한 기능이다.
- [x] DFix는 빠르되, unsafe patch를 자동 적용하지 않는다.
- [x] DFix는 broad implementation을 하지 않는다.
- [x] DFix는 direct fix only 원칙을 지킨다.
- [x] DFix는 root cause 없이 patch하지 않는다.
- [x] DFix는 patch evidence 없이 fixed claim을 만들지 않는다.
- [x] DFix는 verification evidence 없이 verified claim을 만들지 않는다.
- [x] DFix는 no-op patch를 성공으로 보지 않는다.
- [x] DFix는 repeated blocker에서 loop burn을 하지 않는다.
- [x] DFix는 가장 작은 범위의 test/verify를 먼저 실행한다.
- [x] DFix는 필요할 때만 full test를 권장한다.
- [x] DFix는 fast-path와 proof-path를 분리하지 않는다. 빠른 경로도 proof를 남긴다.
- [x] DFix는 deterministic fix가 가능하면 Codex patch handoff를 쓰지 않는다.
- [x] DFix는 Codex patch가 필요하면 bounded prompt와 schema를 사용한다.
- [x] DFix는 patch가 high-risk면 human review로 즉시 전환한다.
- [x] DFix는 모든 단계에 time budget을 둔다.
- [x] DFix는 모든 단계에 artifact를 남긴다.
- [x] DFix는 모든 실패 원인을 Wrongness Memory에 저장한다.
- [x] DFix는 다음 실행에서 Wrongness Memory를 조회해 같은 실수를 줄인다.
- [x] DFix는 UX/PPT/Git/DB/Hook/codex-lb 등 다른 SKS 기능의 safety gate를 침범하지 않는다.


## 2. 최종 성공 문장

> SKS 1.13.0 DFix는 error signature를 즉시 분류하고, 최소 파일/최소 원인/최소 patch/최소 검증을 선택하며, deterministic fast patch와 Codex bounded patch handoff를 구분하고, 모든 결과를 diff·verification·rollback·proof·trust·wrongness로 봉인하는 초고속 안정 fix kernel이다.


## 3. 절대 금지

- [x] DFix가 root cause 없이 patch apply.
- [x] DFix가 `--apply` 없이 파일 수정.
- [x] DFix가 broad refactor를 direct fix로 가장.
- [x] DFix가 fallback implementation을 생성.
- [x] DFix가 DB write/migration/destructive operation을 자동 실행.
- [x] DFix가 auth/payment/security weakening patch를 자동 실행.
- [x] DFix가 verification missing 상태를 fixed로 표시.
- [x] DFix가 no-op patch를 성공 처리.
- [x] DFix가 failed verification을 무시.
- [x] DFix가 same blocker를 3회 이상 반복.
- [x] DFix가 secret을 stdout/stderr/proof/wrongness에 남김.
- [x] DFix가 UX/PPT visual evidence를 text-only proof로 대체.
- [x] DFix가 mock fixture를 real verified로 승격.
- [x] DFix가 all-feature completion을 단순 command presence로만 판단.


## 4. Version / Release Metadata

- [x] package.json version을 1.13.0으로 올린다.
- [x] package-lock.json이 있으면 1.13.0으로 정렬한다.
- [x] src/core/version.ts를 1.13.0으로 올린다.
- [x] src/core/fsx.ts PACKAGE_VERSION을 1.13.0으로 올린다.
- [x] crates/sks-core/Cargo.toml version을 1.13.0으로 올린다.
- [x] crates/sks-core/src/main.rs --version 출력을 1.13.0으로 정렬한다.
- [x] CHANGELOG.md에 [1.13.0] 섹션을 추가한다.
- [x] README.md Current Release를 1.13.0으로 갱신한다.
- [x] docs/dfix.md를 1.13.0 기준으로 갱신한다.
- [x] docs/performance-budgets.md에 DFix speed budgets를 추가한다.
- [x] docs/release-readiness.md를 1.13.0 기준으로 갱신한다.
- [x] docs/wrongness-learning-loop.md에 DFix wrongness fast memory를 추가한다.
- [x] release-check-stamp가 1.13.0 기준으로 생성되게 한다.
- [x] prepublishOnly가 1.13.0 stamp를 검증한다.
- [x] publish:dry가 1.13.0 tarball metadata를 검증한다.


## 5. CHANGELOG 필수 섹션

```md
## [1.13.0] - YYYY-MM-DD

### Added
- Add DFix Extreme Speed Kernel with L0 deterministic, L1 local static, L2 bounded Codex patch handoff, and L3 human-review paths.
- Add DFix error signature cache, root-cause cache, patch template cache, verification command selector, and wrongness avoidance lookup.
- Add DFix minimal impacted verification selector for npm, TypeScript, Rust, Python, test file, changed-file, and package-script contexts.
- Add DFix fast patch runner with exact replace, AST-safe patch hooks, bounded Codex patch handoff, git diff capture, rollback plan, no-op detection, and verification proof.
- Add DFix latency budgets, performance report, and release gate for diagnose/plan/patch/verify speed.
- Add DFix black-box E2E tests with fake failing repo, deterministic patch, Codex patch handoff fixture, no-op patch, failed verification, and rollback readiness.
- Add flagship artifact graph validation for UX/PPT/DFix so release checks validate command → artifact → evidence → proof → trust graph, not just source strings.

### Fixed
- Prevent DFix from running slow full checks when a minimal impacted verification is sufficient.
- Prevent DFix from repeating the same blocker without stopping and storing wrongness.
- Prevent DFix Codex patch handoff from remaining prompt-only without structured patch result and diff capture.
- Prevent all-feature completion from passing when flagship features only satisfy command-name or source-string checks.
- Prevent UX/PPT flagship gates from relying only on source-string release scripts.

### Changed
- Treat DFix speed and correctness as co-equal release invariants.
- Treat DFix verification selection as an optimized decision, not a static command list.
- Treat flagship feature readiness as an artifact graph property.
```


## 6. P0 — DFix Fast Path Architecture

- [x] DFix path를 L0/L1/L2/L3로 분리한다.
- [x] L0 deterministic path는 exact find/replace, missing import, typo, simple config, dependency mismatch 등 빠른 patch에 사용한다.
- [x] L1 local static path는 AST/text scan, package script scan, type error pattern, stack trace path를 사용한다.
- [x] L2 bounded Codex patch handoff는 deterministic patch가 불가능하지만 bounded patch가 가능한 경우에만 사용한다.
- [x] L3 human review path는 high-risk, broad change, auth/payment/security, DB/migration, ambiguous root cause에 사용한다.
- [x] 모든 path는 공통 schema `sks.dfix-path-decision.v1`을 반환한다.
- [x] path decision artifact `dfix-path-decision.json`을 쓴다.
- [x] path decision은 root cause confidence를 포함한다.
- [x] path decision은 estimated patch risk를 포함한다.
- [x] path decision은 expected verification cost를 포함한다.
- [x] path decision은 max allowed duration을 포함한다.
- [x] path decision은 fallback path를 포함한다.
- [x] L0 path는 300ms 목표 budget을 둔다.
- [x] L1 path는 2초 목표 budget을 둔다.
- [x] L2 path는 30초 목표 budget을 둔다.
- [x] L3 path는 즉시 human review blocker를 반환한다.


## 7. P0 — DFix Error Signature Engine

- [x] 새 모듈 `src/core/dfix/error-signature.ts`를 추가한다.
- [x] stack trace file/line extraction을 구현한다.
- [x] TypeScript error code extraction을 구현한다.
- [x] Node error kind extraction을 구현한다.
- [x] Jest/Vitest assertion extraction을 구현한다.
- [x] Rust compiler error extraction을 구현한다.
- [x] Python pytest traceback extraction을 구현한다.
- [x] missing file/path ENOENT extraction을 구현한다.
- [x] undefined/null TypeError extraction을 구현한다.
- [x] module not found/import error extraction을 구현한다.
- [x] schema validation error extraction을 구현한다.
- [x] hook warning error extraction을 구현한다.
- [x] codex-lb missing env error extraction을 구현한다.
- [x] UX/PPT visual gate blocker extraction을 구현한다.
- [x] error signature hash를 만든다.
- [x] error signature에 command, cwd, file, line, error code, normalized message를 포함한다.
- [x] secret redaction 후 signature를 만든다.
- [x] signature artifact `dfix-error-signature.json`을 쓴다.


## 8. P0 — DFix Cache / Wrongness Memory

- [x] 새 모듈 `src/core/dfix/dfix-cache.ts`를 추가한다.
- [x] error signature cache를 구현한다.
- [x] root cause cache를 구현한다.
- [x] successful patch cache를 구현한다.
- [x] failed patch wrongness cache를 구현한다.
- [x] verification command cache를 구현한다.
- [x] cache path는 `.sneakoscope/dfix-cache/`로 둔다.
- [x] shared cache publish는 default off.
- [x] cache records는 file hash와 project hash를 포함한다.
- [x] stale cache는 자동 무시한다.
- [x] same signature + same file hash면 previous fix hint를 제공한다.
- [x] same signature + previous failure면 avoidance rule을 제공한다.
- [x] Wrongness Memory active records를 diagnosis context에 넣는다.
- [x] wrongness recurrence_count를 업데이트한다.
- [x] cache hit artifact `dfix-cache-hit.json`을 쓴다.
- [x] cache miss artifact `dfix-cache-miss.json`을 쓴다.


## 9. P0 — DFix Minimal Diagnosis

- [x] diagnose는 기본적으로 full repo scan을 하지 않는다.
- [x] diagnose는 failing command stderr/stdout tail을 우선 본다.
- [x] diagnose는 stack trace path가 있으면 해당 파일만 우선 본다.
- [x] diagnose는 changed files가 있으면 changed files를 우선 본다.
- [x] diagnose는 package metadata를 lightweight로 읽는다.
- [x] diagnose는 repo-wide grep을 time budget 내에서만 실행한다.
- [x] diagnose는 AST scan을 L1 path에서만 실행한다.
- [x] diagnose는 scout 분석을 L2 path에서만 실행한다.
- [x] diagnose는 human review path에서 broad ambiguity를 명확히 기록한다.
- [x] diagnose artifact에 scanned_files_count를 기록한다.
- [x] diagnose artifact에 diagnosis_duration_ms를 기록한다.
- [x] diagnose artifact에 skipped_expensive_checks를 기록한다.
- [x] diagnose artifact에 root cause confidence를 기록한다.
- [x] diagnose artifact에 insufficient_evidence blocker를 기록한다.


## 10. P0 — DFix Root Cause Ranking

- [x] root cause 후보를 여러 개 만들 수 있게 한다.
- [x] 각 root cause 후보에 confidence를 부여한다.
- [x] 각 root cause 후보에 evidence ids를 연결한다.
- [x] 각 root cause 후보에 affected files를 연결한다.
- [x] 각 root cause 후보에 patchability를 계산한다.
- [x] 각 root cause 후보에 verification cost를 계산한다.
- [x] root cause ranking score를 계산한다.
- [x] highest score 후보를 selected_root_cause로 지정한다.
- [x] confidence가 threshold 미만이면 patch apply를 막는다.
- [x] root cause ambiguity가 높으면 L2 Codex handoff 또는 L3 human review로 전환한다.
- [x] root cause artifact를 v2로 업데이트한다.


## 11. P0 — Fast Patch Templates

- [x] 새 모듈 `src/core/dfix/patch-templates.ts`를 추가한다.
- [x] exact find/replace patch template을 유지한다.
- [x] missing import patch template을 추가한다.
- [x] wrong constant/string patch template을 추가한다.
- [x] schema required field patch template을 추가한다.
- [x] package script command patch template을 추가한다.
- [x] path typo patch template을 추가한다.
- [x] null guard patch template을 추가한다.
- [x] TypeScript optional property patch template을 추가한다.
- [x] Rust version output mismatch patch template을 추가한다.
- [x] package/version drift patch template을 추가한다.
- [x] template applicability checker를 구현한다.
- [x] template confidence score를 구현한다.
- [x] template patch는 exact target file과 exact hunk가 있어야 한다.
- [x] template patch가 ambiguous하면 L2로 넘긴다.
- [x] template patch artifact에 template id를 기록한다.


## 12. P0 — DFix Patch Runner

- [x] 새 모듈 `src/core/dfix/patch-runner.ts`를 추가한다.
- [x] patch runner는 dry-run과 apply mode를 분리한다.
- [x] apply mode는 explicit --apply 필요.
- [x] patch runner는 git diff before를 캡처한다.
- [x] patch runner는 file snapshot before hash를 캡처한다.
- [x] patch runner는 patch 적용 후 file hash를 캡처한다.
- [x] patch runner는 git diff after를 캡처한다.
- [x] patch runner는 changed_files를 실제 diff에서 계산한다.
- [x] patch runner는 no-op을 감지한다.
- [x] patch runner는 rollback plan을 생성한다.
- [x] patch runner는 patch mode를 기록한다.
- [x] patch runner는 patch duration ms를 기록한다.
- [x] patch runner는 high-risk file patch를 막는다.
- [x] patch runner는 binary file patch를 막는다.
- [x] patch runner는 generated file patch를 막거나 explicit allow를 요구한다.
- [x] patch runner artifact `dfix-patch-runner-result.json`을 쓴다.


## 13. P0 — Bounded Codex Patch Handoff 실제화

- [x] Codex patch handoff runner를 추가한다.
- [x] runner는 default dry-run이다.
- [x] runner는 explicit --apply-codex-patch 또는 --apply 필요.
- [x] runner는 DFix patch prompt를 Codex에 전달한다.
- [x] runner는 output schema를 요구한다.
- [x] runner는 changed_files, patch_applied, diff_summary, verification_commands, rollback_plan을 요구한다.
- [x] runner는 Codex unavailable이면 integration_optional blocker.
- [x] runner는 Codex output schema fail이면 blocked.
- [x] runner는 Codex patch가 broad refactor를 제안하면 blocked.
- [x] runner는 unsafe operation을 제안하면 blocked.
- [x] runner는 patch result를 patch-runner와 동일 schema로 normalize한다.
- [x] runner는 proof/trust/wrongness에 연결된다.


## 14. P0 — DFix Verification Selector

- [x] 새 모듈 `src/core/dfix/verification-selector.ts`를 추가한다.
- [x] changed_files 기반 impacted verification을 선택한다.
- [x] package.json scripts를 읽는다.
- [x] tsconfig 존재 시 typecheck 후보를 찾는다.
- [x] test file 변경이면 해당 test file command를 우선 추천한다.
- [x] source file 변경이면 related test file을 추정한다.
- [x] Rust crate 변경이면 cargo check 우선.
- [x] Rust test 변경이면 cargo test 우선.
- [x] Python project면 pytest targeted path 우선.
- [x] schema file 변경이면 schema:check 우선.
- [x] UX/PPT artifact 변경이면 relevant fixture check 우선.
- [x] DFix 자체 변경이면 dfix:fixture/dfix:verification 우선.
- [x] verification selector는 fastest_sufficient_command를 선택한다.
- [x] verification selector는 confidence를 기록한다.
- [x] verification selector는 expected_duration_budget_ms를 기록한다.
- [x] verification selector는 full verification fallback을 기록한다.
- [x] selector artifact `dfix-verification-selection.json`을 쓴다.


## 15. P0 — Verification Runner

- [x] verification runner는 selected command만 먼저 실행한다.
- [x] selected command success면 fixed claim 가능 조건 중 하나를 충족한다.
- [x] selected command fail이면 full test로 확대하지 않고 blocker를 기록한다.
- [x] full test는 explicit --full-verify 또는 release path에서만 실행한다.
- [x] verification runner는 timeout을 둔다.
- [x] verification runner는 stdout/stderr tail을 redacted한다.
- [x] verification runner는 duration_ms를 기록한다.
- [x] verification runner는 passed/failed/timed_out를 기록한다.
- [x] verification runner는 flaky suspicion을 기록할 수 있다.
- [x] verification runner는 repeated verifier failure를 wrongness로 기록한다.


## 16. P0 — DFix Speed Budgets

- [x] DFix diagnose cold source-local budget <= 500ms for simple error text.
- [x] DFix path decision budget <= 100ms after diagnosis.
- [x] DFix patch plan budget <= 300ms for deterministic template path.
- [x] DFix dry-run patch handoff budget <= 500ms without Codex.
- [x] DFix exact patch apply budget <= 1000ms for small file.
- [x] DFix verification selector budget <= 300ms.
- [x] DFix no-Codex full loop fixture budget <= 3000ms.
- [x] DFix Codex handoff path timeout default <= 60s.
- [x] DFix benchmark artifact `dfix-performance-report.json`을 쓴다.
- [x] perf gate에 dfix fast fixture를 추가한다.
- [x] slow path는 reason을 기록한다.
- [x] budget 초과 시 performance warning을 기록한다.


## 17. P0 — DFix Fast Blackbox E2E

- [x] blackbox fixture repo를 만든다.
- [x] fixture repo에 failing JS/TS file을 만든다.
- [x] DFix diagnose가 error signature를 만든다.
- [x] DFix plan이 deterministic patch를 선택한다.
- [x] DFix patch --apply가 exact patch를 적용한다.
- [x] DFix verification selector가 minimal command를 선택한다.
- [x] DFix verify가 selected command를 실행한다.
- [x] DFix proof가 verified_partial 또는 verified를 만든다.
- [x] DFix no-op patch fixture가 blocked가 되는지 확인한다.
- [x] DFix failed verification fixture가 blocked가 되는지 확인한다.
- [x] DFix high-risk patch fixture가 human review로 가는지 확인한다.
- [x] DFix repeated blocker fixture가 loop stop하는지 확인한다.
- [x] DFix cache hit fixture가 두 번째 실행에서 더 빠른지 확인한다.


## 18. P0 — UX/PPT 실제성 Blackbox 강화

- [x] UX fake imagegen adapter로 `sks ux-review run --image --generate-callouts`를 실행한다.
- [x] UX fake extractor로 `sks ux-review extract-issues`를 실행한다.
- [x] UX artifact graph가 issue ledger/proof/trust까지 연결되는지 확인한다.
- [x] UX non-mock fake generic callout이 없는지 확인한다.
- [x] PPT fake soffice adapter로 slide export를 실행한다.
- [x] PPT fake imagegen adapter로 slide callouts를 실행한다.
- [x] PPT fake extractor로 slide issues를 추출한다.
- [x] PPT fixed deck attach/re-export/re-review path를 fixture로 실행한다.
- [x] PPT proof/trust graph가 생성되는지 확인한다.
- [x] PPT unavailable path가 honest blocker를 반환하는지 확인한다.


## 19. P0 — All-Feature Completion Actual Artifact Graph

- [x] all-feature completion이 feature별 실제 latest fixture artifact를 읽는다.
- [x] all-feature completion이 evidence index linkage를 확인한다.
- [x] all-feature completion이 completion proof linkage를 확인한다.
- [x] all-feature completion이 trust report linkage를 확인한다.
- [x] all-feature completion이 wrongness mapping을 확인한다.
- [x] all-feature completion이 mock_not_real cap을 확인한다.
- [x] all-feature completion이 unavailable blocker를 확인한다.
- [x] all-feature completion이 next_action을 확인한다.
- [x] all-feature completion이 source-string only checks를 별도 category로 분리한다.
- [x] source-string only check는 flagship feature에서 pass 조건으로 충분하지 않게 한다.
- [x] flagship feature는 blackbox artifact graph check가 있어야 complete.


## 20. P0 — Evidence Flagship Coverage

- [x] UX evidence graph checker를 추가한다.
- [x] PPT evidence graph checker를 추가한다.
- [x] DFix evidence graph checker를 추가한다.
- [x] graph checker는 command output mission id를 따라간다.
- [x] graph checker는 required artifacts 존재를 확인한다.
- [x] graph checker는 artifact schema를 검증한다.
- [x] graph checker는 evidence index를 확인한다.
- [x] graph checker는 proof를 확인한다.
- [x] graph checker는 trust report를 확인한다.
- [x] graph checker는 mock/real cap을 확인한다.
- [x] graph checker는 missing artifact를 blocker로 반환한다.


## 21. P0 — Stability / Safety Hardening

- [x] DFix patch runner는 secret file 패턴을 차단한다.
- [x] DFix patch runner는 .env 파일 patch를 차단한다.
- [x] DFix patch runner는 package lock 대량 변경을 high-risk로 표시한다.
- [x] DFix patch runner는 generated dist 파일 patch를 차단한다.
- [x] DFix patch runner는 binary file patch를 차단한다.
- [x] DFix patch runner는 chmod/delete/mv destructive command를 자동 실행하지 않는다.
- [x] DFix patch runner는 git worktree dirty status를 기록한다.
- [x] DFix rollback plan은 changed_files마다 존재해야 한다.
- [x] DFix verification fail 시 rollback suggestion을 제공한다.
- [x] UX/PPT generated images는 local-only를 유지한다.
- [x] UX/PPT screenshots는 shared TriWiki에 자동 publish되지 않는다.
- [x] all-feature report는 secret redaction 상태를 검사한다.


## 22. P0 — Release Gate Update

`package.json` scripts에 다음을 추가 또는 강화한다.

```json
{
  "scripts": {
    "dfix:fast-path": "node ./scripts/dfix-fast-path-check.mjs",
    "dfix:error-signature": "node ./scripts/dfix-error-signature-check.mjs",
    "dfix:cache": "node ./scripts/dfix-cache-check.mjs",
    "dfix:verification-selector": "node ./scripts/dfix-verification-selector-check.mjs",
    "dfix:fast-blackbox": "node ./scripts/dfix-fast-blackbox-check.mjs",
    "dfix:performance": "node ./scripts/dfix-performance-check.mjs",
    "ux-review:blackbox-artifact-graph": "node ./scripts/ux-review-blackbox-artifact-graph-check.mjs",
    "ppt:blackbox-artifact-graph": "node ./scripts/ppt-blackbox-artifact-graph-check.mjs",
    "flagship:evidence-graph": "node ./scripts/flagship-evidence-graph-check.mjs",
    "all-features:artifact-graph": "node ./scripts/all-feature-artifact-graph-check.mjs"
  }
}
```

`release:check`에는 반드시 다음을 포함한다.

```text
[x] dfix:fast-path
[x] dfix:error-signature
[x] dfix:cache
[x] dfix:verification-selector
[x] dfix:fast-blackbox
[x] dfix:performance
[x] ux-review:blackbox-artifact-graph
[x] ppt:blackbox-artifact-graph
[x] flagship:evidence-graph
[x] all-features:artifact-graph
```


## 23. Required Unit Tests

- [x] test/unit/dfix-error-signature.test.ts
- [x] test/unit/dfix-path-decision.test.ts
- [x] test/unit/dfix-cache.test.ts
- [x] test/unit/dfix-root-cause-ranking.test.ts
- [x] test/unit/dfix-patch-templates.test.ts
- [x] test/unit/dfix-patch-runner.test.ts
- [x] test/unit/dfix-codex-handoff-runner.test.ts
- [x] test/unit/dfix-verification-selector.test.ts
- [x] test/unit/dfix-verification-runner.test.ts
- [x] test/unit/dfix-speed-budgets.test.ts
- [x] test/unit/ux-review-artifact-graph.test.ts
- [x] test/unit/ppt-artifact-graph.test.ts
- [x] test/unit/all-feature-artifact-graph.test.ts
- [x] test/unit/flagship-evidence-coverage.test.ts


## 24. Required Integration Tests

- [x] test/integration/dfix-fast-deterministic-loop.test.ts
- [x] test/integration/dfix-cache-hit.test.ts
- [x] test/integration/dfix-noop-blocked.test.ts
- [x] test/integration/dfix-verification-selector-node.test.ts
- [x] test/integration/dfix-verification-selector-rust.test.ts
- [x] test/integration/dfix-codex-handoff-fake-runner.test.ts
- [x] test/integration/dfix-rollback-readiness.test.ts
- [x] test/integration/ux-review-blackbox-artifact-graph.test.ts
- [x] test/integration/ppt-blackbox-artifact-graph.test.ts
- [x] test/integration/all-feature-artifact-graph.test.ts


## 25. Required Black-box Tests

- [x] test/blackbox/dfix-fast-path-packed.test.mjs
- [x] test/blackbox/dfix-fast-blackbox-packed.test.mjs
- [x] test/blackbox/dfix-performance-packed.test.mjs
- [x] test/blackbox/ux-review-artifact-graph-packed.test.mjs
- [x] test/blackbox/ppt-artifact-graph-packed.test.mjs
- [x] test/blackbox/all-feature-artifact-graph-packed.test.mjs
- [x] test/blackbox/flagship-evidence-graph-packed.test.mjs


## 26. 대량 세부 Task Bank

- [x] DFix diagnose: define schema
- [x] DFix diagnose: implement module
- [x] DFix diagnose: write artifact
- [x] DFix diagnose: add time budget
- [x] DFix diagnose: add unit test
- [x] DFix diagnose: add integration fixture
- [x] DFix diagnose: add blackbox fixture when applicable
- [x] DFix diagnose: add evidence router mapping
- [x] DFix diagnose: add proof mapping
- [x] DFix diagnose: add trust mapping
- [x] DFix diagnose: add wrongness mapping
- [x] DFix diagnose: add next_action
- [x] DFix diagnose: add redaction
- [x] DFix signature: define schema
- [x] DFix signature: implement module
- [x] DFix signature: write artifact
- [x] DFix signature: add time budget
- [x] DFix signature: add unit test
- [x] DFix signature: add integration fixture
- [x] DFix signature: add blackbox fixture when applicable
- [x] DFix signature: add evidence router mapping
- [x] DFix signature: add proof mapping
- [x] DFix signature: add trust mapping
- [x] DFix signature: add wrongness mapping
- [x] DFix signature: add next_action
- [x] DFix signature: add redaction
- [x] DFix cache: define schema
- [x] DFix cache: implement module
- [x] DFix cache: write artifact
- [x] DFix cache: add time budget
- [x] DFix cache: add unit test
- [x] DFix cache: add integration fixture
- [x] DFix cache: add blackbox fixture when applicable
- [x] DFix cache: add evidence router mapping
- [x] DFix cache: add proof mapping
- [x] DFix cache: add trust mapping
- [x] DFix cache: add wrongness mapping
- [x] DFix cache: add next_action
- [x] DFix cache: add redaction
- [x] DFix path-decision: define schema
- [x] DFix path-decision: implement module
- [x] DFix path-decision: write artifact
- [x] DFix path-decision: add time budget
- [x] DFix path-decision: add unit test
- [x] DFix path-decision: add integration fixture
- [x] DFix path-decision: add blackbox fixture when applicable
- [x] DFix path-decision: add evidence router mapping
- [x] DFix path-decision: add proof mapping
- [x] DFix path-decision: add trust mapping
- [x] DFix path-decision: add wrongness mapping
- [x] DFix path-decision: add next_action
- [x] DFix path-decision: add redaction
- [x] DFix root-cause-ranking: define schema
- [x] DFix root-cause-ranking: implement module
- [x] DFix root-cause-ranking: write artifact
- [x] DFix root-cause-ranking: add time budget
- [x] DFix root-cause-ranking: add unit test
- [x] DFix root-cause-ranking: add integration fixture
- [x] DFix root-cause-ranking: add blackbox fixture when applicable
- [x] DFix root-cause-ranking: add evidence router mapping
- [x] DFix root-cause-ranking: add proof mapping
- [x] DFix root-cause-ranking: add trust mapping
- [x] DFix root-cause-ranking: add wrongness mapping
- [x] DFix root-cause-ranking: add next_action
- [x] DFix root-cause-ranking: add redaction
- [x] DFix patch-template: define schema
- [x] DFix patch-template: implement module
- [x] DFix patch-template: write artifact
- [x] DFix patch-template: add time budget
- [x] DFix patch-template: add unit test
- [x] DFix patch-template: add integration fixture
- [x] DFix patch-template: add blackbox fixture when applicable
- [x] DFix patch-template: add evidence router mapping
- [x] DFix patch-template: add proof mapping
- [x] DFix patch-template: add trust mapping
- [x] DFix patch-template: add wrongness mapping
- [x] DFix patch-template: add next_action
- [x] DFix patch-template: add redaction
- [x] DFix patch-runner: define schema
- [x] DFix patch-runner: implement module
- [x] DFix patch-runner: write artifact
- [x] DFix patch-runner: add time budget
- [x] DFix patch-runner: add unit test
- [x] DFix patch-runner: add integration fixture
- [x] DFix patch-runner: add blackbox fixture when applicable
- [x] DFix patch-runner: add evidence router mapping
- [x] DFix patch-runner: add proof mapping
- [x] DFix patch-runner: add trust mapping
- [x] DFix patch-runner: add wrongness mapping
- [x] DFix patch-runner: add next_action
- [x] DFix patch-runner: add redaction
- [x] DFix codex-handoff: define schema
- [x] DFix codex-handoff: implement module
- [x] DFix codex-handoff: write artifact
- [x] DFix codex-handoff: add time budget
- [x] DFix codex-handoff: add unit test
- [x] DFix codex-handoff: add integration fixture
- [x] DFix codex-handoff: add blackbox fixture when applicable
- [x] DFix codex-handoff: add evidence router mapping
- [x] DFix codex-handoff: add proof mapping
- [x] DFix codex-handoff: add trust mapping
- [x] DFix codex-handoff: add wrongness mapping
- [x] DFix codex-handoff: add next_action
- [x] DFix codex-handoff: add redaction
- [x] DFix diff-capture: define schema
- [x] DFix diff-capture: implement module
- [x] DFix diff-capture: write artifact
- [x] DFix diff-capture: add time budget
- [x] DFix diff-capture: add unit test
- [x] DFix diff-capture: add integration fixture
- [x] DFix diff-capture: add blackbox fixture when applicable
- [x] DFix diff-capture: add evidence router mapping
- [x] DFix diff-capture: add proof mapping
- [x] DFix diff-capture: add trust mapping
- [x] DFix diff-capture: add wrongness mapping
- [x] DFix diff-capture: add next_action
- [x] DFix diff-capture: add redaction
- [x] DFix verification-selection: define schema
- [x] DFix verification-selection: implement module
- [x] DFix verification-selection: write artifact
- [x] DFix verification-selection: add time budget
- [x] DFix verification-selection: add unit test
- [x] DFix verification-selection: add integration fixture
- [x] DFix verification-selection: add blackbox fixture when applicable
- [x] DFix verification-selection: add evidence router mapping
- [x] DFix verification-selection: add proof mapping
- [x] DFix verification-selection: add trust mapping
- [x] DFix verification-selection: add wrongness mapping
- [x] DFix verification-selection: add next_action
- [x] DFix verification-selection: add redaction
- [x] DFix verification-runner: define schema
- [x] DFix verification-runner: implement module
- [x] DFix verification-runner: write artifact
- [x] DFix verification-runner: add time budget
- [x] DFix verification-runner: add unit test
- [x] DFix verification-runner: add integration fixture
- [x] DFix verification-runner: add blackbox fixture when applicable
- [x] DFix verification-runner: add evidence router mapping
- [x] DFix verification-runner: add proof mapping
- [x] DFix verification-runner: add trust mapping
- [x] DFix verification-runner: add wrongness mapping
- [x] DFix verification-runner: add next_action
- [x] DFix verification-runner: add redaction
- [x] DFix rollback: define schema
- [x] DFix rollback: implement module
- [x] DFix rollback: write artifact
- [x] DFix rollback: add time budget
- [x] DFix rollback: add unit test
- [x] DFix rollback: add integration fixture
- [x] DFix rollback: add blackbox fixture when applicable
- [x] DFix rollback: add evidence router mapping
- [x] DFix rollback: add proof mapping
- [x] DFix rollback: add trust mapping
- [x] DFix rollback: add wrongness mapping
- [x] DFix rollback: add next_action
- [x] DFix rollback: add redaction
- [x] DFix proof: define schema
- [x] DFix proof: implement module
- [x] DFix proof: write artifact
- [x] DFix proof: add time budget
- [x] DFix proof: add unit test
- [x] DFix proof: add integration fixture
- [x] DFix proof: add blackbox fixture when applicable
- [x] DFix proof: add evidence router mapping
- [x] DFix proof: add proof mapping
- [x] DFix proof: add trust mapping
- [x] DFix proof: add wrongness mapping
- [x] DFix proof: add next_action
- [x] DFix proof: add redaction
- [x] DFix trust: define schema
- [x] DFix trust: implement module
- [x] DFix trust: write artifact
- [x] DFix trust: add time budget
- [x] DFix trust: add unit test
- [x] DFix trust: add integration fixture
- [x] DFix trust: add blackbox fixture when applicable
- [x] DFix trust: add evidence router mapping
- [x] DFix trust: add proof mapping
- [x] DFix trust: add trust mapping
- [x] DFix trust: add wrongness mapping
- [x] DFix trust: add next_action
- [x] DFix trust: add redaction
- [x] DFix wrongness: define schema
- [x] DFix wrongness: implement module
- [x] DFix wrongness: write artifact
- [x] DFix wrongness: add time budget
- [x] DFix wrongness: add unit test
- [x] DFix wrongness: add integration fixture
- [x] DFix wrongness: add blackbox fixture when applicable
- [x] DFix wrongness: add evidence router mapping
- [x] DFix wrongness: add proof mapping
- [x] DFix wrongness: add trust mapping
- [x] DFix wrongness: add wrongness mapping
- [x] DFix wrongness: add next_action
- [x] DFix wrongness: add redaction
- [x] DFix performance: define schema
- [x] DFix performance: implement module
- [x] DFix performance: write artifact
- [x] DFix performance: add time budget
- [x] DFix performance: add unit test
- [x] DFix performance: add integration fixture
- [x] DFix performance: add blackbox fixture when applicable
- [x] DFix performance: add evidence router mapping
- [x] DFix performance: add proof mapping
- [x] DFix performance: add trust mapping
- [x] DFix performance: add wrongness mapping
- [x] DFix performance: add next_action
- [x] DFix performance: add redaction
- [x] UX-Review: command output contains mission_id or explicit not_applicable reason
- [x] UX-Review: required artifacts exist
- [x] UX-Review: artifacts pass schema validation
- [x] UX-Review: evidence index links artifacts
- [x] UX-Review: completion proof references evidence
- [x] UX-Review: trust report summarizes status
- [x] UX-Review: wrongness mapping exists
- [x] UX-Review: mock evidence downgrade present
- [x] UX-Review: next_action present for blockers
- [x] UX-Review: blackbox artifact graph check exists
- [x] PPT Imagegen Review: command output contains mission_id or explicit not_applicable reason
- [x] PPT Imagegen Review: required artifacts exist
- [x] PPT Imagegen Review: artifacts pass schema validation
- [x] PPT Imagegen Review: evidence index links artifacts
- [x] PPT Imagegen Review: completion proof references evidence
- [x] PPT Imagegen Review: trust report summarizes status
- [x] PPT Imagegen Review: wrongness mapping exists
- [x] PPT Imagegen Review: mock evidence downgrade present
- [x] PPT Imagegen Review: next_action present for blockers
- [x] PPT Imagegen Review: blackbox artifact graph check exists
- [x] DFix: command output contains mission_id or explicit not_applicable reason
- [x] DFix: required artifacts exist
- [x] DFix: artifacts pass schema validation
- [x] DFix: evidence index links artifacts
- [x] DFix: completion proof references evidence
- [x] DFix: trust report summarizes status
- [x] DFix: wrongness mapping exists
- [x] DFix: mock evidence downgrade present
- [x] DFix: next_action present for blockers
- [x] DFix: blackbox artifact graph check exists
- [x] Computer Use: command output contains mission_id or explicit not_applicable reason
- [x] Computer Use: required artifacts exist
- [x] Computer Use: artifacts pass schema validation
- [x] Computer Use: evidence index links artifacts
- [x] Computer Use: completion proof references evidence
- [x] Computer Use: trust report summarizes status
- [x] Computer Use: wrongness mapping exists
- [x] Computer Use: mock evidence downgrade present
- [x] Computer Use: next_action present for blockers
- [x] Computer Use: blackbox artifact graph check exists
- [x] DB Safety: command output contains mission_id or explicit not_applicable reason
- [x] DB Safety: required artifacts exist
- [x] DB Safety: artifacts pass schema validation
- [x] DB Safety: evidence index links artifacts
- [x] DB Safety: completion proof references evidence
- [x] DB Safety: trust report summarizes status
- [x] DB Safety: wrongness mapping exists
- [x] DB Safety: mock evidence downgrade present
- [x] DB Safety: next_action present for blockers
- [x] DB Safety: blackbox artifact graph check exists
- [x] Hooks: command output contains mission_id or explicit not_applicable reason
- [x] Hooks: required artifacts exist
- [x] Hooks: artifacts pass schema validation
- [x] Hooks: evidence index links artifacts
- [x] Hooks: completion proof references evidence
- [x] Hooks: trust report summarizes status
- [x] Hooks: wrongness mapping exists
- [x] Hooks: mock evidence downgrade present
- [x] Hooks: next_action present for blockers
- [x] Hooks: blackbox artifact graph check exists
- [x] codex-lb: command output contains mission_id or explicit not_applicable reason
- [x] codex-lb: required artifacts exist
- [x] codex-lb: artifacts pass schema validation
- [x] codex-lb: evidence index links artifacts
- [x] codex-lb: completion proof references evidence
- [x] codex-lb: trust report summarizes status
- [x] codex-lb: wrongness mapping exists
- [x] codex-lb: mock evidence downgrade present
- [x] codex-lb: next_action present for blockers
- [x] codex-lb: blackbox artifact graph check exists
- [x] Git Collaboration: command output contains mission_id or explicit not_applicable reason
- [x] Git Collaboration: required artifacts exist
- [x] Git Collaboration: artifacts pass schema validation
- [x] Git Collaboration: evidence index links artifacts
- [x] Git Collaboration: completion proof references evidence
- [x] Git Collaboration: trust report summarizes status
- [x] Git Collaboration: wrongness mapping exists
- [x] Git Collaboration: mock evidence downgrade present
- [x] Git Collaboration: next_action present for blockers
- [x] Git Collaboration: blackbox artifact graph check exists
- [x] TriWiki: command output contains mission_id or explicit not_applicable reason
- [x] TriWiki: required artifacts exist
- [x] TriWiki: artifacts pass schema validation
- [x] TriWiki: evidence index links artifacts
- [x] TriWiki: completion proof references evidence
- [x] TriWiki: trust report summarizes status
- [x] TriWiki: wrongness mapping exists
- [x] TriWiki: mock evidence downgrade present
- [x] TriWiki: next_action present for blockers
- [x] TriWiki: blackbox artifact graph check exists
- [x] Wrongness Memory: command output contains mission_id or explicit not_applicable reason
- [x] Wrongness Memory: required artifacts exist
- [x] Wrongness Memory: artifacts pass schema validation
- [x] Wrongness Memory: evidence index links artifacts
- [x] Wrongness Memory: completion proof references evidence
- [x] Wrongness Memory: trust report summarizes status
- [x] Wrongness Memory: wrongness mapping exists
- [x] Wrongness Memory: mock evidence downgrade present
- [x] Wrongness Memory: next_action present for blockers
- [x] Wrongness Memory: blackbox artifact graph check exists
- [x] Image Voxel: command output contains mission_id or explicit not_applicable reason
- [x] Image Voxel: required artifacts exist
- [x] Image Voxel: artifacts pass schema validation
- [x] Image Voxel: evidence index links artifacts
- [x] Image Voxel: completion proof references evidence
- [x] Image Voxel: trust report summarizes status
- [x] Image Voxel: wrongness mapping exists
- [x] Image Voxel: mock evidence downgrade present
- [x] Image Voxel: next_action present for blockers
- [x] Image Voxel: blackbox artifact graph check exists
- [x] Team: command output contains mission_id or explicit not_applicable reason
- [x] Team: required artifacts exist
- [x] Team: artifacts pass schema validation
- [x] Team: evidence index links artifacts
- [x] Team: completion proof references evidence
- [x] Team: trust report summarizes status
- [x] Team: wrongness mapping exists
- [x] Team: mock evidence downgrade present
- [x] Team: next_action present for blockers
- [x] Team: blackbox artifact graph check exists
- [x] QA Loop: command output contains mission_id or explicit not_applicable reason
- [x] QA Loop: required artifacts exist
- [x] QA Loop: artifacts pass schema validation
- [x] QA Loop: evidence index links artifacts
- [x] QA Loop: completion proof references evidence
- [x] QA Loop: trust report summarizes status
- [x] QA Loop: wrongness mapping exists
- [x] QA Loop: mock evidence downgrade present
- [x] QA Loop: next_action present for blockers
- [x] QA Loop: blackbox artifact graph check exists
- [x] Research: command output contains mission_id or explicit not_applicable reason
- [x] Research: required artifacts exist
- [x] Research: artifacts pass schema validation
- [x] Research: evidence index links artifacts
- [x] Research: completion proof references evidence
- [x] Research: trust report summarizes status
- [x] Research: wrongness mapping exists
- [x] Research: mock evidence downgrade present
- [x] Research: next_action present for blockers
- [x] Research: blackbox artifact graph check exists
- [x] Scouts: command output contains mission_id or explicit not_applicable reason
- [x] Scouts: required artifacts exist
- [x] Scouts: artifacts pass schema validation
- [x] Scouts: evidence index links artifacts
- [x] Scouts: completion proof references evidence
- [x] Scouts: trust report summarizes status
- [x] Scouts: wrongness mapping exists
- [x] Scouts: mock evidence downgrade present
- [x] Scouts: next_action present for blockers
- [x] Scouts: blackbox artifact graph check exists
- [x] Commit: command output contains mission_id or explicit not_applicable reason
- [x] Commit: required artifacts exist
- [x] Commit: artifacts pass schema validation
- [x] Commit: evidence index links artifacts
- [x] Commit: completion proof references evidence
- [x] Commit: trust report summarizes status
- [x] Commit: wrongness mapping exists
- [x] Commit: mock evidence downgrade present
- [x] Commit: next_action present for blockers
- [x] Commit: blackbox artifact graph check exists
- [x] GX: command output contains mission_id or explicit not_applicable reason
- [x] GX: required artifacts exist
- [x] GX: artifacts pass schema validation
- [x] GX: evidence index links artifacts
- [x] GX: completion proof references evidence
- [x] GX: trust report summarizes status
- [x] GX: wrongness mapping exists
- [x] GX: mock evidence downgrade present
- [x] GX: next_action present for blockers
- [x] GX: blackbox artifact graph check exists
- [x] Rust Accelerator: command output contains mission_id or explicit not_applicable reason
- [x] Rust Accelerator: required artifacts exist
- [x] Rust Accelerator: artifacts pass schema validation
- [x] Rust Accelerator: evidence index links artifacts
- [x] Rust Accelerator: completion proof references evidence
- [x] Rust Accelerator: trust report summarizes status
- [x] Rust Accelerator: wrongness mapping exists
- [x] Rust Accelerator: mock evidence downgrade present
- [x] Rust Accelerator: next_action present for blockers
- [x] Rust Accelerator: blackbox artifact graph check exists


## 27. Done Definition

- [x] version 1.13.0 everywhere.
- [x] DFix L0/L1/L2/L3 fast path implemented.
- [x] DFix error signature engine implemented.
- [x] DFix cache and wrongness memory implemented.
- [x] DFix root cause ranking implemented.
- [x] DFix fast patch templates implemented.
- [x] DFix patch runner implemented.
- [x] DFix bounded Codex patch handoff runner implemented or honest integration_optional blocker.
- [x] DFix verification selector implemented.
- [x] DFix verification runner implemented.
- [x] DFix speed budgets implemented.
- [x] DFix fast blackbox E2E implemented.
- [x] UX/PPT artifact graph blackbox checks implemented.
- [x] All-feature artifact graph check implemented.
- [x] Evidence flagship coverage implemented.
- [x] Release gate includes new checks.
- [x] Docs updated.
- [x] No P0 gaps remain.


## 28. Final Report Format

작업 완료 후 다음 형식으로 보고한다.

```md
# SKS 1.13.0 DFix Extreme Speed Kernel Report

## Version
- Previous: 1.12.0
- New: 1.13.0

## DFix Fast Path
| Stage | Budget | Result | Evidence |
| --- | ---: | --- | --- |
| diagnose | ... | pass/fail | ... |
| signature | ... | pass/fail | ... |
| path decision | ... | pass/fail | ... |
| patch runner | ... | pass/fail | ... |
| verification selector | ... | pass/fail | ... |
| verification runner | ... | pass/fail | ... |

## DFix Safety
- no-op blocked:
- high-risk blocked:
- rollback ready:
- wrongness recorded:

## UX/PPT Artifact Graph
| Feature | Result | Evidence |
| --- | --- | --- |
| UX-Review | pass/fail | ... |
| PPT Imagegen Review | pass/fail | ... |

## All-Feature Artifact Graph
- advertised:
- complete:
- blocked:
- missing:

## Release Gate
| Command | Result |
| --- | --- |
| dfix:fast-path | pass/fail |
| dfix:fast-blackbox | pass/fail |
| dfix:performance | pass/fail |
| flagship:evidence-graph | pass/fail |
| npm run release:check | pass/fail |

## Remaining Gaps
- None for P0.
```


## 29. 최종 성공 문장

> SKS 1.13.0은 DFix를 초고속 direct fix kernel로 완성하고, UX/PPT/DFix/all-feature evidence graph를 blackbox로 검증하여, 빠르면서도 안전하고 증거가 남는 최강 안정화 릴리스다.
