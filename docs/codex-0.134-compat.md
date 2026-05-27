# Codex 0.134 Compatibility

SKS 1.18.8 keeps the `rust-v0.134.0` compatibility baseline from 1.18.7 and adds release coverage for strategy-first write gating, Appshots evidence, MCP readOnlyHint concurrency, and hook context parity.

Run:

```bash
npm run codex:0.134-compat
npm run codex:0.134-official-compat
npm run codex:profile-primary
npm run codex:managed-proxy-env
npm run hooks:0.134-context-parity
```

The hook parity gate checks that SubagentStart/SubagentStop context remains wired with agent transcript and permission-mode fields.
