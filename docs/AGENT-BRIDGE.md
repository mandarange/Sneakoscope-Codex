# Agent Bridge

SKS exposes its full command surface to any agent system — not a specific one — through two
contracts every agent host already understands: a stdio MCP server, and a non-interactive CLI
contract. This document is the reference for both, plus the real-time streaming recipe for
answering a chat surface from a long-running SKS command.

## Quick start

```bash
sks agent-bridge setup --json
```

This publishes the machine-readable command manifest to `.sneakoscope/agent-bridge/manifest.json`,
prints host registration snippets, and runs a live non-interactive smoke test
(`SKS_AGENT_MODE=1 sks status --json`) so you know the contract actually works on this machine
before wiring anything up.

## Contract 1: stdio MCP server

```bash
sks mcp-server            # exposes read-only commands only
sks mcp-server --expose-exec   # also exposes non-read-only commands
```

Any MCP-capable host can register this as a toolset. It speaks standard MCP over stdio, built on the
already-installed `@modelcontextprotocol/sdk` (the same SDK SKS already uses as an MCP *client*
elsewhere in the codebase) — `initialize`, `tools/list`, and `tools/call` are handled by the
real SDK, not a hand-rolled wire protocol.

- **`tools/list`** returns one tool per command in the agent manifest. By default only
  `read_only: true` commands are exposed (see `src/core/agent-bridge/agent-manifest.ts` — derived
  from `src/cli/command-registry.ts`, never hand-maintained separately). Pass `--expose-exec` at
  server startup to also expose mutating commands — off by default, since a generic MCP client
  should not be able to run `sks uninstall` or a MAD-SKS route without an explicit opt-in.
- **`tools/call`** validates the requested tool name against the manifest before spawning
  anything. An unknown or unexposed name returns an MCP error result — it never spawns a
  process for a name the caller invented.
- Each tool call runs `sks <name> [--json]` as a subprocess with `SKS_AGENT_MODE=1` set (see
  Contract 2) so the invocation is guaranteed to be non-interactive and returns clean JSON.

Register with a CLI host:

```bash
codex mcp add sks -- sks mcp-server
```

Register with any other MCP host — the generic form:

```json
{ "command": "sks", "args": ["mcp-server"] }
```

## Contract 2: non-interactive CLI (`SKS_AGENT_MODE`)

For agent systems that can only invoke subprocesses (no MCP support), set `SKS_AGENT_MODE=1`:

```bash
SKS_AGENT_MODE=1 sks status --json
```

The contract:

- **stdout is exactly one JSON result** for the invoked command — no banners, no spinners
  (those go to stderr).
- **Never blocks on a prompt.** Any interactive question point returns immediately instead of
  calling `readline`:
  ```json
  { "ok": false, "error": "interactive_input_required", "question": "...", "non_interactive_hint": "..." }
  ```
  with exit code `3`, so a caller can detect this case and either answer it via the hinted flag
  or surface it to a human.
- Update checks and the per-project migration gate are skipped automatically (agent mode implies
  the same env vars the SKS menu bar background process already relies on:
  `SKS_UPDATE_MIGRATION_GATE_DISABLED`, `SKS_DISABLE_UPDATE_CHECK`).
- **Any uncaught error still returns valid JSON on stdout** (`{ "ok": false, "error": ..., "command": ... }`,
  exit code 1) rather than leaving stdout empty — the router's final crash guard (see
  `src/cli/router.ts`) guarantees this for every command, not just agent-mode-aware ones.

## Real-time answers: NDJSON streaming (`--stream`)

For a chat bot that wants to relay progress instead of waiting silently
for a long-running command to finish, pass `--stream` on a command that supports it (currently
piloted on `sks qa-loop run`):

```bash
SKS_AGENT_MODE=1 sks qa-loop run <mission> --mock --stream --json
```

stdout becomes newline-delimited JSON, one event per line:

```json
{"event":"start","ts":"...","data":{...}}
{"event":"progress","ts":"...","data":{"type":"cycle_start","cycle":1}}
{"event":"progress","ts":"...","data":{"type":"cycle_continue","cycle":1}}
{"event":"result","ts":"...","data":{"ok":true,"status":"cycle-done"}}
```

The stream always ends with exactly one `result` event, regardless of which internal branch
produced it.

### Chat Bot Recipe

1. Spawn `sks <command> --stream --json` as a child process (with `SKS_AGENT_MODE=1`).
2. On the first `start` event, open a thread and stash `data.mission_id` for later reference.
3. On each `progress` event, **edit the same thread reply in place** with a human-readable
   rendering of `data.type`/`data.cycle` — don't post a new message per event, or you'll spam
   the channel.
4. On the `result` event, post the final pass/fail summary (`data.ok`, `data.status`) as a new
   message and stop reading.

```js
const child = spawn('sks', ['qa-loop', 'run', missionId, '--mock', '--stream', '--json'], {
  env: { ...process.env, SKS_AGENT_MODE: '1' }
});
let threadTs = null;
for await (const line of readLines(child.stdout)) {
  const evt = JSON.parse(line);
  if (evt.event === 'start') threadTs = await postToThread(evt.data.mission_id);
  else if (evt.event === 'progress') await editThreadReply(threadTs, renderProgress(evt.data));
  else if (evt.event === 'result') await postMessage(renderResult(evt.data));
}
```

## Manifest schema (`sks.agent-manifest.v1`)

`sks agent-bridge setup` writes `.sneakoscope/agent-bridge/manifest.json`:

```json
{
  "schema": "sks.agent-manifest.v1",
  "generated_at": "...",
  "tools": [
    {
      "name": "status",
      "description": "Show concise active mission and trust status",
      "read_only": true,
      "requires_explicit_opt_in": false,
      "json_output_supported": true,
      "latency_class": "fast",
      "example_invocation": "sks status --json",
      "maturity": "stable"
    }
  ]
}
```

- `read_only` — safe to expose without `--expose-exec`.
- `requires_explicit_opt_in` — destructive or high-risk commands (uninstall, MAD-SKS, update/apply,
  purge, wipe, delete) are flagged so a host can gate them behind extra confirmation even under
  `--expose-exec`.
- `latency_class` — `fast` (read-only), `long` (Naruto, MAD-SKS, update, Loop, QA-Loop,
  Research/AutoResearch, or anything whose summary mentions install/update), `normal` otherwise.
- `json_output_supported` — best-effort static scan of the compiled command module for a
  `--json` literal; conservatively `false` (never fabricated `true`) when the file can't be
  read (e.g. `dist` not built yet).

## Security notes

- `--expose-exec` is off by default on `sks mcp-server`. A generic MCP client only sees
  read-only commands unless the operator explicitly opts in at server startup.
- `tools/call` never spawns a tool name absent from the manifest, whether or not
  `--expose-exec` is set.
- Every subprocess invocation runs with `SKS_AGENT_MODE=1`, so it inherits the same
  never-block-on-a-prompt guarantee described above.
- The generated manifest contains only the current command registry. `sks doctor --fix` and
  `sks update` reconcile SKS-owned installed manifests and remove retired managed entries;
  user-authored collisions are preserved in quarantine instead of overwritten.
