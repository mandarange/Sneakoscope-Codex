import { USAGE_TOPICS } from '../core/routes/constants.js';
import { narutoCommandInputSchema } from '../core/subagents/naruto-command-input-contract.js';

export type CommandMaturity = 'stable' | 'beta' | 'labs';
export type CommandRiskLite = 'R0' | 'R1' | 'R2' | 'R3';
export type CommandLatencyLite = 'fast' | 'normal' | 'long';
export type CommandInputProfileLite =
  | 'none'
  | 'json-only'
  | 'naruto'
  | 'paths'
  | 'pipeline-status'
  | 'stats'
  | 'proof';

export type ActiveRoutePolicy = 'always' | 'diagnostic-only' | 'blocked-while-active';

export interface CommandManifestLiteEntry {
  name: string;
  summary: string;
  maturity: CommandMaturity;
  readonly?: boolean;
  diagnostic?: boolean;
  allowedDuringActiveRoute?: boolean;
  skipMigrationGate?: boolean;
  mutatesRouteState?: boolean;
  /** One-line synopsis with flags; set only for commands that print usage. */
  usage?: string;
  /** Longer description paired with `usage`. `summary` stays the list-view text. */
  description?: string;
  /** Gate files a route-state mutator owns under its mission directory. */
  ownedGateFiles?: readonly string[];
  deprecated?: boolean;
  hidden?: boolean;
  /** Derived from the flags above; never written in the table. */
  activeRoutePolicy?: ActiveRoutePolicy;
  /** Derived: true exactly when `ownedGateFiles` is non-empty. */
  ownsGates?: boolean;
  risk: CommandRiskLite;
  latency: CommandLatencyLite;
  supportsJson: boolean;
  remoteAllowed: boolean;
  inputProfile: CommandInputProfileLite;
  requiredCapabilities: readonly string[];
}

type CommandManifestLiteSourceEntry = Omit<CommandManifestLiteEntry,
  'risk' | 'latency' | 'supportsJson' | 'remoteAllowed' | 'inputProfile' | 'requiredCapabilities'
  | 'activeRoutePolicy' | 'ownsGates' | 'usage' | 'description'>;

export type CommandContractMetadataLite = Pick<CommandManifestLiteEntry,
  'risk' | 'latency' | 'supportsJson' | 'remoteAllowed' | 'inputProfile' | 'requiredCapabilities'>;

const COMMAND_MANIFEST_LITE_BASE = [
  { name: 'help', summary: 'Show SKS help', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'version', summary: 'Show SKS version', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'commands', summary: 'List SKS commands', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'triwiki', summary: 'Inspect TriWiki index, affected graph, and proof bank', maturity: 'stable', skipMigrationGate: true },
  { name: 'plan', summary: 'Write a planning-only SKS plan artifact without code edits', maturity: 'stable' },
  { name: 'status', summary: 'Show concise active mission and trust status', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'review', summary: 'Review a git diff with machine evidence first', maturity: 'stable', allowedDuringActiveRoute: true },
  { name: 'root', summary: 'Show active SKS root', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'install', summary: 'Install the exact packaged SKS version globally and verify the resolved CLI', maturity: 'stable', skipMigrationGate: true },
  { name: 'update', summary: 'Inspect, review, apply, or roll back the global SKS update', maturity: 'stable', skipMigrationGate: true },
  { name: 'uninstall', summary: 'Uninstall SKS global skills, hooks, config, menu bar, and optional project residue', maturity: 'stable', skipMigrationGate: true, allowedDuringActiveRoute: true },
  { name: 'update-check', summary: 'Show the shared SKS, Codex CLI, and Menu Bar update status', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'config', summary: 'Adopt project Codex config into SKS management', maturity: 'stable', skipMigrationGate: true },
  { name: 'mcp', summary: 'Manage scoped Codex MCP configuration', maturity: 'beta', skipMigrationGate: true },
  { name: 'usage', summary: 'Show focused usage topic', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'quickstart', summary: 'Show quickstart flow', maturity: 'stable' },
  { name: 'setup', summary: 'Initialize SKS state', maturity: 'stable', skipMigrationGate: true },
  { name: 'bootstrap', summary: 'Initialize SKS project files', maturity: 'stable', skipMigrationGate: true },
  { name: 'init', summary: 'Initialize local control surface', maturity: 'stable' },
  { name: 'deps', summary: 'Check local dependencies', maturity: 'stable' },
  { name: 'fix-path', summary: 'Repair hook command paths', maturity: 'stable' },
  { name: 'doctor', summary: 'Check and repair SKS install', maturity: 'stable', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'git', summary: 'Inspect and enforce SKS git collaboration hygiene', maturity: 'beta' },
  { name: 'paths', summary: 'Inspect SKS managed paths', maturity: 'beta', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'postinstall', summary: 'Restore package state; bootstrap only with explicit opt-in', maturity: 'stable', skipMigrationGate: true },
  { name: 'codex', summary: 'Check Codex CLI compatibility and vendored hook schemas', maturity: 'beta', skipMigrationGate: true },
  { name: 'codex-app', summary: 'Check Codex App readiness', maturity: 'beta', skipMigrationGate: true },
  { name: 'codex-native', summary: 'Inspect Codex Native broker and routing readiness', maturity: 'beta' },
  { name: 'bridge', summary: 'Manage the single Desktop Bridge runtime, provider profiles, catalog, and routes', maturity: 'beta', skipMigrationGate: true },
  { name: 'menubar', summary: 'Inspect/install/restart/uninstall SKS menu bar', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'remote', summary: 'Inspect official Remote readiness and run the proof-aware SSH stdio worker', maturity: 'beta' },
  { name: 'hooks', summary: 'Explain and inspect Codex hooks', maturity: 'beta', skipMigrationGate: true },
  { name: 'mad-sks', summary: 'MAD-SKS scoped permission modifier + SQL-plane execution', maturity: 'beta', mutatesRouteState: true, ownedGateFiles: ['mad-sks-gate.json'] },
  { name: 'auto-review', summary: 'Manage auto-review profile', maturity: 'beta' },
  { name: 'dollar-commands', summary: 'List Codex App dollar commands', maturity: 'stable', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'fast-mode', summary: 'Toggle SKS Fast mode default for dollar-command routes', maturity: 'stable', skipMigrationGate: true },
  { name: 'commit', summary: 'Create a simple git commit', maturity: 'stable' },
  { name: 'commit-and-push', summary: 'Create a simple git commit and push', maturity: 'stable' },
  { name: 'dfix', summary: 'Run DFix diagnose/plan/patch/verify loop', maturity: 'stable', mutatesRouteState: true, ownedGateFiles: ['dfix-gate.json'] },
  { name: 'naruto', summary: 'Run the $sks-naruto Codex official subagent workflow', maturity: 'labs', mutatesRouteState: true, ownedGateFiles: ['naruto-gate.json', 'stop-gate.json'] },
  { name: 'route', summary: 'Inspect or close active route state', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'qa-loop', summary: 'Run QA loop missions', maturity: 'beta', mutatesRouteState: true, ownedGateFiles: ['qa-gate.json'] },
  { name: 'research', summary: 'Run research missions', maturity: 'labs', mutatesRouteState: true, ownedGateFiles: ['research-gate.json'] },
  { name: 'autoresearch', summary: 'Alias for research/autoresearch route', maturity: 'labs', mutatesRouteState: true, ownedGateFiles: ['research-gate.json'] },
  { name: 'ppt', summary: 'Inspect/build PPT artifacts', maturity: 'labs', mutatesRouteState: true, ownedGateFiles: ['ppt-gate.json'] },
  { name: 'image-ux-review', summary: 'Inspect image UX artifacts', maturity: 'labs', mutatesRouteState: true, ownedGateFiles: ['image-ux-review-gate.json'] },
  { name: 'computer-use', summary: 'Record native Mac/non-web Computer Use visual evidence', maturity: 'beta', mutatesRouteState: true, ownedGateFiles: ['computer-use-gate.json'] },
  { name: 'context7', summary: 'Context7 checks and docs', maturity: 'beta' },
  { name: 'super-search', summary: 'Run Super-Search provider-independent source intelligence', maturity: 'beta' },
  { name: 'search', summary: 'Local files/text/structure/symbol/context search engines', maturity: 'beta', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'recallpulse', summary: 'RecallPulse evidence route', maturity: 'labs' },
  { name: 'pipeline', summary: 'Inspect pipeline missions and seal a paused route\'s answers', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'guard', summary: 'Check harness guard', maturity: 'beta' },
  { name: 'conflicts', summary: 'Check harness conflicts', maturity: 'beta' },
  { name: 'reasoning', summary: 'Show reasoning route', maturity: 'labs' },
  { name: 'aliases', summary: 'Show command aliases', maturity: 'stable' },
  { name: 'cleanup', summary: 'Permanently blank active TriWiki without retaining a previous generation', maturity: 'beta' },
  { name: 'align', summary: 'Create or replace TriWiki as a code-only repository navigation graph', maturity: 'beta', mutatesRouteState: true, ownedGateFiles: ['align-gate.json'] },
  { name: 'selftest', summary: 'Run local mock selftest', maturity: 'stable' },
  { name: 'goal', summary: 'Print stateless Codex native Goal controls', maturity: 'beta' },
  { name: 'seo-geo-optimizer', summary: 'Run unified SEO/GEO optimizer audit/plan/apply/verify plus research/strategy (--include-marketing) on the search-visibility kernel', maturity: 'beta' },
  { name: 'hook', summary: 'Codex hook entrypoint', maturity: 'beta', skipMigrationGate: true },
  { name: 'proof', summary: 'Show and validate completion proof and the evidence behind it: route trust, stop gate, mission artifacts, H-Proof, proof field', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'wrongness', summary: 'Record and inspect TriWiki wrongness negative evidence', maturity: 'beta' },
  { name: 'skill-dream', summary: 'Track skill dream counters', maturity: 'labs' },
  { name: 'code-structure', summary: 'Scan source structure', maturity: 'labs' },
  { name: 'gx', summary: 'Render/validate GX cartridges', maturity: 'labs' },
  { name: 'eval', summary: 'Run eval reports', maturity: 'labs' },
  { name: 'wiki', summary: 'Manage TriWiki and image voxel ledgers', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'memory', summary: 'Project TriWiki memory into managed AGENTS.md blocks or run memory GC', maturity: 'beta' },
  { name: 'gc', summary: 'Compact/prune runtime state', maturity: 'labs', skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'stats', summary: 'Show storage stats', maturity: 'labs', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'mcp-server', summary: 'Run a stdio MCP server exposing SKS commands as tools for MCP-capable agent hosts', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true },
  { name: 'agent-bridge', summary: 'Register SKS tools or run read-only tools with native Astra async calling', maturity: 'beta', readonly: true, skipMigrationGate: true, allowedDuringActiveRoute: true, diagnostic: true },
  { name: 'decision', summary: 'Manage optional Jev decisions through OpenRouter: status, enable, disable, probe, evaluate', maturity: 'labs', skipMigrationGate: true, allowedDuringActiveRoute: true },
  { name: 'imagegen', summary: 'Generate images with the active SKS image mode (Codex default or a custom OpenRouter model): status, models, enable, disable, generate', maturity: 'beta', skipMigrationGate: true, allowedDuringActiveRoute: true }
] as const satisfies readonly CommandManifestLiteSourceEntry[];

export type CommandNameLite = typeof COMMAND_MANIFEST_LITE_BASE[number]['name'];

const SAFE_COMMAND_CONTRACT_LITE: CommandContractMetadataLite = {
  risk: 'R2',
  latency: 'normal',
  supportsJson: false,
  remoteAllowed: false,
    inputProfile: 'none',
  requiredCapabilities: []
};

const COMMAND_CONTRACT_OVERRIDES_LITE = {
  align: { latency: 'long', supportsJson: true, inputProfile: 'json-only' },
  decision: { risk: 'R2', latency: 'long', supportsJson: true, remoteAllowed: false, inputProfile: 'json-only' },
  imagegen: { risk: 'R2', latency: 'long', supportsJson: true, remoteAllowed: false, inputProfile: 'json-only' },
  cleanup: { risk: 'R3', latency: 'long', supportsJson: true, remoteAllowed: false, inputProfile: 'json-only' },
  autoresearch: { latency: 'long' },
  bridge: { risk: 'R3', latency: 'long', supportsJson: true, remoteAllowed: false, inputProfile: 'json-only' },
  'commit-and-push': { risk: 'R3' },
  'computer-use': { latency: 'long' },
  config: { risk: 'R2', supportsJson: true, remoteAllowed: false, inputProfile: 'json-only' },
  dfix: { latency: 'long' },
  eval: { latency: 'long' },
  'image-ux-review': { latency: 'long' },
  install: { risk: 'R2', latency: 'long' },
  'mad-sks': { risk: 'R3', latency: 'long' },
  mcp: { risk: 'R2', latency: 'long', supportsJson: true, inputProfile: 'json-only' },
  naruto: {
    risk: 'R2', latency: 'long', supportsJson: true, remoteAllowed: false,     inputProfile: 'naruto'
  },
  paths: {
    supportsJson: true, remoteAllowed: true, inputProfile: 'paths',
    requiredCapabilities: ['project.fs.read']
  },
  pipeline: {
    risk: 'R2', latency: 'normal', supportsJson: true, remoteAllowed: true, inputProfile: 'pipeline-status',
    requiredCapabilities: ['proof.pipeline']
  },
  postinstall: { latency: 'long' },
  ppt: { latency: 'long' },
  proof: {
    risk: 'R0', latency: 'fast', supportsJson: true, remoteAllowed: true,     inputProfile: 'proof', requiredCapabilities: ['proof.read', 'proof.trust', 'proof.stop-gate']
  },
  'qa-loop': { latency: 'long' },
  recallpulse: { latency: 'long' },
  remote: { risk: 'R2', latency: 'long', supportsJson: true, remoteAllowed: false, inputProfile: 'json-only' },
  research: { latency: 'long' },
  review: { risk: 'R1' },
  search: { risk: 'R0', latency: 'normal', supportsJson: true, remoteAllowed: true, inputProfile: 'json-only' },
  stats: {
    supportsJson: true, remoteAllowed: true, inputProfile: 'stats',
    requiredCapabilities: ['project.fs.read']
  },
  status: {
    supportsJson: true, remoteAllowed: true, inputProfile: 'json-only',
    requiredCapabilities: ['proof.read']
  },
  uninstall: { risk: 'R3', latency: 'long' },
  update: { latency: 'long' },
  'update-check': {
    supportsJson: true, remoteAllowed: true, inputProfile: 'json-only',
    requiredCapabilities: ['network.npm.read']
  },
} as const satisfies Partial<Record<CommandNameLite, Partial<CommandContractMetadataLite>>>;

const COMMAND_HELP_LITE = {
  help: {
    usage: 'sks help [topic]',
    description: 'Show CLI help or focused help for a topic.'
  },
  version: {
    usage: 'sks version | sks --version',
    description: 'Print the installed Sneakoscope Codex version.'
  },
  'update-check': {
    usage: 'sks update-check [--json]',
    description: 'Refresh the shared update-status.v3 snapshot.'
  },
  mcp: {
    usage: 'sks mcp config list|get|add|edit|duplicate|enable|disable|remove|test|login|logout|backups|restore [--scope global|project|effective] [--stdin-json] [--json]',
    description: 'Manage global/project MCP configuration through the shared guarded MCP Config Domain v2.'
  },
  commands: {
    usage: 'sks commands [--json]',
    description: 'List every user-facing command with a short description.'
  },
  triwiki: {
    usage: 'sks triwiki index|affected|proof-bank|graph-status|graph-lint|graph-query|atlas-status|atlas-lint|atlas-list|atlas-show|atlas-why [--json]',
    description: 'Inspect TriWiki module cards, gate impact maps, affected graphs, proof bank status, and Architecture Map views.'
  },
  plan: {
    usage: 'sks plan "task" [--json]',
    description: 'Write a planning-only artifact under .sneakoscope/plans without editing code.'
  },
  status: {
    usage: 'sks status [--json]',
    description: 'Show the active mission, route, phase, proof, trust, official-subagent evidence, image voxel, DB safety, and next action.'
  },
  review: {
    usage: 'sks review [--staged|--diff <ref>] [--fix] [--json]',
    description: 'Review a diff with machine-evidence findings sorted above LLM review notes.'
  },
  usage: {
    usage: `sks usage [${USAGE_TOPICS}]`,
    description: 'Print copy-ready workflows for common tasks.'
  },
  quickstart: {
    usage: 'sks quickstart',
    description: 'Show the shortest safe setup and verification flow.'
  },
  bootstrap: {
    usage: 'sks bootstrap [--install-scope global|project] [--local-only] [--json]',
    description: 'Initialize the current project, install SKS Codex App files/skills, check Context7/Codex App/Codex CLI, and print ready true/false.'
  },
  root: {
    usage: 'sks root [--json]',
    description: 'Show whether SKS is using a project root or the per-user global SKS runtime root.'
  },
  update: {
    usage: 'sks update status|check|review|now|rollback [--refresh] [--version <version>] [--json] [--dry-run]',
    description: 'Inspect update-status.v3, review the exact staged operation, update the global package, or run guarded rollback.'
  },
  uninstall: {
    usage: 'sks uninstall [--dry-run] [--yes] [--keep-config] [--keep-data] [--purge-projects] [--json]',
    description: 'Remove SKS global skills, hooks, menu bar, state, temp files, and optional project residue while preserving user-owned content by default.'
  },
  deps: {
    usage: 'sks deps check [--json] [--yes]',
    description: 'Check Node/npm and Codex CLI readiness; pass --yes to repair missing Codex CLI tooling when supported.'
  },
  codex: {
    usage: 'sks codex compatibility|version|update-status [--refresh]|update|doctor|schema|current [--json]',
    description: 'Check Codex CLI compatibility/version/update status, run the official `codex update`, and inspect current manifest, capability, and hook-schema evidence.'
  },
  'codex-app': {
    usage: 'sks codex-app [check|status|restart|context-management [status|on|off]|context-1m [status|on|off]|product-design|chrome-extension|pat status|remote-control]',
    description: 'Check Codex App integration, Desktop Bridge readiness, Product Design plugin readiness, Codex Chrome Extension web verification readiness, PAT-safe status, first-party MCP/plugin readiness, Codex CLI remote-control availability, and the opt-in Codex 1M context window toggle (each model gets its largest supported window) with automatic Codex restart. Provider routing is managed only by sks bridge.'
  },
  'codex-native': {
    usage: 'sks codex-native status|feature-broker|invocation-plan|init-deep [--json]',
    description: 'Inspect Codex Native feature broker readiness, invocation routing, and managed memory setup.'
  },
  hooks: {
    usage: 'sks hooks explain|status|trust-report|replay|codex-validate|warning-check ... [--json]',
    description: 'Explain Codex hook events, validate current vendored event output schemas, replay fixtures, and enforce warning-zero SKS hook policies.'
  },
  remote: {
    usage: 'sks remote readiness|machines|worker ... [--json]',
    description: 'Inspect official Codex Remote readiness and the allowlisted proof-aware SSH stdio worker surface.'
  },
  'mad-sks': {
    usage: 'sks mad-sks plan|run|apply|sql|apply-migration|status|close|rollback-apply ... | sks --mad [--high]',
    description: 'Open or inspect MAD-SKS scoped permission workflows, merged SQL-plane execution, and the native Codex permission launcher.'
  },
  'auto-review': {
    usage: 'sks auto-review status|enable|start [--high] | sks --Auto-review --high',
    description: 'Enable Codex automatic approval review and launch the native Codex session with the auto-review profile.'
  },
  'dollar-commands': {
    usage: 'sks dollar-commands [--json]',
    description: 'List Codex App $ commands such as $sks-dfix and $sks-naruto.'
  },
  'fast-mode': {
    usage: 'sks fast-mode on|off|status|clear [--project] [--json]',
    description: 'Toggle the global Codex Desktop Fast (service tier) default used by $sks-fast-on/$sks-fast-off and keep project worker preference in sync; pass --project for project-local only.'
  },
  commit: {
    usage: 'sks commit [--message "msg"] [--json]',
    description: 'Stage current changes, summarize them, and create a simple git commit without the full SKS pipeline.'
  },
  'commit-and-push': {
    usage: 'sks commit-and-push [--message "msg"] [--json]',
    description: 'Stage current changes, create a simple git commit, and push without the full SKS pipeline.'
  },
  dfix: {
    usage: 'sks dfix',
    description: 'Explain $sks-dfix ultralight direct-fix mode.'
  },
  'qa-loop': {
    usage: 'sks qa-loop prepare|answer|run|status ...',
    description: 'Dogfood UI/API as human proxy with safety gates, safe fixes, rechecks, Codex Chrome Extension-first web UI evidence, report.'
  },
  ppt: {
    usage: 'sks ppt build|status <mission-id|latest> [--json]',
    description: 'Build or inspect $sks-ppt HTML/PDF artifacts from a sealed presentation decision contract.'
  },
  'image-ux-review': {
    usage: 'sks ux-review run --image <path> --fix --json | sks image-ux-review status <mission-id|latest> [--json]',
    description: 'Run or inspect $sks-image-ux-review imagegen annotated UI/UX review artifacts, issue ledgers, safe fix loops, recapture, and proof gates.'
  },
  'computer-use': {
    usage: 'sks computer-use import|status|smoke|require ... [--json]',
    description: 'Record native Mac/non-web Computer Use visual evidence while keeping web verification on the Chrome Extension path.'
  },
  context7: {
    usage: 'sks context7 check|setup|tools|resolve|docs|evidence ...',
    description: 'Check, configure, and call the local Context7 MCP requirement.'
  },
  'super-search': {
    usage: 'sks super-search doctor|run|x|fetch|status|inspect|sources|claims|cache|bench',
    description: 'Run Super-Search provider-independent source intelligence.'
  },
  search: {
    usage: 'sks search status|files|text|structure|symbol|context|benchmark|doctor [--json]',
    description: 'Local SearchProvider engines for files/text/structure/symbol/context (no required rg/ast-grep/fd).'
  },
  recallpulse: {
    usage: 'sks recallpulse run|status|eval|governance|checklist <mission-id|latest>',
    description: 'Run report-only RecallPulse active recall, durable status, proof capsule, evidence envelope, and governance checks.'
  },
  pipeline: {
    usage: 'sks pipeline status|resume|plan|answer ...',
    description: 'Inspect the active skill-first route, materialized execution plan, ambiguity gates, and completion gates.'
  },
  guard: {
    usage: 'sks guard check [--json]',
    description: 'Check SKS harness self-protection lock, fingerprints, and source-repo exception state.'
  },
  conflicts: {
    usage: 'sks conflicts check|prompt|cleanup --yes [--json]',
    description: 'Detect other Codex harnesses such as OMX/DCodex, print a cleanup prompt, or quarantine them automatically.'
  },
  aliases: {
    usage: 'sks aliases',
    description: 'Show command aliases and npm binary names.'
  },
  cleanup: {
    usage: 'sks cleanup plan|run|status|proof [--apply] [--json]',
    description: 'Permanently blank active TriWiki without retaining a previous generation; preserve source and audit history.'
  },
  align: {
    usage: 'sks align prepare|run|status|proof [mission|"scope"] [--json]',
    description: 'Create or replace TriWiki as a code-only repository navigation graph with exact file/symbol/line coordinates and transactional publication.'
  },
  setup: {
    usage: 'sks setup [--bootstrap] [--install-scope global|project] [--local-only] [--force] [--json]',
    description: 'Initialize SKS state, Codex App files, hooks, skills, and rules.'
  },
  'fix-path': {
    usage: 'sks fix-path [--install-scope global|project] [--json]',
    description: 'Refresh hook commands with the resolved SKS binary path.'
  },
  doctor: {
    usage: 'sks doctor [--fix] [--local-only] [--json] [--install-scope global|project]',
    description: 'Check and repair SKS generated files, while blocking setup if another Codex harness is detected.'
  },
  git: {
    usage: 'sks git policy|install|status|doctor|precommit|publish-plan|summary [--json]',
    description: 'Install and validate SKS git hygiene, merge-friendly shared TriWiki shards, ignored runtime state, and precommit checks.'
  },
  paths: {
    usage: 'sks paths managed [--json]',
    description: 'List SKS-owned managed paths and rollback eligibility.'
  },
  init: {
    usage: 'sks init [--force] [--local-only] [--install-scope global|project]',
    description: 'Initialize the local SKS control surface.'
  },
  selftest: {
    usage: 'sks selftest [--mock]',
    description: 'Run local smoke tests without calling a model.'
  },
  goal: {
    usage: 'sks goal create|edit|pause|resume|clear|status ...',
    description: 'Print a detailed Codex native /goal command without creating SKS Goal state.'
  },
  'seo-geo-optimizer': {
    usage: 'sks seo-geo-optimizer [seo|geo] doctor|audit|research|strategy|plan|apply|verify|status|rollback|fixture [mission|latest] [--mode seo|geo] [--target auto|website|docs|package] [--include-marketing] [--json]',
    description: 'Run the unified SEO/GEO optimizer on the shared search-visibility kernel with mode-specific gates, marketing research/strategy, safe apply, and proof.'
  },
  research: {
    usage: 'sks research prepare|run|status ...',
    description: 'Run evidence-bound research missions with layered sources, independent review, paper, novelty, and falsification checks.'
  },
  proof: {
    usage: 'sks proof show|latest|validate|export|smoke|trust report|validate|status|explain [latest|mission-id]|artifacts [mission-id|latest] [--required a,b]|stop-gate [check] [--route r] [--mission id]|hproof check [mission-id|latest]|field scan [--intent "task"] [--json|--md]',
    description: 'Show, validate, export, or smoke-write the unified Completion Proof Engine surface, and run the evidence checks behind it: route trust-kernel validation, stop-gate resolution, schema-backed mission artifacts, the H-Proof done gate, and Potential Proof Field cones.'
  },
  eval: {
    usage: 'sks eval run|compare|thresholds ...',
    description: 'Run deterministic context-quality and performance evidence checks.'
  },
  wrongness: {
    usage: 'sks wrongness list|show|add|resolve|summarize|validate|context|rules ...',
    description: 'Record, retrieve, and validate TriWiki wrongness memory: negative evidence, failed assumptions, stale proof, visual/DB/hook mismatches, and avoidance rules.'
  },
  'skill-dream': {
    usage: 'sks skill-dream status|run|record [--json]',
    description: 'Track generated-skill usage in lightweight JSON and periodically report keep, merge, prune, and improvement candidates without deleting skills automatically.'
  },
  'code-structure': {
    usage: 'sks code-structure scan [--json]',
    description: 'Scan handwritten source files for 1000/2000/3000-line structure gates and split-review exceptions.'
  },
  wiki: {
    usage: 'sks wiki coords|pack|refresh|publish|rebuild-index|validate|validate-shared|wrongness ...',
    description: 'Build, refresh, publish shared shards, rebuild ignored indexes, validate, and attach wrongness-memory context to RGBA/trig LLM Wiki packs with attention.use_first and attention.hydrate_first for compact recall plus source hydration.'
  },
  memory: {
    usage: 'sks memory build [--json] | sks memory gc [--dry-run]',
    description: 'Project TriWiki context-pack memory into managed AGENTS.md blocks or run bounded memory cleanup.'
  },
  naruto: {
    usage: 'sks naruto run "task" [--agents N] [--max-threads N] [--trusted-project] [--json] | sks naruto status|subagents|proof [latest|M-...] [--json] | sks naruto parent-summary --mission M-... --stdin [--json]',
    description: 'Run or inspect the Codex official subagent workflow: an orchestrating parent (latest deep-tier standalone default), children on the newest model of their tier (Jev picks the tier on spawn when Jev mode is on), max_depth=1, and structured parent-thread completion evidence.'
  },
  reasoning: {
    usage: 'sks reasoning ["prompt"] [--json]',
    description: 'Show SKS temporary reasoning-effort routing: medium for simple tasks, high for logic, xhigh for research.'
  },
  gx: {
    usage: 'sks gx init|render|validate|drift|snapshot [name]',
    description: 'Create and verify deterministic SVG/HTML visual context cartridges.'
  },
  gc: {
    usage: 'sks gc [--dry-run] [--json]',
    description: 'Compact oversized logs and prune stale runtime artifacts.'
  },
  stats: {
    usage: 'sks stats [--full] [--json]',
    description: 'Show package and .sneakoscope storage size.'
  },
  'mcp-server': {
    usage: 'sks mcp-server [--expose-exec] [--probe]',
    description: 'Run a modern stateless stdio MCP server exposing SKS read-only commands as tools for any MCP-capable agent host; --expose-exec also exposes non-read-only commands; --probe round-trips server/discover and tools/list, then exits.'
  },
  'agent-bridge': {
    usage: 'sks agent-bridge setup [--trusted-project] [--json] | async --prompt "task" [--tools status,stats] [--json]',
    description: 'Publish the agent-bridge manifest or run selected read-only SKS tools with native Astra Async tool calling through the registered Codex-LB bridge.'
  },
  decision: {
    usage: 'sks decision status|enable|disable|probe|evaluate [--json]',
    description: 'Manage optional Jev decisions through the existing OpenRouter credential (off by default). Enable records cloud consent; a valid answer is compiled into SKS plan or context selection. There is no advisory mode and no local model runtime.'
  },
  imagegen: {
    usage: 'sks imagegen status|models|enable --model <id>|disable|generate --prompt <text> --out <file> [--reference <file>] [--json]',
    description: 'Generate images with the active SKS image mode. Off (default): Codex image generation, no pinned model. On: the OpenRouter image model chosen in SKS Control Center, called through the SKS Desktop Bridge. With Jev on, Jev picks the aspect ratio and quality you leave open. Each image gets a .sks-imagegen.json evidence file.'
  }
} as const satisfies Partial<Record<CommandNameLite, { usage: string; description: string }>>;

function derivedRouteFields(entry: CommandManifestLiteSourceEntry): Pick<CommandManifestLiteEntry, 'activeRoutePolicy' | 'ownsGates'> {
  const activeRoutePolicy: ActiveRoutePolicy | undefined = entry.mutatesRouteState ? 'blocked-while-active'
    : entry.readonly ? 'always'
      : entry.diagnostic ? 'diagnostic-only'
        : entry.allowedDuringActiveRoute ? 'always'
          : undefined;
  return {
    ...(activeRoutePolicy ? { activeRoutePolicy } : {}),
    ...((entry.ownedGateFiles?.length ?? 0) > 0 ? { ownsGates: true } : {})
  };
}

export const COMMAND_MANIFEST_LITE = COMMAND_MANIFEST_LITE_BASE.map((entry: CommandManifestLiteSourceEntry) => ({
  ...SAFE_COMMAND_CONTRACT_LITE,
  ...(entry.readonly === true ? { risk: 'R0' as const, latency: 'fast' as const } : {}),
  ...entry,
  ...derivedRouteFields(entry),
  ...(COMMAND_HELP_LITE[entry.name as keyof typeof COMMAND_HELP_LITE] || {}),
  ...(COMMAND_CONTRACT_OVERRIDES_LITE[entry.name as keyof typeof COMMAND_CONTRACT_OVERRIDES_LITE] || {})
})) as readonly (CommandManifestLiteEntry & { name: CommandNameLite })[];

export function commandInputSchema(profile: CommandInputProfileLite): Record<string, unknown> {
  if (profile === 'json-only') return objectSchema({ json: { type: 'boolean' } });
  if (profile === 'naruto') {
    return narutoCommandInputSchema();
  }
  if (profile === 'paths') {
    return objectSchema({
      action: { type: 'string', enum: ['managed', 'git-policy'] },
      json: { type: 'boolean' }
    });
  }
  if (profile === 'pipeline-status') {
    return objectSchema({
      action: { type: 'string', enum: ['status'] },
      json: { type: 'boolean' }
    });
  }
  if (profile === 'stats') return objectSchema({ full: { type: 'boolean' }, json: { type: 'boolean' } });
  if (profile === 'proof') {
    return objectSchema({
      action: { type: 'string', enum: ['show', 'latest', 'validate', 'route', 'trust', 'stop-gate'] },
      mission: boundedString(1, 160),
      completion: { type: 'boolean' },
      trust_action: { type: 'string', enum: ['report', 'status', 'explain'] },
      route: boundedString(1, 80),
      gate: boundedString(1, 1024),
      json: { type: 'boolean' }
    });
  }
  return objectSchema({});
}

function objectSchema(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'object', properties, additionalProperties: false };
}

function boundedString(minLength: number, maxLength: number): Record<string, unknown> {
  return { type: 'string', minLength, maxLength };
}

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
