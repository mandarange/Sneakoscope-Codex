# Super-Search, Context7, And Codex Web Policy

Super-Search is the public source-intelligence command for SKS. It decomposes queries, selects source lanes by capability, records typed artifacts, normalizes sources, separates weak discovery from verified content, and builds claim/citation proof without requiring xAI/Grok.

Balanced/deep runs execute a bounded set of query variants in parallel, record `query-execution.json`, and hydrate a bounded number of discovered URLs. Deduplication prefers verified hydrated content over weak discovery rows for the same canonical URL. Partial fetch failures remain warnings when other verified evidence survives; zero verified evidence still fails closed.

Policy summary:

- Context7 is required for library, framework, SDK, MCP, API, CLI, package-manager, and generated-docs questions.
- Codex Web is a live web-search capability when exposed to the runtime; absence is recorded as a gap, not hidden.
- X/Twitter public discovery is `x_search` and does not prove full-text or near-real-time parity without the X parity corpus.
- Optional official X API or authenticated Chrome read-only lanes may improve X coverage, but credentials are not required for core readiness and are never written to artifacts.
- `sks xai` is a deprecation-only compatibility notice. It does not configure MCP servers, require `XAI_API_KEY`, or affect source-intelligence policy.
- Research and AutoResearch may consume only verified, source-ID-correlated Super Search rows. Their final manuscript gate uses three independent composite `research_reviewer` threads, and any unknown source ID, stale artifact digest, non-approval, or unresolved revision fails closed.

Release gates:

```bash
node ./dist/scripts/super-search-provider-interface-check.js
node ./dist/scripts/source-intelligence-all-modes-check.js
```
