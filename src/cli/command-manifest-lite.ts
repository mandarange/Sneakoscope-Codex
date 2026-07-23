export type CommandMaturity = 'stable' | 'beta' | 'labs';

export interface CommandManifestLiteEntry {
  name: string;
  summary: string;
  maturity: CommandMaturity;
  readonly?: boolean;
  diagnostic?: boolean;
  allowedDuringActiveRoute?: boolean;
  skipMigrationGate?: boolean;
  mutatesRouteState?: boolean;
  deprecated?: boolean;
  hidden?: boolean;
}

export const COMMAND_MANIFEST_LITE = [
  { name: 'help', summary: 'Show SKS help', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'version', summary: 'Show SKS version', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'commands', summary: 'List SKS commands', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'check', summary: 'Run five-minute proof-bank affected checks', maturity: 'stable', skipMigrationGate: true },
  { name: 'gates', summary: 'Run release gate DAG by gate id or preset', maturity: 'stable', skipMigrationGate: true },
  { name: 'task', summary: 'Run an SLA-bounded SKS task check', maturity: 'stable', skipMigrationGate: true },
  { name: 'release', summary: 'Run affected/full/background release gates', maturity: 'stable', skipMigrationGate: true },
  { name: 'triwiki', summary: 'Inspect TriWiki index, affected graph, and proof bank', maturity: 'stable', skipMigrationGate: true },
  { name: 'daemon', summary: 'Inspect or warm the local SKS daemon cache', maturity: 'stable', skipMigrationGate: true },
  { name: 'run', summary: 'Classify and execute a task through the SKS trust kernel', maturity: 'beta' },
  { name: 'plan', summary: 'Write a planning-only SKS plan artifact without code edits', maturity: 'stable' },
  { name: 'status', summary: 'Show concise active mission and trust status', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'review', summary: 'Review a git diff with machine evidence first', maturity: 'stable', allowedDuringActiveRoute: true },
  { name: 'root', summary: 'Show active SKS root', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'update', summary: 'Inspect, review, apply, or roll back the global SKS update', maturity: 'stable' },
  { name: 'uninstall', summary: 'Uninstall SKS global skills, hooks, config, menu bar, and optional project residue', maturity: 'stable', allowedDuringActiveRoute: true },
  { name: 'update-check', summary: 'Show the shared SKS, Codex CLI, and Menu Bar update status', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'mcp', summary: 'Manage scoped Codex MCP configuration', maturity: 'beta', skipMigrationGate: true },
  { name: 'wizard', summary: 'Open setup wizard help', maturity: 'stable' },
  { name: 'usage', summary: 'Show focused usage topic', maturity: 'stable', readonly: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'quickstart', summary: 'Show quickstart flow', maturity: 'stable' },
  { name: 'setup', summary: 'Initialize SKS state', maturity: 'stable', skipMigrationGate: true },
  { name: 'bootstrap', summary: 'Initialize SKS project files', maturity: 'stable', skipMigrationGate: true },
  { name: 'init', summary: 'Initialize local control surface', maturity: 'stable' },
  { name: 'deps', summary: 'Check local dependencies', maturity: 'stable' },
  { name: 'fix-path', summary: 'Repair hook command paths', maturity: 'stable' },
  { name: 'doctor', summary: 'Check and repair SKS install', maturity: 'stable', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'git', summary: 'Inspect and enforce SKS git collaboration hygiene', maturity: 'beta' },
  { name: 'paths', summary: 'Inspect SKS managed paths', maturity: 'beta', readonly: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'rollback', summary: 'List or apply managed-path rollback actions', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'postinstall', summary: 'Run postinstall bootstrap', maturity: 'stable', skipMigrationGate: true },
  { name: 'codex', summary: 'Check Codex CLI compatibility and vendored hook schemas', maturity: 'beta', skipMigrationGate: true },
  { name: 'codex-app', summary: 'Check Codex App readiness', maturity: 'beta' },
  { name: 'codex-native', summary: 'Inspect Codex Native broker and routing readiness', maturity: 'beta' },
  { name: 'codex-lb', summary: 'Inspect codex-lb status and circuit health', maturity: 'beta' },
  { name: 'menubar', summary: 'Inspect/install/restart/uninstall SKS menu bar', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'remote', summary: 'Inspect official Remote readiness and run the proof-aware SSH stdio worker', maturity: 'beta' },
  { name: 'telegram', summary: 'Inspect and run the private proof-aware Telegram Hub', maturity: 'beta' },
  { name: 'hooks', summary: 'Explain and inspect Codex hooks', maturity: 'beta', skipMigrationGate: true },
  { name: 'zellij-lane', summary: 'Render a Zellij lane frame for SKS sessions', maturity: 'beta' },
  { name: 'zellij-slot-pane', summary: 'Render a compact Zellij worker slot pane', maturity: 'beta' },
  { name: 'zellij-monitor-pane', summary: 'Render the live Zellij MAD/Naruto monitor pane', maturity: 'beta', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'zellij-viewport-pane', summary: 'Render a dynamically bound Zellij worker viewport pane', maturity: 'beta', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'zellij-slot-column-anchor', summary: 'Render the compact SLOTS anchor pane for first-slot-down Zellij stacks', maturity: 'beta' },
  { name: 'zellij', summary: 'Inspect Zellij runtime status and explain repair (no auto-install)', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'mad-sks', summary: 'MAD-SKS scoped permission modifier + SQL-plane execution', maturity: 'beta', mutatesRouteState: true },
  { name: 'auto-review', summary: 'Manage auto-review profile', maturity: 'beta' },
  { name: 'dollar-commands', summary: 'List Codex App dollar commands', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'fast-mode', summary: 'Toggle SKS Fast mode default for dollar-command routes', maturity: 'stable', skipMigrationGate: true },
  { name: 'commit', summary: 'Create a simple git commit', maturity: 'stable' },
  { name: 'commit-and-push', summary: 'Create a simple git commit and push', maturity: 'stable' },
  { name: 'dfix', summary: 'Run DFix diagnose/plan/patch/verify loop', maturity: 'stable', mutatesRouteState: true },
  { name: 'with-local-llm', summary: 'Enable or inspect local Ollama worker backend', maturity: 'beta' },
  { name: 'naruto', summary: 'Run the $sks-naruto Codex official subagent workflow', maturity: 'labs', mutatesRouteState: true },
  { name: 'stop-gate', summary: 'Check canonical stop-gate resolution for a route/mission', maturity: 'beta', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'route', summary: 'Inspect or close active route state', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'loop', summary: 'Dynamic Loop Runtime: plan/run/status/proof loop graphs.', maturity: 'labs', mutatesRouteState: true },
  { name: 'qa-loop', summary: 'Run QA loop missions', maturity: 'beta', mutatesRouteState: true },
  { name: 'research', summary: 'Run research missions', maturity: 'labs', mutatesRouteState: true },
  { name: 'autoresearch', summary: 'Alias for research/autoresearch route', maturity: 'labs', mutatesRouteState: true },
  { name: 'ppt', summary: 'Inspect/build PPT artifacts', maturity: 'labs', mutatesRouteState: true },
  { name: 'image-ux-review', summary: 'Inspect image UX artifacts', maturity: 'labs', mutatesRouteState: true },
  { name: 'computer-use', summary: 'Record native Mac/non-web Computer Use visual evidence', maturity: 'beta', mutatesRouteState: true },
  { name: 'context7', summary: 'Context7 checks and docs', maturity: 'beta' },
  { name: 'super-search', summary: 'Run Super-Search provider-independent source intelligence', maturity: 'beta' },
  { name: 'recallpulse', summary: 'RecallPulse evidence route', maturity: 'labs' },
  { name: 'pipeline', summary: 'Inspect pipeline missions', maturity: 'beta', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'guard', summary: 'Check harness guard', maturity: 'beta' },
  { name: 'conflicts', summary: 'Check harness conflicts', maturity: 'beta' },
  { name: 'versioning', summary: 'Manage release version metadata', maturity: 'stable' },
  { name: 'reasoning', summary: 'Show reasoning route', maturity: 'labs' },
  { name: 'aliases', summary: 'Show command aliases', maturity: 'stable' },
  { name: 'selftest', summary: 'Run local mock selftest', maturity: 'stable' },
  { name: 'goal', summary: 'Print stateless Codex native Goal controls', maturity: 'beta' },
  { name: 'seo-geo-optimizer', summary: 'Run unified SEO/GEO optimizer audit/research/strategy/plan/apply/verify with optional --include-marketing on the search-visibility kernel', maturity: 'beta' },
  { name: 'hook', summary: 'Codex hook entrypoint', maturity: 'beta', skipMigrationGate: true },
  { name: 'profile', summary: 'Inspect/set profile', maturity: 'labs' },
  { name: 'hproof', summary: 'Evaluate H-Proof gate', maturity: 'beta' },
  { name: 'validate-artifacts', summary: 'Validate mission artifacts', maturity: 'beta' },
  { name: 'proof', summary: 'Show and validate completion proof', maturity: 'beta' },
  { name: 'trust', summary: 'Report and validate route trust kernel evidence', maturity: 'beta' },
  { name: 'wrongness', summary: 'Record and inspect TriWiki wrongness negative evidence', maturity: 'beta' },
  { name: 'proof-field', summary: 'Scan proof field', maturity: 'beta' },
  { name: 'skill-dream', summary: 'Track skill dream counters', maturity: 'labs' },
  { name: 'code-structure', summary: 'Scan source structure', maturity: 'labs' },
  { name: 'rust', summary: 'Inspect optional Rust accelerator status and smoke parity', maturity: 'beta' },
  { name: 'gx', summary: 'Render/validate GX cartridges', maturity: 'labs' },
  { name: 'eval', summary: 'Run eval reports', maturity: 'labs' },
  { name: 'harness', summary: 'Run harness fixtures', maturity: 'labs' },
  { name: 'wiki', summary: 'Manage TriWiki and image voxel ledgers', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'memory', summary: 'Project TriWiki memory into managed AGENTS.md blocks or run memory GC', maturity: 'beta' },
  { name: 'gc', summary: 'Compact/prune runtime state', maturity: 'labs', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'stats', summary: 'Show storage stats', maturity: 'labs', readonly: true, diagnostic: true },
  { name: 'features', summary: 'Validate feature registry', maturity: 'beta' },
  { name: 'all-features', summary: 'Run all-features selftest', maturity: 'beta' },
  { name: 'perf', summary: 'Run performance checks', maturity: 'beta' },
  { name: 'bench', summary: 'Run core trust-kernel benchmark budgets', maturity: 'beta' },
  { name: 'mcp-server', summary: 'Run a stdio MCP server exposing SKS commands as tools for any MCP-capable agent host', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true },
  { name: 'agent-bridge', summary: 'Publish the agent-bridge manifest and print host registration snippets for external agent systems', maturity: 'beta', readonly: true, diagnostic: true }
] as const satisfies readonly CommandManifestLiteEntry[];

export type CommandNameLite = typeof COMMAND_MANIFEST_LITE[number]['name'];

export const LEGACY_COMMAND_ALIASES_LITE = {
} as const satisfies Record<string, CommandNameLite>;

export const COMMAND_ALIASES_LITE = {
  ...LEGACY_COMMAND_ALIASES_LITE,
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
  '--mad': 'mad-sks',
  '--MAD': 'mad-sks',
  '--mad-sks': 'mad-sks',
  'ux-review': 'image-ux-review',
  'visual-review': 'image-ux-review',
  'ui-ux-review': 'image-ux-review'
} as const satisfies Record<string, CommandNameLite>;

export const COMMAND_MANIFEST_BY_NAME = Object.fromEntries(
  COMMAND_MANIFEST_LITE.map((entry) => [entry.name, entry])
) as Record<CommandNameLite, CommandManifestLiteEntry>;

export const COMMAND_NAME_SET = new Set<string>(COMMAND_MANIFEST_LITE.map((entry) => entry.name));

export function commandManifestNames(): CommandNameLite[] {
  return COMMAND_MANIFEST_LITE.map((entry) => entry.name).sort() as CommandNameLite[];
}
