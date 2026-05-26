# X AI, Context7, And Codex Web Policy 1.18.0

SKS 1.18.0 treats Context7, Codex Web Search, and optional X AI MCP search as source providers, not route-specific hacks.

SKS 1.18.2 preserves that provider boundary while requiring dynamic agent pool generations to carry the inherited source-intelligence reference list into scheduler and proof evidence.

SKS 1.18.2 keeps the same boundary for route blackbox backfill and follow-up work: provider refs are inherited as proof context, not recomputed by worker-local shortcuts.

SKS 1.18.3 keeps actual route-command backfill gates on the same provider boundary: route proof must show inherited Source Intelligence refs from the task graph through each generated worker session.

- Context7 is required for package, SDK, framework, API, MCP, and generated-docs evidence.
- Codex Web Search is the default live web provider unless a route explicitly runs offline/docs-only.
- X AI MCP Search is optional until configured and search-capable. Once detected, verified current claims must include X AI evidence or record a blocker.
- Missing X AI MCP is not a blocker. It selects the normal `context7_codex_web` fallback.
- Raw X AI responses are local-only artifacts; proof reports use redacted summaries.

This policy applies to Team, Research, AutoResearch, QA, DFix, UX/PPT review, Goal, Answer, Commit/Git, MAD-SKS, Hooks, codex-lb, Computer Use, and Wiki when those routes need current source evidence.
