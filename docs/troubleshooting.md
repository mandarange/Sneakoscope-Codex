# Troubleshooting

Start with the smallest diagnostic bundle:

```sh
node --version
sks --version
sks doctor --json
sks status --json
```

Redact credentials, access tokens, private source, and personal paths before sharing output.

## `sks: command not found`

The global npm bin directory is not on `PATH`, or the installer did not finish. Re-run the supported installer and verify the resolved binary:

```sh
npm exec --yes --package=sneakoscope@latest -- sneakoscope install --yes
command -v sks
sks --version
```

If `command -v sks` points at a different installation, remove that stale entry or adjust `PATH` before retrying.

## Doctor reports a failed check

Run `sks doctor --json` again and follow the recovery action printed by the command. Do not bypass a check by deleting state or claiming success. If the recovery action fails twice, attach the redacted JSON and the exact command to a bug report.

## Bootstrap changed more files than expected

Review the diff from the project root. Generated SKS runtime state belongs under the ignored project-local paths. Stop and report the paths if application source or user-authored configuration was changed unexpectedly.

## Codex does not show SKS workflows

Check that the current Codex client is supported, then run `sks status --json` and inspect the hook path reported by Doctor. Restart the Codex task after changing context-management or hook settings.

## SKS Center is not visible on macOS

Run the install from an interactive terminal, then install the native surface explicitly:

```sh
sks menubar install
sks doctor --json
```

Dependency, CI, and piped installs intentionally skip the menu bar build. Set `SKS_POSTINSTALL_MENUBAR=1` only when a scripted install is meant to build it.

## 1M context status is unavailable

Run `sks codex-app context-1m status --json`. A `codex_context_config_unreadable`
blocker means SKS could not read the reported `config_path`. Restore read access
and confirm the path is a file, then retry. SKS leaves the configuration untouched
and does not restart Codex on this failure. JSON reports `ok: false` with
`enabled` and `keys` set to `null`; a missing file remains a valid disabled state.

## Bridge or provider checks are unavailable

Inspect the configured route without entering credentials into a shell history:

```sh
sks bridge status --json
sks bridge route explain gpt-6-astra --json
```

Use the native connection dialog or `--api-key-stdin` for credentials. An unavailable route is a setup problem; it is not a reason to silently substitute another provider.

## Codex compact reports `responses_compact_input_too_large`

The message “Compact input exceeds the upstream size limit and cannot be
trimmed without removing required state anchors” comes from Codex-LB's native
compaction input check. SKS forwards that failure; it does not mean SKS's HTTP
body limit or the model's context window was reached. Enabling 1M context does
not increase the gateway's separate compact limit.

In the [reviewed upstream revision](https://github.com/Soju06/codex-lb/blob/72630bbfeee9e3b0d9acfb95e2b1e706b8b0188e/app/core/openai/requests.py#L1048),
the reference limit is 100,000 estimated tokens: default Python JSON
serialization length, including ASCII escapes and separator spaces, divided by
four and rounded up. Korean characters cost six serialized characters and an
emoji surrogate pair costs twelve. The required selection can include Lite
`additional_tools`, developer/system instructions, goal/plan calls and their
paired results, and terminal state. A small UTF-8 request can therefore exceed
that estimate. The error alone cannot identify which item caused your failure.

After reproducing once, collect `sks --version`, `codex --version`,
`sks bridge status --json`, and `sks bridge route explain <public-model> --json`.
On a bridge build containing the compact size diagnostics, find the bridge log
at `stdout_log_path` in the status output. Older builds lack these size fields.
The redacted
rejection record names `provider_id`, `public_model`,
`upstream_code`, and `request_shape.compaction_sizes`. That measurement contains
only fixed type/role groups and counts/sizes, including the largest item in each
group. `input_json_bytes` describes UTF-8 input JSON;
`input_ascii_json_chars_estimate` and `input_estimated_tokens` account for ASCII
escaping instead. Numeric formatting can differ between JavaScript and Python;
these are diagnostics, not an exact tokenizer or an enforced budget. They
measure the input sent by SKS, not the gateway's final required selection or an
unseen WebSocket continuation. No request text, tool arguments, image bytes,
encrypted state, or credentials are added to these measurements.
Compact records leave the legacy `keys`, `include`, and `input_types` shape
fields empty, even when size measurements are unavailable. Arbitrary labels
are never copied into those compact records; unknown include values in
adaptation logs are represented by the fixed label `<other>`.
HTTP error responses, native uncompressed HTTP 200 SSE size failures, and
WebSocket error events retain their original response and carry the same size
evidence. SSE observation is best-effort for events up to 1 MiB; compressed or
larger events pass through unchanged and may have no size record.

Check the serving gateway version/image digest with its operator. The reviewed
GitHub revision does not establish your deployment version. Avoid repeatedly
retrying the unchanged oversized request or deleting its tool pairs, images,
instructions, or opaque state to make it pass. For future turns, bound file and
tool output to the needed lines/results instead of loading complete large files.
If the required set itself is too large, preserve the original session and make
a reviewed textual handoff for a new task: requirements, constraints, goal/plan,
edits, checks, remaining work, and pending tool actions. Verify the project state
before resuming; a new task does not restore the old task's opaque/pending state.
An exact in-session fix requires a reproducible request shape and a change at
the gateway/host boundary that preserves those required items. SKS does not
silently change provider, remove anchors, raise the upstream cap, or claim that
diagnostic logging repairs this upstream failure.

## Tests fail after a source change

Rebuild before running the canonical test command:

```sh
npm run build
npm run typecheck
npm test
```

Attach the first failing test and its output. Avoid posting a full environment dump.
