# Source Intelligence Layer

Sneakoscope 4.4.0 routes source acquisition through UltraSearch.

Default mode is `ultra_balanced`: Context7 is selected only for library, framework, SDK, MCP, API, package, or generated documentation questions; Codex Web is selected when a live web capability is bound; and source proof is written through provider-independent UltraSearch artifacts.

X/Twitter coverage is handled as `x_search` through the public X source family, optional official API credentials, or operator-approved authenticated Chrome read-only evidence. Public web-index discovery is never promoted to full X evidence by itself, and X parity is reported separately from general source-intelligence readiness.

The proof surface records UltraSearch convergence, source normalization, claim ledger status, citation/source graph coverage, and blockers such as `x_search_parity_not_proven`, `high_risk_claim_unresolved`, `weak_content_used_for_supported_claim`, `codex_web_search_missing`, and `context7_missing`.

Useful commands:

```bash
sks ultra-search doctor --json
sks ultra-search run "package docs" --mode balanced
sks ultra-search x "site:x.com product launch"
sks ultra-search fetch "https://example.com"
```
