# ADR: integrate SKS through the upstream Codex App Server

Status: **selected strategy; implementation pending**. Reviewed 2026-10-31.
This ADR authorizes no runtime cutover. The accompanying
[source evidence](codex-native-integration-evidence.md) separates implemented
capabilities from proposals; the [roadmap](codex-native-integration-roadmap.md)
defines delivery and promotion gates.

## Decision and scope

Build a native SKS client of the upstream Codex App Server v2 protocol, starting
with SKS-owned sessions. Keep upstream Codex as the execution engine. Consolidate
SKS session access behind a scoped `CodexSessionBroker`, implemented as an
extension of the existing TypeScript control plane and task ownership helpers.
Keep SKS Center as the native UX and the CLI as the functional source of truth.

Do not maintain a Codex runtime fork initially. Open source makes a fork possible,
but does not make it the cheapest or most stable integration. SKS would inherit
Rust runtime, sandbox, authentication, protocol, packaging, and security update
maintenance. Neither a fork nor a custom client gives access to unavailable
models, backend entitlements, private Desktop APIs, or a provider's capacity.

The goal is to remove repeated launches, repeated policy/context preparation,
competing session writers, and inconsistent recovery **where measurements show
them**. Source shows these costs are plausible; it does not establish which is
the dominant cause of latency or prove an improvement. Model inference and
provider transport remain separate costs.

This is documentation-only strategy. Runtime behavior, dependency pins, provider
configuration, secrets, and release gates are unchanged by this PR. Draft
[#33](https://github.com/mandarange/Sneakoscope-Codex/pull/33) owns the unreadable
context-configuration correction; this work neither includes nor replaces it.

## Why this boundary

| Option | Assessment | Decision |
| --- | --- | --- |
| Keep CLI/SDK, hooks, and Center calls as independent execution paths | Lowest initial change; retains repeated process setup and fragmented lifecycle ownership | Retain as the migration baseline and explicit rollback path |
| SKS client using upstream App Server | Public source-defined thread/turn/event/approval contract; long-lived transport; SKS owns integration without copying the agent loop | Select, subject to contract and live gates |
| Embed private Rust crates or maintain a Codex fork | Maximum control, but internal API churn and distribution/security obligations become SKS work; does not solve backend restrictions | Defer |
| Attach to stock Desktop through private sockets, SQLite writes, or app patching | Discovery/resume of stored history does not establish ownership of an active Desktop thread | Exclude |

App Server itself is an evolving surface: the upstream CLI labels it
experimental, and individual methods/fields have further experimental gates.
Use the non-experimental subset of the measured schema where possible, with
explicit per-feature opt-in for unavoidable experimental features. Do not call
the whole protocol permanently stable. Keep the current latest-stable Codex
compatibility policy; recorded commit/version pins are reproducibility anchors,
not permanent installation recommendations.

Revisit a small, time-bounded fork only after a reproducible blocker cannot be
solved through the public protocol, configuration, MCP, or an upstream change.
Require an upstream issue/reproducer, minimal patch inventory, named maintainer,
security-update SLA, platform CI, redistribution review, and an exit condition.
Prefer contributing an extension upstream. A fork decision needs a separate ADR.

## Current architecture and actual gap

The [evidence inventory](codex-native-integration-evidence.md#sks-implementation)
records exact source anchors. Today:

- `CodexAppServerV2Client` already has initialize, thread/turn methods, events,
  request deadlines, bounded frames/notifications, default-deny approval
  callbacks, dynamic-tool cancellation, and process-exit handling. Its only
  production factory caller found in the source scan is model metadata lookup,
  which initializes and closes a client for that lookup. It is not the shared
  mission execution owner.
- `runCodexTask` uses TypeScript or Python SDK adapters with routing, evidence,
  schema validation, concurrency slots, and a reliability shield. The TypeScript
  adapter constructs a SDK client/thread per task and streams a CLI execution.
  The upstream SDK spawns `codex exec`; retaining its JS object alone does not
  establish a persistent App Server transport.
- Standalone Naruto starts one Codex `exec` parent. Current-session Naruto
  returns `delegation_context_ready` to the existing parent; that status
  explicitly has `completion_evidence: false`. Codex owns official children.
- Hooks enforce admission and capture official lifecycle evidence. Existing
  pipeline helpers already define task states, stable keys, attach-or-create,
  authority intersection, leases, fencing, and typed handoffs. The broker must
  bind these to upstream thread/turn IDs, rather than create another task ledger.
  The active-task map is process-local with snapshot/restore helpers; durable
  cross-process exclusion is not established by those helpers. Extend the
  existing owner with locked persistence and recovery before claiming it.
- Center already has bounded subprocess execution, operation receipts, mutation
  serialization, cancellation flags, and scoped recovery. These do not yet form
  a shared streaming execution-session owner with the CLI.
- TriWiki context and canonical memory, staged intake/promotion, MCP command
  exposure, and bounded read-only tool scheduling exist. A narrow, persistent,
  mission-bound memory MCP interface for the broker remains new work. The
  generic MCP server currently invokes CLI subprocesses and filters whole
  command contracts; it is not automatically safe to expose every memory action.

Do not describe existing SKS as a blank slate or claim hooks are all overhead.
Keep a hook until its security/evidence purpose has an equivalent, tested owner.

## Target architecture and component ownership

```text
SKS CLI / SKS Center
        | typed operation request, idempotency key, scoped authorization
        v
Existing SKS mission/task owner + finite execution plan + gates
        | admits a task; owns integration, evidence, and claim validation
        v
CodexSessionBroker (new shared control-plane lifecycle)
        | one writer/thread; request journal; approvals; events; recovery
        v  local private stdio
Upstream Codex App Server v2
        | native agent loop, tools, sandbox, auth, official child threads
        +---- existing Desktop Bridge only for configured provider routes
        +---- narrowly scoped SKS MCP memory/context access
```

| Owner | Retain / extend | Must not own |
| --- | --- | --- |
| Upstream Codex | Agent loop, native tools, auth, sandbox enforcement, compaction, native child lifecycle | SKS completion claims or canonical project memory |
| Existing SKS task/pipeline owner | Task identity, authority, DAG admission, integration, verification, evidence | A second model/tool execution loop |
| Broker in `src/core/codex-control/` | Extend the v2 client; runtime identity, session scope, journal, stream reduction, approval/cancel/reconnect | Provider credential storage, a second mission/task store |
| `src/core/subagents/` and hooks | Official-child policy, connection-specific model lists, disjoint ownership, event correlation, parent summary | Recursive orchestration or synthetic child proof |
| Desktop Bridge | Explicit provider routing, auth separation, catalog/session pins, transport diagnostics | Session ownership or agent orchestration |
| TriWiki / memory owners | Source freshness, bounded recall, canonical writes, explicit promotion and tombstones | Conversation replay as canonical truth |
| Center | Show CLI/broker projections, collect scoped decisions, cancel/recover operations | Independent mission/evidence writes or inferred success |

Initially the broker lives for a mission command's lifetime, across its turns;
it is not a machine-global daemon. Later Center cutover may use one user-scoped
local service with authenticated IPC so independent CLI processes can share that
owner. Service lifecycle/IPC is a separately gated slice, not an assumed
capability of today's `ProcessClient`. Use local stdio for the child transport;
remote WebSocket/control features are outside the initial scope.

### Session and authority binding

A broker scope binds the canonical workspace/worktree identity, Codex home/store,
resolved binary version/hash, non-secret auth-binding revision, provider route
and catalog generation, effective permission policy, and MCP configuration
revision. Account or route changes require a new scope. Persist opaque references
in private state; never derive public fingerprints from credentials. Do not pool
sessions across users, unrelated workspaces, or authority boundaries.

The admission rule is the intersection of user/managed host policy, project
trust, mission authorization, role/tool requirements, and requested write scope.
The broker never widens sandbox/network/approval settings to keep a task moving.
An environment variable or remembered permission is not consent. Use Codex's
effective policy and validated start/resume responses; reject unknown or
incompatible policy. Approval transport is not a sandbox for SKS-side tools:
MCP/service filesystem and network access need their own confinement.

For current Desktop/CLI-hosted sessions, preserve the host parent model/effort
and credentials. Standalone SKS-owned parents resolve their existing explicit
configuration. Children use the user's connection-specific allowed model/effort
list and existing role policy; they receive bounded task context and no greater
authority. Record requested and effective model, effort, route, and policy
revision. Reject unavailable or unsupported settings with a recovery action;
do not silently substitute a model, provider, account, or service tier.
Existing SDK and standalone defaults differ; unification must be an explicit,
tested migration, not a claim that all current paths already inherit identically.

Upstream owns model availability, authentication, entitlements, rate limits,
and provider-specific capabilities. MCP support, structured output, image/web/
computer tools, context limits, and service tiers require separate capability
evidence for the selected route. Preserve provider pins; compaction/encrypted
history may prevent provider/account handoff. Start a new thread with an explicit,
bounded handoff when safe transfer cannot be proved.

### Single writer, cancellation, and uncertain outcomes

Bind the existing task key/attempt/fencing token to `(scope, threadId, turnId)`.
One broker owner holds the thread lease; all SKS mutations queue through it.
Multiple clients may subscribe to projections, but cannot independently start,
steer, interrupt, or approve on the same thread. Upstream serialization does not
replace cross-process SKS ownership. Never resume a live Desktop-owned thread
as a second writer; current-session delegation remains host-owned.

Journal an operation intent before send, its parameter digest and authority
revision, then acknowledgment and terminal observation. Redact content before
persistence. Idempotency is an SKS operation property, not the JSON-RPC request
ID. Upstream `clientUserMessageId` is correlation data; this design assumes no
generic exactly-once `turn/start` guarantee. On lost acknowledgment, inspect
thread/turn history under the same owner. If it cannot prove whether work
started, enter `terminal_uncertain`, block dependent writes, and request a
scoped reconciliation decision. Never blindly replay a mutation.

Use the existing task-state vocabulary and define an adapter mapping in the
implementation slice. Broker projections distinguish queued, running, awaiting
approval/input, interrupt requested, terminal success/failure/interruption,
disconnected/reconciling, and uncertain. `turn/start` acknowledgment is not
completion. A `turn/completed` notification still needs its terminal status and
SKS artifact/gate validation before a success claim.

Cancel sends `turn/interrupt` for the exact active thread/turn, cancels owned
dynamic/MCP work, and waits for terminal evidence with a bounded grace period.
RPC timeout, idle timeout, whole-task deadline, and approval expiry are distinct.
The current approval callbacks are synchronous (unlike dynamic-tool callbacks);
human UI approvals need a bounded asynchronous pending-request implementation,
cancel/expiry handling, and exactly one response to each server request.
An interrupt acknowledgment, UI closure, or process signal does not undo writes.
If termination is necessary, kill only the owned process group after identity
verification; record an uncertain outcome until history/files are reconciled.

Reduce events using scope, owner epoch, thread/turn/item IDs, and an internal
monotonic journal sequence. Do not infer an upstream global replay cursor.
Duplicate/reordered observations must not produce duplicate evidence or regress
terminal state. On overflow/disconnect, mark a gap, re-read paginated history,
and record what cannot be recovered. Do not let the client's bounded notification
ring masquerade as a durable journal. Fence late callbacks from prior owners.

### Concurrency and deterministic planning

Reuse the finite SKS stage/DAG compiler and its task keys. Stable ordering of
ready stages, dependency barriers, verified cache keys, and exclusive resource
leases belong here. Parallelize only admitted independent reads or isolated
worktree tasks. Serialize canonical memory mutation, main-worktree integration,
release claims, configuration/auth changes, and each GUI surface. A read-only
hint alone is insufficient evidence of no side effects.

Codex remains the official subagent scheduler. The public App Server thread
start/fork API does not by itself create an official child with native parent
semantics. Do not relabel independent threads as official subagents or build a
parallel custom agent pool. Deterministic SKS stage admission is achievable;
deterministic model-generated spawn order is not promised. A later multi-lane
slice must prove native parent/child lifecycle integration or remain blocked.

Keep one parent delegation depth, existing recursion guards and spawn admission,
bounded handoffs, and parent-owned integration. `agents.max_depth=1` alone is
insufficient for multi-agent V2; test actual denial and evidence closure. If
the measured host cannot enforce the required policy, disable that lane. Caps
bound resource use and provider quota; they are not utilization targets or
proof that 256 children have run. Ordinary tasks stay single-agent unless the
existing explicit/opt-in delegation policy admits parallel work.

### Memory and hot paths

Expose bounded source/context recall and canonical-memory recall through a
versioned MCP contract that calls existing readers. Require workspace, mission,
authority, query/token budget, freshness and provenance binding. Missing/stale
sources return explicit unavailable states. Treat retrieved text as untrusted
data, never as permission or instructions overriding the task.

Keep staged intake separate from canonical promotion. Only the existing main
coordinator with explicit authority can promote, align, forget, or retain data;
children cannot write canonical memory. Do not copy full history/context packs
into every child. Start with read-only tools, no generic exec exposure. Cache
only digest-bound immutable projections and invalidate on source/config/policy
change. Avoid a new mandatory model call for routing, memory, or status; retain
the existing optional Jev consent and deterministic baseline.

### UX and security

Onboarding chooses the workspace, checks the actual runtime and protocol,
shows session ownership and effective provider/model/policy, then validates
read-only operation before enabling writes. Use existing setup, doctor,
Naruto, bridge, and Center surfaces; any new action/flag must enter the command
manifest and schema together. Show unavailable configuration as unknown/error,
never disabled or ready. Do not rewrite user-owned config or auto-upgrade Codex.

Center shows queued/running/approval/input/disconnected/reconciling/terminal
states, last observation time, current owner, limiting capacity, and one root
cause with a bounded recovery action. Approval identifies the command/diff,
workspace, requested scope, and thread/turn; accept applies only to that bound
request and expires on policy/owner change. Stale callbacks cannot overwrite a
new operation. Status subscribers must not start model turns or re-run probes.

Recovery offers reconnect/reconcile, resume the same verified scope, inspect
artifacts, or start a new thread with an explicit handoff. Configuration/auth/
provider changes pause execution until validated. Closing Center does not imply
cancellation; quit behavior must state whether an owned run continues. Preserve
accessible native controls and keyboard cancellation. MacOS behavior requires
real native tests, not Linux source review.

Use owner-only state/IPC permissions, peer identity checks, realpath confinement,
symlink/traversal rejection, bounded queues, allowlisted child environments, and
existing secret redaction. Preserve required proxy/CA settings without printing
their values. Credentials remain with Codex/provider credential owners; never
forward ChatGPT OAuth to provider upstreams. MCP cannot call back into the
broker to grant itself authority or recursively spawn work. Record minimal local
diagnostics with retention limits; no remote telemetry or raw transcripts by
default. Public benchmark/PR artifacts contain no private paths or identities.

## Compatibility, deprecation, and licensing

Keep the current SDK/exec path selectable for explicit rollback while the broker
is experimental. Pin transport selection per mission; do not run both writers
or silently fall back mid-turn. Retain current-session hooks/delegation for stock
Desktop. Deprecate duplicate launches, polling, model/context preparation, and
hook work only on the broker-owned path after equivalent safety/evidence tests
pass. Keep Desktop Bridge where provider routing requires it; App Server IPC
does not eliminate that network hop. Do not remove native Codex features or
legacy compatibility paths solely because the new client builds.

Generate and hash the protocol from the exact resolved binary; compare required
methods, request/response fields, approval variants, and terminal semantics.
Add recorded fixtures and a real handshake/turn/approval/interrupt/resume matrix.
Schema method-name presence alone is insufficient. Test the current stable
candidate against the measured package pin before updates; detect drift and
fail with an induce/check/recovery action. Do not silently auto-update the host.

Upstream's Apache-2.0 license permits modification/redistribution subject to its
conditions; SKS is MIT. Preserve upstream license, notices, attribution and
modification notices for redistributed derivatives; review bundled dependencies
and platform artifacts separately. Keep upstream notices with copied code rather
than describing it as MIT-only. This strategy copies no upstream runtime code.
Open code does not license model weights, hosted services, trademarks, or private
Desktop implementation. Distribution of a future bundled/forked binary needs its
own artifact and licensing review, based on that exact dependency tree.

## Consequences and stop conditions

One execution owner should reduce avoidable setup and recovery disagreement,
but adds a stateful broker, event reconciliation, and protocol maintenance.
These costs may outweigh startup savings for short tasks. Selective reuse and
bounded caches must earn their complexity in the benchmark.

Do not promote on schema-only evidence, synthetic child events, uncertain writes,
weaker approval enforcement, missing macOS evidence, or unmeasured latency claims.
Delivery slices, executable tests, benchmarks, rollback, and ownership are
specified in the [roadmap](codex-native-integration-roadmap.md).
