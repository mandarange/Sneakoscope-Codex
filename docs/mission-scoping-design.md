# Mission Scoping Design: `findLatestMission()`

Status: design only (work order item E-3). No source code changes are part of this
document. `findLatestMission()` remains globally-unscoped in this round; see
`known-gaps.md` / the 18-part fix plan for when the actual code change lands.

## 1. Problem statement

`src/core/mission.ts` — `findLatestMission(root)` (~lines 54-73) lists every
directory under `.sneakoscope/missions/` matching `M-*`, reads each
`mission.json` for `created_at`/`updated_at`, falls back to filesystem `mtime`,
and returns the single newest id. It has **no awareness of**:

- which route/command created the mission (`$Naruto`, `$PPT`, `$MAD-SKS`, ...)
- which mode the mission is in (`mission.json.mode`, e.g. `'loop'`, `'ppt'`, `'goal'`)
- which CLI session or terminal is asking

On a machine with many concurrent/historical sessions (confirmed up to 25+
active mission directories during testing in this repo), "latest" can resolve
to a mission created moments ago by a totally unrelated command in another
terminal — silently attaching the wrong mission's gates/artifacts to the
current command's output. This is the mechanism behind several of the
"work-order items silently omitted while reaching done" defects this 18-part
fix addresses.

## 2. Call-site inventory

`grep -rn "findLatestMission" src --include="*.ts"` found **48 matches**
across 24 files: 1 declaration, 1 re-export-only import that is never called
in that file (`feature-fixtures.ts`, string literal only, see note), and 46
actual call sites. Classification:

- **(a) Safe / already scoped** — "latest" is resolved immediately after this
  same invocation created the mission (or from a result object the invocation
  itself just produced), so no other session can have raced a newer mission
  into place inside that single synchronous call chain in practice, or the
  call site already carries an explicit disambiguating check.
- **(b) Ambiguous global-latest** — a bare cross-command/status/CLI-arg lookup
  with no route or mode narrowing; a busy machine can return the wrong
  mission.

| # | File:Line | Route / command | Classification | Notes |
|---|-----------|------------------|-----------------|-------|
| 1 | `src/core/mission.ts:54` | (declaration) | n/a | the function itself |
| 2 | `src/core/dfix.ts:174` | `sks dfix` (`resolveDfixRun`) | (b) ambiguous | `missionArg` defaults to `'latest'`; resolves whatever mission is newest system-wide, not necessarily the dfix mission |
| 3 | `src/core/feature-fixtures.ts:145` | fixture metadata string only | n/a | this is a documentation string embedded in a fixture's `reason` field, not a call; the string itself calls out that `qa-loop` "resolves 'latest' via the same globally-unscoped `findLatestMission` used everywhere else" — i.e. the codebase already self-documents this exact risk |
| 4 | `src/core/feature-fixture-executor.ts:94` | fixture harness, `execute_and_validate_artifacts` | (a) safe (fallback-only) | prefers `extractMissionId(spawnResult.stdout)` — the mission id the command just printed — and only falls back to `findLatestMission` if the command's own JSON output didn't carry an id; comment in-file explicitly documents this is to avoid races with unrelated concurrent sessions |
| 5 | `src/core/agents/runtime-proof-summary.ts:64` | `buildRuntimeProofSummary` (shared helper used by `$Naruto proof`, etc.) | (b) ambiguous | `missionIdInput = 'latest'` default; caller-agnostic, whoever calls this without an explicit id inherits the ambiguity |
| 6 | `src/core/trust-kernel/trust-report.ts:38` | `latestTrustReport` (`sks trust`) | (b) ambiguous | CLI `--mission latest` or omitted arg resolves globally |
| 7 | `src/core/search-visibility/mission.ts:60` | `sks search-visibility` (`resolveSearchVisibilityMission`) | (b) ambiguous | same `missionRef === 'latest'` CLI-arg pattern |
| 8 | `src/core/triwiki-wrongness/wrongness-ledger.ts:52` | `resolveWrongnessMissionId` (used by multiple wrongness-ledger commands) | (b) ambiguous | same pattern, shared helper |
| 9 | `src/core/commands/image-ux-review-command.ts:79` | `sks image-ux-review run --mission latest` | (b) ambiguous | explicit `--mission latest` flag |
| 10 | `src/core/commands/image-ux-review-command.ts:279` | `attach-generated` | (b) ambiguous | positional arg defaults to `'latest'` |
| 11 | `src/core/commands/image-ux-review-command.ts:299` | `attach-after` | (b) ambiguous | same pattern |
| 12 | `src/core/commands/image-ux-review-command.ts:327` | `rebuildExistingMission` (`fix`/`recapture`/`proof`) | (b) ambiguous | same pattern |
| 13 | `src/core/commands/image-ux-review-command.ts:350` | `status` | (b) ambiguous | same pattern |
| 14 | `src/core/commands/image-ux-review-command.ts:368` | `explain` | (b) ambiguous | same pattern |
| 15 | `src/core/commands/ui-command.ts:53` | `collectUiState` (dashboard) | (b) ambiguous | `missionInput = 'latest'` default param |
| 16 | `src/core/commands/command-utils.ts:13` | `resolveMissionId` (shared helper, many commands) | (b) ambiguous, partially mitigated | calls `warnOnMultipleActiveSessions(root)` first, which prints a warning listing active sessions when ≥2 are active, but still proceeds to return the (wrong) global-latest — a warning, not a fix |
| 17 | `src/core/commands/mad-sks-command.ts:1015` | `sks mad-sks status/doctor` | (b) ambiguous | no `--mission` given, resolves globally |
| 18 | `src/core/commands/mad-sks-command.ts:1327` | `closeMadSks` (`sks mad-sks close/revoke`) | (b) ambiguous | falls back to global-latest only if no `--mission`/positional given — closing/revoking permission on the *wrong* mission is a real correctness + safety risk, not just cosmetic |
| 19 | `src/core/commands/mad-sks-command.ts:1351` | `cleanupExpiredMadSks` | (b) ambiguous | background/periodic cleanup call, no route context at all |
| 20 | `src/core/commands/ppt-command.ts:46` | `sks ppt <verb> [mission\|latest]` (generic verbs) | (b) ambiguous | positional arg defaults `'latest'` |
| 21 | `src/core/commands/ppt-command.ts:113` | `pptImagegenReview` (`review`/`export-slides`/etc.) | (a) safe-ish | only resolves `findLatestMission` when `!shouldCreate` (i.e. not creating a new mission) *and* no explicit mission arg given; when creating, a fresh mission is made instead — still ambiguous when reusing, so left as (b) with mitigation noted |
| 22 | `src/core/commands/ppt-command.ts:259` | `pptExplain` | (b) ambiguous | same pattern |
| 23 | `src/core/commands/team-command.ts:24` | `redirectTeamCreateToNaruto` | (a) safe | prefers `result?.mission_id` from the naruto call this same function just made; `findLatestMission` is only a fallback if that result didn't carry an id — same synchronous-creation pattern as #4 |
| 24 | `src/core/commands/naruto-command.ts:747` | `narutoStatus` | (b) ambiguous | `parsed.missionId` defaults to CLI arg or `'latest'`; status queries commonly run without an id |
| 25 | `src/core/commands/naruto-command.ts:784` | `narutoDashboard` | (b) ambiguous | same pattern |
| 26 | `src/core/commands/naruto-command.ts:807` | `narutoWorkers` | (b) ambiguous | same pattern |
| 27 | `src/core/commands/naruto-command.ts:834` | `narutoProof` | (b) ambiguous | same pattern |
| 28 | `src/core/commands/loop-command.ts:135` | `loopKill` | (b) ambiguous, worse than most | **no arg-check at all** — always calls `findLatestMission(root)` unconditionally, cannot target a specific mission's loop even if the caller wanted to; killing the wrong mission's loop is a correctness/safety risk |
| 29 | `src/core/commands/loop-command.ts:177` (inside `resolveLoopMission`, used by `loopGraph`/`loopResume`) | `sks loop graph/resume [mission\|latest]` | (a) partially safe (existing precedent) | after resolving global-latest, it loads the mission and checks `loaded.mission.mode === 'loop' \|\| readJson(loopPlanPath(...))` before accepting it — rejects a latest-mission match that isn't actually a loop mission; **this is the strongest existing precedent for mode-based filtering** already in the codebase |
| 30 | `src/core/commands/computer-use-command.ts:29` | `smoke` | (b) ambiguous | `--mission latest`/omitted resolves globally |
| 31 | `src/core/commands/computer-use-command.ts:106` | generic computer-use verbs | (b) ambiguous | positional arg defaults `'latest'` |
| 32 | `src/core/commands/agent-command.ts:208` | `resolveAgentMission` (shared helper) | (b) ambiguous | same `requested !== 'latest'` pattern, shared across agent subcommands |
| 33 | `src/core/stop-gate/stop-gate-resolver.ts:89` | stop-gate resolution (used by many routes to check "is the active route done") | (a) mostly safe (existing precedent, most mature) | only reached as step 4 of a fallback chain, and only when `input.allowLatestFallback !== false` (interactive hooks disable it entirely); after the fallback picks a mission it (1) requires the gate file's `route`/`route_command` to match the requested `route` via `gateMatchesRoute()`, and (2) prints an explicit warning to stderr if the resolved latest mission disagrees with the current session's `stateMissionId`. **This is the most complete existing scoping precedent in the codebase** — route-matching plus a disable switch plus a mismatch warning |
| 34 | `src/core/mad-db/mad-db-capability.ts:150` | `resolveMadDbMissionId` | (a) safe (existing precedent) | priority order: explicit id → `state.mad_db_capability_mission_id` → `state.mission_id` → only then `findLatestMission` as last resort; the state-based lookups make the global-latest branch rarely hit in practice |
| 35 | `src/cli/context7-command.ts:185` | `sks context7 [mission\|latest]` | (b) ambiguous | same CLI-arg pattern |
| 36 | `src/cli/recallpulse-command.ts:126` | `sks recallpulse [mission\|latest]` | (b) ambiguous | same CLI-arg pattern |
| 37 | `src/commands/proof.ts:50` | `sks proof route [mission\|latest]` | (b) ambiguous | same CLI-arg pattern |
| 38 | `src/commands/proof.ts:63` | `sks proof finalize [mission\|latest]` | (b) ambiguous | finalizing the wrong mission's completion proof is a real correctness risk, not just a read |
| 39 | `src/commands/proof.ts:86` | `sks proof repair latest` | (b) ambiguous | explicit `latest` literal in the CLI surface |

Import-only lines not listed as separate rows above (e.g. the `import {
findLatestMission, ... } from '../mission.js'` statements in each file) are
folded into their file's call-site row(s) since they're not independent call
sites.

**Summary: of the ~38 distinct call sites (excluding the declaration and the
non-call string literal), roughly 6 are safe or have meaningful existing
mitigation (`feature-fixture-executor.ts`, `team-command.ts`,
`loop-command.ts:177`, `stop-gate-resolver.ts`, `mad-db-capability.ts`, and
partially `ppt-command.ts:113`), and the remaining ~32 are genuinely ambiguous
global-latest lookups with no route or mode narrowing today.** The highest-risk
ambiguous sites are the ones that *mutate* mission state based on the guess —
`mad-sks-command.ts` close/revoke (#18), `loop-command.ts` kill (#28), and
`proof.ts` finalize (#38) — because picking the wrong mission there doesn't
just display wrong data, it writes a wrong or destructive state change into an
unrelated mission.

## 3. Proposed signature

```ts
export async function findLatestMission(
  root: any,
  { route, mode }: { route?: string | null; mode?: string | null } = {}
): Promise<string | null>
```

### What metadata is actually available to filter on

Per `createMission()` (`src/core/mission.ts:26-44`), `mission.json` is written
as:

```json
{
  "id": "M-...",
  "mode": "goal" | "<mode string>",
  "prompt": "...",
  "created_at": "...",
  "phase": "GOAL_PREPARE" | "PREPARE",
  "questions_allowed": true,
  "implementation_allowed": false
}
```

Confirmed by reading `createMission()` directly: **`mission.json` never gets a
`route` or `route_command` field, at creation or afterward** (`grep -n
"route" src/core/mission.ts` shows `route` only appears inside
`routePreemptions()`/`setCurrent()` logic, which writes to
`.sneakoscope/state/current.json` or a per-session state file under
`.sneakoscope/state/sessions/`, never into the mission's own `mission.json`).
`route`/`route_command` only exist in:

- the shared/session **state files** (`current.json`, `state/sessions/<key>.json`)
  written by `setCurrent()`, which are keyed by session, not by mission, and get
  overwritten as a session moves between missions; or
- **per-route gate artifacts** written inside each mission's own directory
  (e.g. `mad-sks-gate.json`, `image-ux-review-gate.json`), which do carry a
  `route`/`route_command` field — this is exactly what
  `stop-gate-resolver.ts`'s `gateMatchesRoute()` already reads.

This means the two proposed filters have different levels of directness:

- **`mode` filtering is direct and cheap**: read each candidate's
  `mission.json.mode` (already being read for `created_at` in the existing
  scan) and skip candidates whose `mode` doesn't match. No extra file reads.
  `loop-command.ts:177`'s existing `loaded.mission.mode === 'loop'` check is
  the exact same idea, just done today as a post-hoc filter *after* calling
  `findLatestMission` unscoped, rather than inside the scan.

- **`route` filtering is indirect and requires an extra read per candidate**:
  since `mission.json` carries no `route` field, scoping by route means either
  (a) probing for a known gate-artifact filename inside each candidate mission
  dir (route-specific, e.g. `mad-sks-gate.json` for `$MAD-SKS`,
  `image-ux-review-gate.json` for image-ux-review) and requiring it to exist
  and its `route`/`route_command` field to match, mirroring
  `gateMatchesRoute()`; or (b) accepting an already-known mission id list
  scoped by route from the caller (e.g. session state) instead of trying to
  derive route from the mission directory itself. Given gate artifact
  filenames are route-specific and not currently passed into
  `findLatestMission`, the design should let the caller pass an explicit gate
  filename alongside `route` (e.g. `{ route: '$MAD-SKS', gateFile:
  'mad-sks-gate.json' }`) rather than trying to infer it, to avoid
  `findLatestMission` needing a hardcoded route→filename map that will drift
  out of sync with each command's own gate artifact name.

### Narrowing behavior

1. Enumerate `M-*` directories exactly as today.
2. For each candidate, read `mission.json` once (already happening) and, if
   `mode` was passed, skip candidates whose `mission.mode !== mode`.
3. If `route` (and optionally `gateFile`) was passed, additionally check for
   the named gate artifact inside the candidate's directory and skip
   candidates where it's absent or its `route`/`route_command` doesn't match
   (reusing `normalizeRoute()`'s `$`/`_`/case-insensitive normalization logic
   from `stop-gate-resolver.ts` so `$MAD-SKS` and `mad_sks` compare equal).
4. Sort survivors by the existing `(createdMs, mtimeMs, id)` tuple and return
   the newest, same as today.
5. If no candidates survive filtering, return `null` (same "no mission found"
   contract callers already handle) rather than silently widening back to an
   unscoped search — a caller that asked for `mode: 'loop'` and got nothing
   should be told nothing, not handed an unrelated PPT mission.
6. Keep the options object optional and default to `{}` so all 30+ existing
   call sites keep compiling and behaving identically until each is migrated
   deliberately (this is intentionally a non-breaking, additive signature
   change).

## 4. Staged migration plan

### Stage 0 — land the signature (this document's follow-up PR)
Change `findLatestMission`'s signature to accept the optional `{ route, mode,
gateFile }` object as designed above, with all filtering behind those optional
params so passing nothing reproduces today's exact behavior byte-for-byte.
No call sites change in this stage; this is purely additive and should ship
with unit tests covering: no options (baseline unchanged), `mode`-only
filtering, `route`+`gateFile` filtering, and the "no survivors → null" case.

### Stage 1 — adopt at low-risk, immediately-after-creation sites first
These already know their own mode/route unambiguously because they just
created or just received the mission from a call in the same function:

- `src/core/commands/team-command.ts:24` — pass `{ mode: 'naruto' }` (or
  whatever mode `narutoCommand` actually assigns) as a defensive fallback,
  even though the primary path (`result?.mission_id`) already avoids the
  ambiguity.
- `src/core/commands/loop-command.ts:177` (`resolveLoopMission`) — move the
  existing post-hoc `mode === 'loop'` check into the `findLatestMission` call
  itself via `{ mode: 'loop' }`, removing the now-redundant follow-up load+check.
- `src/core/mad-db/mad-db-capability.ts:150` (`resolveMadDbMissionId`) — add
  `{ mode: 'mad-db' }` (or the actual mode string used) to the final
  `findLatestMission(root)` fallback branch, tightening the last-resort case.
- `src/core/feature-fixture-executor.ts:94` — already mitigated by preferring
  stdout-extracted mission id; add `{ mode: ... }` matching the fixture's
  expected mode to the `.catch(() => null)` fallback branch as defense in depth.

These are low risk because the correct `mode` value is either already known as
a literal in the same function or trivially derivable, and none of them need
route/gate-file knowledge.

### Stage 2 — adopt at single-command CLI surfaces with a stable, known route
Commands whose entire file only ever represents one route can pass a literal
`route`/`gateFile` pair confidently:

- `src/core/commands/mad-sks-command.ts` (#17, #18, #19) — `{ route:
  '$MAD-SKS', gateFile: 'mad-sks-gate.json' }`; prioritize #18 (`closeMadSks`)
  and #19 (`cleanupExpiredMadSks`) first since they *mutate* state on a wrong
  guess.
- `src/core/commands/image-ux-review-command.ts` (all 6 sites) — `{ route:
  '$ImageUxReview' (or actual route string), gateFile:
  'image-ux-review-gate.json' }`.
- `src/core/commands/ppt-command.ts` (all 3 sites) — `{ route: '$PPT',
  gateFile: <PPT_IMAGEGEN_REVIEW_GATE_ARTIFACT constant> }`.
- `src/core/commands/computer-use-command.ts` (both sites) — route-scope by
  the computer-use gate artifact.
- `src/core/commands/naruto-command.ts` (all 4 sites) — `{ mode: 'naruto' }`
  at minimum; add route/gate scoping if a naruto-specific gate filename
  constant already exists.
- `src/core/commands/loop-command.ts:135` (`loopKill`) — this one currently
  has **no fallback check at all**; fix should both add `{ mode: 'loop' }`
  scoping *and* add the missing "no mission found" guard that every sibling
  function in the same file already has. Flag as highest priority in this
  stage given it's a kill/mutation action with zero existing safety net.
- `src/cli/context7-command.ts`, `src/cli/recallpulse-command.ts`,
  `src/commands/proof.ts` — each is a single-purpose CLI surface; scope by
  that command's own route/mode.

Migrate mutation-risk sites (close/revoke, kill, finalize) before read-only
status/explain sites within this stage, since a wrong guess there causes a
destructive/incorrect write rather than just a wrong printout.

### Stage 3 — shared/cross-command helpers (need more care)
These are called from multiple routes/commands, so the correct `route`/`mode`
isn't a fixed literal — it has to be threaded through from each call site's
own caller, which means touching every caller of the helper, not just the
helper itself:

- `src/core/commands/command-utils.ts:13` (`resolveMissionId`) — shared by
  many commands; needs a `mode`/`route` parameter added to `resolveMissionId`
  itself, then threaded from each of its callers. Higher risk because it's
  already doing a `warnOnMultipleActiveSessions` check that must be preserved
  (removing that warning while adding filtering would be a regression, not a fix).
- `src/core/commands/agent-command.ts:208` (`resolveAgentMission`) — same
  shared-helper shape; identify each call site's known route/mode before
  threading through.
- `src/core/agents/runtime-proof-summary.ts:64` (`buildRuntimeProofSummary`) —
  called from `narutoProof` (Stage 2) among possibly others; once Stage 2's
  naruto-command.ts sites pass an explicit `missionId` in, this default-arg
  path becomes reachable only by other future callers, but should still be
  scoped defensively.
- `src/core/trust-kernel/trust-report.ts:38`,
  `src/core/search-visibility/mission.ts:60`,
  `src/core/triwiki-wrongness/wrongness-ledger.ts:52` — each is its own
  route's shared resolver (trust, search-visibility, wrongness), analogous to
  Stage 2's single-command pattern, but grouped here rather than Stage 2
  because each spans multiple subcommands within its file and needs a per-
  subcommand mode/route audit rather than one blanket literal.
- `src/core/commands/ui-command.ts:53` (`collectUiState`) — the dashboard
  aggregates state across potentially multiple active missions/routes by
  design (it is itself a cross-route status view), so "scoping" here may mean
  exposing the ambiguity to the user (e.g. listing candidates) rather than
  silently picking one — needs a product decision, not just a mechanical
  parameter add.

### Stage 4 — the two existing "most mature" precedents
`src/core/stop-gate/stop-gate-resolver.ts:89` and
`src/core/mad-db/mad-db-capability.ts:150` already implement most of the
intended safety (route-matching, disable switch, mismatch warning /
state-based priority order). Once the new `findLatestMission` options exist,
refactor these two to call `findLatestMission(root, { route, gateFile })`
directly instead of hand-rolling the same post-hoc filtering inline, so the
scoping logic lives in one place. Do this last since these two are already the
safest sites in the inventory — deferring them carries the least risk of
regressing something that currently silently omits work.

### Rollout order (highest to lowest priority)

1. Stage 0 (additive signature + tests) — prerequisite for everything else.
2. Stage 1 (creation-adjacent call sites) — mechanical, near-zero risk.
3. Stage 2, mutation-risk subset first (`mad-sks close/revoke`, `loop kill`,
   `proof finalize`) — highest real-world defect impact per call site.
4. Stage 2, remaining read-only/status subset.
5. Stage 3 (shared cross-command helpers) — requires per-caller route/mode
   audit, budget the most review time here.
6. Stage 4 (consolidate the two already-mature precedents onto the new shared
   implementation) — lowest urgency, do once Stage 0-3 have proven the new
   options object out in practice.
