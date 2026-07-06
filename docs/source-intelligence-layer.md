# Source Intelligence Layer

Sneakoscope routes source acquisition through Super-Search.

Default mode is `balanced`: Context7 is selected only for library, framework, SDK, MCP, API, package, or generated documentation questions; Codex Web is selected when a live web capability is bound; and source proof is written through provider-independent Super-Search artifacts.

X/Twitter coverage is handled as `x_search` through the public X source family, optional official API credentials, or operator-approved authenticated Chrome read-only evidence. Public web-index discovery is never promoted to full X evidence by itself, and X parity is reported separately from general source-intelligence readiness.

The proof surface records Super-Search convergence, source normalization, claim ledger status, citation/source graph coverage, and blockers such as `x_search_parity_not_proven`, `high_risk_claim_unresolved`, `weak_content_used_for_supported_claim`, `codex_web_search_missing`, and `context7_missing`.

Useful commands:

```bash
sks super-search doctor --json
sks super-search run "package docs" --mode balanced
sks super-search x "site:x.com product launch"
sks super-search fetch "https://github.com/mandarange/Sneakoscope-Codex"
```
