# SKS 1.0.8 Goal 지시서 — Codex rust-v0.132.0 완전 반영 · Real UX-Review gpt-image-2 Callout/Fix Loop · Release Seal

> 대상 저장소: `mandarange/Sneakoscope-Codex`
> 현재 기준 버전: `1.0.7` 배포 이후 main
> 목표 버전: **`1.0.8`**
> 외부 기준: **OpenAI Codex CLI `rust-v0.132.0`**
> 목표 성격: **1.0.7 잔여 미비점 완전 제거 + Codex 0.132 신규 기능 적극 반영 + `$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues`를 실제 실행형 대표 기능으로 완성**
> 핵심 원칙: **새로운 경쟁 하네스 기능 복제 금지. SKS의 핵심인 proof/evidence/TriWiki/Wrongness/Computer Use/codex-lb/UX-Review를 실전 실행 루프로 완성한다.**

---

## 0. Goal Command Payload

```bash
sks goal create "SKS 1.0.8 Codex 0.132 real UX-Review gpt-image-2 callout fix loop final seal" --from-file docs/goals/sks-1.0.8-codex-0.132-ux-review-final-seal.md
```

Codex App / Codex CLI에 다음처럼 전달한다.

```text
$Goal SKS 1.0.8 업데이트를 수행한다. 현재 1.0.7 이후 남은 미비점 — package/version metadata drift, Codex rust-v0.132.0 신규 기능 미반영, `$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues`가 아직 policy/fixture 중심이고 real gpt-image-2 callout generation → issue extraction → fix loop → recapture/re-review → Image Voxel/Completion Proof까지 완전히 자동화되지 않은 문제 — 를 전부 P0로 해결한다. Codex 0.132의 `codex exec resume --output-schema`, app-server image fidelity preservation, memory summary version/rebuild, goal continuation blocker behavior, TUI probe batching 개선을 SKS에 적극 반영한다. 최종 목표는 SKS 대표 기능인 UX-Review를 실제 gpt-image-2 기반 visual callout/fix loop로 완성하고, proof/evidence/TriWiki/Wrongness/release gates로 봉인하는 것이다.
```


## 1. Source of Truth — Codex rust-v0.132.0 반영 항목

- [x] OpenAI Codex CLI `rust-v0.132.0` 릴리스 노트를 기준으로 compatibility matrix를 업데이트한다.
- [x] `codex exec resume`의 `--output-schema` 지원을 SKS structured output 경로에 반영한다.
- [x] Python SDK first-class auth와 richer TurnResult는 P1 optional integration으로 분류한다.
- [x] TUI startup terminal capability probe batching을 SKS doctor/probe batching에 반영한다.
- [x] Remote executor registration can use standard Codex auth 항목을 SKS codex-lb/remote executor policy에 반영할지 검토한다.
- [x] App-server turns image fidelity preservation, original-resolution local images 보존을 UX-Review/Computer Use/Image Voxel에 P0로 반영한다.
- [x] Goal continuation usage limit/repeated blocker stop behavior를 SKS Goal/Research/QA loop에 반영한다.
- [x] Memory summaries versioned/rebuild behavior를 SKS TriWiki/Wrongness/Shared Memory summaries에 반영한다.
- [x] Codex 0.132 unknown future fields는 추측하지 않고 compatibility warning으로 기록한다.
- [x] Codex 0.131 hook strict-subset gate는 유지하되 0.132 matrix에서도 통과해야 한다.


## 2. 최종 성공 문장

> SKS 1.0.8은 Codex rust-v0.132.0의 structured resume output, app-server image fidelity, memory summary rebuild, continuation blocker behavior를 반영하고, `$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues`를 real gpt-image-2 annotated callout generation → schema-bound issue extraction → safe fix loop → recapture/re-review → Image Voxel TriWiki → Completion Proof/Trust Report까지 연결하는 완성형 Codex visual trust harness다.


## 3. 절대 원칙

- [x] 기능 이름만 추가하지 않는다.
- [x] text-only screenshot critique를 gpt-image-2 callout review로 대체하지 않는다.
- [x] gpt-image-2 generated callout image가 없으면 UX-Review verified claim을 만들지 않는다.
- [x] generated callout image에서 issue ledger를 추출하지 않았으면 fix loop를 시작하지 않는다.
- [x] fix loop는 P0/P1 우선이며 bounded iteration을 지킨다.
- [x] fix 후 recapture/re-review 없이 visual fix verified claim을 만들지 않는다.
- [x] Computer Use screenshot과 gpt-image-2 output은 local-only privacy 기본값을 지킨다.
- [x] shared TriWiki에는 screenshot binary를 자동 publish하지 않는다.
- [x] Image Voxel metadata와 anchors는 publish 가능하되 policy를 따른다.
- [x] Codex 0.132 기능이 unavailable이면 honest blocker를 기록한다.
- [x] `codex exec resume --output-schema`가 unavailable이면 fallback은 verified_partial 이하로 처리한다.
- [x] package/version/changelog/stamp drift는 release failure다.
- [x] 모든 P0는 다음 버전으로 넘기지 않는다.


## 4. Version / Release Metadata 정합성 P0

- [x] package.json version을 1.0.8로 올린다.
- [x] package-lock.json이 있으면 1.0.8로 정렬한다.
- [x] src/core/version.ts를 1.0.8로 올린다.
- [x] src/core/fsx.ts PACKAGE_VERSION을 1.0.8로 올린다.
- [x] crates/sks-core/Cargo.toml version을 1.0.8로 올린다.
- [x] crates/sks-core/src/main.rs --version 출력을 1.0.8로 정렬한다.
- [x] CHANGELOG.md에 [1.0.8] 섹션을 추가한다.
- [x] README.md에 1.0.8 섹션을 추가한다.
- [x] docs/release-readiness.md를 1.0.8로 갱신한다.
- [x] release-check-stamp가 1.0.8 package hash/source digest 기준으로 재생성되게 한다.
- [x] release:readiness report가 package version 1.0.8이 아니면 fail한다.
- [x] registry:check가 1.0.8 publish status를 검사한다.
- [x] publish:dry가 1.0.8 tarball metadata를 검사한다.


## 5. CHANGELOG 필수 섹션

```md
## [1.0.8] - YYYY-MM-DD

### Added
- Add Codex CLI `rust-v0.132.0` compatibility matrix and feature detection.
- Add `codex exec resume --output-schema` integration for schema-bound Scout, UX-Review callout extraction, Completion Proof, and Wrongness outputs.
- Add app-server image fidelity preservation support for UX-Review source screenshots, gpt-image-2 callouts, and Image Voxel coordinate alignment.
- Add real `$UX-Review` gpt-image-2 callout generation, generated image ingestion, schema-bound callout extraction, fix task creation, bounded fix loop, recapture, and re-review.
- Add UX-Review before/after Image Voxel relations and visual wrongness records for bad callouts, stale screenshots, and failed fixes.
- Add Codex memory summary version/rebuild integration for TriWiki/Wrongness generated summaries.
- Add Goal/QA/Research repeated blocker and usage-limit loop stop behavior aligned with Codex 0.132.

### Fixed
- Prevent UX-Review from passing with prose-only screenshot critique.
- Prevent mock gpt-image-2 callout fixtures from being promoted to verified real UX evidence.
- Prevent visual fix claims without post-fix recapture and changed-screen re-review.
- Prevent version drift between package metadata, runtime version, Rust crate version, changelog, and release stamp.

### Changed
- Treat `$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues` as a first-class real execution route.
- Treat source screenshot fidelity and coordinate alignment as release-gated visual evidence requirements.
- Treat Codex 0.132 structured resume output as the preferred path for schema-bound automation artifacts.
```


## 6. P0 — Codex 0.132 Compatibility Matrix

- [x] 새 파일 `src/core/codex-compat/codex-0-132.ts`를 추가한다.
- [x] compat matrix에 `rust-v0.132.0`을 추가한다.
- [x] compat matrix에 `exec_resume_output_schema` capability를 추가한다.
- [x] compat matrix에 `app_server_image_fidelity` capability를 추가한다.
- [x] compat matrix에 `memory_summary_version_rebuild` capability를 추가한다.
- [x] compat matrix에 `goal_continuation_blocker_stop` capability를 추가한다.
- [x] compat matrix에 `tui_probe_batching` capability를 추가한다.
- [x] compat matrix에 `python_sdk_turn_result` capability를 P1로 추가한다.
- [x] `sks codex compatibility --json`이 0.132 capability를 표시한다.
- [x] `sks codex doctor --json`이 0.132 feature availability를 표시한다.
- [x] Codex missing은 integration_optional로 유지한다.
- [x] Codex <0.132는 degraded but supported로 표시한다.
- [x] Codex >=0.132이면 UX-Review output-schema path preferred=true로 표시한다.
- [x] unknown newer Codex는 warning만 내고 0.132 baseline으로 검증한다.


## 7. P0 — `codex exec resume --output-schema` Integration

- [x] 새 모듈 `src/core/codex-exec-output-schema.ts`를 추가한다.
- [x] `codex exec resume --output-schema` availability detector를 구현한다.
- [x] detector는 Codex version >=0.132 또는 help text에서 `--output-schema`를 확인한다.
- [x] schema file path를 temp 또는 mission dir에 쓸 수 있게 한다.
- [x] resume command builder를 구현한다.
- [x] resume command builder는 session id/thread id/resume id를 안전하게 받는다.
- [x] resume command builder는 output schema path를 absolute path로 넘긴다.
- [x] stdout/stderr는 redaction된다.
- [x] JSON parse failure는 structured blocker로 기록한다.
- [x] schema validation failure는 Wrongness Memory에 기록한다.
- [x] fallback path는 Codex <0.132일 때만 허용한다.
- [x] fallback path 결과는 verified_partial 이하로 제한한다.
- [x] Scout real outputs에 output-schema를 적용한다.
- [x] UX-Review callout extraction에 output-schema를 적용한다.
- [x] Completion Proof generation에 output-schema를 적용한다.
- [x] Wrongness extraction에 output-schema를 적용한다.
- [x] Research paper/eval summaries에 output-schema 적용을 P1로 준비한다.


## 8. P0 — Schema Files for Codex Resume

- [x] schemas/codex/ux-review-callout-extraction.schema.json 추가
- [x] schemas/codex/image-ux-issue-ledger.schema.json 추가
- [x] schemas/codex/completion-proof.schema.json 추가 또는 existing schema link
- [x] schemas/codex/wrongness-record.schema.json 추가 또는 existing schema link
- [x] schemas/codex/scout-result.schema.json 추가 또는 existing schema link
- [x] schemas/codex/computer-use-live-evidence.schema.json 추가 또는 existing schema link
- [x] schema 파일들은 dist package에 포함되게 한다.
- [x] package-boundary check가 schema files를 검사한다.
- [x] output-schema runner가 schema file existence를 검사한다.
- [x] schema invalid JSON이면 release fail한다.


## 9. P0 — App-server Image Fidelity Preservation

- [x] Codex 0.132 app-server image fidelity capability detector를 구현한다.
- [x] UX-Review source screenshot inventory에 original_resolution field를 추가한다.
- [x] source screenshot width/height/sha256를 기록한다.
- [x] source screenshot EXIF/orientation normalization을 기록한다.
- [x] generated callout image에 source image id를 기록한다.
- [x] generated callout image에 requested_fidelity='original' 또는 equivalent metadata를 기록한다.
- [x] generated image size와 source image size relation을 기록한다.
- [x] bbox coordinate transform validator를 추가한다.
- [x] coordinate transform이 mismatch이면 issue extraction confidence를 낮춘다.
- [x] Image Voxel ledger에 source/generated/fixed image dimension relation을 저장한다.
- [x] Computer Use screenshot → gpt-image-2 input path가 original-resolution을 보존하는지 검사한다.
- [x] image fidelity unavailable이면 warning + verified_partial 이하로 제한한다.


## 10. P0 — `$UX-Review` Command Real Execution Surface

- [x] `sks ux-review run --image <path> --fix --json`을 지원한다.
- [x] `sks ux-review run --screenshot <path> --fix --json`을 지원한다.
- [x] `sks ux-review run --mission latest --fix --json`을 지원한다.
- [x] `sks ux-review run --from-computer-use latest --fix --json`을 지원한다.
- [x] `sks ux-review callouts --image <path> --json`을 지원한다.
- [x] `sks ux-review extract-issues --generated-image <path> --json`을 지원한다.
- [x] `sks ux-review fix latest --json`을 지원한다.
- [x] `sks ux-review recapture latest --json`을 지원한다.
- [x] `sks ux-review recheck latest --json`을 지원한다.
- [x] `sks ux-review status latest --json`을 지원한다.
- [x] `$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues` prompt가 route classifier에서 UX-Review로 분류된다.
- [x] route classifier가 `gpt-image-2 callouts` phrase를 image-ux-review route로 매핑한다.
- [x] route classifier가 `then fix the issues`를 remediation requested로 표시한다.
- [x] source image가 없으면 screenshot_required blocker를 반환한다.
- [x] source image가 있으면 mission 생성 + source screen inventory 작성


## 11. P0 — Real gpt-image-2 Callout Generation Adapter

- [x] 새 모듈 `src/core/image-ux-review/imagegen-adapter.ts`를 추가한다.
- [x] adapter interface `ImageUxReviewImagegenAdapter`를 정의한다.
- [x] Codex App `$imagegen` adapter를 구현한다.
- [x] OpenAI Images API adapter는 optional P1로 구조만 준비한다.
- [x] gpt-image-2 model name을 explicit field로 기록한다.
- [x] reference image input path를 adapter에 전달한다.
- [x] review prompt template을 policy에서 adapter로 전달한다.
- [x] generated annotated review image output path를 mission dir에 쓴다.
- [x] generated image output id/path/sha256/created_at을 기록한다.
- [x] adapter unavailable이면 `imagegen_capability_missing` blocker를 기록한다.
- [x] imagegen 실패 시 `gpt_image_2_callout_generation_failed` wrongness를 기록한다.
- [x] imagegen 결과가 prose-only이면 fail한다.
- [x] imagegen 결과가 image artifact를 포함하지 않으면 fail한다.
- [x] generated image는 local-only 기본값이다.
- [x] generated image는 shared TriWiki에 자동 publish하지 않는다.
- [x] generated image metadata는 Image Voxel에 publish 가능하다.
- [x] mock fixture는 `source: mock_fixture`로 표시한다.
- [x] real generated output만 verified claim에 사용한다.


## 12. P0 — gpt-image-2 Callout Prompt Contract

- [x] prompt template은 numbered callouts를 요구한다.
- [x] prompt template은 P0/P1/P2/P3 severity labels를 요구한다.
- [x] prompt template은 concrete UI region overlay를 요구한다.
- [x] prompt template은 visual hierarchy marker를 요구한다.
- [x] prompt template은 contrast marker를 요구한다.
- [x] prompt template은 alignment marker를 요구한다.
- [x] prompt template은 density marker를 요구한다.
- [x] prompt template은 affordance marker를 요구한다.
- [x] prompt template은 eye-flow arrows를 요구한다.
- [x] prompt template은 corrected mini-comp 또는 before/after strip을 요구한다.
- [x] prompt template은 visible evidence만 사용하라고 요구한다.
- [x] prompt template은 product requirement invention 금지를 요구한다.
- [x] prompt template은 screenshot source id를 포함한다.
- [x] prompt template은 output must be image artifact라고 명시한다.
- [x] prompt template은 text-only response invalid라고 명시한다.


## 13. P0 — Generated Callout Image Ingestion

- [x] generated image를 mission dir에 저장한다.
- [x] generated image sha256를 계산한다.
- [x] generated image dimensions를 계산한다.
- [x] generated image source_screen_id를 기록한다.
- [x] generated image provider model `gpt-image-2`를 기록한다.
- [x] generated image provider surface를 기록한다.
- [x] generated image local-only privacy를 기록한다.
- [x] generated image artifact가 존재하지 않으면 gate fail.
- [x] generated image ledger에 `real_generated: true|false`를 기록한다.
- [x] generated image ledger에 `mock: true|false`를 기록한다.
- [x] generated image ledger에 `callout_extraction_required: true`를 기록한다.
- [x] generated image를 Image Voxel ledger에 ingest한다.
- [x] source screenshot과 generated image relation을 만든다.
- [x] relation type은 `generated_callout_review_of`로 한다.


## 14. P0 — Callout Extraction with `--output-schema`

- [x] 새 모듈 `src/core/image-ux-review/callout-extraction.ts`를 추가한다.
- [x] generated callout image를 입력으로 받는다.
- [x] Codex 0.132 `codex exec resume --output-schema`를 preferred path로 사용한다.
- [x] issue ledger schema를 output-schema로 넘긴다.
- [x] extraction result는 strict JSON이어야 한다.
- [x] extraction result schema validation을 수행한다.
- [x] extraction result에 callout_id가 있어야 한다.
- [x] extraction result에 severity가 있어야 한다.
- [x] severity는 P0/P1/P2/P3 중 하나여야 한다.
- [x] extraction result에 bbox/region이 있어야 한다.
- [x] bbox는 generated image bounds 안에 있어야 한다.
- [x] extraction result에 source_screen_id가 있어야 한다.
- [x] extraction result에 evidence_image_id가 있어야 한다.
- [x] extraction result에 title/detail/fix_action이 있어야 한다.
- [x] extraction result에 confidence가 있어야 한다.
- [x] extraction result에 extracted_from_generated_image=true를 기록한다.
- [x] text-only generated review에서는 extraction fail한다.
- [x] extraction fail은 wrongness record를 만든다.
- [x] Codex <0.132 fallback은 verified_partial 이하로 제한한다.


## 15. P0 — UX Issue Ledger Schema

- [x] issue ledger schema를 v2로 업데이트한다.
- [x] issue row에 `id`를 포함한다.
- [x] issue row에 `severity`를 포함한다.
- [x] issue row에 `source_screen_id`를 포함한다.
- [x] issue row에 `generated_review_image_id`를 포함한다.
- [x] issue row에 `callout_id`를 포함한다.
- [x] issue row에 `bbox`를 포함한다.
- [x] issue row에 `region` 또는 normalized region을 포함한다.
- [x] issue row에 `title`을 포함한다.
- [x] issue row에 `detail`을 포함한다.
- [x] issue row에 `likely_cause`를 포함한다.
- [x] issue row에 `fix_action`을 포함한다.
- [x] issue row에 `target_surface`를 포함한다.
- [x] issue row에 `candidate_files`를 포함할 수 있게 한다.
- [x] issue row에 `status`를 포함한다.
- [x] issue row status는 open/fixed/accepted_not_applicable/blocked/needs_human 중 하나다.
- [x] issue row에 `confidence`를 포함한다.
- [x] issue row에 `source`를 real_gpt_image_2_callout로 기록한다.
- [x] mock fixture issue는 source mock_fixture로 기록한다.


## 16. P0 — Issue → Fix Task Conversion

- [x] 새 모듈 `src/core/image-ux-review/fix-task-planner.ts`를 추가한다.
- [x] P0/P1 issues를 fix task로 변환한다.
- [x] P2는 cheap/local fix만 자동화 대상으로 삼는다.
- [x] P3는 default로 suggestion only 처리한다.
- [x] fix task에 issue_id를 연결한다.
- [x] fix task에 source_screen_id를 연결한다.
- [x] fix task에 callout_id를 연결한다.
- [x] fix task에 candidate_files를 연결한다.
- [x] fix task에 patch_strategy를 기록한다.
- [x] fix task에 risk_level을 기록한다.
- [x] fix task에 requires_human_review를 기록한다.
- [x] fix task에 expected_visual_delta를 기록한다.
- [x] fix task가 없으면 no_fixable_issues blocker를 기록한다.
- [x] fix task generation에는 Scout 2 Verification input을 포함한다.
- [x] fix task generation에는 Wrongness avoidance rules를 포함한다.


## 17. P0 — Safe Fix Loop

- [x] 새 모듈 `src/core/image-ux-review/fix-loop.ts`를 추가한다.
- [x] fix loop는 max_full_surface_passes를 지킨다.
- [x] fix loop는 max_screen_retries를 지킨다.
- [x] fix loop는 P0/P1 먼저 처리한다.
- [x] fix loop는 risky patch를 자동 적용하지 않는다.
- [x] fix loop는 DB/destructive operation을 실행하지 않는다.
- [x] fix loop는 code patch 전 git dirty status를 기록한다.
- [x] fix loop는 changed files list를 기록한다.
- [x] fix loop는 patch command/status를 기록한다.
- [x] fix loop는 patch 실패 시 blocker를 기록한다.
- [x] fix loop는 patch 성공 후 recapture_required를 기록한다.
- [x] fix loop는 patch 없이 issue status fixed로 바꾸지 않는다.
- [x] fix loop는 no-op patch를 wrongness로 기록한다.
- [x] fix loop는 repeated blocker를 감지한다.
- [x] fix loop는 usage limit/repeated blocker에 닿으면 멈춘다.
- [x] fix loop result를 `image-ux-fix-loop.json`에 쓴다.


## 18. P0 — Recapture / Re-review

- [x] 새 모듈 `src/core/image-ux-review/recapture.ts`를 추가한다.
- [x] changed screen만 recapture한다.
- [x] Computer Use available이면 recapture source로 사용한다.
- [x] Computer Use unavailable이면 user-provided screenshot 또는 manual recapture blocker를 기록한다.
- [x] recaptured screenshot sha256를 기록한다.
- [x] recaptured screenshot dimensions를 기록한다.
- [x] before/after relation을 Image Voxel에 기록한다.
- [x] recaptured screen에 대해 gpt-image-2 callout re-review를 실행한다.
- [x] re-review generated image를 새 artifact로 저장한다.
- [x] re-review issue extraction을 output-schema로 실행한다.
- [x] fixed issue가 여전히 open이면 status remains_open으로 기록한다.
- [x] new P0/P1 issue가 생기면 regression blocker를 기록한다.
- [x] changed_screens_rechecked_or_not_applicable gate를 true/false로 계산한다.


## 19. P0 — UX-Review Gate v2

- [x] image-ux-review-gate schema를 v2로 업데이트한다.
- [x] gate에 `real_source_screenshot_present`를 추가한다.
- [x] gate에 `computer_use_or_user_screenshot_source`를 추가한다.
- [x] gate에 `gpt_image_2_callout_generated`를 추가한다.
- [x] gate에 `generated_image_ingested`를 추가한다.
- [x] gate에 `callout_extraction_schema_valid`를 추가한다.
- [x] gate에 `issue_ledger_from_generated_callout`를 추가한다.
- [x] gate에 `p0_p1_zero_after_fix`를 추가한다.
- [x] gate에 `fix_loop_executed_or_not_needed`를 추가한다.
- [x] gate에 `changed_screens_rechecked`를 추가한다.
- [x] gate에 `image_voxel_relations_created`를 추가한다.
- [x] gate에 `wrongness_checked`를 추가한다.
- [x] gate에 `honest_mode_complete`를 유지한다.
- [x] real generated callout image가 없으면 verified 불가.
- [x] mock fixture면 verified_partial 이하.
- [x] text-only review면 blocked.


## 20. P0 — Completion Proof / Trust Report Integration

- [x] Completion Proof에 `image_ux_review` evidence section을 추가한다.
- [x] Proof에 source screenshots count를 기록한다.
- [x] Proof에 generated gpt-image-2 callout images count를 기록한다.
- [x] Proof에 callout extraction schema status를 기록한다.
- [x] Proof에 open P0/P1 count를 기록한다.
- [x] Proof에 fixed P0/P1 count를 기록한다.
- [x] Proof에 recapture/re-review status를 기록한다.
- [x] Proof에 Image Voxel relation count를 기록한다.
- [x] Proof에 Computer Use evidence mode를 기록한다.
- [x] Trust Report에 UX-Review status를 추가한다.
- [x] Trust Report에 UX-Review blockers를 추가한다.
- [x] Trust Report가 text-only review를 verified로 만들지 못하게 한다.
- [x] Trust Report가 mock gpt-image-2 fixture를 real verified로 만들지 못하게 한다.


## 21. P0 — Image Voxel TriWiki Relations

- [x] source screenshot image asset 생성
- [x] generated callout image asset 생성
- [x] fixed/after screenshot image asset 생성
- [x] `generated_callout_review_of` relation 생성
- [x] `issue_detected_in` relation 생성
- [x] `fix_attempt_for_issue` relation 생성
- [x] `after_screenshot_of` relation 생성
- [x] `re_review_of` relation 생성
- [x] `wrong_callout` relation 생성 가능
- [x] relation graph validator가 unresolved refs를 차단한다.
- [x] relation graph validator가 duplicate relation을 dedupe한다.
- [x] relation graph validator가 stale source screenshot을 차단한다.
- [x] relation graph validator가 bbox out-of-bounds를 차단한다.
- [x] TriWiki shared publish는 metadata only by default.
- [x] screenshot binary publish는 explicit opt-in.


## 22. P0 — UX Wrongness Memory

- [x] new wrongness kind `ux_review_text_only_fallback` 추가
- [x] new wrongness kind `gpt_image_2_callout_generation_failed` 추가
- [x] new wrongness kind `callout_extraction_schema_failed` 추가
- [x] new wrongness kind `callout_bbox_out_of_bounds` 추가
- [x] new wrongness kind `fix_loop_noop_patch` 추가
- [x] new wrongness kind `visual_fix_not_rechecked` 추가
- [x] new wrongness kind `post_fix_regression_detected` 추가
- [x] text-only fallback 시 wrongness record 생성
- [x] bad bbox 시 image wrongness record 생성
- [x] issue extraction mismatch 시 wrongness record 생성
- [x] fix loop 실패 시 wrongness record 생성
- [x] recapture missing 시 wrongness record 생성
- [x] same UX issue recurring 시 recurrence_count 증가
- [x] Scout 4 Visual/Voxel이 relevant UX wrongness를 읽는다.
- [x] route finalizer가 active UX wrongness를 claim confidence에 반영한다.


## 23. P0 — UX-Review Tests

- [x] unit: imagegen adapter unavailable blocks
- [x] unit: generated callout image ledger validates
- [x] unit: prose-only review fails gate
- [x] unit: issue extraction schema validates
- [x] unit: bbox out of bounds fails
- [x] unit: fix task planner maps P0/P1
- [x] unit: fix task planner ignores P3 by default
- [x] unit: safe fix loop stops on repeated blocker
- [x] unit: recapture required after patch
- [x] unit: Image Voxel relation graph validates
- [x] integration: UX-Review fixture remains verified_partial
- [x] integration: real adapter unavailable blocks verified
- [x] integration: mock generated image cannot become verified
- [x] integration: output-schema extraction path works with fake codex 0.132
- [x] integration: changed screen recheck required
- [x] e2e: `$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues` route classification
- [x] e2e: UX-Review full mock-safe loop creates proof/trust/wrongness
- [x] blackbox: packed install has UX-Review schemas/assets
- [x] blackbox: UX-Review no text-only fallback


## 24. P0 — Codex Memory Summary Version/Rebuild

- [x] TriWiki summary schema version 추가 또는 갱신
- [x] Wrongness summary schema version 추가 또는 갱신
- [x] Shared memory generated index schema version 추가 또는 갱신
- [x] stale summary detection 구현
- [x] `sks wiki rebuild-summary --json` 추가 또는 기존 command 확장
- [x] `sks wrongness rebuild-summary --json` 추가 또는 기존 command 확장
- [x] Codex 0.132 memory summary rebuild capability와 docs 연결
- [x] summary stale이면 context pack이 rebuild를 권고한다.
- [x] release gate에 stale generated summary fixture 추가


## 25. P0 — Goal/Loop Repeated Blocker Stop Alignment

- [x] SKS Goal continuation repeated blocker detector를 강화한다.
- [x] QA loop repeated blocker detector를 강화한다.
- [x] Research loop repeated blocker detector를 강화한다.
- [x] UX-Review fix loop repeated blocker detector를 추가한다.
- [x] usage limit style blocker를 structured blocker로 기록한다.
- [x] repeated blocker가 2회 이상이면 loop를 멈춘다.
- [x] loop burn 방지 event를 mission events에 기록한다.
- [x] Wrongness Memory에 repeated blocker를 기록한다.
- [x] Completion Proof는 repeated blocker 상태를 verified_partial/blocker로 표시한다.
- [x] Codex 0.132 goal continuation behavior와 docs를 맞춘다.


## 26. P1 — Codex 0.132 Python SDK / TurnResult Integration

- [x] Python SDK auth/TurnResult는 P1로 분류한다.
- [x] SKS eval harness가 Python SDK를 쓰는지 조사한다.
- [x] TurnResult timing/usage를 scout benchmark에 연결할 수 있는 adapter skeleton 작성
- [x] string input support를 simple eval harness에 활용할 수 있는지 검토
- [x] P1 docs에 optional integration으로 기록


## 27. P1 — TUI / Doctor Probe Batching

- [x] doctor probe list를 inventory한다.
- [x] codex compat probe를 병렬화한다.
- [x] codex-lb status probe를 병렬화한다.
- [x] computer-use status probe를 병렬화한다.
- [x] tmux readiness probe를 병렬화한다.
- [x] scout engine detection probe를 병렬화한다.
- [x] probe result timeout budget을 정의한다.
- [x] bench core에 doctor probe latency를 추가한다.
- [x] TUI startup/cold-start docs에 반영한다.


## 28. Release Gate Update

`package.json` scripts에 다음을 추가 또는 강화한다.

```json
{
  "scripts": {
    "codex:0.132-compat": "node ./dist/bin/sks.js codex compatibility --require rust-v0.132.0 --json",
    "codex:output-schema-fixture": "node ./scripts/codex-output-schema-fixture-check.mjs",
    "image-fidelity:check": "node ./scripts/image-fidelity-fixture-check.mjs",
    "ux-review:real-loop-fixture": "node ./scripts/ux-review-real-loop-fixture-check.mjs",
    "ux-review:no-text-fallback": "node ./scripts/ux-review-no-text-fallback-check.mjs",
    "ux-review:image-voxel-relations": "node ./scripts/ux-review-image-voxel-relations-check.mjs",
    "memory-summary:rebuild-check": "node ./scripts/memory-summary-rebuild-check.mjs",
    "loop-blocker:check": "node ./scripts/loop-blocker-check.mjs"
  }
}
```

`release:check`에는 반드시 다음을 포함한다.

```text
[x] codex:0.132-compat
[x] codex:output-schema-fixture
[x] image-fidelity:check
[x] ux-review:real-loop-fixture
[x] ux-review:no-text-fallback
[x] ux-review:image-voxel-relations
[x] memory-summary:rebuild-check
[x] loop-blocker:check
```


## 29. Required Unit Tests

- [x] test/unit/codex-0-132-compat.test.ts
- [x] test/unit/codex-exec-output-schema.test.ts
- [x] test/unit/image-fidelity-policy.test.ts
- [x] test/unit/ux-review-imagegen-adapter.test.ts
- [x] test/unit/ux-review-callout-prompt.test.ts
- [x] test/unit/ux-review-generated-image-ledger.test.ts
- [x] test/unit/ux-review-callout-extraction-schema.test.ts
- [x] test/unit/ux-review-issue-ledger-v2.test.ts
- [x] test/unit/ux-review-fix-task-planner.test.ts
- [x] test/unit/ux-review-safe-fix-loop.test.ts
- [x] test/unit/ux-review-recapture-policy.test.ts
- [x] test/unit/ux-review-gate-v2.test.ts
- [x] test/unit/ux-review-proof-evidence.test.ts
- [x] test/unit/ux-review-image-voxel-relations.test.ts
- [x] test/unit/ux-review-wrongness.test.ts
- [x] test/unit/memory-summary-version.test.ts
- [x] test/unit/repeated-blocker-stop.test.ts


## 30. Required Integration Tests

- [x] test/integration/codex-output-schema-resume-fake.test.ts
- [x] test/integration/ux-review-route-classification.test.ts
- [x] test/integration/ux-review-source-screenshot-inventory.test.ts
- [x] test/integration/ux-review-generated-callout-ingestion.test.ts
- [x] test/integration/ux-review-callout-extraction-output-schema.test.ts
- [x] test/integration/ux-review-fix-task-loop.test.ts
- [x] test/integration/ux-review-recapture-recheck.test.ts
- [x] test/integration/ux-review-completion-proof.test.ts
- [x] test/integration/ux-review-trust-report.test.ts
- [x] test/integration/ux-review-wrongness-loop.test.ts
- [x] test/integration/image-fidelity-original-resolution.test.ts
- [x] test/integration/memory-summary-rebuild.test.ts
- [x] test/integration/goal-loop-repeated-blocker-stop.test.ts


## 31. Required Black-box Tests

- [x] test/blackbox/package-version-1-0-8.test.mjs
- [x] test/blackbox/codex-0-132-compat-packed.test.mjs
- [x] test/blackbox/codex-output-schema-packed.test.mjs
- [x] test/blackbox/ux-review-command-packed.test.mjs
- [x] test/blackbox/ux-review-no-text-fallback-packed.test.mjs
- [x] test/blackbox/ux-review-image-voxel-packed.test.mjs
- [x] test/blackbox/ux-review-proof-trust-packed.test.mjs
- [x] test/blackbox/memory-summary-rebuild-packed.test.mjs
- [x] test/blackbox/loop-blocker-packed.test.mjs


## 32. Massive Detailed Task Bank

- [x] UX-Review route classification: define input contract
- [x] UX-Review route classification: define output artifact
- [x] UX-Review route classification: add schema validation
- [x] UX-Review route classification: add mock fixture
- [x] UX-Review route classification: add real optional path
- [x] UX-Review route classification: add blocker behavior
- [x] UX-Review route classification: add wrongness behavior
- [x] UX-Review route classification: add proof link
- [x] UX-Review route classification: add trust report link
- [x] UX-Review route classification: add docs
- [x] UX-Review source screenshot inventory: define input contract
- [x] UX-Review source screenshot inventory: define output artifact
- [x] UX-Review source screenshot inventory: add schema validation
- [x] UX-Review source screenshot inventory: add mock fixture
- [x] UX-Review source screenshot inventory: add real optional path
- [x] UX-Review source screenshot inventory: add blocker behavior
- [x] UX-Review source screenshot inventory: add wrongness behavior
- [x] UX-Review source screenshot inventory: add proof link
- [x] UX-Review source screenshot inventory: add trust report link
- [x] UX-Review source screenshot inventory: add docs
- [x] UX-Review Computer Use source capture: define input contract
- [x] UX-Review Computer Use source capture: define output artifact
- [x] UX-Review Computer Use source capture: add schema validation
- [x] UX-Review Computer Use source capture: add mock fixture
- [x] UX-Review Computer Use source capture: add real optional path
- [x] UX-Review Computer Use source capture: add blocker behavior
- [x] UX-Review Computer Use source capture: add wrongness behavior
- [x] UX-Review Computer Use source capture: add proof link
- [x] UX-Review Computer Use source capture: add trust report link
- [x] UX-Review Computer Use source capture: add docs
- [x] UX-Review user-provided screenshot ingestion: define input contract
- [x] UX-Review user-provided screenshot ingestion: define output artifact
- [x] UX-Review user-provided screenshot ingestion: add schema validation
- [x] UX-Review user-provided screenshot ingestion: add mock fixture
- [x] UX-Review user-provided screenshot ingestion: add real optional path
- [x] UX-Review user-provided screenshot ingestion: add blocker behavior
- [x] UX-Review user-provided screenshot ingestion: add wrongness behavior
- [x] UX-Review user-provided screenshot ingestion: add proof link
- [x] UX-Review user-provided screenshot ingestion: add trust report link
- [x] UX-Review user-provided screenshot ingestion: add docs
- [x] UX-Review gpt-image-2 prompt preparation: define input contract
- [x] UX-Review gpt-image-2 prompt preparation: define output artifact
- [x] UX-Review gpt-image-2 prompt preparation: add schema validation
- [x] UX-Review gpt-image-2 prompt preparation: add mock fixture
- [x] UX-Review gpt-image-2 prompt preparation: add real optional path
- [x] UX-Review gpt-image-2 prompt preparation: add blocker behavior
- [x] UX-Review gpt-image-2 prompt preparation: add wrongness behavior
- [x] UX-Review gpt-image-2 prompt preparation: add proof link
- [x] UX-Review gpt-image-2 prompt preparation: add trust report link
- [x] UX-Review gpt-image-2 prompt preparation: add docs
- [x] UX-Review gpt-image-2 callout generation: define input contract
- [x] UX-Review gpt-image-2 callout generation: define output artifact
- [x] UX-Review gpt-image-2 callout generation: add schema validation
- [x] UX-Review gpt-image-2 callout generation: add mock fixture
- [x] UX-Review gpt-image-2 callout generation: add real optional path
- [x] UX-Review gpt-image-2 callout generation: add blocker behavior
- [x] UX-Review gpt-image-2 callout generation: add wrongness behavior
- [x] UX-Review gpt-image-2 callout generation: add proof link
- [x] UX-Review gpt-image-2 callout generation: add trust report link
- [x] UX-Review gpt-image-2 callout generation: add docs
- [x] UX-Review generated image ingestion: define input contract
- [x] UX-Review generated image ingestion: define output artifact
- [x] UX-Review generated image ingestion: add schema validation
- [x] UX-Review generated image ingestion: add mock fixture
- [x] UX-Review generated image ingestion: add real optional path
- [x] UX-Review generated image ingestion: add blocker behavior
- [x] UX-Review generated image ingestion: add wrongness behavior
- [x] UX-Review generated image ingestion: add proof link
- [x] UX-Review generated image ingestion: add trust report link
- [x] UX-Review generated image ingestion: add docs
- [x] UX-Review callout extraction: define input contract
- [x] UX-Review callout extraction: define output artifact
- [x] UX-Review callout extraction: add schema validation
- [x] UX-Review callout extraction: add mock fixture
- [x] UX-Review callout extraction: add real optional path
- [x] UX-Review callout extraction: add blocker behavior
- [x] UX-Review callout extraction: add wrongness behavior
- [x] UX-Review callout extraction: add proof link
- [x] UX-Review callout extraction: add trust report link
- [x] UX-Review callout extraction: add docs
- [x] UX-Review issue ledger creation: define input contract
- [x] UX-Review issue ledger creation: define output artifact
- [x] UX-Review issue ledger creation: add schema validation
- [x] UX-Review issue ledger creation: add mock fixture
- [x] UX-Review issue ledger creation: add real optional path
- [x] UX-Review issue ledger creation: add blocker behavior
- [x] UX-Review issue ledger creation: add wrongness behavior
- [x] UX-Review issue ledger creation: add proof link
- [x] UX-Review issue ledger creation: add trust report link
- [x] UX-Review issue ledger creation: add docs
- [x] UX-Review fix task planning: define input contract
- [x] UX-Review fix task planning: define output artifact
- [x] UX-Review fix task planning: add schema validation
- [x] UX-Review fix task planning: add mock fixture
- [x] UX-Review fix task planning: add real optional path
- [x] UX-Review fix task planning: add blocker behavior
- [x] UX-Review fix task planning: add wrongness behavior
- [x] UX-Review fix task planning: add proof link
- [x] UX-Review fix task planning: add trust report link
- [x] UX-Review fix task planning: add docs
- [x] UX-Review safe patch loop: define input contract
- [x] UX-Review safe patch loop: define output artifact
- [x] UX-Review safe patch loop: add schema validation
- [x] UX-Review safe patch loop: add mock fixture
- [x] UX-Review safe patch loop: add real optional path
- [x] UX-Review safe patch loop: add blocker behavior
- [x] UX-Review safe patch loop: add wrongness behavior
- [x] UX-Review safe patch loop: add proof link
- [x] UX-Review safe patch loop: add trust report link
- [x] UX-Review safe patch loop: add docs
- [x] UX-Review recapture: define input contract
- [x] UX-Review recapture: define output artifact
- [x] UX-Review recapture: add schema validation
- [x] UX-Review recapture: add mock fixture
- [x] UX-Review recapture: add real optional path
- [x] UX-Review recapture: add blocker behavior
- [x] UX-Review recapture: add wrongness behavior
- [x] UX-Review recapture: add proof link
- [x] UX-Review recapture: add trust report link
- [x] UX-Review recapture: add docs
- [x] UX-Review re-review: define input contract
- [x] UX-Review re-review: define output artifact
- [x] UX-Review re-review: add schema validation
- [x] UX-Review re-review: add mock fixture
- [x] UX-Review re-review: add real optional path
- [x] UX-Review re-review: add blocker behavior
- [x] UX-Review re-review: add wrongness behavior
- [x] UX-Review re-review: add proof link
- [x] UX-Review re-review: add trust report link
- [x] UX-Review re-review: add docs
- [x] UX-Review Image Voxel linking: define input contract
- [x] UX-Review Image Voxel linking: define output artifact
- [x] UX-Review Image Voxel linking: add schema validation
- [x] UX-Review Image Voxel linking: add mock fixture
- [x] UX-Review Image Voxel linking: add real optional path
- [x] UX-Review Image Voxel linking: add blocker behavior
- [x] UX-Review Image Voxel linking: add wrongness behavior
- [x] UX-Review Image Voxel linking: add proof link
- [x] UX-Review Image Voxel linking: add trust report link
- [x] UX-Review Image Voxel linking: add docs
- [x] UX-Review Completion Proof: define input contract
- [x] UX-Review Completion Proof: define output artifact
- [x] UX-Review Completion Proof: add schema validation
- [x] UX-Review Completion Proof: add mock fixture
- [x] UX-Review Completion Proof: add real optional path
- [x] UX-Review Completion Proof: add blocker behavior
- [x] UX-Review Completion Proof: add wrongness behavior
- [x] UX-Review Completion Proof: add proof link
- [x] UX-Review Completion Proof: add trust report link
- [x] UX-Review Completion Proof: add docs
- [x] UX-Review Trust Report: define input contract
- [x] UX-Review Trust Report: define output artifact
- [x] UX-Review Trust Report: add schema validation
- [x] UX-Review Trust Report: add mock fixture
- [x] UX-Review Trust Report: add real optional path
- [x] UX-Review Trust Report: add blocker behavior
- [x] UX-Review Trust Report: add wrongness behavior
- [x] UX-Review Trust Report: add proof link
- [x] UX-Review Trust Report: add trust report link
- [x] UX-Review Trust Report: add docs
- [x] UX-Review Wrongness Memory: define input contract
- [x] UX-Review Wrongness Memory: define output artifact
- [x] UX-Review Wrongness Memory: add schema validation
- [x] UX-Review Wrongness Memory: add mock fixture
- [x] UX-Review Wrongness Memory: add real optional path
- [x] UX-Review Wrongness Memory: add blocker behavior
- [x] UX-Review Wrongness Memory: add wrongness behavior
- [x] UX-Review Wrongness Memory: add proof link
- [x] UX-Review Wrongness Memory: add trust report link
- [x] UX-Review Wrongness Memory: add docs
- [x] Codex 0.132 `exec resume --output-schema`: classify P0/P1/P2 impact
- [x] Codex 0.132 `exec resume --output-schema`: add compatibility matrix entry
- [x] Codex 0.132 `exec resume --output-schema`: add detector if applicable
- [x] Codex 0.132 `exec resume --output-schema`: add docs note
- [x] Codex 0.132 `exec resume --output-schema`: add test or explicit not-applicable reason
- [x] Codex 0.132 `app-server image fidelity`: classify P0/P1/P2 impact
- [x] Codex 0.132 `app-server image fidelity`: add compatibility matrix entry
- [x] Codex 0.132 `app-server image fidelity`: add detector if applicable
- [x] Codex 0.132 `app-server image fidelity`: add docs note
- [x] Codex 0.132 `app-server image fidelity`: add test or explicit not-applicable reason
- [x] Codex 0.132 `memory summary versioning`: classify P0/P1/P2 impact
- [x] Codex 0.132 `memory summary versioning`: add compatibility matrix entry
- [x] Codex 0.132 `memory summary versioning`: add detector if applicable
- [x] Codex 0.132 `memory summary versioning`: add docs note
- [x] Codex 0.132 `memory summary versioning`: add test or explicit not-applicable reason
- [x] Codex 0.132 `goal continuation repeated blocker stop`: classify P0/P1/P2 impact
- [x] Codex 0.132 `goal continuation repeated blocker stop`: add compatibility matrix entry
- [x] Codex 0.132 `goal continuation repeated blocker stop`: add detector if applicable
- [x] Codex 0.132 `goal continuation repeated blocker stop`: add docs note
- [x] Codex 0.132 `goal continuation repeated blocker stop`: add test or explicit not-applicable reason
- [x] Codex 0.132 `TUI probe batching`: classify P0/P1/P2 impact
- [x] Codex 0.132 `TUI probe batching`: add compatibility matrix entry
- [x] Codex 0.132 `TUI probe batching`: add detector if applicable
- [x] Codex 0.132 `TUI probe batching`: add docs note
- [x] Codex 0.132 `TUI probe batching`: add test or explicit not-applicable reason
- [x] Codex 0.132 `remote executor auth-backed registration`: classify P0/P1/P2 impact
- [x] Codex 0.132 `remote executor auth-backed registration`: add compatibility matrix entry
- [x] Codex 0.132 `remote executor auth-backed registration`: add detector if applicable
- [x] Codex 0.132 `remote executor auth-backed registration`: add docs note
- [x] Codex 0.132 `remote executor auth-backed registration`: add test or explicit not-applicable reason
- [x] Codex 0.132 `Python SDK auth`: classify P0/P1/P2 impact
- [x] Codex 0.132 `Python SDK auth`: add compatibility matrix entry
- [x] Codex 0.132 `Python SDK auth`: add detector if applicable
- [x] Codex 0.132 `Python SDK auth`: add docs note
- [x] Codex 0.132 `Python SDK auth`: add test or explicit not-applicable reason
- [x] Codex 0.132 `Python TurnResult`: classify P0/P1/P2 impact
- [x] Codex 0.132 `Python TurnResult`: add compatibility matrix entry
- [x] Codex 0.132 `Python TurnResult`: add detector if applicable
- [x] Codex 0.132 `Python TurnResult`: add docs note
- [x] Codex 0.132 `Python TurnResult`: add test or explicit not-applicable reason
- [x] UX gate `real_source_screenshot_present`: compute boolean
- [x] UX gate `real_source_screenshot_present`: add artifact evidence
- [x] UX gate `real_source_screenshot_present`: add blocker reason
- [x] UX gate `real_source_screenshot_present`: add unit test
- [x] UX gate `real_source_screenshot_present`: add integration fixture
- [x] UX gate `real_source_screenshot_present`: add proof mapping
- [x] UX gate `gpt_image_2_callout_generated`: compute boolean
- [x] UX gate `gpt_image_2_callout_generated`: add artifact evidence
- [x] UX gate `gpt_image_2_callout_generated`: add blocker reason
- [x] UX gate `gpt_image_2_callout_generated`: add unit test
- [x] UX gate `gpt_image_2_callout_generated`: add integration fixture
- [x] UX gate `gpt_image_2_callout_generated`: add proof mapping
- [x] UX gate `generated_image_ingested`: compute boolean
- [x] UX gate `generated_image_ingested`: add artifact evidence
- [x] UX gate `generated_image_ingested`: add blocker reason
- [x] UX gate `generated_image_ingested`: add unit test
- [x] UX gate `generated_image_ingested`: add integration fixture
- [x] UX gate `generated_image_ingested`: add proof mapping
- [x] UX gate `callout_extraction_schema_valid`: compute boolean
- [x] UX gate `callout_extraction_schema_valid`: add artifact evidence
- [x] UX gate `callout_extraction_schema_valid`: add blocker reason
- [x] UX gate `callout_extraction_schema_valid`: add unit test
- [x] UX gate `callout_extraction_schema_valid`: add integration fixture
- [x] UX gate `callout_extraction_schema_valid`: add proof mapping
- [x] UX gate `issue_ledger_from_generated_callout`: compute boolean
- [x] UX gate `issue_ledger_from_generated_callout`: add artifact evidence
- [x] UX gate `issue_ledger_from_generated_callout`: add blocker reason
- [x] UX gate `issue_ledger_from_generated_callout`: add unit test
- [x] UX gate `issue_ledger_from_generated_callout`: add integration fixture
- [x] UX gate `issue_ledger_from_generated_callout`: add proof mapping
- [x] UX gate `p0_p1_zero_after_fix`: compute boolean
- [x] UX gate `p0_p1_zero_after_fix`: add artifact evidence
- [x] UX gate `p0_p1_zero_after_fix`: add blocker reason
- [x] UX gate `p0_p1_zero_after_fix`: add unit test
- [x] UX gate `p0_p1_zero_after_fix`: add integration fixture
- [x] UX gate `p0_p1_zero_after_fix`: add proof mapping
- [x] UX gate `fix_loop_executed_or_not_needed`: compute boolean
- [x] UX gate `fix_loop_executed_or_not_needed`: add artifact evidence
- [x] UX gate `fix_loop_executed_or_not_needed`: add blocker reason
- [x] UX gate `fix_loop_executed_or_not_needed`: add unit test
- [x] UX gate `fix_loop_executed_or_not_needed`: add integration fixture
- [x] UX gate `fix_loop_executed_or_not_needed`: add proof mapping
- [x] UX gate `changed_screens_rechecked`: compute boolean
- [x] UX gate `changed_screens_rechecked`: add artifact evidence
- [x] UX gate `changed_screens_rechecked`: add blocker reason
- [x] UX gate `changed_screens_rechecked`: add unit test
- [x] UX gate `changed_screens_rechecked`: add integration fixture
- [x] UX gate `changed_screens_rechecked`: add proof mapping
- [x] UX gate `image_voxel_relations_created`: compute boolean
- [x] UX gate `image_voxel_relations_created`: add artifact evidence
- [x] UX gate `image_voxel_relations_created`: add blocker reason
- [x] UX gate `image_voxel_relations_created`: add unit test
- [x] UX gate `image_voxel_relations_created`: add integration fixture
- [x] UX gate `image_voxel_relations_created`: add proof mapping
- [x] UX gate `wrongness_checked`: compute boolean
- [x] UX gate `wrongness_checked`: add artifact evidence
- [x] UX gate `wrongness_checked`: add blocker reason
- [x] UX gate `wrongness_checked`: add unit test
- [x] UX gate `wrongness_checked`: add integration fixture
- [x] UX gate `wrongness_checked`: add proof mapping
- [x] UX gate `honest_mode_complete`: compute boolean
- [x] UX gate `honest_mode_complete`: add artifact evidence
- [x] UX gate `honest_mode_complete`: add blocker reason
- [x] UX gate `honest_mode_complete`: add unit test
- [x] UX gate `honest_mode_complete`: add integration fixture
- [x] UX gate `honest_mode_complete`: add proof mapping
- [x] Image Voxel relation `generated_callout_review_of`: define schema
- [x] Image Voxel relation `generated_callout_review_of`: create writer
- [x] Image Voxel relation `generated_callout_review_of`: create validator
- [x] Image Voxel relation `generated_callout_review_of`: add fixture
- [x] Image Voxel relation `generated_callout_review_of`: add Trust Report summary
- [x] Image Voxel relation `issue_detected_in`: define schema
- [x] Image Voxel relation `issue_detected_in`: create writer
- [x] Image Voxel relation `issue_detected_in`: create validator
- [x] Image Voxel relation `issue_detected_in`: add fixture
- [x] Image Voxel relation `issue_detected_in`: add Trust Report summary
- [x] Image Voxel relation `fix_attempt_for_issue`: define schema
- [x] Image Voxel relation `fix_attempt_for_issue`: create writer
- [x] Image Voxel relation `fix_attempt_for_issue`: create validator
- [x] Image Voxel relation `fix_attempt_for_issue`: add fixture
- [x] Image Voxel relation `fix_attempt_for_issue`: add Trust Report summary
- [x] Image Voxel relation `after_screenshot_of`: define schema
- [x] Image Voxel relation `after_screenshot_of`: create writer
- [x] Image Voxel relation `after_screenshot_of`: create validator
- [x] Image Voxel relation `after_screenshot_of`: add fixture
- [x] Image Voxel relation `after_screenshot_of`: add Trust Report summary
- [x] Image Voxel relation `re_review_of`: define schema
- [x] Image Voxel relation `re_review_of`: create writer
- [x] Image Voxel relation `re_review_of`: create validator
- [x] Image Voxel relation `re_review_of`: add fixture
- [x] Image Voxel relation `re_review_of`: add Trust Report summary
- [x] Image Voxel relation `corrected_by`: define schema
- [x] Image Voxel relation `corrected_by`: create writer
- [x] Image Voxel relation `corrected_by`: create validator
- [x] Image Voxel relation `corrected_by`: add fixture
- [x] Image Voxel relation `corrected_by`: add Trust Report summary
- [x] Image Voxel relation `wrong_callout`: define schema
- [x] Image Voxel relation `wrong_callout`: create writer
- [x] Image Voxel relation `wrong_callout`: create validator
- [x] Image Voxel relation `wrong_callout`: add fixture
- [x] Image Voxel relation `wrong_callout`: add Trust Report summary
- [x] Image Voxel relation `requires_evidence`: define schema
- [x] Image Voxel relation `requires_evidence`: create writer
- [x] Image Voxel relation `requires_evidence`: create validator
- [x] Image Voxel relation `requires_evidence`: add fixture
- [x] Image Voxel relation `requires_evidence`: add Trust Report summary
- [x] src/core/image-ux-review.ts: implement or update module
- [x] src/core/image-ux-review.ts: add TypeScript types
- [x] src/core/image-ux-review.ts: add validators
- [x] src/core/image-ux-review.ts: add redaction/local-only policy where needed
- [x] src/core/image-ux-review.ts: add no-mock-as-real guard
- [x] src/core/image-ux-review.ts: add tests
- [x] src/core/image-ux-review.ts: update docs link
- [x] src/core/commands/image-ux-review-command.ts: implement or update module
- [x] src/core/commands/image-ux-review-command.ts: add TypeScript types
- [x] src/core/commands/image-ux-review-command.ts: add validators
- [x] src/core/commands/image-ux-review-command.ts: add redaction/local-only policy where needed
- [x] src/core/commands/image-ux-review-command.ts: add no-mock-as-real guard
- [x] src/core/commands/image-ux-review-command.ts: add tests
- [x] src/core/commands/image-ux-review-command.ts: update docs link
- [x] src/core/image-ux-review/imagegen-adapter.ts: implement or update module
- [x] src/core/image-ux-review/imagegen-adapter.ts: add TypeScript types
- [x] src/core/image-ux-review/imagegen-adapter.ts: add validators
- [x] src/core/image-ux-review/imagegen-adapter.ts: add redaction/local-only policy where needed
- [x] src/core/image-ux-review/imagegen-adapter.ts: add no-mock-as-real guard
- [x] src/core/image-ux-review/imagegen-adapter.ts: add tests
- [x] src/core/image-ux-review/imagegen-adapter.ts: update docs link
- [x] src/core/image-ux-review/callout-extraction.ts: implement or update module
- [x] src/core/image-ux-review/callout-extraction.ts: add TypeScript types
- [x] src/core/image-ux-review/callout-extraction.ts: add validators
- [x] src/core/image-ux-review/callout-extraction.ts: add redaction/local-only policy where needed
- [x] src/core/image-ux-review/callout-extraction.ts: add no-mock-as-real guard
- [x] src/core/image-ux-review/callout-extraction.ts: add tests
- [x] src/core/image-ux-review/callout-extraction.ts: update docs link
- [x] src/core/image-ux-review/fix-task-planner.ts: implement or update module
- [x] src/core/image-ux-review/fix-task-planner.ts: add TypeScript types
- [x] src/core/image-ux-review/fix-task-planner.ts: add validators
- [x] src/core/image-ux-review/fix-task-planner.ts: add redaction/local-only policy where needed
- [x] src/core/image-ux-review/fix-task-planner.ts: add no-mock-as-real guard
- [x] src/core/image-ux-review/fix-task-planner.ts: add tests
- [x] src/core/image-ux-review/fix-task-planner.ts: update docs link
- [x] src/core/image-ux-review/fix-loop.ts: implement or update module
- [x] src/core/image-ux-review/fix-loop.ts: add TypeScript types
- [x] src/core/image-ux-review/fix-loop.ts: add validators
- [x] src/core/image-ux-review/fix-loop.ts: add redaction/local-only policy where needed
- [x] src/core/image-ux-review/fix-loop.ts: add no-mock-as-real guard
- [x] src/core/image-ux-review/fix-loop.ts: add tests
- [x] src/core/image-ux-review/fix-loop.ts: update docs link
- [x] src/core/image-ux-review/recapture.ts: implement or update module
- [x] src/core/image-ux-review/recapture.ts: add TypeScript types
- [x] src/core/image-ux-review/recapture.ts: add validators
- [x] src/core/image-ux-review/recapture.ts: add redaction/local-only policy where needed
- [x] src/core/image-ux-review/recapture.ts: add no-mock-as-real guard
- [x] src/core/image-ux-review/recapture.ts: add tests
- [x] src/core/image-ux-review/recapture.ts: update docs link
- [x] src/core/wiki-image/image-voxel-ledger.ts: implement or update module
- [x] src/core/wiki-image/image-voxel-ledger.ts: add TypeScript types
- [x] src/core/wiki-image/image-voxel-ledger.ts: add validators
- [x] src/core/wiki-image/image-voxel-ledger.ts: add redaction/local-only policy where needed
- [x] src/core/wiki-image/image-voxel-ledger.ts: add no-mock-as-real guard
- [x] src/core/wiki-image/image-voxel-ledger.ts: add tests
- [x] src/core/wiki-image/image-voxel-ledger.ts: update docs link
- [x] src/core/proof/route-finalizer.ts: implement or update module
- [x] src/core/proof/route-finalizer.ts: add TypeScript types
- [x] src/core/proof/route-finalizer.ts: add validators
- [x] src/core/proof/route-finalizer.ts: add redaction/local-only policy where needed
- [x] src/core/proof/route-finalizer.ts: add no-mock-as-real guard
- [x] src/core/proof/route-finalizer.ts: add tests
- [x] src/core/proof/route-finalizer.ts: update docs link
- [x] src/core/evidence/evidence-router.ts: implement or update module
- [x] src/core/evidence/evidence-router.ts: add TypeScript types
- [x] src/core/evidence/evidence-router.ts: add validators
- [x] src/core/evidence/evidence-router.ts: add redaction/local-only policy where needed
- [x] src/core/evidence/evidence-router.ts: add no-mock-as-real guard
- [x] src/core/evidence/evidence-router.ts: add tests
- [x] src/core/evidence/evidence-router.ts: update docs link
- [x] src/core/codex-exec-output-schema.ts: implement or update module
- [x] src/core/codex-exec-output-schema.ts: add TypeScript types
- [x] src/core/codex-exec-output-schema.ts: add validators
- [x] src/core/codex-exec-output-schema.ts: add redaction/local-only policy where needed
- [x] src/core/codex-exec-output-schema.ts: add no-mock-as-real guard
- [x] src/core/codex-exec-output-schema.ts: add tests
- [x] src/core/codex-exec-output-schema.ts: update docs link
- [x] src/core/codex-compat/codex-0-132.ts: implement or update module
- [x] src/core/codex-compat/codex-0-132.ts: add TypeScript types
- [x] src/core/codex-compat/codex-0-132.ts: add validators
- [x] src/core/codex-compat/codex-0-132.ts: add redaction/local-only policy where needed
- [x] src/core/codex-compat/codex-0-132.ts: add no-mock-as-real guard
- [x] src/core/codex-compat/codex-0-132.ts: add tests
- [x] src/core/codex-compat/codex-0-132.ts: update docs link


## 33. Done Definition

- [x] version 1.0.8 everywhere
- [x] Codex 0.132 compatibility matrix implemented
- [x] codex exec resume --output-schema integration implemented
- [x] UX-Review real gpt-image-2 adapter implemented
- [x] UX-Review generated callout image ingestion implemented
- [x] UX-Review callout extraction with output-schema implemented
- [x] UX-Review issue ledger v2 implemented
- [x] UX-Review fix task planner implemented
- [x] UX-Review bounded safe fix loop implemented
- [x] UX-Review recapture/re-review implemented
- [x] UX-Review Image Voxel relations implemented
- [x] UX-Review Completion Proof/Trust integration implemented
- [x] UX-Review Wrongness integration implemented
- [x] Text-only UX review cannot pass gate
- [x] Mock gpt-image-2 fixture cannot become verified real evidence
- [x] Codex image fidelity metadata implemented
- [x] TriWiki/Wrongness memory summary rebuild implemented
- [x] Goal/loop repeated blocker stop alignment implemented
- [x] release:check includes all new gates
- [x] docs updated
- [x] no P0 gaps remain


## 34. Final Report Format

작업 완료 후 다음 형식으로 보고한다.

```md
# SKS 1.0.8 Codex 0.132 / UX-Review Final Seal Report

## Version
- Previous:
- New: 1.0.8

## Codex 0.132 Compatibility
| Feature | Status | Evidence |
| --- | --- | --- |
| exec resume --output-schema | pass/fail | ... |
| app-server image fidelity | pass/fail | ... |
| memory summary rebuild | pass/fail | ... |
| repeated blocker stop | pass/fail | ... |
| TUI probe batching | pass/fail/P1 | ... |

## UX-Review Real Loop
| Stage | Result |
| --- | --- |
| source screenshot inventory | pass/fail |
| gpt-image-2 callout generation | pass/fail |
| generated image ingestion | pass/fail |
| callout extraction | pass/fail |
| issue ledger v2 | pass/fail |
| fix task planner | pass/fail |
| safe fix loop | pass/fail |
| recapture | pass/fail |
| re-review | pass/fail |
| Image Voxel relations | pass/fail |
| Completion Proof | pass/fail |
| Trust Report | pass/fail |

## No Text Fallback
- Text-only fallback blocked:
- Mock-as-real blocked:

## Release Gate
| Command | Result |
| --- | --- |
| npm run codex:0.132-compat | pass/fail |
| npm run codex:output-schema-fixture | pass/fail |
| npm run ux-review:real-loop-fixture | pass/fail |
| npm run ux-review:no-text-fallback | pass/fail |
| npm run release:check | pass/fail |

## Honest Mode
- Verified:
- Verified partial:
- Not verified:
- Blocked:

## Remaining Gaps
- None for P0.
```


## 35. 최종 성공 문장

> SKS 1.0.8은 Codex rust-v0.132.0 신규 기능을 활용하고, UX-Review를 실제 gpt-image-2 callout/fix/recheck/Image Voxel/Proof 루프로 완성하여, screenshot 기반 UI 문제를 증거 기반으로 찾아 고치고 검증하는 SKS 대표 기능을 완전히 실전화한 release다.
