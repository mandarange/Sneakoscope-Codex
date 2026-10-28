# Desktop Bridge provider guide

## 8.1.3 contract

SKS has one managed Desktop and CLI routing runtime: the local **Desktop
Bridge**. Codex-LB and OpenRouter are independent provider profiles registered
with that bridge; neither is a runtime mode or a global Codex provider
selection. Codex stays bound to the bridge (`model_provider = "openai"` with
`openai_base_url` pointing at it); enabling or disabling a provider changes
bridge routing only. A `model_provider = "codex-lb"` that SKS 10.7.0 and
earlier wrote under the managed marker is set back to `openai` by the next
catalog sync.

ChatGPT OAuth remains owned by Codex. SKS does not copy, rewrite, or send that
OAuth authorization to either provider upstream. Codex-LB and OpenRouter
credentials may coexist, and enabling, disabling, validating, or rotating one
profile must not delete or overwrite the other profile's credential.

The old `sks codex-lb` command family has been removed. It has no compatibility
alias: invoking it returns `unknown_command`. Use `sks bridge` exclusively.

## Configure and inspect profiles

```sh
sks bridge status --json
sks bridge ensure --json

# Read the key from standard input; never put it in argv.
read -r -s codex_lb_key
printf '\n'
printf '%s\n' "$codex_lb_key" | \
  sks bridge provider configure codex-lb --host lb.example.com --api-key-stdin --json
unset codex_lb_key

read -r -s openrouter_key
printf '\n'
printf '%s\n' "$openrouter_key" | \
  sks bridge provider configure openrouter --api-key-stdin --json
unset openrouter_key

sks bridge provider validate codex-lb --json
sks bridge provider validate openrouter --json
sks bridge provider list --json
```

`provider disable` stops the profile from being used but preserves its
credential. Credential deletion is separate, destructive, and requires an
explicit confirmation:

```sh
sks bridge provider disable codex-lb --json
sks bridge provider remove-credential codex-lb --confirm --json
```

Bridge results expose secret-free credential metadata only: state, source,
redacted fingerprint, and check time. They never serialize provider keys,
OAuth tokens, or a complete endpoint query.

### Credential persistence classes

The status contract reports the credential persistence class without exposing
the credential. `durable_env_file` is the owner-only CLI store,
`durable_keychain` is available only through an explicit signed-app reconnect,
`shell_profile` identifies an operator-owned shell source that SKS does not
rewrite, and `process_only_ephemeral` means the value disappears with the
process. A profile containing a **base URL only** is configured-incomplete, not
ready. None of these classes authorizes automatic authentication UI or copying
ChatGPT OAuth into a provider profile.

## Catalog and routing

The bridge builds one combined catalog and one explicit route index. A model is
routed by an index entry, not by a model-name convention or by the currently
selected profile. A conflicting public model ID is blocked with
`catalog_model_route_ambiguous`; an unknown model is blocked with
`catalog_model_route_missing`. A thread pinned to a provider never falls back
to the official identity: an unknown model there fails with
`catalog_model_route_missing` (409). Only a thread with no provider pin may
still use the official identity for a model no provider claims.

```sh
sks bridge catalog sync --json
sks bridge catalog status --json
sks bridge models refresh --json
sks bridge route list --json
sks bridge route set-default codex-lb --json
sks bridge route explain <model> --json
```

The model list refreshes at the end of every `sks update`, `sks doctor`
(read-only without `--fix`: SKS's own catalog files, never `config.toml`),
setup, menubar install, `sks codex update` and SKS Center change;
`sks bridge models refresh` runs one now. A provider that cannot be reached
keeps its last good models. The bridge answers `GET /models` from the active
catalog (ETag `sksb-<generation>`) and replaces `X-Models-Etag` on every
Responses reply, so Codex fetches the new list when it changes. Codex reads
`/models` from the bridge only with a ChatGPT sign-in; SKS then removes its
own `model_catalog_json` after a `/models` self-check (one Codex restart to
switch). Other sign-ins keep `model_catalog_json`, and a refresh that changed
the list says to restart Codex. A `model_catalog_json` you wrote yourself is
left alone.

Through the bridge Codex treats every route as OpenAI and asks for `include`
values only OpenAI serves; the bridge sends Codex-LB and OpenRouter only the
values each accepts. An operator whose Codex-LB already accepts more can add
them to its provider profile in `~/.codex/sks/desktop-bridge-settings.json`:
`"request_compat": { "extra_include": ["output.encrypted_content"] }` (at most
eight lowercase dotted values; a catalog sync keeps it).

The default provider helps with uniquely resolvable aliases and new-selection
UI filtering. It is never a silent request fallback. Every thread is pinned at
its first request — official-route threads too (provider `openai`) — so a
profile, catalog or auth-priority change never moves a running thread to
another identity. A thread moves only when its model changes to one routed
elsewhere; that request and every later one drop reasoning items and any other
`encrypted_content`, which only the previous account can read, and the move
drops `previous_response_id` and `x-codex-turn-state`. A move whose history
holds a native compaction item is refused with Codex's non-retryable
`invalid_prompt` and a message: switch back, or start a new thread.

### Context compaction on a provider route

SKS points Codex's built-in OpenAI provider at the bridge, so Codex compacts
long threads *remotely*: it sends a Responses request ending in a
`compaction_trigger` item (or, on older Codex, a POST to `/responses/compact`)
and expects one opaque `compaction` item back. How a route answers is a
per-provider capability (`BRIDGE_REMOTE_COMPACTION`):

- **Native** — the official backend and Codex-LB. Codex-LB runs the compaction
  itself on the thread's own account, so the request travels like any other
  turn: same headers, unchanged body apart from the model alias, and no bridge
  idle limit below five minutes (a compaction streams nothing for 45–150 s).
  `POST /responses/compact` is routed by the thread's pin, then its body
  model, in every mode — it never leaves for the official identity.
- **Bridge summary** — OpenRouter, which has none. The bridge asks the thread's
  own provider and model for a handoff summary (Codex's summarization prompt,
  tool calls disabled) and returns it as the `compaction` item, over HTTP or
  the Responses WebSocket. The item carries a bridge envelope; on later turns
  the bridge replaces it with the summary as a user message before forwarding,
  on every route, because no upstream can read it. A provider that refuses the
  summary request is reported with its own error identifiers
  (`bridge_compaction_summary_status_<status>` in the bridge log).

### Codex-LB requests and errors

Codex-LB is a protocol-transparent proxy of the official backend, so it gets
the official route's headers with only the identity swapped: the key replaces
the client's `Authorization`, and `chatgpt-account-id` and cookies are
dropped. `user-agent`, `originator`, `version`, session, thread and
subagent headers travel, so Codex-LB recognizes Codex and keeps each thread on
its account. An `x-codex-turn-state` reaches it only when Codex-LB issued that
value for the same thread and key. Its errors reach Codex as sent — status,
code, message, `resets_at` — so `context_length_exceeded`,
`usage_limit_reached` and `previous_response_not_found` keep their effect;
the bridge only removes credentials from the body and adds `Retry-After: 5`
to a `server_is_overloaded` that arrived without advice.

## Verification levels

```sh
sks bridge verify --level shallow --json
sks bridge verify --level transport --json
sks bridge verify --level deep --json
```

`shallow` inspects ownership, service state, profile configuration, and route
metadata. `transport` validates the applicable bridge and active-route path;
it distinguishes TCP, HTTP health, WebSocket upgrade, protocol, frame round
trip, and clean close. `deep` additionally needs feature-specific evidence,
such as a validated image artifact.

Command execution and readiness are different fields. A non-strict report can
be generated successfully even when readiness is false. Only `--strict` or
`--require-ready` turns unmet readiness into a non-zero exit. A missing deep
probe is `not_attempted`, not a transport blocker and not evidence that the
feature is available.

## Migration, ownership, and rollback

Current migration privately recognizes only SKS-authored historical routing
markers. It converts them into the Desktop Bridge, provider profiles, combined
catalog, and route policy without creating a legacy runtime directory. A
user-owned or ambiguous provider/catalog/base-URL configuration fails closed
with a recovery action; it is not edited automatically.

Migration writes a restricted receipt containing hashes, ownership-safe
metadata, migrated profile IDs, and rollback metadata. It never includes a
secret. Running migration again records an already-migrated/no-op result.
Rollback uses that receipt to restore bridge/config metadata only; it does not
overwrite a newer OAuth state, a rotated key, or a newly added provider
credential.

```sh
sks bridge unmanage --confirm --json
sks bridge rollback <receipt-id> --confirm --json
```

`unmanage` is an explicit removal/rollback operation, not a provider switch.
After it, the state is unmanaged/native rather than another SKS mode.

## Real-environment boundary

Local schema checks and hermetic tests do not prove a real macOS service,
credential validation, Desktop restart, WebSocket frame round trip, or deep
feature artifact. Those items stay `not-run-real` until a target-bound,
redacted runtime receipt is collected for the release.
