# X AI, Context7, And Codex Web Policy 1.18.0

SKS 1.18.0 treats Context7, Codex Web Search, and optional X AI MCP search as source providers, not route-specific hacks.

- Context7 is required for package, SDK, framework, API, MCP, and generated-docs evidence.
- Codex Web Search is the default live web provider unless a route explicitly runs offline/docs-only.
- X AI MCP Search is optional until configured and search-capable. Once detected, verified current claims must include X AI evidence or record a blocker.
- Missing X AI MCP is not a blocker. It selects the normal `context7_codex_web` fallback.
- Raw X AI responses are local-only artifacts; proof reports use redacted summaries.

This policy applies to Team, Research, AutoResearch, QA, DFix, UX/PPT review, Goal, Answer, Commit/Git, MAD-SKS, Hooks, codex-lb, Computer Use, and Wiki when those routes need current source evidence.
