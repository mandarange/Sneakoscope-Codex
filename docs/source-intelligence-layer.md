# Source Intelligence Layer 1.18.0

SKS 1.18.0 adds a shared Source Intelligence Layer for routes that need current or external source evidence.

Default mode is `context7_codex_web`: Context7 handles docs/library context and Codex Web Search handles live web sources. When an X AI MCP server such as `xai`, `x-ai`, `x_ai`, or `grok` is configured and search-capable, mode becomes `context7_codex_web_xai` and X AI evidence is required for verified current claims. If X AI is absent, the route remains valid with Context7 plus Codex Web Search.

Artifacts:

- `source-intelligence-policy.json`
- `source-intelligence-evidence.json`
- `source-intelligence-evidence.md`
- local-only provider cache under `source-intelligence/`

The proof surface records `xai_available_not_used`, `codex_web_search_missing`, and `context7_missing` as explicit wrongness kinds instead of hiding source gaps.
