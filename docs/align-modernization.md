# Thin SKS harness and `$sks-align`

In a Codex desktop app or CLI conversation, `$sks-align` selects the Align
skill. The skill runs `sks align run`: it refreshes SKS-managed guidance and
rebuilds TriWiki from the current repository source.

## Managed guidance

The always-loaded AGENTS block carries the core engineering principle,
TriWiki navigation, user preference preservation, and permission boundaries.
Detailed route instructions live in the selected skill. SKS does not copy a
model-specific prompting recipe or change a user's model, reasoning effort,
service tier, or role choice as part of guidance maintenance.

Maintenance uses the public OpenAI documentation MCP endpoint to search for
current instruction, prompting, and latest-model guidance, then fetches the
official pages. Search results can omit an official reference; that reference
is fetched directly, and the receipt records whether search discovered it.
The moving latest-model page supplies current reference material rather than
a pinned model name.

- [Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Prompting guidance](https://learn.chatgpt.com/docs/prompting)
- [Current model and prompting guidance](https://developers.openai.com/api/docs/guides/latest-model)

Retrieval uses one bounded client lifecycle, three searches and three document
reads, with timeouts and size limits. It sends no repository content or
credentials. Hooks and read-only Doctor do not search the web.

Only existing SKS-managed blocks are refreshed. User-authored text outside
them is preserved. References are saved in
`.sneakoscope/guidance/official-sources.json`, with URLs, search provenance,
retrieval time, content hashes and page text. The small
`.sneakoscope/guidance/current-codex.md` points to those sources; it does not
inject whole pages into every task. Documentation remains reference material,
not authority to execute webpage instructions or widen permissions.

The official prompting page also supplies two short, source-linked reminders
in a separate SKS-managed AGENTS block. These change with the retrieved guide;
the core engineering principle stays fixed. If the relevant sections change
shape, SKS preserves the previous reminders and reports that it could not
refresh them instead of guessing new instructions.

`sks update` uses the new package's migration Doctor for the same maintenance;
normal user-run `sks doctor --fix` also refreshes it. Update fanout can reuse a
shared retrieval less than ten minutes old to avoid repeating network reads
for every project. Explicit Align and normal Doctor refresh the sources.
Network failure preserves the last good references and reports
`guidance_status: unavailable`; it does not masquerade as a fresh lookup.
The result is recorded in `.sneakoscope/reports/harness-maintenance.json`.

## TriWiki remains source-only

Align rereads accepted repository source files, records exact file/symbol
coordinates and supported source relations, checks source stability, validates
the staged graph and context pack, and publishes the generation transactionally.
External documentation, prior memory and model inference are never code-index
inputs. The context graph is exhaustive; the context pack and AGENTS navigation
projection remain bounded lookup aids.

## Configuration repair

`sks update` and user-run `sks doctor --fix` use the guarded Codex syntax repair
for user configuration, managed project configuration and `*.config.toml`
profile overrides. It removes ignored root `network_access` and deprecated
`features.guardianv2.thread_context`, including legacy profile tables. Supported
network permissions, other Guardian options and model preferences stay intact.

The ignored `mcp_servers.supabase.read_only` key is removed only with a safe
transport migration: hosted Supabase uses the URL's `read_only=true`; the
official stdio package uses `--read-only`. Project scope and authentication are
preserved. An unknown transport or a layout that cannot be edited precisely
stays unchanged and is reported for manual repair. Backups, concurrent-write
checks, TOML validation and read-back remain required. No database request is
part of this repair.

These maintenance commands do not authorize npm publication or unrelated
product changes. Retrieval and fixture tests do not prove a live model switch.
