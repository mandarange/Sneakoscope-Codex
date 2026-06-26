# Source Intelligence Layer

Sneakoscope routes source acquisition through InsaneSearch, formerly exposed as UltraSearch.

Default mode is `ultra_balanced`: Context7 is selected only for library, framework, SDK, MCP, API, package, or generated documentation questions; Codex Web is selected when a live web capability is bound; and source proof is written through provider-independent InsaneSearch artifacts.

X/Twitter coverage is handled as `x_search` through the public X source family, optional official API credentials, or operator-approved authenticated Chrome read-only evidence. Public web-index discovery is never promoted to full X evidence by itself, and X parity is reported separately from general source-intelligence readiness.

The proof surface records InsaneSearch convergence, source normalization, claim ledger status, citation/source graph coverage, and blockers such as `x_search_parity_not_proven`, `high_risk_claim_unresolved`, `weak_content_used_for_supported_claim`, `codex_web_search_missing`, and `context7_missing`.

Useful commands:

```bash
sks insane-search doctor --json
sks insane-search run "package docs" --mode balanced
sks insane-search x "site:x.com product launch"
sks insane-search fetch "https://example.com"
```
