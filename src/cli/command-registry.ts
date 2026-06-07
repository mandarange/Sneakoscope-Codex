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
  lazy: () => Promise<CommandModule>
): CommandEntry {
  return { maturity, summary, packageRequiredFiles: [packageRequiredFile], lazy };
}

const basicModule = '../core/commands/basic-cli.js';
const basicArgs = (exportName: string) => argsCommand(() => import(basicModule), exportName, 'dist/core/commands/basic-cli.js');
const basicNoArgs = (exportName: string) => noArgsCommand(() => import(basicModule), exportName, 'dist/core/commands/basic-cli.js');
const gcArgs = (exportName: 'gcCommand' | 'statsCommand' | 'memoryCommand') =>
  argsCommand(() => import('../core/commands/gc-command.js'), exportName, 'dist/core/commands/gc-command.js');

export const COMMANDS = {
  help: entry('stable', 'Show SKS help', 'dist/commands/help.js', directCommand(() => import('../commands/help.js'), 'dist/commands/help.js')),
  version: entry('stable', 'Show SKS version', 'dist/commands/version.js', directCommand(() => import('../commands/version.js'), 'dist/commands/version.js')),
  commands: entry('stable', 'List SKS commands', 'dist/core/commands/basic-cli.js', basicArgs('commandsCommand')),
  run: entry('beta', 'Classify and execute a task through the SKS trust kernel', 'dist/core/commands/run-command.js', argsCommand(() => import('../core/commands/run-command.js'), 'runCommand', 'dist/core/commands/run-command.js')),
  status: entry('stable', 'Show concise active mission and trust status', 'dist/core/commands/status-command.js', argsCommand(() => import('../core/commands/status-command.js'), 'statusCommand', 'dist/core/commands/status-command.js')),
  root: entry('stable', 'Show active SKS root', 'dist/commands/root.js', directCommand(() => import('../commands/root.js'), 'dist/commands/root.js')),
  update: entry('stable', 'Update the global SKS npm package', 'dist/core/commands/basic-cli.js', subcommand(() => import(basicModule), 'updateCommand', 'dist/core/commands/basic-cli.js', 'check')),
  'update-check': entry('stable', 'Check npm package freshness', 'dist/core/commands/basic-cli.js', basicArgs('updateCheckCommand')),
  wizard: entry('stable', 'Open setup wizard help', 'dist/core/commands/basic-cli.js', basicNoArgs('quickstartCommand')),
  usage: entry('stable', 'Show focused usage topic', 'dist/core/commands/basic-cli.js', basicArgs('usageCommand')),
  quickstart: entry('stable', 'Show quickstart flow', 'dist/core/commands/basic-cli.js', basicNoArgs('quickstartCommand')),
  setup: entry('stable', 'Initialize SKS state', 'dist/core/commands/basic-cli.js', basicArgs('setupCommand')),
  bootstrap: entry('stable', 'Initialize SKS project files', 'dist/core/commands/basic-cli.js', basicArgs('bootstrapCommand')),
  init: entry('stable', 'Initialize local control surface', 'dist/core/commands/basic-cli.js', basicArgs('initCommand')),
  deps: entry('stable', 'Check local dependencies', 'dist/core/commands/basic-cli.js', subcommand(() => import(basicModule), 'depsCommand', 'dist/core/commands/basic-cli.js', 'check')),
  'fix-path': entry('stable', 'Repair hook command paths', 'dist/core/commands/basic-cli.js', basicArgs('fixPathCommand')),
  doctor: entry('stable', 'Check and repair SKS install', 'dist/commands/doctor.js', directCommand(() => import('../commands/doctor.js'), 'dist/commands/doctor.js')),
  git: entry('beta', 'Inspect and enforce SKS git collaboration hygiene', 'dist/commands/git.js', directCommand(() => import('../commands/git.js'), 'dist/commands/git.js')),
  paths: entry('beta', 'Inspect SKS managed paths', 'dist/core/commands/paths-command.js', argsCommand(() => import('../core/commands/paths-command.js'), 'pathsCommand', 'dist/core/commands/paths-command.js')),
  rollback: entry('beta', 'List or apply managed-path rollback actions', 'dist/core/commands/rollback-command.js', argsCommand(() => import('../core/commands/rollback-command.js'), 'rollbackCommand', 'dist/core/commands/rollback-command.js')),
  postinstall: entry('stable', 'Run postinstall bootstrap', 'dist/core/commands/basic-cli.js', basicArgs('postinstallCommand')),
  codex: entry('beta', 'Check Codex CLI compatibility and vendored hook schemas', 'dist/commands/codex.js', directCommand(() => import('../commands/codex.js'), 'dist/commands/codex.js')),
  'codex-app': entry('beta', 'Check Codex App readiness', 'dist/commands/codex-app.js', directCommand(() => import('../commands/codex-app.js'), 'dist/commands/codex-app.js')),
  'codex-lb': entry('beta', 'Inspect codex-lb status and circuit health', 'dist/commands/codex-lb.js', directCommand(() => import('../commands/codex-lb.js'), 'dist/commands/codex-lb.js')),
  auth: entry('beta', 'Alias for codex-lb auth commands', 'dist/commands/codex-lb.js', directCommand(() => import('../commands/codex-lb.js'), 'dist/commands/codex-lb.js')),
  hooks: entry('beta', 'Explain and inspect Codex hooks', 'dist/commands/hooks.js', directCommand(() => import('../commands/hooks.js'), 'dist/commands/hooks.js')),
  openclaw: entry('labs', 'Create OpenClaw skill package', 'dist/commands/openclaw.js', directCommand(() => import('../commands/openclaw.js'), 'dist/commands/openclaw.js')),
  hermes: entry('labs', 'Create Hermes Agent skill package', 'dist/commands/hermes.js', directCommand(() => import('../commands/hermes.js'), 'dist/commands/hermes.js')),
  tmux: entry('beta', 'Show removed-runtime migration notice', 'dist/commands/tmux.js', directCommand(() => import('../commands/tmux.js'), 'dist/commands/tmux.js')),
  'zellij-lane': entry('beta', 'Render a Zellij lane frame for SKS sessions', 'dist/commands/zellij-lane.js', directCommand(() => import('../commands/zellij-lane.js'), 'dist/commands/zellij-lane.js')),
  'zellij-slot-pane': entry('beta', 'Render a compact Zellij worker slot pane', 'dist/commands/zellij-slot-pane.js', directCommand(() => import('../commands/zellij-slot-pane.js'), 'dist/commands/zellij-slot-pane.js')),
  zellij: entry('beta', 'Inspect Zellij runtime status and explain repair (no auto-install)', 'dist/commands/zellij.js', directCommand(() => import('../commands/zellij.js'), 'dist/commands/zellij.js')),
  mad: entry('beta', 'MAD-SKS Zellij permission launcher', 'dist/commands/mad-sks.js', directCommand(() => import('../commands/mad-sks.js'), 'dist/commands/mad-sks.js')),
  'mad-sks': entry('beta', 'MAD-SKS scoped permission modifier', 'dist/commands/mad-sks.js', directCommand(() => import('../commands/mad-sks.js'), 'dist/commands/mad-sks.js')),
  'auto-review': entry('beta', 'Manage auto-review profile', 'dist/commands/auto-review.js', directCommand(() => import('../commands/auto-review.js'), 'dist/commands/auto-review.js')),
  autoreview: entry('beta', 'Alias for auto-review', 'dist/commands/auto-review.js', directCommand(() => import('../commands/auto-review.js'), 'dist/commands/auto-review.js')),
  'dollar-commands': entry('stable', 'List Codex App dollar commands', 'dist/core/commands/basic-cli.js', basicArgs('dollarCommandsCommand')),
  dollars: entry('stable', 'Alias for dollar-commands', 'dist/core/commands/basic-cli.js', basicArgs('dollarCommandsCommand')),
  '$': entry('stable', 'Alias for dollar-commands', 'dist/core/commands/basic-cli.js', basicArgs('dollarCommandsCommand')),
  'fast-mode': entry('stable', 'Toggle SKS Fast mode default for dollar-command routes', 'dist/core/commands/fast-mode-command.js', argsCommand(() => import('../core/commands/fast-mode-command.js'), 'fastModeCommand', 'dist/core/commands/fast-mode-command.js')),
  commit: entry('stable', 'Create a simple git commit', 'dist/commands/commit.js', directCommand(() => import('../commands/commit.js'), 'dist/commands/commit.js')),
  'commit-and-push': entry('stable', 'Create a simple git commit and push', 'dist/commands/commit-and-push.js', directCommand(() => import('../commands/commit-and-push.js'), 'dist/commands/commit-and-push.js')),
  dfix: entry('stable', 'Run DFix diagnose/plan/patch/verify loop', 'dist/core/commands/dfix-command.js', commandArgsCommand(() => import('../core/commands/dfix-command.js'), 'dfixCommand', 'dist/core/commands/dfix-command.js')),
  team: entry('beta', 'Create and observe Team missions', 'dist/core/commands/team-command.js', argsCommand(() => import('../core/commands/team-command.js'), 'team', 'dist/core/commands/team-command.js')),
  agent: entry('beta', 'Run native multi-session agent missions', 'dist/core/commands/agent-command.js', argsCommand(() => import('../core/commands/agent-command.js'), 'agentCommand', 'dist/core/commands/agent-command.js')),
  'with-local-llm': entry('beta', 'Enable or inspect local Ollama worker backend', 'dist/core/commands/local-model-command.js', argsCommand(() => import('../core/commands/local-model-command.js'), 'localModelCommand', 'dist/core/commands/local-model-command.js')),
  naruto: entry('labs', 'Run $Naruto shadow-clone swarm (up to 100 parallel sessions)', 'dist/core/commands/naruto-command.js', argsCommand(() => import('../core/commands/naruto-command.js'), 'narutoCommand', 'dist/core/commands/naruto-command.js')),
  'qa-loop': entry('beta', 'Run QA loop missions', 'dist/core/commands/qa-loop-command.js', subcommand(() => import('../core/commands/qa-loop-command.js'), 'qaLoopCommand', 'dist/core/commands/qa-loop-command.js')),
  research: entry('labs', 'Run research missions', 'dist/core/commands/research-command.js', subcommand(() => import('../core/commands/research-command.js'), 'researchCommand', 'dist/core/commands/research-command.js')),
  autoresearch: entry('labs', 'Alias for research/autoresearch route', 'dist/core/commands/autoresearch-command.js', subcommand(() => import('../core/commands/autoresearch-command.js'), 'autoresearchCommand', 'dist/core/commands/autoresearch-command.js', 'status')),
  ppt: entry('labs', 'Inspect/build PPT artifacts', 'dist/core/commands/ppt-command.js', commandArgsCommand(() => import('../core/commands/ppt-command.js'), 'pptCommand', 'dist/core/commands/ppt-command.js')),
  'image-ux-review': entry('labs', 'Inspect image UX artifacts', 'dist/core/commands/image-ux-review-command.js', commandArgsCommand(() => import('../core/commands/image-ux-review-command.js'), 'imageUxReviewCommand', 'dist/core/commands/image-ux-review-command.js')),
  'ux-review': entry('labs', 'Alias for image UX review', 'dist/core/commands/image-ux-review-command.js', commandArgsCommand(() => import('../core/commands/image-ux-review-command.js'), 'imageUxReviewCommand', 'dist/core/commands/image-ux-review-command.js')),
  'visual-review': entry('labs', 'Alias for image UX review', 'dist/core/commands/image-ux-review-command.js', commandArgsCommand(() => import('../core/commands/image-ux-review-command.js'), 'imageUxReviewCommand', 'dist/core/commands/image-ux-review-command.js')),
  'ui-ux-review': entry('labs', 'Alias for image UX review', 'dist/core/commands/image-ux-review-command.js', commandArgsCommand(() => import('../core/commands/image-ux-review-command.js'), 'imageUxReviewCommand', 'dist/core/commands/image-ux-review-command.js')),
  'computer-use': entry('beta', 'Record native Mac/non-web Computer Use visual evidence', 'dist/core/commands/computer-use-command.js', commandArgsCommand(() => import('../core/commands/computer-use-command.js'), 'computerUseCommand', 'dist/core/commands/computer-use-command.js')),
  cu: entry('beta', 'Alias for native Computer Use', 'dist/core/commands/computer-use-command.js', commandArgsCommand(() => import('../core/commands/computer-use-command.js'), 'computerUseCommand', 'dist/core/commands/computer-use-command.js')),
  context7: entry('beta', 'Context7 checks and docs', 'dist/cli/context7-command.js', subcommand(() => import('./context7-command.js'), 'context7Command', 'dist/cli/context7-command.js', 'check')),
  xai: entry('beta', 'Set up and check xAI/Grok search MCP integration', 'dist/cli/xai-command.js', subcommand(() => import('./xai-command.js'), 'xaiCommand', 'dist/cli/xai-command.js', 'check')),
  grok: entry('beta', 'Alias for xAI/Grok search setup', 'dist/cli/xai-command.js', subcommand(() => import('./xai-command.js'), 'xaiCommand', 'dist/cli/xai-command.js', 'check')),
  recallpulse: entry('labs', 'RecallPulse evidence route', 'dist/commands/recallpulse.js', directCommand(() => import('../commands/recallpulse.js'), 'dist/commands/recallpulse.js')),
  pipeline: entry('beta', 'Inspect pipeline missions', 'dist/commands/pipeline.js', directCommand(() => import('../commands/pipeline.js'), 'dist/commands/pipeline.js')),
  guard: entry('beta', 'Check harness guard', 'dist/commands/guard.js', directCommand(() => import('../commands/guard.js'), 'dist/commands/guard.js')),
  conflicts: entry('beta', 'Check harness conflicts', 'dist/commands/conflicts.js', directCommand(() => import('../commands/conflicts.js'), 'dist/commands/conflicts.js')),
  versioning: entry('stable', 'Manage release version metadata', 'dist/commands/versioning.js', directCommand(() => import('../commands/versioning.js'), 'dist/commands/versioning.js')),
  reasoning: entry('labs', 'Show reasoning route', 'dist/core/commands/basic-cli.js', basicArgs('reasoningCommand')),
  aliases: entry('stable', 'Show command aliases', 'dist/core/commands/basic-cli.js', basicNoArgs('aliasesCommand')),
  selftest: entry('stable', 'Run local mock selftest', 'dist/core/commands/basic-cli.js', basicArgs('selftestCommand')),
  goal: entry('beta', 'Manage Goal bridge workflow', 'dist/core/commands/goal-command.js', subcommand(() => import('../core/commands/goal-command.js'), 'goalCommand', 'dist/core/commands/goal-command.js')),
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
  memory: entry('labs', 'Run retention checks', 'dist/core/commands/gc-command.js', subcommand(() => import('../core/commands/gc-command.js'), 'memoryCommand', 'dist/core/commands/gc-command.js')),
  gx: entry('labs', 'Render/validate GX cartridges', 'dist/core/commands/gx-command.js', subcommand(() => import('../core/commands/gx-command.js'), 'gxCommand', 'dist/core/commands/gx-command.js', 'validate')),
  db: entry('beta', 'Inspect DB safety policy', 'dist/core/commands/db-command.js', subcommand(() => import('../core/commands/db-command.js'), 'dbCommand', 'dist/core/commands/db-command.js', 'policy')),
  eval: entry('labs', 'Run eval reports', 'dist/core/commands/eval-command.js', subcommand(() => import('../core/commands/eval-command.js'), 'evalCommand', 'dist/core/commands/eval-command.js', 'run')),
  harness: entry('labs', 'Run harness fixtures', 'dist/core/commands/harness-command.js', subcommand(() => import('../core/commands/harness-command.js'), 'harnessCommand', 'dist/core/commands/harness-command.js', 'fixture')),
  wiki: entry('beta', 'Manage TriWiki and image voxel ledgers', 'dist/commands/wiki.js', directCommand(() => import('../commands/wiki.js'), 'dist/commands/wiki.js')),
  gc: entry('labs', 'Compact/prune runtime state', 'dist/core/commands/gc-command.js', gcArgs('gcCommand')),
  stats: entry('labs', 'Show storage stats', 'dist/core/commands/gc-command.js', gcArgs('statsCommand')),
  features: entry('beta', 'Validate feature registry', 'dist/commands/features.js', directCommand(() => import('../commands/features.js'), 'dist/commands/features.js')),
  'all-features': entry('beta', 'Run all-features selftest', 'dist/commands/all-features.js', directCommand(() => import('../commands/all-features.js'), 'dist/commands/all-features.js')),
  perf: entry('beta', 'Run performance checks', 'dist/commands/perf.js', directCommand(() => import('../commands/perf.js'), 'dist/commands/perf.js')),
  bench: entry('beta', 'Run core trust-kernel benchmark budgets', 'dist/core/commands/bench-command.js', argsCommand(() => import('../core/commands/bench-command.js'), 'benchCommand', 'dist/core/commands/bench-command.js'))
} satisfies Record<string, CommandEntry>;

export const TYPED_COMMANDS = COMMANDS;

export const COMMAND_ALIASES = {
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
  '--mad': 'mad',
  '--MAD': 'mad',
  '--mad-sks': 'mad-sks',
  '--agent': 'agent',
  '--naruto': 'naruto'
} as const;

export type CommandName = Extract<keyof typeof COMMANDS, string>;

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
