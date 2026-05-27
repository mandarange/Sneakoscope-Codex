# Source Intelligence Layer 1.18.0

SKS 1.18.0 adds a shared Source Intelligence Layer for routes that need current or external source evidence.

SKS 1.18.4 keeps Source Intelligence as inherited route proof while real tmux, Codex dynamic smoke, cleanup, and intelligent work graph checks add stronger fake-vs-real evidence boundaries.

SKS 1.18.2 carries Source Intelligence references into each dynamic agent pool session generation so scheduler, proof, and cockpit artifacts can show the source context that every replenished worker inherited.

SKS 1.18.2 also attaches Source Intelligence refs to task graph work items and schema-valid follow-up work items before each generated session generation is launched.

SKS 1.18.3 reconciles those refs across task graph, work queue, scheduler proof, and the actual Agent/Team/Research/QA route blackboxes so a generic route stand-in cannot satisfy source propagation proof.

Default mode is `context7_codex_web`: Context7 handles docs/library context and Codex Web Search handles live web sources. When an X AI MCP server such as `xai`, `x-ai`, `x_ai`, or `grok` is configured and search-capable, mode becomes `context7_codex_web_xai` and X AI evidence is required for verified current claims. If X AI is absent, the route remains valid with Context7 plus Codex Web Search.

Artifacts:

- `source-intelligence-policy.json`
- `source-intelligence-evidence.json`
- `source-intelligence-evidence.md`
- `appshots-evidence.json` when visual/app-state proof is requested
- local-only provider cache under `source-intelligence/`

The proof surface records `xai_available_not_used`, `codex_web_search_missing`, and `context7_missing` as explicit wrongness kinds instead of hiding source gaps.

## 1.18.6 Runtime Truth Note

SKS 1.18.6 keeps this surface in the runtime-truth release closure and links it to the lifecycle tmux proof, real Codex smoke v2, cleanup executor v2, AST-aware work graph, fake-real policy v2, and runtime truth matrix gates.
