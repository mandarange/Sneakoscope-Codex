# Super-Search, Context7, And Codex Web Policy

Super-Search is the public source-intelligence command for SKS. It decomposes queries, selects source lanes by capability, records typed artifacts, normalizes sources, separates weak discovery from verified content, and builds claim/citation proof without requiring xAI/Grok.

Policy summary:

- Context7 is required for library, framework, SDK, MCP, API, CLI, package-manager, and generated-docs questions.
- Codex Web is a live web-search capability when exposed to the runtime; absence is recorded as a gap, not hidden.
- X/Twitter public discovery is `x_search` and does not prove full-text or near-real-time parity without the X parity corpus.
- Optional official X API or authenticated Chrome read-only lanes may improve X coverage, but credentials are not required for core readiness and are never written to artifacts.
- `sks xai` is a deprecation-only compatibility notice. It does not configure MCP servers, require `XAI_API_KEY`, or affect source-intelligence policy.

Release gates:

```bash
node ./dist/scripts/super-search-provider-interface-check.js
node ./dist/scripts/source-intelligence-all-modes-check.js
```
