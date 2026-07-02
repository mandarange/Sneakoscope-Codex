export type CommandRun = (command: string, args: string[]) => Promise<unknown> | unknown;
export type ArgsRun = (args: string[]) => Promise<unknown> | unknown;
export type SubcommandRun = (subcommand: string, args: string[]) => Promise<unknown> | unknown;
export type CommandArgsRun = (command: string, args: string[]) => Promise<unknown> | unknown;

export interface CommandModule {
  run: CommandRun;
}

export interface CommandEntry {
  maturity: 'stable' | 'beta' | 'labs';
  summary: string;
  lazy: () => Promise<CommandModule>;
  packageRequiredFiles: readonly string[];
  skipMigrationGate?: boolean;
  readonly?: boolean;
  diagnostic?: boolean;
  allowedDuringActiveRoute?: boolean;
  activeRoutePolicy?: 'always' | 'diagnostic-only' | 'blocked-while-active';
  mutatesRouteState?: boolean;
  ownsGates?: boolean;
  ownedGateFiles?: readonly string[];
}

type CommandCallable = (...args: unknown[]) => Promise<unknown> | unknown;

/** Loaded ESM modules are unknown at the boundary; narrow before calling exports. */
export function hasFunctionExport<K extends string>(
  mod: unknown,
  exportName: K
): mod is Record<K, CommandCallable> {
  if (!mod || typeof mod !== 'object') return false;
  const v = (mod as Record<string, unknown>)[exportName];
  return typeof v === 'function';
}

function functionExport<T>(mod: unknown, exportName: string): T {
  if (!hasFunctionExport(mod, exportName)) throw new Error(`Missing export ${exportName}`);
  return mod[exportName] as T;
}

/** Pick runner from default export object shape used by legacy command files. */
function pickRunner(mod: Record<string, unknown>): CommandCallable | null {
  for (const k of ['run', 'main', 'default'] as const) {
    const v = mod[k];
    if (typeof v === 'function') return v as CommandCallable;
  }
  return null;
}

function normalizeCommandModule(moduleValue: unknown, _packageRequiredFile: string): CommandModule {
  if (!moduleValue || typeof moduleValue !== 'object')
    throw new Error('Invalid command module');

  const rec = moduleValue as Record<string, unknown>;
  const runner = pickRunner(rec);
  if (!runner)
    throw new Error('Command module must export run/main/default callable');

  return {
    run: async (command: string, args: string[]) => runner(command, args) as unknown,
  } satisfies CommandModule;
}

export function directCommand<T extends { run?: CommandRun; main?: CommandRun; default?: CommandRun }>(
  loader: () => Promise<T>,
  packageRequiredFile: string
): () => Promise<CommandModule> {
  return async () => normalizeCommandModule(await loader(), packageRequiredFile);
}

export function argsCommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K,
  packageRequiredFile: string
): () => Promise<CommandModule> {
  return async () => {
    const mod = await loader();
    const fn = functionExport<ArgsRun>(mod, exportName);
    return { run: (_command: string, args: string[]) => fn(args) as unknown };
  };
}

function noArgsCommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K,
  packageRequiredFile: string
): () => Promise<CommandModule> {
  return async () => {
    const mod = await loader();
    const fn = functionExport<() => Promise<unknown> | unknown>(mod, exportName);
    return { run: () => fn() as unknown };
  };
}

function commandArgsCommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K,
  packageRequiredFile: string
): () => Promise<CommandModule> {
  return async () => {
    const mod = await loader();
    const fn = functionExport<CommandArgsRun>(mod, exportName);
    return { run: (command: string, args: string[]) => fn(command, args) as unknown };
  };
}

function subcommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K,
  packageRequiredFile: string,
  fallbackSubcommand?: string
): () => Promise<CommandModule> {
  return async () => {
    const mod = await loader();
    const fn = functionExport<SubcommandRun>(mod, exportName);
    return {
      run: (_command: string, args: string[]) => {
        const [subcommandName = fallbackSubcommand, ...rest] = args;
        return fn(subcommandName ?? '', rest) as unknown;
      },
    };
  };
}

function entry(
  maturity: CommandEntry['maturity'],
  summary: string,
  packageRequiredFile: string,
  lazy: () => Promise<CommandModule>,
  contract: Partial<Omit<CommandEntry, 'maturity' | 'summary' | 'lazy' | 'packageRequiredFiles'>> = {}
): CommandEntry {
  return { maturity, summary, packageRequiredFiles: [packageRequiredFile], lazy, ...contract };
}

function skipMigrationGate(command: CommandEntry): CommandEntry {
  return { ...command, skipMigrationGate: true };
}

function readOnly(command: CommandEntry): CommandEntry {
  return { ...command, readonly: true, diagnostic: true, allowedDuringActiveRoute: true, activeRoutePolicy: 'always', skipMigrationGate: true };
}

function activeRouteDiagnostic(command: CommandEntry): CommandEntry {
  return { ...command, diagnostic: true, allowedDuringActiveRoute: true, activeRoutePolicy: 'diagnostic-only', skipMigrationGate: true };
}

function routeStateMutator(command: CommandEntry, ownedGateFiles: readonly string[] = []): CommandEntry {
  return { ...command, mutatesRouteState: true, ownsGates: true, activeRoutePolicy: 'blocked-while-active', ownedGateFiles };
}

const basicModule = '../core/commands/basic-cli.js';
const basicArgs = (exportName: string) => argsCommand(() => import(basicModule), exportName, 'dist/core/commands/basic-cli.js');
const basicNoArgs = (exportName: string) => noArgsCommand(() => import(basicModule), exportName, 'dist/core/commands/basic-cli.js');
const gcArgs = (exportName: 'gcCommand' | 'statsCommand' | 'memoryCommand') =>
  argsCommand(() => import('../core/commands/gc-command.js'), exportName, 'dist/core/commands/gc-command.js');

export const COMMANDS = {
  help: readOnly(entry('stable', 'Show SKS help', 'dist/commands/help.js', directCommand(() => import('../commands/help.js'), 'dist/commands/help.js'))),
  version: readOnly(entry('stable', 'Show SKS version', 'dist/commands/version.js', directCommand(() => import('../commands/version.js'), 'dist/commands/version.js'))),
  commands: readOnly(entry('stable', 'List SKS commands', 'dist/core/commands/basic-cli.js', basicArgs('commandsCommand'))),
  check: skipMigrationGate(entry('stable', 'Run five-minute proof-bank affected checks', 'dist/core/commands/check-command.js', argsCommand(() => import('../core/commands/check-command.js'), 'checkCommand', 'dist/core/commands/check-command.js'))),
  gates: skipMigrationGate(entry('stable', 'Run release gate DAG by gate id or preset', 'dist/core/commands/gates-command.js', argsCommand(() => import('../core/commands/gates-command.js'), 'gatesCommand', 'dist/core/commands/gates-command.js'))),
  task: skipMigrationGate(entry('stable', 'Run an SLA-bounded SKS task check', 'dist/core/commands/task-command.js', argsCommand(() => import('../core/commands/task-command.js'), 'taskCommand', 'dist/core/commands/task-command.js'))),
  release: skipMigrationGate(entry('stable', 'Run affected/full/background release gates', 'dist/core/commands/release-command.js', argsCommand(() => import('../core/commands/release-command.js'), 'releaseCommand', 'dist/core/commands/release-command.js'))),
  triwiki: skipMigrationGate(entry('stable', 'Inspect TriWiki index, affected graph, and proof bank', 'dist/core/commands/triwiki-command.js', argsCommand(() => import('../core/commands/triwiki-command.js'), 'triwikiCommand', 'dist/core/commands/triwiki-command.js'))),
  daemon: skipMigrationGate(entry('stable', 'Inspect or warm the local SKS daemon cache', 'dist/core/commands/daemon-command.js', argsCommand(() => import('../core/commands/daemon-command.js'), 'daemonCommand', 'dist/core/commands/daemon-command.js'))),
  run: entry('beta', 'Classify and execute a task through the SKS trust kernel', 'dist/core/commands/run-command.js', argsCommand(() => import('../core/commands/run-command.js'), 'runCommand', 'dist/core/commands/run-command.js')),
  status: readOnly(entry('stable', 'Show concise active mission and trust status', 'dist/core/commands/status-command.js', argsCommand(() => import('../core/commands/status-command.js'), 'statusCommand', 'dist/core/commands/status-command.js'))),
  root: readOnly(entry('stable', 'Show active SKS root', 'dist/commands/root.js', directCommand(() => import('../commands/root.js'), 'dist/commands/root.js'))),
  update: skipMigrationGate(entry('stable', 'Update the global SKS npm package', 'dist/core/commands/basic-cli.js', subcommand(() => import(basicModule), 'updateCommand', 'dist/core/commands/basic-cli.js', 'now'))),
  uninstall: entry('stable', 'Uninstall SKS global skills, hooks, config, menu bar, and optional project residue', 'dist/core/commands/uninstall-command.js', argsCommand(() => import('../core/commands/uninstall-command.js'), 'uninstallCommand', 'dist/core/commands/uninstall-command.js'), {
    skipMigrationGate: true,
    readonly: false,
    allowedDuringActiveRoute: true,
    activeRoutePolicy: 'always'
  }),
  'update-check': readOnly(entry('stable', 'Check npm package freshness', 'dist/core/commands/basic-cli.js', basicArgs('updateCheckCommand'))),
  wizard: entry('stable', 'Open setup wizard help', 'dist/core/commands/basic-cli.js', basicNoArgs('quickstartCommand')),
  usage: readOnly(entry('stable', 'Show focused usage topic', 'dist/core/commands/basic-cli.js', basicArgs('usageCommand'))),
  quickstart: entry('stable', 'Show quickstart flow', 'dist/core/commands/basic-cli.js', basicNoArgs('quickstartCommand')),
  setup: entry('stable', 'Initialize SKS state', 'dist/core/commands/basic-cli.js', basicArgs('setupCommand')),
  bootstrap: entry('stable', 'Initialize SKS project files', 'dist/core/commands/basic-cli.js', basicArgs('bootstrapCommand')),
  init: entry('stable', 'Initialize local control surface', 'dist/core/commands/basic-cli.js', basicArgs('initCommand')),
  deps: entry('stable', 'Check local dependencies', 'dist/core/commands/basic-cli.js', subcommand(() => import(basicModule), 'depsCommand', 'dist/core/commands/basic-cli.js', 'check')),
  'fix-path': entry('stable', 'Repair hook command paths', 'dist/core/commands/basic-cli.js', basicArgs('fixPathCommand')),
  doctor: activeRouteDiagnostic(entry('stable', 'Check and repair SKS install', 'dist/commands/doctor.js', directCommand(() => import('../commands/doctor.js'), 'dist/commands/doctor.js'))),
  git: entry('beta', 'Inspect and enforce SKS git collaboration hygiene', 'dist/commands/git.js', directCommand(() => import('../commands/git.js'), 'dist/commands/git.js')),
  paths: readOnly(entry('beta', 'Inspect SKS managed paths', 'dist/core/commands/paths-command.js', argsCommand(() => import('../core/commands/paths-command.js'), 'pathsCommand', 'dist/core/commands/paths-command.js'))),
  rollback: activeRouteDiagnostic(entry('beta', 'List or apply managed-path rollback actions', 'dist/core/commands/rollback-command.js', argsCommand(() => import('../core/commands/rollback-command.js'), 'rollbackCommand', 'dist/core/commands/rollback-command.js'))),
  postinstall: skipMigrationGate(entry('stable', 'Run postinstall bootstrap', 'dist/core/commands/basic-cli.js', basicArgs('postinstallCommand'))),
  codex: skipMigrationGate(entry('beta', 'Check Codex CLI compatibility and vendored hook schemas', 'dist/commands/codex.js', directCommand(() => import('../commands/codex.js'), 'dist/commands/codex.js'))),
  'codex-app': entry('beta', 'Check Codex App readiness', 'dist/commands/codex-app.js', directCommand(() => import('../commands/codex-app.js'), 'dist/commands/codex-app.js')),
  'codex-native': entry('beta', 'Inspect Codex Native broker and routing readiness', 'dist/commands/codex-native.js', directCommand(() => import('../commands/codex-native.js'), 'dist/commands/codex-native.js')),
  'codex-lb': entry('beta', 'Inspect codex-lb status and circuit health', 'dist/commands/codex-lb.js', directCommand(() => import('../commands/codex-lb.js'), 'dist/commands/codex-lb.js')),
  menubar: activeRouteDiagnostic(entry('beta', 'Inspect/install/restart/uninstall SKS menu bar', 'dist/core/commands/menubar-command.js', subcommand(() => import('../core/commands/menubar-command.js'), 'menubarCommand', 'dist/core/commands/menubar-command.js', 'status'))),
  hooks: entry('beta', 'Explain and inspect Codex hooks', 'dist/commands/hooks.js', directCommand(() => import('../commands/hooks.js'), 'dist/commands/hooks.js')),
  tmux: entry('beta', 'Show removed-runtime migration notice', 'dist/commands/tmux.js', directCommand(() => import('../commands/tmux.js'), 'dist/commands/tmux.js')),
  'zellij-lane': entry('beta', 'Render a Zellij lane frame for SKS sessions', 'dist/commands/zellij-lane.js', directCommand(() => import('../commands/zellij-lane.js'), 'dist/commands/zellij-lane.js')),
  'zellij-slot-pane': entry('beta', 'Render a compact Zellij worker slot pane', 'dist/commands/zellij-slot-pane.js', directCommand(() => import('../commands/zellij-slot-pane.js'), 'dist/commands/zellij-slot-pane.js')),
  'zellij-monitor-pane': skipMigrationGate(readOnly(entry('beta', 'Render the live Zellij MAD/Naruto monitor pane', 'dist/commands/zellij-monitor-pane.js', directCommand(() => import('../commands/zellij-monitor-pane.js'), 'dist/commands/zellij-monitor-pane.js')))),
  'zellij-viewport-pane': skipMigrationGate(readOnly(entry('beta', 'Render a dynamically bound Zellij worker viewport pane', 'dist/commands/zellij-viewport-pane.js', directCommand(() => import('../commands/zellij-viewport-pane.js'), 'dist/commands/zellij-viewport-pane.js')))),
  'zellij-slot-column-anchor': entry('beta', 'Render the compact SLOTS anchor pane for first-slot-down Zellij stacks', 'dist/commands/zellij-slot-column-anchor.js', directCommand(() => import('../commands/zellij-slot-column-anchor.js'), 'dist/commands/zellij-slot-column-anchor.js')),
  zellij: activeRouteDiagnostic(entry('beta', 'Inspect Zellij runtime status and explain repair (no auto-install)', 'dist/commands/zellij.js', directCommand(() => import('../commands/zellij.js'), 'dist/commands/zellij.js'))),
  'mad-sks': routeStateMutator(entry('beta', 'MAD-SKS scoped permission modifier', 'dist/commands/mad-sks.js', directCommand(() => import('../commands/mad-sks.js'), 'dist/commands/mad-sks.js')), ['mad-sks-gate.json']),
  glm: entry('beta', 'Run GLM 5.2 MAD mode through OpenRouter', 'dist/core/commands/glm-command.js', argsCommand(() => import('../core/commands/glm-command.js'), 'glmCommand', 'dist/core/commands/glm-command.js')),
  'mad-db': routeStateMutator(entry('beta', 'Run first-class MadDB SQL-plane execution cycles with mission-local Supabase write transport', 'dist/commands/mad-db.js', directCommand(() => import('../commands/mad-db.js'), 'dist/commands/mad-db.js')), ['mad-db-gate.json']),
  'auto-review': entry('beta', 'Manage auto-review profile', 'dist/commands/auto-review.js', directCommand(() => import('../commands/auto-review.js'), 'dist/commands/auto-review.js')),
  'dollar-commands': entry('stable', 'List Codex App dollar commands', 'dist/core/commands/basic-cli.js', basicArgs('dollarCommandsCommand')),
  'fast-mode': entry('stable', 'Toggle SKS Fast mode default for dollar-command routes', 'dist/core/commands/fast-mode-command.js', argsCommand(() => import('../core/commands/fast-mode-command.js'), 'fastModeCommand', 'dist/core/commands/fast-mode-command.js')),
  commit: entry('stable', 'Create a simple git commit', 'dist/commands/commit.js', directCommand(() => import('../commands/commit.js'), 'dist/commands/commit.js')),
  'commit-and-push': entry('stable', 'Create a simple git commit and push', 'dist/commands/commit-and-push.js', directCommand(() => import('../commands/commit-and-push.js'), 'dist/commands/commit-and-push.js')),
  dfix: routeStateMutator(entry('stable', 'Run DFix diagnose/plan/patch/verify loop', 'dist/core/commands/dfix-command.js', commandArgsCommand(() => import('../core/commands/dfix-command.js'), 'dfixCommand', 'dist/core/commands/dfix-command.js')), ['dfix-gate.json']),
  team: routeStateMutator(entry('beta', 'Deprecated alias. New execution redirects to Naruto; legacy observe/watch remains.', 'dist/core/commands/team-command.js', argsCommand(() => import('../core/commands/team-command.js'), 'team', 'dist/core/commands/team-command.js')), ['team-gate.json', 'naruto-gate.json']),
  agent: routeStateMutator(entry('beta', 'Run native multi-session agent missions', 'dist/core/commands/agent-command.js', argsCommand(() => import('../core/commands/agent-command.js'), 'agentCommand', 'dist/core/commands/agent-command.js')), ['agent-gate.json']),
  'with-local-llm': entry('beta', 'Enable or inspect local Ollama worker backend', 'dist/core/commands/local-model-command.js', argsCommand(() => import('../core/commands/local-model-command.js'), 'localModelCommand', 'dist/core/commands/local-model-command.js')),
  naruto: routeStateMutator(entry('labs', 'Run $Naruto shadow-clone swarm (up to 100 parallel sessions)', 'dist/core/commands/naruto-command.js', argsCommand(() => import('../core/commands/naruto-command.js'), 'narutoCommand', 'dist/core/commands/naruto-command.js')), ['naruto-gate.json', 'stop-gate.json']),
  'stop-gate': readOnly(entry('beta', 'Check canonical stop-gate resolution for a route/mission', 'dist/core/commands/stop-gate-command.js', commandArgsCommand(() => import('../core/commands/stop-gate-command.js'), 'stopGateCommand', 'dist/core/commands/stop-gate-command.js'))),
  route: activeRouteDiagnostic(entry('beta', 'Inspect or close active route state', 'dist/core/commands/route-command.js', subcommand(() => import('../core/commands/route-command.js'), 'routeCommand', 'dist/core/commands/route-command.js', 'status'))),
  loop: routeStateMutator(entry('labs', 'Dynamic Loop Runtime: plan/run/status/proof loop graphs.', 'dist/core/commands/loop-command.js', subcommand(() => import('../core/commands/loop-command.js'), 'loopCommand', 'dist/core/commands/loop-command.js', 'help')), ['loop-graph-proof.json']),
  'qa-loop': routeStateMutator(entry('beta', 'Run QA loop missions', 'dist/core/commands/qa-loop-command.js', subcommand(() => import('../core/commands/qa-loop-command.js'), 'qaLoopCommand', 'dist/core/commands/qa-loop-command.js')), ['qa-gate.json']),
  research: routeStateMutator(entry('labs', 'Run research missions', 'dist/core/commands/research-command.js', subcommand(() => import('../core/commands/research-command.js'), 'researchCommand', 'dist/core/commands/research-command.js')), ['research-gate.json']),
  autoresearch: routeStateMutator(entry('labs', 'Alias for research/autoresearch route', 'dist/core/commands/autoresearch-command.js', subcommand(() => import('../core/commands/autoresearch-command.js'), 'autoresearchCommand', 'dist/core/commands/autoresearch-command.js', 'status')), ['research-gate.json']),
  ppt: routeStateMutator(entry('labs', 'Inspect/build PPT artifacts', 'dist/core/commands/ppt-command.js', commandArgsCommand(() => import('../core/commands/ppt-command.js'), 'pptCommand', 'dist/core/commands/ppt-command.js')), ['ppt-gate.json']),
  'image-ux-review': routeStateMutator(entry('labs', 'Inspect image UX artifacts', 'dist/core/commands/image-ux-review-command.js', commandArgsCommand(() => import('../core/commands/image-ux-review-command.js'), 'imageUxReviewCommand', 'dist/core/commands/image-ux-review-command.js')), ['image-ux-review-gate.json']),
  'computer-use': routeStateMutator(entry('beta', 'Record native Mac/non-web Computer Use visual evidence', 'dist/core/commands/computer-use-command.js', commandArgsCommand(() => import('../core/commands/computer-use-command.js'), 'computerUseCommand', 'dist/core/commands/computer-use-command.js')), ['computer-use-gate.json']),
  context7: entry('beta', 'Context7 checks and docs', 'dist/cli/context7-command.js', subcommand(() => import('./context7-command.js'), 'context7Command', 'dist/cli/context7-command.js', 'check')),
  'insane-search': entry('beta', 'Run provider-independent InsaneSearch source intelligence', 'dist/cli/insane-search-command.js', subcommand(() => import('./insane-search-command.js'), 'insaneSearchCommand', 'dist/cli/insane-search-command.js', 'doctor')),
  'ultra-search': entry('beta', 'Compatibility alias for InsaneSearch source intelligence', 'dist/cli/insane-search-command.js', subcommand(() => import('./insane-search-command.js'), 'ultraSearchCommand', 'dist/cli/insane-search-command.js', 'doctor')),
  xai: entry('beta', 'Deprecated compatibility notice for removed xAI/Grok setup', 'dist/cli/xai-command.js', subcommand(() => import('./xai-command.js'), 'xaiCommand', 'dist/cli/xai-command.js', 'check')),
  recallpulse: entry('labs', 'RecallPulse evidence route', 'dist/commands/recallpulse.js', directCommand(() => import('../commands/recallpulse.js'), 'dist/commands/recallpulse.js')),
  pipeline: activeRouteDiagnostic(entry('beta', 'Inspect pipeline missions', 'dist/commands/pipeline.js', directCommand(() => import('../commands/pipeline.js'), 'dist/commands/pipeline.js'))),
  guard: entry('beta', 'Check harness guard', 'dist/commands/guard.js', directCommand(() => import('../commands/guard.js'), 'dist/commands/guard.js')),
  conflicts: entry('beta', 'Check harness conflicts', 'dist/commands/conflicts.js', directCommand(() => import('../commands/conflicts.js'), 'dist/commands/conflicts.js')),
  versioning: entry('stable', 'Manage release version metadata', 'dist/commands/versioning.js', directCommand(() => import('../commands/versioning.js'), 'dist/commands/versioning.js')),
  reasoning: entry('labs', 'Show reasoning route', 'dist/core/commands/basic-cli.js', basicArgs('reasoningCommand')),
  aliases: entry('stable', 'Show command aliases', 'dist/core/commands/basic-cli.js', basicNoArgs('aliasesCommand')),
  selftest: entry('stable', 'Run local mock selftest', 'dist/core/commands/basic-cli.js', basicArgs('selftestCommand')),
  goal: routeStateMutator(entry('beta', 'Manage Goal bridge workflow', 'dist/core/commands/goal-command.js', subcommand(() => import('../core/commands/goal-command.js'), 'goalCommand', 'dist/core/commands/goal-command.js')), ['goal-gate.json']),
  'seo-geo-optimizer': entry('beta', 'Run unified SEO/GEO optimizer audit/plan/apply/verify on the search-visibility kernel', 'dist/core/commands/seo-command.js', argsCommand(() => import('../core/commands/seo-command.js'), 'seoGeoOptimizerCommand', 'dist/core/commands/seo-command.js')),
  hook: entry('beta', 'Codex hook entrypoint', 'dist/commands/hook.js', directCommand(() => import('../commands/hook.js'), 'dist/commands/hook.js')),
  profile: entry('labs', 'Inspect/set profile', 'dist/commands/profile.js', directCommand(() => import('../commands/profile.js'), 'dist/commands/profile.js')),
  hproof: entry('beta', 'Evaluate H-Proof gate', 'dist/commands/hproof.js', directCommand(() => import('../commands/hproof.js'), 'dist/commands/hproof.js')),
  'validate-artifacts': entry('beta', 'Validate mission artifacts', 'dist/core/commands/validate-artifacts-command.js', argsCommand(() => import('../core/commands/validate-artifacts-command.js'), 'validateArtifactsCommand', 'dist/core/commands/validate-artifacts-command.js')),
  proof: entry('beta', 'Show and validate completion proof', 'dist/commands/proof.js', directCommand(() => import('../commands/proof.js'), 'dist/commands/proof.js')),
  trust: entry('beta', 'Report and validate route trust kernel evidence', 'dist/core/commands/trust-command.js', argsCommand(() => import('../core/commands/trust-command.js'), 'trustCommand', 'dist/core/commands/trust-command.js')),
  wrongness: entry('beta', 'Record and inspect TriWiki wrongness negative evidence', 'dist/core/commands/wrongness-command.js', argsCommand(() => import('../core/commands/wrongness-command.js'), 'wrongnessCommand', 'dist/core/commands/wrongness-command.js')),
  'proof-field': entry('beta', 'Scan proof field', 'dist/commands/proof-field.js', directCommand(() => import('../commands/proof-field.js'), 'dist/commands/proof-field.js')),
  'skill-dream': entry('labs', 'Track skill dream counters', 'dist/core/commands/skill-dream-command.js', subcommand(() => import('../core/commands/skill-dream-command.js'), 'skillDreamCommand', 'dist/core/commands/skill-dream-command.js', 'status')),
  'code-structure': entry('labs', 'Scan source structure', 'dist/core/commands/code-structure-command.js', subcommand(() => import('../core/commands/code-structure-command.js'), 'codeStructureCommand', 'dist/core/commands/code-structure-command.js', 'scan')),
  rust: entry('beta', 'Inspect optional Rust accelerator status and smoke parity', 'dist/commands/rust.js', directCommand(() => import('../commands/rust.js'), 'dist/commands/rust.js')),
  gx: entry('labs', 'Render/validate GX cartridges', 'dist/core/commands/gx-command.js', subcommand(() => import('../core/commands/gx-command.js'), 'gxCommand', 'dist/core/commands/gx-command.js', 'validate')),
  db: entry('beta', 'Inspect DB safety policy', 'dist/core/commands/db-command.js', subcommand(() => import('../core/commands/db-command.js'), 'dbCommand', 'dist/core/commands/db-command.js', 'policy')),
  eval: entry('labs', 'Run eval reports', 'dist/core/commands/eval-command.js', subcommand(() => import('../core/commands/eval-command.js'), 'evalCommand', 'dist/core/commands/eval-command.js', 'run')),
  harness: entry('labs', 'Run harness fixtures', 'dist/core/commands/harness-command.js', subcommand(() => import('../core/commands/harness-command.js'), 'harnessCommand', 'dist/core/commands/harness-command.js', 'fixture')),
  wiki: activeRouteDiagnostic(entry('beta', 'Manage TriWiki and image voxel ledgers', 'dist/commands/wiki.js', directCommand(() => import('../commands/wiki.js'), 'dist/commands/wiki.js'))),
  gc: activeRouteDiagnostic(entry('labs', 'Compact/prune runtime state', 'dist/core/commands/gc-command.js', gcArgs('gcCommand'))),
  stats: readOnly(entry('labs', 'Show storage stats', 'dist/core/commands/gc-command.js', gcArgs('statsCommand'))),
  features: entry('beta', 'Validate feature registry', 'dist/commands/features.js', directCommand(() => import('../commands/features.js'), 'dist/commands/features.js')),
  'all-features': entry('beta', 'Run all-features selftest', 'dist/commands/all-features.js', directCommand(() => import('../commands/all-features.js'), 'dist/commands/all-features.js')),
  perf: entry('beta', 'Run performance checks', 'dist/commands/perf.js', directCommand(() => import('../commands/perf.js'), 'dist/commands/perf.js')),
  bench: entry('beta', 'Run core trust-kernel benchmark budgets', 'dist/core/commands/bench-command.js', argsCommand(() => import('../core/commands/bench-command.js'), 'benchCommand', 'dist/core/commands/bench-command.js'))
} satisfies Record<string, CommandEntry>;

export const TYPED_COMMANDS = COMMANDS;

export type CommandName = Extract<keyof typeof COMMANDS, string>;

export const LEGACY_COMMAND_ALIASES = {
} as const satisfies Record<string, CommandName>;

export const COMMAND_ALIASES = {
  ...LEGACY_COMMAND_ALIASES,
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
  '--mad': 'mad-sks',
  '--MAD': 'mad-sks',
  '--mad-sks': 'mad-sks',
  '--agent': 'agent',
  '--naruto': 'naruto'
} as const satisfies Record<string, CommandName>;

export function commandNames(): CommandName[] {
  return Object.keys(COMMANDS).sort() as CommandName[];
}

export function typedCommandNames(): CommandName[] {
  return commandNames();
}

export function assertCommandModule(value: unknown): asserts value is CommandModule {
  if (!value || typeof value !== 'object' || typeof (value as Partial<CommandModule>).run !== 'function') {
    throw new Error('Command module must expose run(command, args)');
  }
}
