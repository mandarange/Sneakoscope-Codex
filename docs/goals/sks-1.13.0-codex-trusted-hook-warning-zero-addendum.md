# SKS 1.13.0 Addendum — Codex 최신 Trust/Trusted Hook Warning-Zero 지시서

> 대상 저장소: `mandarange/Sneakoscope-Codex`  
> 적용 대상: 기존 `SKS 1.13.0 DFix Extreme Speed Kernel Goal 지시서`에 **추가로 붙일 addendum**  
> 목표 성격: **Codex 최신 공식 hook 문법 / trusted hook state / Subagent hooks / output semantic parser 완전 반영으로 trust/trusu hook 경고 0개 달성**  
> 핵심 원칙: **Codex hook 경고는 “무시할 수 있는 warning”이 아니다. 사용자가 계속 보는 hook/trust warning은 release blocker다.**

---

## 0. Addendum Goal Command Payload

```bash
sks goal create "SKS 1.13.0 addendum: Codex latest trusted hook warning-zero compatibility" --from-file docs/goals/sks-1.13.0-codex-trusted-hook-warning-zero-addendum.md
```

Codex App / Codex CLI에는 다음처럼 전달한다.

```text
$Goal 기존 SKS 1.13.0 DFix Extreme Speed Kernel Goal에 이 addendum을 추가 적용한다. 사용자가 반복적으로 보는 trust/trusu hook 관련 경고를 완전히 제거하기 위해 OpenAI Codex 최신 공식 hook schema, hook discovery, trusted_hash state, SubagentStart/SubagentStop events, output parser semantic rules를 SKS hook writer/validator/installer/doctor/release gate에 반영한다. SKS가 생성하는 hooks.json/config.toml/requirements.toml/hook output은 Codex 최신 문법과 정확히 맞아야 하며, warning-zero가 release invariant가 되어야 한다.
```

---

## 1. 문제 정의

현재 사용자가 반복적으로 보는 증상:

```text
[x] trust hook 관련 경고
[x] trusu hook처럼 보이는 hook/trust 오타성 경고
[x] Codex hook config warning
[x] Codex hook output warning
[x] untrusted/modified hook warning
[x] old schema hook warning
[x] unsupported field warning
[x] prompt/agent/async hook skipped warning
```

이 addendum의 목표:

```text
[x] SKS가 생성한 hook config가 Codex 최신 공식 구조와 맞아야 한다.
[x] SKS가 생성한 hook output이 Codex 최신 output parser semantic rule과 맞아야 한다.
[x] SKS가 생성한 hooks state가 trusted_hash/current_hash 흐름과 맞아야 한다.
[x] SKS가 unmanaged hooks를 만들 경우 trust 상태를 명확히 안내하고, managed hooks path를 우선 사용해야 한다.
[x] hook warning이 발생하면 release failure가 되어야 한다.
```

---

## 2. 공식 Codex 최신 hook 근거

OpenAI Codex 최신 `main` 기준 공식 hook schema는 다음 event를 가진다.

```text
PreToolUse
PermissionRequest
PostToolUse
PreCompact
PostCompact
SessionStart
UserPromptSubmit
SubagentStart
SubagentStop
Stop
```

즉 기존 8-event 기준만 유지하면 최신 Codex에서 `SubagentStart` / `SubagentStop` 관련 drift가 생길 수 있다.

Codex hook config는 `HookEventsToml`에 위 10개 event를 포함하고, handler type은 현재 `command`, `prompt`, `agent`를 enum으로 갖지만 discovery 단계에서는 `prompt`와 `agent` hook을 아직 지원하지 않아 skip warning을 만든다. 따라서 SKS는 Codex 최신이 실제 실행하는 **command hook**만 생성해야 한다.

Codex discovery는 unmanaged hook의 trust state를 `trusted_hash`와 current hook hash로 비교한다. managed hook은 `Managed`, trusted_hash가 current hash와 일치하면 `Trusted`, 다르면 `Modified`, 없으면 `Untrusted`가 된다. 따라서 SKS가 user/project unmanaged hook을 만들고 trusted_hash를 맞추지 않으면 trust warning이 반복될 수 있다.

Codex output parser는 JSON schema보다 더 엄격한 semantic rule을 적용한다. 예를 들어 `PreToolUse`에서는 `continue:false`, `stopReason`, `suppressOutput`, `permissionDecision:ask`, `permissionDecision:allow` without `updatedInput`, `updatedInput` without `permissionDecision:allow`, `permissionDecision:deny` without non-empty reason이 unsupported다. `PermissionRequest`도 `continue:false`, `stopReason`, `suppressOutput`, `updatedInput`, `updatedPermissions`, `interrupt:true`를 unsupported로 본다. `PostToolUse`는 `suppressOutput`과 `updatedMCPToolOutput`을 unsupported로 보고, block decision에는 non-empty reason이 필요하다.

---

## 3. 절대 원칙

```text
[x] SKS hook writer는 최신 Codex event list 10개를 알아야 한다.
[x] SKS hook writer는 command hook만 생성해야 한다.
[x] SKS는 prompt hook을 생성하지 않는다.
[x] SKS는 agent hook을 생성하지 않는다.
[x] SKS는 async hook을 생성하지 않는다.
[x] SKS는 empty command hook을 생성하지 않는다.
[x] SKS는 invalid matcher를 생성하지 않는다.
[x] SKS는 hooks.json과 config.toml hooks를 같은 layer에 동시에 쓰지 않는다.
[x] SKS는 unmanaged hook을 만들 때 trust 상태를 doctor에서 명확히 표시한다.
[x] SKS는 managed hooks를 우선 사용한다.
[x] SKS는 requirements.toml managed hooks path를 정확히 사용한다.
[x] SKS는 config.toml에 managed-only 요구사항을 잘못 쓰지 않는다.
[x] SKS hook output은 camelCase만 쓴다.
[x] SKS hook output은 snake_case를 절대 쓰지 않는다.
[x] SKS hook output은 Codex parser semantic rule을 통과해야 한다.
[x] SKS hook warning은 release blocker다.
```

---

## 4. P0 — Codex Latest Hook Event Matrix 업데이트

### Tasks

```text
[x] `src/core/codex-compat/codex-hook-events.ts`를 추가하거나 기존 event matrix를 업데이트한다.
[x] event list를 10개로 업데이트한다.
[x] PreToolUse 추가.
[x] PermissionRequest 추가.
[x] PostToolUse 추가.
[x] PreCompact 추가.
[x] PostCompact 추가.
[x] SessionStart 추가.
[x] UserPromptSubmit 추가.
[x] SubagentStart 추가.
[x] SubagentStop 추가.
[x] Stop 추가.
[x] 기존 8-event snapshot이 있으면 SubagentStart/SubagentStop missing을 release blocker로 만든다.
[x] `sks hooks codex-schema --json`에 supported_events_count=10을 출력한다.
[x] `sks hooks codex-validate --json`이 10개 event output fixture를 모두 검사한다.
```

### Acceptance criteria

```text
[x] hook event matrix includes SubagentStart.
[x] hook event matrix includes SubagentStop.
[x] release gate fails if event count < 10.
```

---

## 5. P0 — Latest Hook Schema Snapshot 갱신

### Required files

```text
src/vendor/openai-codex/latest/hooks/pre-tool-use.command.input.schema.json
src/vendor/openai-codex/latest/hooks/pre-tool-use.command.output.schema.json
src/vendor/openai-codex/latest/hooks/permission-request.command.input.schema.json
src/vendor/openai-codex/latest/hooks/permission-request.command.output.schema.json
src/vendor/openai-codex/latest/hooks/post-tool-use.command.input.schema.json
src/vendor/openai-codex/latest/hooks/post-tool-use.command.output.schema.json
src/vendor/openai-codex/latest/hooks/pre-compact.command.input.schema.json
src/vendor/openai-codex/latest/hooks/pre-compact.command.output.schema.json
src/vendor/openai-codex/latest/hooks/post-compact.command.input.schema.json
src/vendor/openai-codex/latest/hooks/post-compact.command.output.schema.json
src/vendor/openai-codex/latest/hooks/session-start.command.input.schema.json
src/vendor/openai-codex/latest/hooks/session-start.command.output.schema.json
src/vendor/openai-codex/latest/hooks/user-prompt-submit.command.input.schema.json
src/vendor/openai-codex/latest/hooks/user-prompt-submit.command.output.schema.json
src/vendor/openai-codex/latest/hooks/subagent-start.command.input.schema.json
src/vendor/openai-codex/latest/hooks/subagent-start.command.output.schema.json
src/vendor/openai-codex/latest/hooks/subagent-stop.command.input.schema.json
src/vendor/openai-codex/latest/hooks/subagent-stop.command.output.schema.json
src/vendor/openai-codex/latest/hooks/stop.command.input.schema.json
src/vendor/openai-codex/latest/hooks/stop.command.output.schema.json
```

### Tasks

```text
[x] vendored latest snapshot metadata를 추가한다.
[x] upstream repo를 기록한다.
[x] upstream commit/tag를 기록한다.
[x] captured_at을 기록한다.
[x] schema files count가 20개인지 검사한다.
[x] missing schema는 release failure.
[x] invalid JSON schema는 release failure.
[x] schema snapshot drift report를 만든다.
[x] 0.132 snapshot과 latest snapshot을 비교한다.
[x] latest snapshot에서 새 event가 있으면 compatibility warning이 아니라 update-required blocker로 처리한다.
```

---

## 6. P0 — Trusted Hook State / trusted_hash 반영

### 문제

Codex discovery는 hook config에서 current hash를 계산하고 hook state의 `trusted_hash`와 비교한다. managed hook이면 `Managed`, trusted_hash가 맞으면 `Trusted`, mismatch면 `Modified`, missing이면 `Untrusted`가 된다.

### Required SKS behavior

```text
[x] SKS managed hook은 managed path로 설치한다.
[x] SKS unmanaged hook 설치 시 trusted_hash state를 생성하거나 사용자에게 trust command/next action을 안내한다.
[x] SKS hook doctor가 current_hash와 trusted_hash를 비교한다.
[x] SKS hook doctor가 Untrusted/Modified를 명확히 출력한다.
[x] SKS hook doctor --fix가 가능한 경우 trusted_hash를 갱신한다.
[x] SKS hook install은 기존 user hook을 덮어쓰지 않는다.
[x] SKS hook install은 managed block만 업데이트한다.
[x] SKS hook install은 hooks.json/config.toml 중 하나만 사용한다.
[x] 같은 layer에서 hooks.json과 config.toml hooks가 동시에 있으면 warning을 출력하고 fix 안내를 준다.
[x] trust hook warning이 있으면 wrongness record를 만든다.
```

### New files / modules

```text
src/core/codex-hooks/codex-hook-trust-state.ts
src/core/codex-hooks/codex-hook-hash.ts
src/core/codex-hooks/codex-hook-state-writer.ts
src/core/codex-hooks/codex-hook-trust-doctor.ts
```

### New commands

```bash
sks hooks trust-state --json
sks hooks trust-doctor --json
sks hooks trust-fix --json
sks hooks install --managed --json
sks hooks install --project --trusted --json
```

### Acceptance criteria

```text
[x] `sks hooks trust-doctor --json` lists current_hash, trusted_hash, trust_status.
[x] Managed hooks report Managed.
[x] Trusted unmanaged hooks report Trusted.
[x] Modified hooks report Modified with repair action.
[x] Untrusted hooks report Untrusted with repair action.
[x] trust warning cannot appear without a structured SKS explanation.
```

---

## 7. P0 — Hook Config Writer 최신화

### Codex-supported config shape

SKS should emit only:

```toml
[[hooks.PreToolUse]]
matcher = "..."
[[hooks.PreToolUse.hooks]]
type = "command"
command = "..."
timeout = 30
async = false
statusMessage = "..."
```

Supported handler fields:

```text
command
commandWindows / command_windows
timeout
async
statusMessage
```

But SKS must not set:

```text
[x] async=true
[x] type=prompt
[x] type=agent
[x] empty command
[x] invalid matcher
[x] duplicated hooks in both hooks.json and TOML layer
```

### Tasks

```text
[x] hook config writer only emits command hooks.
[x] hook config writer never emits prompt hook.
[x] hook config writer never emits agent hook.
[x] hook config writer never emits async=true.
[x] timeout is always >=1.
[x] timeout default is explicit and sane.
[x] statusMessage is optional but if present non-empty.
[x] command is non-empty.
[x] commandWindows only emitted when needed.
[x] matcher is omitted for events where matcher is not applicable.
[x] PreToolUse matcher is valid regex/pattern.
[x] UserPromptSubmit invalid matcher is omitted, matching Codex behavior.
[x] hooks.json and TOML are not both written in the same layer.
[x] doctor detects dual representation and suggests one representation.
```

---

## 8. P0 — Latest Hook Output Semantic Builder

### PreToolUse rules

```text
[x] continue must be true.
[x] stopReason must be absent.
[x] suppressOutput must be false/absent.
[x] permissionDecision:ask is forbidden.
[x] permissionDecision:allow requires updatedInput.
[x] updatedInput without permissionDecision:allow is forbidden.
[x] permissionDecision:deny requires non-empty permissionDecisionReason.
[x] permissionDecisionReason without permissionDecision is forbidden.
[x] legacy decision:approve is forbidden.
[x] legacy decision:block is allowed only if reason non-empty, but SKS should prefer hookSpecificOutput deny.
[x] additionalContext is allowed by parser, but SKS classifies it as strict-subset policy depending on event.
```

### PermissionRequest rules

```text
[x] continue must be true.
[x] stopReason must be absent.
[x] suppressOutput must be false/absent.
[x] updatedInput forbidden.
[x] updatedPermissions forbidden.
[x] interrupt:true forbidden.
[x] behavior allow allowed.
[x] behavior deny allowed.
[x] deny message may be absent upstream but SKS should require non-empty message for clarity.
```

### PostToolUse rules

```text
[x] suppressOutput forbidden.
[x] updatedMCPToolOutput forbidden.
[x] decision:block requires non-empty reason.
[x] reason without decision should be warning/failure.
[x] additionalContext allowed.
```

### UserPromptSubmit / Stop / SubagentStop rules

```text
[x] decision:block requires non-empty reason.
[x] Stop block uses continue:true, decision:block, reason.
[x] SubagentStop uses same block rule as Stop.
```

### SessionStart / SubagentStart

```text
[x] additionalContext may be emitted through hookSpecificOutput.
[x] SKS should not emit unsupported fields.
```

### Compact hooks

```text
[x] PreCompact output should be { continue: true } unless official schema says otherwise.
[x] PostCompact output should be { continue: true } unless official schema says otherwise.
```

---

## 9. P0 — Hook Output Builders 업데이트

### Required builder functions

```ts
buildPreToolUseContinue()
buildPreToolUseDeny(reason: string)
buildPreToolUseAllowRewrite(updatedInput: unknown)
buildPermissionRequestAllow()
buildPermissionRequestDeny(message: string)
buildPostToolUseContext(additionalContext: string)
buildPostToolUseBlock(reason: string, additionalContext?: string)
buildUserPromptSubmitContext(additionalContext: string)
buildUserPromptSubmitBlock(reason: string)
buildStopContinue()
buildStopBlock(reason: string)
buildSessionStartContext(additionalContext: string)
buildSubagentStartContext(additionalContext: string)
buildSubagentStopContinue()
buildSubagentStopBlock(reason: string)
buildPreCompactContinue()
buildPostCompactContinue()
```

### Tasks

```text
[x] 모든 builder는 camelCase만 출력한다.
[x] 모든 builder는 unknown field를 출력하지 않는다.
[x] 모든 builder output은 vendored latest schema를 통과한다.
[x] 모든 builder output은 semantic validator를 통과한다.
[x] 모든 builder output은 warning detector warnings_count=0이어야 한다.
[x] builder가 invalid reason/message를 받으면 throw한다.
[x] builder throw는 redacted error로 처리한다.
```

---

## 10. P0 — Trust Hook Warning-Zero Release Gate

### New scripts

```json
{
  "scripts": {
    "hooks:latest-schema-check": "node ./scripts/codex-hook-latest-schema-check.mjs",
    "hooks:trust-state-check": "node ./scripts/codex-hook-trust-state-check.mjs",
    "hooks:trust-warning-zero": "node ./scripts/codex-hook-trust-warning-zero.mjs",
    "hooks:subagent-events-check": "node ./scripts/codex-hook-subagent-events-check.mjs",
    "hooks:no-unsupported-handlers": "node ./scripts/codex-hook-no-unsupported-handlers.mjs"
  }
}
```

### Add to release:check

```text
[x] hooks:latest-schema-check
[x] hooks:trust-state-check
[x] hooks:trust-warning-zero
[x] hooks:subagent-events-check
[x] hooks:no-unsupported-handlers
```

### Must fail on

```text
[x] trust_status Untrusted for SKS-managed hook
[x] trust_status Modified for SKS-managed hook
[x] missing trusted_hash for SKS unmanaged trusted install
[x] prompt hook generated by SKS
[x] agent hook generated by SKS
[x] async hook generated by SKS
[x] empty hook command
[x] invalid matcher generated by SKS
[x] hooks.json and TOML both generated in same layer
[x] warning text contains trust hook / trusu hook / trusted hook / untrusted hook / modified hook
[x] unsupported output parser rule
[x] missing SubagentStart/SubagentStop schema
```

---

## 11. P0 — Hook Doctor UX

### Output schema

```json
{
  "schema": "sks.codex-hook-trust-doctor.v1",
  "ok": true,
  "codex_latest_events": 10,
  "generated_events": 10,
  "managed_hooks": 3,
  "unmanaged_hooks": 0,
  "trusted": 0,
  "modified": 0,
  "untrusted": 0,
  "warnings": [],
  "repair_actions": []
}
```

### Tasks

```text
[x] `sks hooks doctor --json` includes trust section.
[x] `sks hooks warning-check --json` includes trust warning section.
[x] `sks hooks trust-report --json` includes latest events and trust state.
[x] If untrusted hook exists, output exact repair command.
[x] If modified hook exists, output exact repair command.
[x] If dual hooks representation exists, output exact cleanup command.
[x] If async/prompt/agent hook exists, output exact config path and reason.
[x] If hook output fails semantic rule, output event and failing field.
```

---

## 12. P0 — Wrongness Memory 추가

### New wrongness kinds

```text
codex_hook_trust_warning
codex_hook_untrusted_state
codex_hook_modified_state
codex_hook_latest_schema_drift
codex_hook_subagent_event_missing
codex_hook_unsupported_handler
codex_hook_dual_representation
codex_hook_output_semantic_warning
```

### Tasks

```text
[x] trust warning 발견 시 wrongness record 생성.
[x] modified state 발견 시 wrongness record 생성.
[x] untrusted state 발견 시 wrongness record 생성.
[x] schema drift 발견 시 wrongness record 생성.
[x] unsupported handler 발견 시 wrongness record 생성.
[x] dual representation 발견 시 wrongness record 생성.
[x] wrongness avoidance rule을 hook writer에 반영.
[x] next hook install/check에서 active hook wrongness를 읽는다.
```

---

## 13. P0 — Tests

### Unit tests

```text
[x] codex-hook-event-matrix-latest.test.ts
[x] codex-hook-output-builders-latest.test.ts
[x] codex-hook-trust-state.test.ts
[x] codex-hook-hash.test.ts
[x] codex-hook-config-writer-latest.test.ts
[x] codex-hook-semantic-latest.test.ts
[x] codex-hook-subagent-events.test.ts
```

### Integration tests

```text
[x] hooks-managed-install-trusted.test.ts
[x] hooks-unmanaged-trusted-hash.test.ts
[x] hooks-modified-state-detected.test.ts
[x] hooks-dual-representation-warning.test.ts
[x] hooks-no-prompt-agent-async.test.ts
[x] hooks-subagent-output-fixtures.test.ts
```

### Black-box tests

```text
[x] hooks-trust-warning-zero-packed.test.mjs
[x] hooks-latest-schema-packed.test.mjs
[x] hooks-subagent-events-packed.test.mjs
[x] hooks-no-unsupported-handlers-packed.test.mjs
```

---

## 14. P0 — Docs

### README

Add concise note:

```md
SKS validates Codex hooks against the latest official Codex hook schema and runtime parser semantics, including SubagentStart/SubagentStop and trusted hook state. SKS-managed hooks are installed through managed/trusted paths so users do not see recurring trust hook warnings.
```

### docs/hooks-pat.md

```text
[x] 최신 10-event hook list를 문서화.
[x] trust_status Managed/Trusted/Modified/Untrusted 설명.
[x] trusted_hash repair flow 설명.
[x] hooks.json vs config.toml dual representation warning 설명.
[x] prompt/agent/async hook skipped warning 설명.
[x] PreToolUse semantic rules 설명.
[x] PermissionRequest semantic rules 설명.
[x] PostToolUse semantic rules 설명.
[x] SubagentStart/SubagentStop rules 설명.
```

---

## 15. Done Definition

```text
[x] Latest Codex hook schema snapshot has 10 events / 20 schema files.
[x] SubagentStart/SubagentStop supported in SKS matrix.
[x] SKS hook config writer emits only supported command hooks.
[x] SKS hook output builders pass latest schema + semantic validator.
[x] SKS hook doctor reports trusted_hash/current_hash/trust_status.
[x] Managed hooks do not show untrusted/modified warnings.
[x] Unmanaged trusted install writes or guides trusted_hash.
[x] hooks:trust-warning-zero passes.
[x] hooks:no-unsupported-handlers passes.
[x] hooks:subagent-events-check passes.
[x] Wrongness records exist for hook trust warnings.
[x] README/docs updated.
[x] release:check includes new hook trust checks.
```

---

## 16. Final Report Format

```md
# SKS 1.13.0 Hook Trust Warning-Zero Addendum Report

## Codex Latest Hook Schema
- Events:
- Schema files:
- SubagentStart:
- SubagentStop:

## Hook Config
- command handlers:
- prompt handlers:
- agent handlers:
- async handlers:
- dual representation:

## Hook Trust State
| Hook | Source | Current Hash | Trusted Hash | Trust Status |
| --- | --- | --- | --- | --- |

## Hook Output Semantic
| Event | Schema | Semantic | Warning |
| --- | --- | --- | --- |
| PreToolUse | pass/fail | pass/fail | yes/no |
| PermissionRequest | pass/fail | pass/fail | yes/no |
| PostToolUse | pass/fail | pass/fail | yes/no |
| SubagentStart | pass/fail | pass/fail | yes/no |
| SubagentStop | pass/fail | pass/fail | yes/no |

## Warning Zero
- trust hook warning:
- trusu hook warning:
- untrusted hook warning:
- modified hook warning:
- unsupported field warning:

## Release Gate
| Command | Result |
| --- | --- |
| hooks:latest-schema-check | pass/fail |
| hooks:trust-state-check | pass/fail |
| hooks:trust-warning-zero | pass/fail |
| hooks:subagent-events-check | pass/fail |
| hooks:no-unsupported-handlers | pass/fail |

## Remaining Gaps
- None for P0.
```
