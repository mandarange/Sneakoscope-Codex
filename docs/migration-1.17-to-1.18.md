# Migration From 1.17.0 To 1.18.0

1. Update package/runtime metadata to `1.18.0`.
2. Run `npm run build`.
3. Run the new 1.18.0 gates: `npm run source-intelligence:all-modes`, `npm run agent:background-terminals`, and `npm run release:parallel-full-coverage`.
4. Run `npm run release:check` before publishing.

X AI MCP is optional. If it is not configured, routes use Context7 plus Codex Web Search. If it is configured and search-capable, X AI evidence becomes required for verified current-source claims.
