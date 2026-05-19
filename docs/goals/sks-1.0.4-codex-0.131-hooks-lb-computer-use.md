# SKS 1.0.4 Goal 지시서 — Codex CLI rust-v0.131.0 최적화 · Hooks 최신 문법 · codex-lb Wizard · macOS Computer Use 적극화판

> 대상 저장소: `mandarange/Sneakoscope-Codex`  
> 현재 기준 버전: `1.0.3` 또는 최신 main  
> 목표 버전: **`1.0.4`**  
> 기준 upstream: **OpenAI Codex CLI `rust-v0.131.0`**  
> 목표 성격: **Codex CLI 최신 릴리스 호환 / hooks 경고 0개 / codex-lb setup interactive wizard / CODEX_LB_API_KEY missing bug 영구 제거 / macOS Codex App Computer Use 적극 사용 / MAD-SKS와 Computer Use 정책 완전 분리**  
> 핵심 원칙: **SKS는 Codex 공식 스키마를 추측하지 않는다. OpenAI Codex `rust-v0.131.0` hook schemas와 config semantics를 snapshot하고, release gate에서 최신 문법만 허용한다.**

---

## 0. Goal Command Payload

Codex CLI 또는 Codex App에서 다음 goal로 시작한다.

```bash
sks goal create "SKS 1.0.4 Codex CLI rust-v0.131.0 compatibility hooks codex-lb computer-use hardening" --from-file docs/goals/sks-1.0.4-codex-0.131-hooks-lb-computer-use.md
```

Codex App에서는 다음처럼 전달한다.

```text
$Goal SKS 1.0.4 업데이트를 수행한다. OpenAI Codex CLI rust-v0.131.0을 기준으로 hooks 스키마와 config semantics를 최신화하고, hooks 관련 경고가 절대 나오지 않도록 모든 SKS hook output/input replay를 공식 schema snapshot으로 검증한다. 또한 sks codex-lb setup을 interactive wizard로 바꿔 domain/base URL과 API key를 사용자에게 질문 형식으로 받아 안전하게 저장하고, macOS에서 CODEX_LB_API_KEY missing 환경변수 오류가 다시는 뜨지 않도록 env auto-load/doctor/repair/release tests를 추가한다. Codex App Computer Use는 MAD-SKS와 무관한 macOS 적극 사용 capability로 분리하고, SKS 내부 policy가 Computer Use를 safety policy로 오판해 차단하지 않도록 고친다. 단, 공식 Codex/App/플랫폼에서 외부 capability를 실제로 차단하는 경우에는 우회하지 않고 external_capability_blocked로 정직하게 기록한다.
```

---

## 1. 최상위 임무

너는 SKS `1.0.4`를 구현하는 작업자 AI다.

이번 업데이트의 목적은 세 가지다.

```text
1. Codex CLI rust-v0.131.0 compatibility
   - Codex hook/config schema가 바뀌어도 SKS가 구식 hook output을 내보내지 않게 한다.
   - Hooks 관련 경고가 release gate와 black-box에서 0개여야 한다.

2. codex-lb setup reliability
   - `sks codex-lb setup`이 질문형 wizard로 domain/base URL과 API key를 받아 설정한다.
   - macOS 사용자에게 `[Missing environment variable: CODEX_LB_API_KEY]`가 다시 뜨면 release failure다.

3. macOS Computer Use active capability
   - Mac에서 visual/UI verification이 필요하면 Codex App Computer Use를 적극적으로 사용하도록 한다.
   - Computer Use는 MAD-SKS와 무관하다.
   - SKS 내부 policy가 `safety policy blocked` 같은 문구로 Computer Use를 잘못 차단하지 않게 한다.
   - 단, OpenAI Codex App 또는 OS capability가 실제로 거부한 경우 SKS는 우회하지 않고 external_capability_blocked로 기록한다.
```

---

## 2. Source of Truth

### 2.1 Upstream Codex source

이번 버전의 기준은 다음이다.

```text
OpenAI Codex CLI tag: rust-v0.131.0
Repository: openai/codex
```

핵심 근거:

```text
[ ] OpenAI Codex README: Codex CLI install, Codex App entry, docs links
[ ] codex-rs/Cargo.toml: workspace.package version = 0.131.0
[ ] docs/config.md: lifecycle hooks and allow_managed_hooks_only semantics
[ ] codex-rs/config/src/hook_config.rs: hook config event names and handler config shape
[ ] codex-rs/hooks/src/schema.rs: command hook input/output schema source
[ ] codex-rs/hooks/schema/generated/*.schema.json: generated hook schemas
```

### 2.2 Do not invent schemas

금지:

```text
[ ] Codex App subagent / Computer Use / hooks schema를 추측해서 만들기
[ ] OpenAI 공식/업스트림 스키마와 다른 이름의 hook output을 내보내기
[ ] 구식 Claude hook output shape를 Codex hook output처럼 사용하기
[ ] generated schema fixture 없이 hook output을 release pass 처리하기
```

허용:

```text
[x] upstream generated schema snapshot vendor
[x] schema diff detector
[x] unknown future field -> blocked/unsupported, not guessed
[x] external capability unavailable -> external_capability_blocked
```

---

## 3. Version update

### 3.1 목표 버전

```text
1.0.3 or current -> 1.0.4
```

### 3.2 반드시 업데이트할 파일

```text
[ ] package.json
[ ] package-lock.json, if present
[ ] src/core/version.ts
[ ] src/core/fsx.ts PACKAGE_VERSION
[ ] crates/sks-core/Cargo.toml
[ ] crates/sks-core/src/main.rs --version output
[ ] CHANGELOG.md
[ ] README.md
[ ] docs/codex-cli-compat.md
[ ] docs/hooks-pat.md
[ ] docs/codex-lb.md
[ ] docs/computer-use-evidence.md
[ ] docs/codex-app.md
[ ] docs/known-gaps.md
```

### 3.3 CHANGELOG 필수 섹션

```md
## [1.0.4] - YYYY-MM-DD

### Added
- Add Codex CLI `rust-v0.131.0` compatibility layer with vendored hook schema snapshots and strict hook output validation.
- Add `sks codex-lb setup` interactive wizard for domain/base URL and API key capture with secure storage and env auto-load.
- Add codex-lb missing-env prevention so macOS users do not see raw `Missing environment variable: CODEX_LB_API_KEY` after setup or update.
- Add macOS Codex App Computer Use capability detector and visual-route integration that treats Computer Use as a first-class visual evidence source.
- Add hook warning black-box tests that fail release if Codex hook output produces deprecated-shape or unknown-field warnings.
- Add `sks codex compatibility` and `sks hooks codex-validate` surfaces for checking Codex CLI version, hook schemas, and SKS output shape.

### Fixed
- Replace legacy hook output shapes with Codex `rust-v0.131.0` canonical `hookSpecificOutput` / camelCase output syntax.
- Prevent SKS from misclassifying Codex App Computer Use as a MAD-SKS or generic safety block.
- Prevent codex-lb launch/setup paths from throwing raw missing-env errors when setup can repair or explain the missing key.
- Prevent secrets from being written to proof, logs, screenshots, hook replay, black-box reports, or wrongness memory.

### Changed
- Treat Codex CLI compatibility and hook-schema freshness as release invariants.
- Treat Computer Use availability as a capability check, not an SKS safety policy decision.
```

---

## 4. P0 — Codex CLI rust-v0.131.0 Compatibility Layer

### 4.1 목표

SKS가 설치된 Codex CLI 버전과 upstream hook/config semantics를 감지하고, rust-v0.131.0 기준으로 호환성을 검증한다.

### 4.2 새 모듈

```text
src/core/codex-compat/
  codex-version.ts
  codex-version-policy.ts
  codex-schema-snapshot.ts
  codex-hook-schema.ts
  codex-hook-output-normalizer.ts
  codex-hook-warning-detector.ts
  codex-config-policy.ts
  codex-compat-report.ts
```

### 4.3 CLI

```bash
sks codex compatibility --json
sks codex version --json
sks codex doctor --json
sks hooks codex-validate --json
sks hooks codex-schema --json
```

`codex-app` 기존 command와 충돌하지 않게 `codex` top-level command를 추가하거나, 기존 `codex-app`/`hooks` command에 subcommand로 붙인다.

### 4.4 Version detection

검사 순서:

```text
[ ] `codex --version`
[ ] `codex --help`, if version parsing fails
[ ] npm package @openai/codex version, if installed through npm
[ ] Homebrew cask metadata, if available
[ ] GitHub tag baseline from vendor snapshot
```

Output:

```json
{
  "schema": "sks.codex-compat.v1",
  "required_baseline": "rust-v0.131.0",
  "detected": {
    "available": true,
    "version": "0.131.0",
    "source": "codex --version"
  },
  "hooks_schema": {
    "snapshot": "rust-v0.131.0",
    "ok": true
  },
  "ok": true,
  "warnings": []
}
```

### 4.5 Policy

```text
[ ] detected version >= 0.131.0 -> ok
[ ] detected version older -> warning + compatibility degraded
[ ] no codex binary -> integration_optional, not hard release failure
[ ] release hook schema tests use vendored snapshot, not live codex binary
[ ] live codex binary tests are optional real tests
```

### 4.6 Acceptance criteria

```text
[ ] sks codex compatibility --json works
[ ] no codex installed -> honest integration_optional result
[ ] Codex v0.131.0 installed -> ok
[ ] older codex -> warning with upgrade instruction
[ ] compatibility report included in doctor
```

---

## 5. P0 — Vendor Codex Hook Schema Snapshot

### 5.1 목표

`rust-v0.131.0`의 hook input/output schema를 SKS에 snapshot하여, hooks 관련 warning이 나올 수 있는 구식 문법을 release gate에서 막는다.

### 5.2 Vendored files

```text
src/vendor/openai-codex/rust-v0.131.0/hooks/
  pre-tool-use.command.input.schema.json
  pre-tool-use.command.output.schema.json
  permission-request.command.input.schema.json
  permission-request.command.output.schema.json
  post-tool-use.command.input.schema.json
  post-tool-use.command.output.schema.json
  pre-compact.command.input.schema.json
  pre-compact.command.output.schema.json
  post-compact.command.input.schema.json
  post-compact.command.output.schema.json
  session-start.command.input.schema.json
  session-start.command.output.schema.json
  user-prompt-submit.command.input.schema.json
  user-prompt-submit.command.output.schema.json
  stop.command.input.schema.json
  stop.command.output.schema.json
```

### 5.3 Snapshot metadata

```json
{
  "schema": "sks.codex-hook-schema-snapshot.v1",
  "upstream": "openai/codex",
  "tag": "rust-v0.131.0",
  "codex_version": "0.131.0",
  "captured_at": "YYYY-MM-DDTHH:mm:ssZ",
  "source_files": [
    "codex-rs/hooks/src/schema.rs",
    "codex-rs/hooks/schema/generated/*.schema.json"
  ]
}
```

### 5.4 Hook events to support

Based on Codex `rust-v0.131.0`, supported hook config event names:

```text
PreToolUse
PermissionRequest
PostToolUse
PreCompact
PostCompact
SessionStart
UserPromptSubmit
Stop
```

### 5.5 Hook config shape

Based on upstream `HookHandlerConfig`, SKS hook writers must use:

```toml
[[hooks.PreToolUse]]
matcher = "..."
[[hooks.PreToolUse.hooks]]
type = "command"
command = "sks hook pre-tool --json"
timeout = 30
async = false
statusMessage = "SKS trust gate"
```

Command handler supported fields:

```text
command
commandWindows / command_windows alias
timeout
async
statusMessage
```

Do not emit unsupported config fields.

### 5.6 Managed hooks only

OpenAI Codex `rust-v0.131.0` docs state:

```text
allow_managed_hooks_only = true is top-level in requirements.toml only.
Putting it in config.toml does not enable managed-hooks-only mode.
```

SKS must not write `allow_managed_hooks_only` to `config.toml`.

### 5.7 Acceptance criteria

```text
[ ] vendored hook schema snapshot exists
[ ] hook config writer emits only supported event names and fields
[ ] allow_managed_hooks_only is only written to requirements.toml when explicitly requested
[ ] hooks codex-validate validates all generated SKS hook outputs against snapshot
[ ] release fails if unsupported hook field appears
```

---

## 6. P0 — Latest Hook Output Canonicalizer

### 6.1 목표

SKS hook outputs must always use Codex `rust-v0.131.0` camelCase output syntax.

### 6.2 Universal output

All hook outputs may include:

```json
{
  "continue": true,
  "stopReason": null,
  "suppressOutput": false,
  "systemMessage": null
}
```

Do not emit snake_case in output.

금지:

```text
[ ] stop_reason
[ ] suppress_output
[ ] system_message
[ ] hook_specific_output
[ ] hook_event_name
[ ] permission_decision
[ ] permission_decision_reason
[ ] updated_input
[ ] additional_context
```

허용:

```text
[x] stopReason
[x] suppressOutput
[x] systemMessage
[x] hookSpecificOutput
[x] hookEventName
[x] permissionDecision
[x] permissionDecisionReason
[x] updatedInput
[x] additionalContext
```

### 6.3 PreToolUse output

Canonical deny:

```json
{
  "continue": true,
  "suppressOutput": false,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "SKS DB safety policy blocked destructive SQL"
  }
}
```

Canonical allow:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  }
}
```

Canonical ask:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "permissionDecisionReason": "SKS requires user confirmation"
  }
}
```

Do not rely on top-level legacy `permissionDecision`.

### 6.4 PermissionRequest output

Canonical deny/allow:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "deny",
      "message": "SKS DB safety policy requires a migration plan"
    }
  }
}
```

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "message": "SKS trust policy allows this request"
    }
  }
}
```

Do not emit `updatedInput`, `updatedPermissions`, or `interrupt` for PermissionRequest because upstream marks them as reserved and fail-closed.

### 6.5 PostToolUse output

Canonical context:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "SKS recorded command evidence EV-..."
  }
}
```

### 6.6 SessionStart / UserPromptSubmit

SessionStart:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "SKS trust kernel active"
  }
}
```

UserPromptSubmit with block:

```json
{
  "continue": true,
  "decision": "block",
  "reason": "SKS requires route contract clarification before implementation."
}
```

UserPromptSubmit with context:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Relevant wrongness memory: ..."
  }
}
```

### 6.7 Stop output

Stop block:

```json
{
  "continue": false,
  "stopReason": "SKS Completion Proof missing",
  "decision": "block",
  "reason": "SKS serious route cannot finalize without valid Completion Proof."
}
```

Stop allow:

```json
{
  "continue": true
}
```

### 6.8 PreCompact/PostCompact output

```json
{
  "continue": true
}
```

### 6.9 Acceptance criteria

```text
[ ] all SKS hook outputs validate against vendored rust-v0.131.0 output schemas
[ ] no hook output contains snake_case output keys
[ ] PermissionRequest output never emits reserved fields
[ ] Stop block includes reason
[ ] hook replay warns=0
```

---

## 7. P0 — Hook Warning Zero Gate

### 7.1 목표

사용자가 "hooks 관련 경고"를 보지 않게 한다.  
Release must fail if SKS hook output would produce Codex warnings.

### 7.2 New command

```bash
sks hooks codex-validate --json
sks hooks warning-check --json
sks hooks replay-codex-fixtures --json
```

### 7.3 Test fixtures

```text
test/fixtures/codex-hooks/rust-v0.131.0/
  pre-tool-use-deny.input.json
  pre-tool-use-deny.output.expected.json
  pre-tool-use-allow.output.expected.json
  permission-request-deny.input.json
  permission-request-deny.output.expected.json
  post-tool-use-context.output.expected.json
  session-start-context.output.expected.json
  user-prompt-submit-block.output.expected.json
  stop-block.output.expected.json
```

### 7.4 Warning detector

Detect and block:

```text
[ ] unknown field in output
[ ] snake_case output keys
[ ] old hookSpecificOutput wrapper missing where required
[ ] PermissionRequest reserved fields
[ ] Stop block without reason
[ ] top-level permissionDecision legacy output
[ ] config event name typo
[ ] allow_managed_hooks_only written to config.toml
```

### 7.5 Release scripts

```json
{
  "scripts": {
    "codex:compat": "node ./dist/bin/sks.js codex compatibility --json",
    "hooks:codex-validate": "node ./dist/bin/sks.js hooks codex-validate --json",
    "hooks:warning-check": "node ./dist/bin/sks.js hooks warning-check --json"
  }
}
```

Add to `release:check`.

### 7.6 Acceptance criteria

```text
[ ] hooks:codex-validate passes
[ ] hooks:warning-check passes
[ ] all hook replay fixtures validate against vendored schema
[ ] release fails on any Codex hook warning pattern
```

---

## 8. P0 — codex-lb setup Interactive Wizard

### 8.1 현재 문제

사용자 macOS 환경에서 SKS 업데이트 후 다음 raw error가 뜬다.

```text
Missing environment variable: CODEX_LB_API_KEY
```

이 메시지가 사용자에게 다시 노출되면 1.0.4 release failure다.

### 8.2 목표

`sks codex-lb setup`을 interactive wizard로 만들고, domain/base URL과 API key를 안전하게 받아 설정한다.

### 8.3 CLI UX

```bash
sks codex-lb setup
```

Interactive prompt:

```text
SKS codex-lb setup

1. codex-lb domain or base URL?
   Example: lb.example.com or https://lb.example.com/backend-api/codex

2. API key?
   Input hidden. Value will be stored securely and never printed.

3. Use this codex-lb as default for Codex launches? [Y/n]

4. Write shell env loader to ~/.codex/sks-codex-lb.env? [Y/n]

5. Run health check now? [Y/n]
```

Non-interactive:

```bash
sks codex-lb setup --host lb.example.com --api-key sk-clb-... --yes --json
sks codex-lb setup --base-url https://lb.example.com/backend-api/codex --api-key-stdin --yes --json
```

### 8.4 Base URL normalization

Input normalization:

```text
lb.example.com
  -> https://lb.example.com/backend-api/codex

https://lb.example.com
  -> https://lb.example.com/backend-api/codex

https://lb.example.com/backend-api/codex
  -> unchanged
```

Ask user before writing if path is not recognized.

### 8.5 Secure storage

Preferred order on macOS:

```text
1. macOS Keychain, if available and user allows
2. ~/.codex/sks-codex-lb.env with chmod 0600
3. project-local .sneakoscope/secrets only if explicitly requested and gitignored
```

Env file content:

```bash
export CODEX_LB_BASE_URL='https://.../backend-api/codex'
export CODEX_LB_API_KEY='...'
```

Never write key to:

```text
[ ] completion proof
[ ] trust report
[ ] wrongness memory
[ ] logs
[ ] screenshots
[ ] hook replay result
[ ] black-box reports
[ ] git tracked shared memory
```

### 8.6 Doctor / status

```bash
sks codex-lb status --json
sks codex-lb doctor --deep --json
sks codex-lb repair --json
```

Should show redacted key status:

```json
{
  "configured": true,
  "base_url": "https://lb.example.com/backend-api/codex",
  "api_key": {
    "present": true,
    "source": "macos-keychain",
    "redacted": true
  },
  "env_auto_load": true,
  "ok": true
}
```

### 8.7 Acceptance criteria

```text
[ ] sks codex-lb setup interactive wizard works
[ ] --host/--api-key non-interactive works
[ ] --api-key-stdin works
[ ] API key input is hidden in interactive mode
[ ] env file chmod 0600
[ ] key never appears in stdout/stderr/proof/logs/reports
[ ] base URL normalized
[ ] health check works or reports structured blocker
```

---

## 9. P0 — CODEX_LB_API_KEY Missing Bug Permanent Fix

### 9.1 Hard rule

SKS must never print raw:

```text
Missing environment variable: `CODEX_LB_API_KEY`.
Missing environment variable: CODEX_LB_API_KEY
```

Instead print structured, actionable message:

```text
codex-lb API key is not configured.
Run:
  sks codex-lb setup
or:
  sks codex-lb setup --host <domain> --api-key-stdin --yes
```

### 9.2 Env auto-load

Before any codex-lb path runs, SKS must load key from:

```text
[ ] process.env
[ ] macOS Keychain
[ ] ~/.codex/sks-codex-lb.env
[ ] ~/.codex/sks.env
[ ] project .sneakoscope/secrets/codex-lb.env, if explicitly allowed
```

### 9.3 Launch wrapper

All Codex launch/codex-lb wrappers must call:

```ts
await loadCodexLbEnvironment({ repairHints: true })
```

before checking missing env.

### 9.4 Postinstall/update protection

During npm update/postinstall:

```text
[ ] do not trigger live codex-lb launch if key missing
[ ] do not print raw missing env
[ ] doctor should show setup needed
[ ] setup needed is not fatal for package install
```

### 9.5 Tests

```text
test/unit/codex-lb-env-loader.test.ts
test/unit/codex-lb-missing-env-message.test.ts
test/integration/codex-lb-setup-wizard.test.ts
test/blackbox/codex-lb-fresh-macos-home.test.mjs
test/blackbox/codex-lb-update-no-missing-env.test.mjs
```

### 9.6 Acceptance criteria

```text
[ ] grep test proves raw missing env message never appears in SKS output
[ ] fresh HOME codex-lb status gives setup_needed, not raw env error
[ ] after setup, codex-lb doctor sees key
[ ] after simulated npm update, no raw missing env message
[ ] secrets redacted everywhere
```

---

## 10. P0 — macOS Codex App Computer Use Active Capability

### 10.1 문제

사용자가 다음 메시지를 받았다.

```text
Codex 앱은 Computer Use 접근이 안전 정책상 차단됐고,
```

SKS must not produce this message as its own policy for macOS visual/UI work.

### 10.2 Correct policy

Computer Use is:

```text
[ ] macOS Codex App capability
[ ] visual/UI evidence source
[ ] not MAD-SKS
[ ] not DB safety
[ ] not generic SKS safety block
```

SKS must separate:

```text
SKS internal policy:
  do not block Computer Use because of MAD-SKS or generic safety.

External platform/capability:
  if Codex App or OS denies access, record external_capability_blocked.
```

### 10.3 New status model

```ts
type ComputerUseStatus =
  | 'available'
  | 'codex_app_missing'
  | 'macos_permission_missing'
  | 'codex_app_capability_missing'
  | 'external_capability_blocked'
  | 'not_macos'
  | 'unknown';
```

### 10.4 CLI

```bash
sks computer-use status --json
sks computer-use doctor --json
sks computer-use enable --macos --json
sks computer-use require --route '$Image-UX-Review' --json
```

### 10.5 macOS detection

Check:

```text
[ ] platform darwin
[ ] Codex App installed or `codex app` available
[ ] app-server reachable if applicable
[ ] screen recording / accessibility permission status, if safely detectable
[ ] user guidance if permission missing
```

Do not fabricate permission checks. If OS-level detection is unavailable, show `unknown` with steps.

### 10.6 Visual route behavior

For macOS visual/UI routes:

```text
[ ] `$Image-UX-Review` should prefer Computer Use evidence when real UI verification is required.
[ ] `$QA-LOOP` UI verification should require Computer Use evidence or mark verified_partial/blocked.
[ ] `$PPT` visual review should use Computer Use/screenshots if needed.
[ ] Browser Use is not a substitute for Computer Use UI verification.
[ ] MAD-SKS permission state must not disable Computer Use.
```

### 10.7 Forbidden message

SKS must not output:

```text
Computer Use blocked by safety policy
Computer Use access is unsafe
MAD-SKS disabled Computer Use
```

Allowed messages:

```text
Computer Use capability is not available from Codex App in this environment.
macOS permission appears missing; open System Settings and grant Screen Recording/Accessibility to Codex App.
External Codex App capability returned a block; SKS recorded external_capability_blocked and will not fabricate UI evidence.
```

### 10.8 Evidence

If available, visual route proof must include:

```json
{
  "computer_use": {
    "schema": "sks.computer-use-evidence.v1",
    "status": "available",
    "source": "codex-app-macos",
    "screens": [],
    "actions": [],
    "image_voxel_linked": true
  }
}
```

### 10.9 Acceptance criteria

```text
[ ] SKS never emits forbidden safety-block message for Computer Use
[ ] macOS status command distinguishes permission/capability/external block
[ ] visual routes request Computer Use when needed
[ ] MAD-SKS state has no effect on Computer Use availability
[ ] external official platform denial is not bypassed and is recorded honestly
[ ] tests cover all status values
```

---

## 11. P0 — Hook / Computer Use / codex-lb Wrongness Memory

### 11.1 목표

codex-lb missing env, hook warning, Computer Use misclassification은 wrongness memory로 저장되어 다음 업데이트에서 재발하지 않아야 한다.

### 11.2 Wrongness records

Auto-generate wrongness for:

```text
[ ] hook_schema_warning
[ ] hook_output_deprecated_shape
[ ] codex_lb_missing_env_raw_message
[ ] computer_use_misclassified_as_safety_block
[ ] computer_use_mad_sks_confusion
[ ] codex_cli_version_incompatibility
```

### 11.3 Avoidance rules

```text
[ ] Do not emit hook output that fails Codex rust-v0.131.0 schema.
[ ] Do not print raw CODEX_LB_API_KEY missing messages; use setup wizard guidance.
[ ] Do not classify macOS Computer Use as MAD-SKS or generic safety block.
[ ] Do not claim Computer Use evidence if external capability is blocked.
```

### 11.4 Acceptance criteria

```text
[ ] wrongness record created if hook warning fixture fails
[ ] wrongness record created if raw missing env message appears in fixture
[ ] wrongness record created if Computer Use forbidden message appears
[ ] trust report includes avoidance rules
```

---

## 12. P0 — Black-box macOS/User Update Simulation

### 12.1 목표

사용자 macOS update scenario에서 문제를 재현/차단한다.

### 12.2 Black-box tests

```text
test/blackbox/codex-lb-macos-fresh-home.test.mjs
test/blackbox/codex-lb-macos-after-update.test.mjs
test/blackbox/hooks-codex-0-131-warning-zero.test.mjs
test/blackbox/computer-use-macos-policy.test.mjs
```

### 12.3 Scenarios

```text
fresh HOME:
  sks codex-lb status --json
  -> setup_needed, no raw missing env

interactive setup simulated:
  echo key | sks codex-lb setup --host example.test --api-key-stdin --yes --json
  -> configured true, key redacted

after update:
  npm install -g sneakoscope
  sks codex-lb doctor --json
  -> no raw missing env

hooks:
  sks hooks replay-codex-fixtures --json
  -> warnings=0

computer-use:
  sks computer-use status --json
  -> status structured, no forbidden safety message
```

### 12.4 Acceptance criteria

```text
[ ] black-box macOS/fresh HOME fixtures pass
[ ] no raw missing env output
[ ] no hook warning output
[ ] no Computer Use safety-block wording
```

---

## 13. P0 — Documentation Updates

### 13.1 Update docs

```text
docs/codex-cli-compat.md
docs/hooks-pat.md
docs/codex-lb.md
docs/computer-use-evidence.md
docs/codex-app.md
docs/known-gaps.md
README.md
```

### 13.2 README section

Add concise 1.0.4 section:

```md
## 1.0.4 Codex CLI Compatibility

SKS 1.0.4 targets OpenAI Codex CLI `rust-v0.131.0`. Hook outputs are validated against vendored upstream schemas, so SKS fails release checks if it emits deprecated hook shapes or unknown fields. `sks codex-lb setup` now guides users through domain/base URL and API key setup, stores secrets securely, and prevents raw `CODEX_LB_API_KEY` missing messages. On macOS, Computer Use is treated as a first-class Codex App visual evidence capability and is never blocked by MAD-SKS or a generic SKS safety policy.
```

Caution:

```md
If the Codex App or OS itself denies Computer Use capability, SKS records `external_capability_blocked` and does not fabricate UI evidence.
```

### 13.3 Acceptance criteria

```text
[ ] docs cite Codex rust-v0.131.0 baseline
[ ] docs explain hook schema snapshot
[ ] docs explain codex-lb setup wizard
[ ] docs explain Computer Use status semantics
```

---

## 14. Release Gate Update

### 14.1 New scripts

```json
{
  "scripts": {
    "codex:compat": "node ./dist/bin/sks.js codex compatibility --json",
    "hooks:codex-validate": "node ./dist/bin/sks.js hooks codex-validate --json",
    "hooks:warning-check": "node ./dist/bin/sks.js hooks warning-check --json",
    "codex-lb:setup-fixture": "node ./scripts/codex-lb-setup-fixture-check.mjs",
    "computer-use:policy-check": "node ./scripts/computer-use-policy-check.mjs"
  }
}
```

### 14.2 release:check additions

```text
[ ] codex:compat
[ ] hooks:codex-validate
[ ] hooks:warning-check
[ ] codex-lb:setup-fixture
[ ] computer-use:policy-check
```

### 14.3 Pass criteria

```text
[ ] hook warnings = 0
[ ] hook schema validation = pass
[ ] codex-lb fresh HOME setup_needed message is structured
[ ] codex-lb setup configures key without leaks
[ ] raw CODEX_LB_API_KEY missing message absent
[ ] Computer Use forbidden safety wording absent
[ ] Computer Use capability status structured
```

---

## 15. Required Tests

### 15.1 Unit tests

```text
[ ] test/unit/codex-version-policy.test.ts
[ ] test/unit/codex-hook-output-normalizer.test.ts
[ ] test/unit/codex-hook-schema-validator.test.ts
[ ] test/unit/codex-lb-env-loader.test.ts
[ ] test/unit/codex-lb-url-normalizer.test.ts
[ ] test/unit/codex-lb-secret-redaction.test.ts
[ ] test/unit/computer-use-status-policy.test.ts
[ ] test/unit/computer-use-mad-sks-separation.test.ts
```

### 15.2 Integration tests

```text
[ ] test/integration/hooks-codex-0-131-replay.test.ts
[ ] test/integration/codex-lb-interactive-setup.test.ts
[ ] test/integration/codex-lb-doctor-after-setup.test.ts
[ ] test/integration/computer-use-visual-route-policy.test.ts
[ ] test/integration/codex-compat-doctor.test.ts
```

### 15.3 Black-box tests

```text
[ ] test/blackbox/codex-lb-fresh-home-no-raw-missing-env.test.mjs
[ ] test/blackbox/codex-lb-after-update-no-raw-missing-env.test.mjs
[ ] test/blackbox/hooks-warning-zero.test.mjs
[ ] test/blackbox/computer-use-no-safety-block-wording.test.mjs
```

---

## 16. Done Definition

1.0.4 is done only when all are true.

```text
[ ] version 1.0.4
[ ] Codex rust-v0.131.0 hook schema snapshot vendored
[ ] hook output canonicalizer uses camelCase latest syntax
[ ] hooks warning-check passes with warnings=0
[ ] hook replay fixtures validate against rust-v0.131.0 schemas
[ ] allow_managed_hooks_only never written to config.toml
[ ] sks codex-lb setup interactive wizard works
[ ] codex-lb setup stores key securely/redacted
[ ] raw CODEX_LB_API_KEY missing message cannot appear
[ ] postinstall/update does not trigger raw missing env
[ ] macOS Computer Use status model implemented
[ ] Computer Use not tied to MAD-SKS
[ ] SKS does not output forbidden Computer Use safety-block wording
[ ] external Codex/App denial recorded as external_capability_blocked, not bypassed
[ ] wrongness memory records hook/lb/computer-use regressions
[ ] release:check passes
[ ] docs updated
```

---

## 17. Final Report Format

After work completes, report:

```md
# SKS 1.0.4 Codex Compatibility / Hooks / codex-lb / Computer Use Report

## Version
- Previous:
- New: 1.0.4

## Codex CLI Compatibility
- Required baseline: rust-v0.131.0
- Detected Codex:
- Hook schema snapshot:
- Compatibility result:

## Hooks
| Event | Schema Validate | Warning |
| --- | --- | --- |
| PreToolUse | pass/fail | yes/no |
| PermissionRequest | pass/fail | yes/no |
| PostToolUse | pass/fail | yes/no |
| SessionStart | pass/fail | yes/no |
| UserPromptSubmit | pass/fail | yes/no |
| Stop | pass/fail | yes/no |

## codex-lb
- setup wizard:
- env auto-load:
- key storage:
- raw missing env blocked:
- health:

## Computer Use
- macOS status:
- MAD-SKS separation:
- visual route usage:
- external blocks:

## Wrongness Memory
- hook warning wrongness:
- missing env wrongness:
- computer-use misclassification wrongness:

## Release Gate
| Command | Result |
| --- | --- |
| npm run release:check | pass/fail |
| npm run hooks:warning-check | pass/fail |
| npm run codex-lb:setup-fixture | pass/fail |
| npm run computer-use:policy-check | pass/fail |

## Honest Mode
- Verified:
- Verified partial:
- Not verified:
- Blocked:

## Remaining Gaps
- None for P0.
```

---

## 18. Final Success Sentence

완료 후 SKS는 이렇게 설명되어야 한다.

> SKS 1.0.4는 OpenAI Codex CLI rust-v0.131.0 기준 hook/config 스키마를 따르고, hooks warning을 release gate에서 0개로 강제하며, codex-lb setup을 질문형 wizard와 env auto-load로 안정화하고, macOS Computer Use를 MAD-SKS와 분리된 적극적 visual evidence capability로 다루는 최신 Codex 호환 trust kernel이다.
