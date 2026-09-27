# OpenRouter Only Mode

OpenRouter Only Mode runs the Codex main thread and every subagent on OpenRouter
models. Subagents may use only the models on a list you keep, and Jev reads the
criteria you write for each model to route every child.

## Turning it on

In SKS Control Center, open **Connections** and turn on **OpenRouter Only** in the
**Default connection** card, or run:

```sh
sks bridge openrouter-only status --json
sks bridge openrouter-only on --json
sks bridge openrouter-only off --json
```

OpenRouter Only and **Prefer Codex-LB** (`sks bridge auth-priority`) are mutually
exclusive. Turning OpenRouter Only on turns Prefer Codex-LB off in the same
operation, and turning Prefer Codex-LB on turns OpenRouter Only off first. Turning
OpenRouter Only off leaves Prefer Codex-LB off; turn it back on yourself.

Turning the mode on requires an enabled OpenRouter profile with a validated key.
It then:

- rebuilds the Codex model catalog without Codex-LB models, so the Codex picker
  offers only OpenRouter models, and adds every subagent-list model to it (Codex
  lets a subagent run only a model in its catalog);
- switches `model` in `~/.codex/config.toml` to the default list model when the
  main model is not an OpenRouter model, and records the previous value;
- installs a model-less read-only subagent role in `~/.codex/agents/`, so read-only
  slices keep their read-only sandbox while running a list model;
- restarts Codex Desktop if it is running and something changed.

Turning it off restores the Codex-LB catalog and puts the previous main model back
when `config.toml` still names the model SKS wrote. The subagent list is kept for
the next time. Start a new Codex thread after either change; existing threads keep
the model and route they started with.

The Codex-LB profile and its credentials are never removed. Requests that carry no
model (file uploads, voice, and other Codex services) keep using your ChatGPT sign-in.

## The subagent model list

Open **Subagent Models** in Control Center. While OpenRouter Only is on you can add
and remove models (up to 16), write criteria for each one, pick a reasoning effort,
and choose the default. Apply saves the whole list. The CLI takes the same list as
JSON on stdin:

```sh
sks bridge subagent-models list --json
echo '{"subagent_models":[
  {"model":"z-ai/glm-5.3","criteria":"Deep refactors and debugging.","reasoning_effort":"high","default":true},
  {"model":"google/gemini-3.8-flash","criteria":"Fast UI edits and renames.","reasoning_effort":"low","default":false}
]}' | sks bridge subagent-models set --stdin --json
```

When the mode is turned on with an empty list, SKS seeds it from the OpenRouter
models already exposed in the Codex picker.

## How children are routed

Every `spawn_agent` call, in Naruto and in any other parallel work, passes through
the SKS PreToolUse hook while the mode is on:

1. With Jev mode on and two or more models on the list, Jev picks the model whose
   criteria fit the child's task.
2. Otherwise, or when Jev is off, busy or unsure, the child keeps a listed model the
   parent asked for, else it gets the default model.
3. The hook then denies any spawn whose model is not on the list.

Naruto plans record the model and reason for every role in `subagent-plan.json`,
and the delegation prompt names only list models. Role-model preferences are
ignored while the mode is on and apply again when it is off.

The Desktop Bridge enforces the same rules even if the hooks are not installed:
with the mode on it refuses any model-bearing request that does not route to
OpenRouter (`openrouter_only_route_blocked`), and a subagent request whose model is
not on the list (`openrouter_only_subagent_model_blocked`).

## Limits

- Codex's own image tool does not exist on OpenRouter models. Use the custom image
  model mode on the **Image Generation** page while OpenRouter Only is on.
- Codex features that call their own non-OpenRouter model (for example the
  auto-review guardian) are refused while the mode is on.
- The mode state lives in `~/.codex/sks/sks-openrouter-only.json`. It is read from
  HOME, never from `CODEX_HOME`, so the hooks and the launchd bridge read the same file.
