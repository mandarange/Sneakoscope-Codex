# SKS 1.14.1 Goal 지시서 — 9.9+ Extreme Stabilization Release: Codex Hook Official Parity · Real Imagegen Smoke · PPT Full E2E · Codex 0.133 Verification

> 대상 저장소: `mandarange/Sneakoscope-Codex`
> 현재 기준 버전: `1.14.0`
> 목표 버전: **`1.14.1`**
> 목표 성격: **새 기능 확장보다 실전 신뢰도 9.9+를 위한 극단적 안정화 릴리스**
> 핵심 원칙: **이미 구현된 Hook Trust Parity, UX/PPT Imagegen, DFix, Evidence Graph를 “정책/구조/fixture” 수준에서 “실전 검증/옵션 real smoke/official parity/blackbox artifact graph” 수준으로 끌어올린다.**
>
> 1.14.0은 성공적인 릴리스였지만, 9.9+로 가려면 다음 네 가지를 끝까지 닫아야 한다.
>
> 1. 실제 Codex official hook hash/trust parity 강화
> 2. UX/PPT real gpt-image-2 smoke 운영화
> 3. PPT synthetic deck → slide export → imagegen → extraction → proof full E2E 검증
> 4. Codex 0.133 공식 릴리스/소스 기반 compatibility matrix 검증
>
> 이 릴리스는 “기능을 더 많이 만든다”가 아니라 “사용자가 신뢰할 수 있는 증거를 더 깊게 만든다”가 목표다.

---

## 0. Goal Command Payload

```bash
sks goal create "SKS 1.14.1 9.9+ extreme stabilization: official hook parity, real imagegen smoke, PPT full E2E, Codex 0.133 verification" --from-file docs/goals/sks-1.14.1-extreme-stabilization-release.md
```

Codex App / Codex CLI에는 다음처럼 전달한다.

```text
$Goal SKS 1.14.1 Extreme Stabilization Release를 수행한다. 1.14.0에서 성공적으로 들어간 Codex hook trust parity, managed hook install, gpt-image-2 request validator, UX/PPT fake-adapter blackbox를 기반으로, 남은 실전 신뢰도 구멍을 전부 P0로 닫는다. 특히 Codex official hook hash를 실제 Codex discovery 또는 official Rust hash oracle로 검증하고, real imagegen smoke를 opt-in CI로 운영화하며, PPT는 synthetic deck부터 slide export/imagegen/extraction/proof까지 full E2E blackbox를 추가하고, Codex 0.133 공식 릴리스/소스 변경을 SKS matrix와 release readiness에 반영한다. 목표는 9.9+ 신뢰도의 극단적 안정화 릴리스다.
```


## 1. 최상위 목표

- [x] Hook trust warning-zero를 managed policy 수준에서 official hash parity 수준으로 한 단계 더 끌어올린다.
- [x] Codex CLI가 official hook hash/list API를 제공하는 경우, SKS 계산과 실제 Codex 결과를 비교한다.
- [x] Codex CLI가 official hook hash/list API를 제공하지 않는 경우, official Rust hash oracle 또는 golden fixture를 통해 parity를 검증한다.
- [x] SKS-only canonical JSON hash를 trusted_hash로 쓰지 않는 1.14.0 정책을 유지한다.
- [x] managed install은 기본 repair path로 유지한다.
- [x] real imagegen smoke를 opt-in CI/profile로 운영화한다.
- [x] UX real imagegen smoke는 실제 gpt-image-2 output artifact를 검증한다.
- [x] PPT real imagegen smoke는 1-slide generated callout output artifact를 검증한다.
- [x] PPT는 synthetic PPTX부터 slide export, imagegen, extraction, deck issue ledger, proof/trust까지 full E2E blackbox를 가져야 한다.
- [x] Codex 0.133 compatibility matrix가 공식 릴리스/소스 기반으로 검증되어야 한다.
- [x] release:check는 hermetic하고 빠르게 유지하되, release:real-check는 optional real API/Codex checks를 실행한다.
- [x] 모든 real smoke는 cost/latency budget과 local-only artifact policy를 가진다.
- [x] fake adapter blackbox와 real smoke 결과를 절대 혼동하지 않는다.
- [x] 1.14.1은 patch release이지만 신뢰도 측면에서 major-quality 안정화를 목표로 한다.


## 2. 최종 성공 문장

> SKS 1.14.1은 Codex hook trust warning-zero를 official discovery/hash parity 또는 official hash oracle로 검증하고, UX/PPT imagegen route를 opt-in real gpt-image-2 smoke와 hermetic full E2E blackbox로 증명하며, Codex 0.133 compatibility를 공식 릴리스 기반으로 봉인한 9.9+ 신뢰도의 극단적 안정화 릴리스다.


## 3. 절대 금지

- [x] SKS-only hash를 official Codex hash로 가장하지 않는다.
- [x] official hash unavailable 상태에서 unmanaged trusted_hash를 자동 생성하지 않는다.
- [x] managed install로 통과했다고 official hash parity가 증명됐다고 말하지 않는다.
- [x] fake imagegen blackbox를 real gpt-image-2 smoke로 가장하지 않는다.
- [x] real imagegen smoke가 실패했는데 release:real-check를 pass 처리하지 않는다.
- [x] real imagegen smoke output image 없이 generated claim을 만들지 않는다.
- [x] PPT full E2E 없이 PPT imagegen completeness를 주장하지 않는다.
- [x] manual slide image blackbox만으로 synthetic deck E2E를 대체하지 않는다.
- [x] Codex 0.133 compatibility를 package script 추가만으로 완료 처리하지 않는다.
- [x] Codex 0.133 공식 릴리스/소스 변경을 확인하지 않고 matrix를 ok로 표시하지 않는다.
- [x] real smoke screenshot/generated image/PPT deck을 shared TriWiki에 자동 publish하지 않는다.
- [x] secret-bearing env를 smoke output에 남기지 않는다.
- [x] large binary artifacts를 npm package에 포함하지 않는다.
- [x] release:check를 지나치게 느린 real API test에 의존시키지 않는다.


## 4. Version / Release Metadata

- [x] package.json version을 1.14.1로 올린다.
- [x] package-lock.json이 있으면 1.14.1로 정렬한다.
- [x] src/core/version.ts를 1.14.1로 올린다.
- [x] src/core/fsx.ts PACKAGE_VERSION을 1.14.1로 올린다.
- [x] crates/sks-core/Cargo.toml version을 1.14.1로 올린다.
- [x] crates/sks-core/src/main.rs --version 출력을 1.14.1로 정렬한다.
- [x] CHANGELOG.md에 [1.14.1] 섹션을 추가한다.
- [x] README.md Current Release를 1.14.1로 갱신한다.
- [x] docs/release-readiness.md를 1.14.1 기준으로 갱신한다.
- [x] docs/hooks-pat.md에 official parity/oracle 내용을 추가한다.
- [x] docs/ux-review.md에 real imagegen smoke 내용을 추가한다.
- [x] docs/ppt-imagegen-review.md에 synthetic deck E2E 내용을 추가한다.
- [x] docs/codex-cli-compat.md에 Codex 0.133 검증 결과를 추가한다.
- [x] docs/official-docs-compat.md를 1.14.1 기준으로 갱신한다.
- [x] release metadata check가 1.14.1을 요구하게 한다.
- [x] release-check-stamp가 1.14.1 기준으로 생성되게 한다.
- [x] prepublishOnly가 1.14.1 stamp를 검증한다.
- [x] publish:dry가 1.14.1 tarball metadata를 검증한다.


## 5. CHANGELOG 필수 섹션

```md
## [1.14.1] - YYYY-MM-DD

### Added
- Add Codex hook official hash oracle / parity fixture so SKS can verify hook trust state beyond managed-policy fallback when official data is available.
- Add `sks hooks parity --official --json` and release gates for official hash parity, actual discovery parity, managed repair, and runtime warning-zero replay.
- Add opt-in real imagegen smoke profile for UX and PPT using gpt-image-2 request validation, local-only generated artifacts, cost/latency tracking, and strict no-`input_fidelity` checks.
- Add PPT full synthetic deck E2E blackbox: synthetic PPTX, slide export, fake imagegen, structured extraction, deck issue ledger, Image Voxel relations, Completion Proof, and Trust Report.
- Add Codex 0.133 official release/source compatibility report covering release notes, source feature deltas, hook schema drift, and SKS matrix consistency.
- Add flagship proof graph validator for UX/PPT hook/DFix evidence graphs to ensure command → artifact → evidence → proof → trust continuity.

### Fixed
- Prevent managed hook install success from being misreported as official hash parity.
- Prevent fake imagegen blackbox artifacts from being reported as real gpt-image-2 smoke results.
- Prevent PPT manual-slide-only blackbox from standing in for full deck E2E coverage.
- Prevent Codex 0.133 compatibility from passing without official release/source verification.
- Prevent optional real smoke artifacts from leaking secrets or local-only binary paths.

### Changed
- Treat 1.14.1 as a confidence hardening release: no new flagship surfaces, only deeper parity and real-smoke proof.
- Treat real imagegen tests as opt-in `release:real-check` while keeping hermetic fake-adapter blackbox in `release:check`.
```


## 6. P0 — Codex Official Hook Hash Oracle

- [x] 새 모듈 `src/core/codex-hooks/codex-hook-official-hash-oracle.ts`를 추가한다.
- [x] official oracle mode를 `cli`, `rust-helper`, `golden-fixture`, `unavailable`로 구분한다.
- [x] Codex CLI가 `hooks list --json` 또는 equivalent를 제공하면 `cli` mode로 사용한다.
- [x] Codex CLI가 official hash를 제공하지 않으면 Rust helper 또는 golden fixture로 fallback한다.
- [x] Rust helper가 가능하면 `sks-rs hook-hash` 또는 `sks-rs codex-hook-hash`를 구현한다.
- [x] Rust helper는 Codex normalized TOML identity를 사용해야 한다.
- [x] Rust helper는 event_name, matcher group, normalized command handler를 입력으로 받는다.
- [x] Rust helper는 timeout, async=false, statusMessage, commandWindows normalization을 반영한다.
- [x] Rust helper는 JSON input을 받고 JSON output을 낸다.
- [x] Rust helper output schema는 `sks.codex-hook-hash-oracle.v1`이다.
- [x] golden fixture는 official Codex known hash fixtures를 저장한다.
- [x] golden fixture에는 PreToolUse matcher command hook이 있어야 한다.
- [x] golden fixture에는 SessionStart matcher 없는 hook이 있어야 한다.
- [x] golden fixture에는 SubagentStart/SubagentStop hook이 있어야 한다.
- [x] golden fixture에는 commandWindows/statusMessage/timeout fixture가 있어야 한다.
- [x] official hash oracle unavailable이면 unmanaged trusted_hash writer는 disabled 상태여야 한다.
- [x] official hash oracle unavailable이면 managed install을 repair path로 제안한다.


## 7. P0 — Hook Official Parity Report v2

- [x] 기존 parity report를 `sks.codex-hook-official-parity.v2`로 올린다.
- [x] report에 `oracle_mode`를 포함한다.
- [x] report에 `official_hash_available`을 포함한다.
- [x] report에 `official_hash_proven`을 포함한다.
- [x] report에 `managed_policy_used`를 포함한다.
- [x] report에 `unmanaged_trusted_hash_writer_enabled`를 포함한다.
- [x] report에 `unmanaged_trusted_hash_writer_enabled=false` when oracle unavailable을 강제한다.
- [x] report에 Codex CLI version을 포함한다.
- [x] report에 Codex hook list command/result를 포함한다.
- [x] report에 Rust helper version을 포함한다.
- [x] report에 golden fixture version을 포함한다.
- [x] report에 SKS computed hash와 official hash를 모두 기록한다.
- [x] report에 mismatch list를 기록한다.
- [x] report에 trust_status mismatch list를 기록한다.
- [x] report에 plugin source coverage status를 기록한다.
- [x] report에 requirements.toml managed coverage status를 기록한다.
- [x] report에 config.toml inline hooks coverage status를 기록한다.
- [x] report에 hooks.json coverage status를 기록한다.
- [x] report blockers가 있으면 release fail.


## 8. P0 — Hook Actual Discovery Parity 강화

- [x] actual discovery가 project hooks.json을 읽는다.
- [x] actual discovery가 user hooks.json을 읽는다.
- [x] actual discovery가 project config.toml inline hooks를 읽는다.
- [x] actual discovery가 user config.toml inline hooks를 읽는다.
- [x] actual discovery가 project requirements.toml을 읽는다.
- [x] actual discovery가 user requirements.toml을 읽는다.
- [x] actual discovery가 system requirements.toml path를 best-effort로 읽는다.
- [x] actual discovery가 hooks.managed_dir를 읽는다.
- [x] actual discovery가 windows_managed_dir를 읽는다.
- [x] actual discovery가 managed dir JSON/TOML hooks를 읽는다.
- [x] actual discovery가 plugin hooks source를 best-effort로 탐지한다.
- [x] plugin hooks source를 못 읽으면 `plugin_source_not_available` warning을 낸다.
- [x] plugin warning은 release fixture에서는 blocker가 아니지만 user doctor에서는 표시한다.
- [x] dual representation은 release blocker.
- [x] unsupported handler는 release blocker.
- [x] async handler는 release blocker.
- [x] invalid matcher는 release blocker.
- [x] empty command는 release blocker.
- [x] source_kind/source_format/source_path를 모든 entry에 기록한다.


## 9. P0 — Hook Trust Repair UX

- [x] `sks hooks parity --official --json` command를 추가한다.
- [x] `sks hooks trust-doctor --actual --json`를 v2 report로 업데이트한다.
- [x] `sks hooks repair --managed --json`를 추가하거나 `install --managed`와 alias한다.
- [x] `sks hooks repair --trusted --json`는 official hash oracle available일 때만 trusted_hash를 쓴다.
- [x] official hash oracle unavailable이면 `repair --trusted`는 blocked로 처리한다.
- [x] repair output에 exact next command를 포함한다.
- [x] repair output에 modified/untrusted/dual/unsupported handler별 next action을 포함한다.
- [x] repair output은 사용자 config를 덮어쓰기 전에 dry-run diff를 제공한다.
- [x] repair output은 requirements.toml managed install을 default로 제안한다.
- [x] repair output은 OpenAI Codex warning text를 SKS structured blocker로 매핑한다.


## 10. P0 — Hook Runtime Warning-Zero Actual Replay v2

- [x] runtime replay가 모든 10 events를 포함한다.
- [x] runtime replay가 official schema output validation을 실행한다.
- [x] runtime replay가 semantic validator를 실행한다.
- [x] runtime replay가 actual Codex hook parser를 사용할 수 있으면 opt-in으로 실행한다.
- [x] runtime replay stdout/stderr에서 trust/trusu/untrusted/modified/unsupported/skipping prompt/skipping agent/skipping async 문자열을 grep한다.
- [x] runtime replay가 managed install fixture 후 실행된다.
- [x] runtime replay가 unmanaged trusted fixture 후 실행된다.
- [x] runtime replay가 modified/untrusted fixture를 negative test로 실행한다.
- [x] negative test는 warning을 감지해야 pass한다.
- [x] positive test는 warning 0개여야 pass한다.
- [x] runtime replay report를 `.sneakoscope/reports/hooks-runtime-warning-zero-1.14.1.json`에 쓴다.


## 11. P0 — Real Imagegen Smoke 운영화

- [x] 새 script `scripts/imagegen-real-smoke-check.mjs`를 강화한다.
- [x] real smoke는 `SKS_TEST_REAL_IMAGEGEN=1` 없이는 실행하지 않는다.
- [x] real smoke는 `OPENAI_API_KEY` 없으면 integration_optional으로 종료한다.
- [x] real smoke는 UX single screenshot flow를 실행한다.
- [x] real smoke는 PPT one-slide flow를 실행한다.
- [x] real smoke는 request validator output을 기록한다.
- [x] real smoke는 `input_fidelity`가 request에 없음을 검사한다.
- [x] real smoke는 generated image file 존재를 검사한다.
- [x] real smoke는 generated image sha256를 검사한다.
- [x] real smoke는 generated image dimensions를 검사한다.
- [x] real smoke는 response artifact를 검사한다.
- [x] real smoke는 local-only privacy를 검사한다.
- [x] real smoke는 cost/usage metadata가 있으면 기록한다.
- [x] real smoke는 latency ms를 기록한다.
- [x] real smoke는 artifact path를 `.sneakoscope/reports/real-imagegen-smoke-1.14.1.json`에 기록한다.
- [x] real smoke는 artifacts를 shared TriWiki에 자동 publish하지 않는다.
- [x] real smoke는 failed API response를 redacted한다.
- [x] real smoke는 moderation/safety block을 structured blocker로 반환한다.


## 12. P0 — UX Real Imagegen Smoke

- [x] UX real smoke source image fixture를 작은 PNG로 준비한다.
- [x] UX real smoke prompt는 low-risk UI callout prompt를 사용한다.
- [x] UX real smoke는 `generateGptImage2CalloutReview()` 실제 OpenAI Images API path를 탄다.
- [x] UX real smoke request artifact를 검사한다.
- [x] UX real smoke response artifact를 검사한다.
- [x] UX real smoke generated image를 검사한다.
- [x] UX real smoke는 Structured Outputs extraction까지 optional로 실행한다.
- [x] Extraction API key/model unavailable이면 generation success만으로 smoke pass 가능하되 extraction optional blocker를 기록한다.
- [x] UX real smoke는 fake_adapter=false를 요구한다.
- [x] UX real smoke는 real_generated=true를 요구한다.


## 13. P0 — PPT Real Imagegen Smoke

- [x] PPT real smoke는 one-slide image fixture 또는 synthetic deck export image를 사용한다.
- [x] PPT real smoke는 `generateSlideCalloutReviews()`를 통해 UX imagegen adapter를 재사용한다.
- [x] PPT real smoke request/response artifact를 검사한다.
- [x] PPT real smoke generated slide callout image를 검사한다.
- [x] PPT real smoke는 fake_adapter=false를 요구한다.
- [x] PPT real smoke는 real_generated=true를 요구한다.
- [x] PPT real smoke는 deck-level proof graph와 분리된 small smoke report를 쓴다.
- [x] PPT real smoke는 cost/latency를 기록한다.


## 14. P0 — PPT Synthetic Deck Full E2E Blackbox

- [x] 새 script `scripts/ppt-full-e2e-blackbox-check.mjs`를 추가한다.
- [x] synthetic PPTX fixture를 생성한다.
- [x] synthetic PPTX는 최소 1개 slide를 갖는다.
- [x] 가능하면 2개 slide fixture도 추가한다.
- [x] slide export adapter를 실행한다.
- [x] soffice unavailable이면 fake export adapter를 사용하되 source를 fake_export로 표시한다.
- [x] slide image output artifact를 검사한다.
- [x] fake imagegen adapter를 통해 generated slide callout image를 만든다.
- [x] fake extractor를 통해 slide issue ledger를 만든다.
- [x] deck issue ledger를 만든다.
- [x] Image Voxel relation을 만든다.
- [x] Completion Proof를 만든다.
- [x] Trust Report를 만든다.
- [x] blackbox는 actual CLI `sks ppt review --deck ... --imagegen --json`를 실행한다.
- [x] manual-slide-images만 사용하는 것은 full E2E로 인정하지 않는다.
- [x] full E2E report는 `sks.ppt-full-e2e-blackbox.v1` schema를 갖는다.
- [x] release:check에 `ppt:full-e2e-blackbox`를 추가한다.


## 15. P0 — PPT Full E2E Artifact Graph Validator

- [x] deck inventory artifact 존재를 확인한다.
- [x] slide export ledger artifact 존재를 확인한다.
- [x] slide callout ledger artifact 존재를 확인한다.
- [x] slide issue ledger artifact 존재를 확인한다.
- [x] deck issue ledger artifact 존재를 확인한다.
- [x] Image Voxel relation artifact 존재를 확인한다.
- [x] Completion Proof artifact 존재를 확인한다.
- [x] Trust Report artifact 존재를 확인한다.
- [x] generated slide review count >= slide count인지 확인한다.
- [x] issue extraction count > 0인지 확인한다.
- [x] mock/fake source가 verified real로 승격되지 않았는지 확인한다.
- [x] local-only artifact policy를 확인한다.


## 16. P0 — Codex 0.133 Official Compatibility Verification

- [x] 새 모듈 `src/core/codex-compat/codex-0-133.ts`를 추가하거나 기존 matrix를 강화한다.
- [x] 새 script `scripts/codex-0-133-official-compat-report.mjs`를 추가한다.
- [x] Codex 0.133 release source URL/tag를 metadata에 기록한다.
- [x] Codex 0.133 release notes key features를 report에 기록한다.
- [x] Codex 0.133 source delta를 report에 기록한다.
- [x] goal defaults 변경이 있으면 SKS Goal defaults와 비교한다.
- [x] remote-control foreground app-server behavior가 있으면 SKS Computer Use/Codex App integration과 비교한다.
- [x] permission profiles/requirements 변경이 있으면 SKS hooks/managed requirements와 비교한다.
- [x] plugin discovery/marketplaces 변경이 있으면 hook actual discovery plugin coverage와 비교한다.
- [x] extension lifecycle events 변경이 있으면 SKS event matrix와 비교한다.
- [x] hook schema drift가 있으면 snapshot update required blocker.
- [x] Codex 0.133 detected version이면 compatibility ok.
- [x] Codex <0.133이면 degraded but supported.
- [x] Codex missing이면 integration_optional.
- [x] report schema는 `sks.codex-0-133-official-compat.v1`이다.
- [x] release:check에 `codex:0.133-official-compat`를 추가한다.


## 17. P0 — Codex 0.133 Matrix / 0.132 Backward Compatibility

- [x] 0.132 output-schema detection을 유지한다.
- [x] 0.133 compatibility가 0.132 structured output path를 깨지 않게 한다.
- [x] 0.133 baseline required flag는 release script에서만 사용한다.
- [x] 사용자 환경에서 0.132가 있으면 compatibility_degraded가 아니라 supported_degraded로 표현한다.
- [x] README/docs에 0.133 recommended, 0.132 supported를 명시한다.
- [x] Codex 0.133 missing optional features는 blocker가 아니라 warning unless SKS needs it.
- [x] Hook latest schema는 10-event 유지 또는 official drift에 따라 update한다.


## 18. P0 — Flagship Proof Graph Validator v2

- [x] 새 모듈 `src/core/evidence/flagship-proof-graph-validator.ts`를 추가한다.
- [x] UX graph validator를 구현한다.
- [x] PPT graph validator를 구현한다.
- [x] DFix graph validator를 구현한다.
- [x] Hooks graph validator를 구현한다.
- [x] graph validator는 command output mission_id를 입력으로 받는다.
- [x] graph validator는 required artifacts를 읽는다.
- [x] graph validator는 recursive schema validator를 실행한다.
- [x] graph validator는 Evidence Index linkage를 확인한다.
- [x] graph validator는 Completion Proof linkage를 확인한다.
- [x] graph validator는 Trust Report linkage를 확인한다.
- [x] graph validator는 Wrongness linkage를 확인한다.
- [x] graph validator는 mock/real cap을 확인한다.
- [x] graph validator는 local-only policy를 확인한다.
- [x] graph validator는 missing artifact를 blocker로 반환한다.
- [x] release:check에 flagship graph validator v2를 추가한다.


## 19. Release Gate Update

`package.json` scripts에 다음을 추가하거나 강화한다.

```json
{
  "scripts": {
    "hooks:official-hash-oracle": "node ./scripts/hooks-official-hash-oracle-check.mjs",
    "hooks:actual-parity-v2": "node ./scripts/hooks-actual-parity-v2-check.mjs",
    "hooks:runtime-replay-warning-zero-v2": "node ./scripts/hooks-runtime-replay-warning-zero-v2.mjs",
    "imagegen:real-smoke": "node ./scripts/imagegen-real-smoke-check.mjs",
    "ux-review:real-imagegen-smoke": "node ./scripts/ux-review-real-imagegen-smoke-check.mjs",
    "ppt:real-imagegen-smoke": "node ./scripts/ppt-real-imagegen-smoke-check.mjs",
    "ppt:full-e2e-blackbox": "node ./scripts/ppt-full-e2e-blackbox-check.mjs",
    "ppt:full-e2e-artifact-graph": "node ./scripts/ppt-full-e2e-artifact-graph-check.mjs",
    "codex:0.133-official-compat": "node ./scripts/codex-0-133-official-compat-report.mjs",
    "flagship:proof-graph-v2": "node ./scripts/flagship-proof-graph-v2-check.mjs"
  }
}
```

기본 `release:check`에는 hermetic checks만 포함한다.

```text
[x] hooks:official-hash-oracle
[x] hooks:actual-parity-v2
[x] hooks:runtime-replay-warning-zero-v2
[x] ppt:full-e2e-blackbox
[x] ppt:full-e2e-artifact-graph
[x] codex:0.133-official-compat
[x] flagship:proof-graph-v2
```

`release:real-check`에는 real smoke를 포함한다.

```text
[x] release:check
[x] imagegen:real-smoke
[x] ux-review:real-imagegen-smoke
[x] ppt:real-imagegen-smoke
```


## 20. Required Unit Tests

- [x] test/unit/codex-hook-official-hash-oracle.test.ts
- [x] test/unit/codex-hook-parity-v2.test.ts
- [x] test/unit/codex-hook-trust-doctor-actual-v2.test.ts
- [x] test/unit/codex-hook-runtime-replay-v2.test.ts
- [x] test/unit/imagegen-real-smoke-policy.test.ts
- [x] test/unit/ux-real-imagegen-smoke.test.ts
- [x] test/unit/ppt-real-imagegen-smoke.test.ts
- [x] test/unit/ppt-synthetic-deck-fixture.test.ts
- [x] test/unit/ppt-full-e2e-artifact-graph.test.ts
- [x] test/unit/codex-0-133-official-compat.test.ts
- [x] test/unit/flagship-proof-graph-validator-v2.test.ts


## 21. Required Integration Tests

- [x] test/integration/hooks-official-hash-oracle-rust-helper.test.ts
- [x] test/integration/hooks-managed-policy-no-unmanaged-hash.test.ts
- [x] test/integration/hooks-actual-parity-v2-managed.test.ts
- [x] test/integration/hooks-runtime-replay-warning-zero-v2.test.ts
- [x] test/integration/ppt-full-synthetic-deck-e2e.test.ts
- [x] test/integration/ppt-full-e2e-artifact-graph.test.ts
- [x] test/integration/ux-fake-imagegen-artifact-graph-v2.test.ts
- [x] test/integration/codex-0-133-matrix.test.ts
- [x] test/integration/flagship-proof-graph-v2.test.ts


## 22. Required Black-box Tests

- [x] test/blackbox/hooks-official-hash-oracle-packed.test.mjs
- [x] test/blackbox/hooks-actual-parity-v2-packed.test.mjs
- [x] test/blackbox/hooks-runtime-replay-warning-zero-v2-packed.test.mjs
- [x] test/blackbox/ppt-full-e2e-blackbox-packed.test.mjs
- [x] test/blackbox/ppt-full-e2e-artifact-graph-packed.test.mjs
- [x] test/blackbox/codex-0-133-official-compat-packed.test.mjs
- [x] test/blackbox/flagship-proof-graph-v2-packed.test.mjs


## 23. 대량 세부 Task Bank

- [x] Hook parity `managed requirements.toml hook`: fixture created
- [x] Hook parity `managed requirements.toml hook`: actual discovery reads source
- [x] Hook parity `managed requirements.toml hook`: official oracle status recorded
- [x] Hook parity `managed requirements.toml hook`: warning-zero expectation recorded
- [x] Hook parity `managed requirements.toml hook`: repair action recorded
- [x] Hook parity `managed requirements.toml hook`: blackbox or unit coverage exists
- [x] Hook parity `managed_dir TOML hook`: fixture created
- [x] Hook parity `managed_dir TOML hook`: actual discovery reads source
- [x] Hook parity `managed_dir TOML hook`: official oracle status recorded
- [x] Hook parity `managed_dir TOML hook`: warning-zero expectation recorded
- [x] Hook parity `managed_dir TOML hook`: repair action recorded
- [x] Hook parity `managed_dir TOML hook`: blackbox or unit coverage exists
- [x] Hook parity `managed_dir JSON hook`: fixture created
- [x] Hook parity `managed_dir JSON hook`: actual discovery reads source
- [x] Hook parity `managed_dir JSON hook`: official oracle status recorded
- [x] Hook parity `managed_dir JSON hook`: warning-zero expectation recorded
- [x] Hook parity `managed_dir JSON hook`: repair action recorded
- [x] Hook parity `managed_dir JSON hook`: blackbox or unit coverage exists
- [x] Hook parity `project hooks.json unmanaged trusted`: fixture created
- [x] Hook parity `project hooks.json unmanaged trusted`: actual discovery reads source
- [x] Hook parity `project hooks.json unmanaged trusted`: official oracle status recorded
- [x] Hook parity `project hooks.json unmanaged trusted`: warning-zero expectation recorded
- [x] Hook parity `project hooks.json unmanaged trusted`: repair action recorded
- [x] Hook parity `project hooks.json unmanaged trusted`: blackbox or unit coverage exists
- [x] Hook parity `project hooks.json unmanaged modified`: fixture created
- [x] Hook parity `project hooks.json unmanaged modified`: actual discovery reads source
- [x] Hook parity `project hooks.json unmanaged modified`: official oracle status recorded
- [x] Hook parity `project hooks.json unmanaged modified`: warning-zero expectation recorded
- [x] Hook parity `project hooks.json unmanaged modified`: repair action recorded
- [x] Hook parity `project hooks.json unmanaged modified`: blackbox or unit coverage exists
- [x] Hook parity `project hooks.json unmanaged untrusted`: fixture created
- [x] Hook parity `project hooks.json unmanaged untrusted`: actual discovery reads source
- [x] Hook parity `project hooks.json unmanaged untrusted`: official oracle status recorded
- [x] Hook parity `project hooks.json unmanaged untrusted`: warning-zero expectation recorded
- [x] Hook parity `project hooks.json unmanaged untrusted`: repair action recorded
- [x] Hook parity `project hooks.json unmanaged untrusted`: blackbox or unit coverage exists
- [x] Hook parity `user hooks.json unmanaged trusted`: fixture created
- [x] Hook parity `user hooks.json unmanaged trusted`: actual discovery reads source
- [x] Hook parity `user hooks.json unmanaged trusted`: official oracle status recorded
- [x] Hook parity `user hooks.json unmanaged trusted`: warning-zero expectation recorded
- [x] Hook parity `user hooks.json unmanaged trusted`: repair action recorded
- [x] Hook parity `user hooks.json unmanaged trusted`: blackbox or unit coverage exists
- [x] Hook parity `config.toml inline hook`: fixture created
- [x] Hook parity `config.toml inline hook`: actual discovery reads source
- [x] Hook parity `config.toml inline hook`: official oracle status recorded
- [x] Hook parity `config.toml inline hook`: warning-zero expectation recorded
- [x] Hook parity `config.toml inline hook`: repair action recorded
- [x] Hook parity `config.toml inline hook`: blackbox or unit coverage exists
- [x] Hook parity `dual representation`: fixture created
- [x] Hook parity `dual representation`: actual discovery reads source
- [x] Hook parity `dual representation`: official oracle status recorded
- [x] Hook parity `dual representation`: warning-zero expectation recorded
- [x] Hook parity `dual representation`: repair action recorded
- [x] Hook parity `dual representation`: blackbox or unit coverage exists
- [x] Hook parity `prompt handler`: fixture created
- [x] Hook parity `prompt handler`: actual discovery reads source
- [x] Hook parity `prompt handler`: official oracle status recorded
- [x] Hook parity `prompt handler`: warning-zero expectation recorded
- [x] Hook parity `prompt handler`: repair action recorded
- [x] Hook parity `prompt handler`: blackbox or unit coverage exists
- [x] Hook parity `agent handler`: fixture created
- [x] Hook parity `agent handler`: actual discovery reads source
- [x] Hook parity `agent handler`: official oracle status recorded
- [x] Hook parity `agent handler`: warning-zero expectation recorded
- [x] Hook parity `agent handler`: repair action recorded
- [x] Hook parity `agent handler`: blackbox or unit coverage exists
- [x] Hook parity `async handler`: fixture created
- [x] Hook parity `async handler`: actual discovery reads source
- [x] Hook parity `async handler`: official oracle status recorded
- [x] Hook parity `async handler`: warning-zero expectation recorded
- [x] Hook parity `async handler`: repair action recorded
- [x] Hook parity `async handler`: blackbox or unit coverage exists
- [x] Hook parity `invalid matcher`: fixture created
- [x] Hook parity `invalid matcher`: actual discovery reads source
- [x] Hook parity `invalid matcher`: official oracle status recorded
- [x] Hook parity `invalid matcher`: warning-zero expectation recorded
- [x] Hook parity `invalid matcher`: repair action recorded
- [x] Hook parity `invalid matcher`: blackbox or unit coverage exists
- [x] Hook parity `SubagentStart`: fixture created
- [x] Hook parity `SubagentStart`: actual discovery reads source
- [x] Hook parity `SubagentStart`: official oracle status recorded
- [x] Hook parity `SubagentStart`: warning-zero expectation recorded
- [x] Hook parity `SubagentStart`: repair action recorded
- [x] Hook parity `SubagentStart`: blackbox or unit coverage exists
- [x] Hook parity `SubagentStop`: fixture created
- [x] Hook parity `SubagentStop`: actual discovery reads source
- [x] Hook parity `SubagentStop`: official oracle status recorded
- [x] Hook parity `SubagentStop`: warning-zero expectation recorded
- [x] Hook parity `SubagentStop`: repair action recorded
- [x] Hook parity `SubagentStop`: blackbox or unit coverage exists
- [x] UX fake imagegen graph: command executed
- [x] UX fake imagegen graph: artifacts exist
- [x] UX fake imagegen graph: schema validation passes
- [x] UX fake imagegen graph: evidence index linked
- [x] UX fake imagegen graph: proof linked
- [x] UX fake imagegen graph: trust linked
- [x] UX fake imagegen graph: wrongness behavior defined
- [x] UX fake imagegen graph: mock/real cap checked
- [x] UX fake imagegen graph: local-only policy checked
- [x] UX fake imagegen graph: release gate added
- [x] UX real imagegen smoke: command executed
- [x] UX real imagegen smoke: artifacts exist
- [x] UX real imagegen smoke: schema validation passes
- [x] UX real imagegen smoke: evidence index linked
- [x] UX real imagegen smoke: proof linked
- [x] UX real imagegen smoke: trust linked
- [x] UX real imagegen smoke: wrongness behavior defined
- [x] UX real imagegen smoke: mock/real cap checked
- [x] UX real imagegen smoke: local-only policy checked
- [x] UX real imagegen smoke: release gate added
- [x] UX structured extraction: command executed
- [x] UX structured extraction: artifacts exist
- [x] UX structured extraction: schema validation passes
- [x] UX structured extraction: evidence index linked
- [x] UX structured extraction: proof linked
- [x] UX structured extraction: trust linked
- [x] UX structured extraction: wrongness behavior defined
- [x] UX structured extraction: mock/real cap checked
- [x] UX structured extraction: local-only policy checked
- [x] UX structured extraction: release gate added
- [x] PPT fake imagegen graph: command executed
- [x] PPT fake imagegen graph: artifacts exist
- [x] PPT fake imagegen graph: schema validation passes
- [x] PPT fake imagegen graph: evidence index linked
- [x] PPT fake imagegen graph: proof linked
- [x] PPT fake imagegen graph: trust linked
- [x] PPT fake imagegen graph: wrongness behavior defined
- [x] PPT fake imagegen graph: mock/real cap checked
- [x] PPT fake imagegen graph: local-only policy checked
- [x] PPT fake imagegen graph: release gate added
- [x] PPT real imagegen smoke: command executed
- [x] PPT real imagegen smoke: artifacts exist
- [x] PPT real imagegen smoke: schema validation passes
- [x] PPT real imagegen smoke: evidence index linked
- [x] PPT real imagegen smoke: proof linked
- [x] PPT real imagegen smoke: trust linked
- [x] PPT real imagegen smoke: wrongness behavior defined
- [x] PPT real imagegen smoke: mock/real cap checked
- [x] PPT real imagegen smoke: local-only policy checked
- [x] PPT real imagegen smoke: release gate added
- [x] PPT synthetic deck export: command executed
- [x] PPT synthetic deck export: artifacts exist
- [x] PPT synthetic deck export: schema validation passes
- [x] PPT synthetic deck export: evidence index linked
- [x] PPT synthetic deck export: proof linked
- [x] PPT synthetic deck export: trust linked
- [x] PPT synthetic deck export: wrongness behavior defined
- [x] PPT synthetic deck export: mock/real cap checked
- [x] PPT synthetic deck export: local-only policy checked
- [x] PPT synthetic deck export: release gate added
- [x] PPT synthetic deck extraction: command executed
- [x] PPT synthetic deck extraction: artifacts exist
- [x] PPT synthetic deck extraction: schema validation passes
- [x] PPT synthetic deck extraction: evidence index linked
- [x] PPT synthetic deck extraction: proof linked
- [x] PPT synthetic deck extraction: trust linked
- [x] PPT synthetic deck extraction: wrongness behavior defined
- [x] PPT synthetic deck extraction: mock/real cap checked
- [x] PPT synthetic deck extraction: local-only policy checked
- [x] PPT synthetic deck extraction: release gate added
- [x] PPT synthetic deck proof: command executed
- [x] PPT synthetic deck proof: artifacts exist
- [x] PPT synthetic deck proof: schema validation passes
- [x] PPT synthetic deck proof: evidence index linked
- [x] PPT synthetic deck proof: proof linked
- [x] PPT synthetic deck proof: trust linked
- [x] PPT synthetic deck proof: wrongness behavior defined
- [x] PPT synthetic deck proof: mock/real cap checked
- [x] PPT synthetic deck proof: local-only policy checked
- [x] PPT synthetic deck proof: release gate added
- [x] DFix graph: command executed
- [x] DFix graph: artifacts exist
- [x] DFix graph: schema validation passes
- [x] DFix graph: evidence index linked
- [x] DFix graph: proof linked
- [x] DFix graph: trust linked
- [x] DFix graph: wrongness behavior defined
- [x] DFix graph: mock/real cap checked
- [x] DFix graph: local-only policy checked
- [x] DFix graph: release gate added
- [x] Hooks graph: command executed
- [x] Hooks graph: artifacts exist
- [x] Hooks graph: schema validation passes
- [x] Hooks graph: evidence index linked
- [x] Hooks graph: proof linked
- [x] Hooks graph: trust linked
- [x] Hooks graph: wrongness behavior defined
- [x] Hooks graph: mock/real cap checked
- [x] Hooks graph: local-only policy checked
- [x] Hooks graph: release gate added
- [x] Codex 0.133 `goal defaults`: official source checked
- [x] Codex 0.133 `goal defaults`: SKS impact classified
- [x] Codex 0.133 `goal defaults`: matrix row added
- [x] Codex 0.133 `goal defaults`: release readiness row added
- [x] Codex 0.133 `goal defaults`: test or not-applicable reason added
- [x] Codex 0.133 `remote-control foreground app-server`: official source checked
- [x] Codex 0.133 `remote-control foreground app-server`: SKS impact classified
- [x] Codex 0.133 `remote-control foreground app-server`: matrix row added
- [x] Codex 0.133 `remote-control foreground app-server`: release readiness row added
- [x] Codex 0.133 `remote-control foreground app-server`: test or not-applicable reason added
- [x] Codex 0.133 `permission profiles`: official source checked
- [x] Codex 0.133 `permission profiles`: SKS impact classified
- [x] Codex 0.133 `permission profiles`: matrix row added
- [x] Codex 0.133 `permission profiles`: release readiness row added
- [x] Codex 0.133 `permission profiles`: test or not-applicable reason added
- [x] Codex 0.133 `requirements`: official source checked
- [x] Codex 0.133 `requirements`: SKS impact classified
- [x] Codex 0.133 `requirements`: matrix row added
- [x] Codex 0.133 `requirements`: release readiness row added
- [x] Codex 0.133 `requirements`: test or not-applicable reason added
- [x] Codex 0.133 `plugin discovery`: official source checked
- [x] Codex 0.133 `plugin discovery`: SKS impact classified
- [x] Codex 0.133 `plugin discovery`: matrix row added
- [x] Codex 0.133 `plugin discovery`: release readiness row added
- [x] Codex 0.133 `plugin discovery`: test or not-applicable reason added
- [x] Codex 0.133 `marketplaces`: official source checked
- [x] Codex 0.133 `marketplaces`: SKS impact classified
- [x] Codex 0.133 `marketplaces`: matrix row added
- [x] Codex 0.133 `marketplaces`: release readiness row added
- [x] Codex 0.133 `marketplaces`: test or not-applicable reason added
- [x] Codex 0.133 `extension lifecycle events`: official source checked
- [x] Codex 0.133 `extension lifecycle events`: SKS impact classified
- [x] Codex 0.133 `extension lifecycle events`: matrix row added
- [x] Codex 0.133 `extension lifecycle events`: release readiness row added
- [x] Codex 0.133 `extension lifecycle events`: test or not-applicable reason added
- [x] Codex 0.133 `hook schema drift`: official source checked
- [x] Codex 0.133 `hook schema drift`: SKS impact classified
- [x] Codex 0.133 `hook schema drift`: matrix row added
- [x] Codex 0.133 `hook schema drift`: release readiness row added
- [x] Codex 0.133 `hook schema drift`: test or not-applicable reason added
- [x] Codex 0.133 `structured output inheritance`: official source checked
- [x] Codex 0.133 `structured output inheritance`: SKS impact classified
- [x] Codex 0.133 `structured output inheritance`: matrix row added
- [x] Codex 0.133 `structured output inheritance`: release readiness row added
- [x] Codex 0.133 `structured output inheritance`: test or not-applicable reason added
- [x] Codex 0.133 `computer use impact`: official source checked
- [x] Codex 0.133 `computer use impact`: SKS impact classified
- [x] Codex 0.133 `computer use impact`: matrix row added
- [x] Codex 0.133 `computer use impact`: release readiness row added
- [x] Codex 0.133 `computer use impact`: test or not-applicable reason added


## 24. Done Definition

- [x] version 1.14.1 everywhere.
- [x] Official hook hash oracle implemented or managed-only policy explicitly enforced.
- [x] Hook official parity report v2 implemented.
- [x] Hook actual discovery parity strengthened.
- [x] Hook runtime warning-zero replay v2 implemented.
- [x] UX real imagegen smoke implemented.
- [x] PPT real imagegen smoke implemented.
- [x] PPT full synthetic deck E2E blackbox implemented.
- [x] PPT full E2E artifact graph validator implemented.
- [x] Codex 0.133 official compatibility report implemented.
- [x] Flagship proof graph validator v2 implemented.
- [x] release:check includes hermetic 1.14.1 gates.
- [x] release:real-check includes real imagegen smoke.
- [x] Docs updated.
- [x] No P0 gaps remain.


## 25. Final Report Format

작업 완료 후 다음 형식으로 보고한다.

```md
# SKS 1.14.1 Extreme Stabilization Report

## Version
- Previous: 1.14.0
- New: 1.14.1

## Hook Official Parity
| Check | Result | Evidence |
| --- | --- | --- |
| official hash oracle | pass/fail | ... |
| actual discovery v2 | pass/fail | ... |
| managed policy fallback | pass/fail | ... |
| runtime warning-zero v2 | pass/fail | ... |

## Real Imagegen Smoke
| Flow | Result | Evidence |
| --- | --- | --- |
| UX real gpt-image-2 smoke | pass/fail/integration_optional | ... |
| PPT real gpt-image-2 smoke | pass/fail/integration_optional | ... |

## PPT Full E2E
| Stage | Result | Evidence |
| --- | --- | --- |
| synthetic deck | pass/fail |
| slide export | pass/fail |
| fake imagegen | pass/fail |
| structured extraction | pass/fail |
| deck ledger | pass/fail |
| proof/trust graph | pass/fail |

## Codex 0.133 Compatibility
| Topic | Result | Notes |
| --- | --- | --- |

## Release Gate
| Command | Result |
| --- | --- |
| hooks:official-hash-oracle | pass/fail |
| hooks:actual-parity-v2 | pass/fail |
| ppt:full-e2e-blackbox | pass/fail |
| codex:0.133-official-compat | pass/fail |
| flagship:proof-graph-v2 | pass/fail |
| npm run release:check | pass/fail |
| npm run release:real-check | pass/fail/integration_optional |

## Remaining Gaps
- None for P0.
```


## 26. 최종 성공 문장

> SKS 1.14.1은 hook official parity, real imagegen smoke, PPT full E2E, Codex 0.133 verification을 통해 1.14.0의 강력한 구조를 실제 검증 신뢰도 9.9+로 끌어올린 극단적 안정화 릴리스다.
