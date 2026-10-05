import {
  COMMAND_ALIASES_LITE,
  COMMAND_MANIFEST_BY_NAME,
  LEGACY_COMMAND_ALIASES_LITE,
  commandManifestNames,
  type CommandInputProfileLite,
  type CommandLatencyLite,
  type CommandManifestLiteEntry,
  type CommandNameLite,
  type CommandRiskLite
} from './command-manifest-lite.js';

export type CommandRun = (command: string, args: string[]) => Promise<unknown> | unknown;
export type ArgsRun = (args: string[]) => Promise<unknown> | unknown;
export type SubcommandRun = (subcommand: string, args: string[]) => Promise<unknown> | unknown;
export type CommandArgsRun = (command: string, args: string[]) => Promise<unknown> | unknown;

export type CommandRisk = CommandRiskLite;
export type CommandLatency = CommandLatencyLite;
export type CommandInputProfile = CommandInputProfileLite;

export interface CommandModule {
  run: CommandRun;
  /**
   * Optional richer usage text. The router prints this for `--help` instead of
   * the manifest-derived default, and never calls `run` for a help request.
   */
  usage?: (command: string) => string;
}

/**
 * Everything about a command except how to load it comes from
 * command-manifest-lite.ts; this registry adds only the lazy loader and the
 * package file the loader needs.
 */
export type CommandEntry = Omit<CommandManifestLiteEntry, 'name'> & {
  lazy: () => Promise<CommandModule>;
  packageRequiredFiles: readonly string[];
};

interface CommandLoader {
  lazy: () => Promise<CommandModule>;
  packageRequiredFiles: readonly string[];
}

type CommandCallable = (...args: unknown[]) => Promise<unknown> | unknown;

/** Loaded ESM modules are unknown at the boundary; narrow before calling exports. */
function hasFunctionExport<K extends string>(
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

/**
 * Every wrapper below builds a fresh CommandModule from one named export, which
 * silently dropped any `usage()` the module also exported — so the router's
 * "a command opts into richer help by exporting usage()" branch was unreachable
 * for every registered command. Carry it through when it is there.
 */
function usageOf(mod: unknown): { usage?: (command: string) => string } {
  const candidate = (mod as Record<string, unknown> | null)?.usage;
  return typeof candidate === 'function' ? { usage: candidate as (command: string) => string } : {};
}

function normalizeCommandModule(moduleValue: unknown): CommandModule {
  if (!moduleValue || typeof moduleValue !== 'object')
    throw new Error('Invalid command module');

  const rec = moduleValue as Record<string, unknown>;
  const runner = pickRunner(rec);
  if (!runner)
    throw new Error('Command module must export run/main/default callable');

  return {
    run: async (command: string, args: string[]) => runner(command, args) as unknown,
    ...usageOf(rec),
  } satisfies CommandModule;
}

function directCommand<T extends { run?: CommandRun; main?: CommandRun; default?: CommandRun }>(
  loader: () => Promise<T>
): () => Promise<CommandModule> {
  return async () => normalizeCommandModule(await loader());
}

function argsCommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K
): () => Promise<CommandModule> {
  return async () => {
    const mod = await loader();
    const fn = functionExport<ArgsRun>(mod, exportName);
    return { run: (_command: string, args: string[]) => fn(args) as unknown, ...usageOf(mod) };
  };
}

function noArgsCommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K
): () => Promise<CommandModule> {
  return async () => {
    const mod = await loader();
    const fn = functionExport<() => Promise<unknown> | unknown>(mod, exportName);
    return { run: () => fn() as unknown, ...usageOf(mod) };
  };
}

function commandArgsCommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K
): () => Promise<CommandModule> {
  return async () => {
    const mod = await loader();
    const fn = functionExport<CommandArgsRun>(mod, exportName);
    return { run: (command: string, args: string[]) => fn(command, args) as unknown, ...usageOf(mod) };
  };
}

function subcommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K,
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
      ...usageOf(mod),
    };
  };
}

function command(packageRequiredFile: string, lazy: () => Promise<CommandModule>): CommandLoader {
  return { lazy, packageRequiredFiles: [packageRequiredFile] };
}

const basicModule = '../core/commands/basic-cli.js';
const basicArgs = (exportName: string) => argsCommand(() => import(basicModule), exportName);
const basicNoArgs = (exportName: string) => noArgsCommand(() => import(basicModule), exportName);
const gcArgs = (exportName: 'gcCommand' | 'statsCommand' | 'memoryCommand') =>
  argsCommand(() => import('../core/commands/gc-command.js'), exportName);

const COMMAND_LOADERS = {
  help: command('dist/commands/help.js', directCommand(() => import('../commands/help.js'))),
  version: command('dist/commands/version.js', directCommand(() => import('../commands/version.js'))),
  commands: command('dist/core/commands/basic-cli.js', basicArgs('commandsCommand')),
  check: command('dist/core/commands/check-command.js', argsCommand(() => import('../core/commands/check-command.js'), 'checkCommand')),
  gates: command('dist/core/commands/gates-command.js', argsCommand(() => import('../core/commands/gates-command.js'), 'gatesCommand')),
  task: command('dist/core/commands/task-command.js', argsCommand(() => import('../core/commands/task-command.js'), 'taskCommand')),
  release: command('dist/core/commands/release-command.js', argsCommand(() => import('../core/commands/release-command.js'), 'releaseCommand')),
  triwiki: command('dist/core/commands/triwiki-command.js', argsCommand(() => import('../core/commands/triwiki-command.js'), 'triwikiCommand')),
  daemon: command('dist/core/commands/daemon-command.js', argsCommand(() => import('../core/commands/daemon-command.js'), 'daemonCommand')),
  run: command('dist/core/commands/run-command.js', argsCommand(() => import('../core/commands/run-command.js'), 'runCommand')),
  plan: command('dist/core/commands/plan-command.js', argsCommand(() => import('../core/commands/plan-command.js'), 'planCommand')),
  status: command('dist/core/commands/status-command.js', argsCommand(() => import('../core/commands/status-command.js'), 'statusCommand')),
  review: command('dist/core/commands/review-command.js', argsCommand(() => import('../core/commands/review-command.js'), 'reviewCommand')),
  root: command('dist/commands/root.js', directCommand(() => import('../commands/root.js'))),
  install: command('dist/core/commands/install-package-command.js', argsCommand(() => import('../core/commands/install-package-command.js'), 'installPackageCommand')),
  update: command('dist/core/commands/basic-cli.js', subcommand(() => import(basicModule), 'updateCommand', 'now')),
  uninstall: command('dist/core/commands/uninstall-command.js', argsCommand(() => import('../core/commands/uninstall-command.js'), 'uninstallCommand')),
  'update-check': command('dist/core/commands/basic-cli.js', basicArgs('updateCheckCommand')),
  config: command('dist/core/config-adopt/index.js', subcommand(() => import('../core/config-adopt/index.js'), 'configCommand', 'adopt')),
  mcp: command('dist/core/commands/mcp-config-command.js', argsCommand(() => import('../core/commands/mcp-config-command.js'), 'mcpConfigCommand')),
  wizard: command('dist/core/commands/basic-cli.js', basicNoArgs('quickstartCommand')),
  usage: command('dist/core/commands/basic-cli.js', basicArgs('usageCommand')),
  quickstart: command('dist/core/commands/basic-cli.js', basicNoArgs('quickstartCommand')),
  setup: command('dist/core/commands/basic-cli.js', basicArgs('setupCommand')),
  bootstrap: command('dist/core/commands/basic-cli.js', basicArgs('bootstrapCommand')),
  init: command('dist/core/commands/basic-cli.js', basicArgs('initCommand')),
  deps: command('dist/core/commands/basic-cli.js', subcommand(() => import(basicModule), 'depsCommand', 'check')),
  'fix-path': command('dist/core/commands/basic-cli.js', basicArgs('fixPathCommand')),
  doctor: command('dist/commands/doctor.js', directCommand(() => import('../commands/doctor.js'))),
  git: command('dist/commands/git.js', directCommand(() => import('../commands/git.js'))),
  paths: command('dist/core/commands/paths-command.js', argsCommand(() => import('../core/commands/paths-command.js'), 'pathsCommand')),
  rollback: command('dist/core/commands/rollback-command.js', argsCommand(() => import('../core/commands/rollback-command.js'), 'rollbackCommand')),
  postinstall: command('dist/core/commands/basic-cli.js', basicArgs('postinstallCommand')),
  codex: command('dist/commands/codex.js', directCommand(() => import('../commands/codex.js'))),
  'codex-app': command('dist/commands/codex-app.js', directCommand(() => import('../commands/codex-app.js'))),
  'codex-native': command('dist/commands/codex-native.js', directCommand(() => import('../commands/codex-native.js'))),
  bridge: command('dist/commands/bridge.js', directCommand(() => import('../commands/bridge.js'))),
  menubar: command('dist/core/commands/menubar-command.js', subcommand(() => import('../core/commands/menubar-command.js'), 'menubarCommand', 'status')),
  remote: command('dist/core/commands/remote-command.js', argsCommand(() => import('../core/commands/remote-command.js'), 'remoteCommand')),
  hooks: command('dist/commands/hooks.js', directCommand(() => import('../commands/hooks.js'))),
  'mad-sks': command('dist/commands/mad-sks.js', directCommand(() => import('../commands/mad-sks.js'))),
  'auto-review': command('dist/commands/auto-review.js', directCommand(() => import('../commands/auto-review.js'))),
  'dollar-commands': command('dist/core/commands/basic-cli.js', basicArgs('dollarCommandsCommand')),
  'fast-mode': command('dist/core/commands/fast-mode-command.js', argsCommand(() => import('../core/commands/fast-mode-command.js'), 'fastModeCommand')),
  commit: command('dist/commands/commit.js', directCommand(() => import('../commands/commit.js'))),
  'commit-and-push': command('dist/commands/commit-and-push.js', directCommand(() => import('../commands/commit-and-push.js'))),
  dfix: command('dist/core/commands/dfix-command.js', commandArgsCommand(() => import('../core/commands/dfix-command.js'), 'dfixCommand')),
  naruto: command('dist/core/commands/naruto-command.js', argsCommand(() => import('../core/commands/naruto-command.js'), 'narutoCommand')),
  'stop-gate': command('dist/core/commands/stop-gate-command.js', commandArgsCommand(() => import('../core/commands/stop-gate-command.js'), 'stopGateCommand')),
  route: command('dist/core/commands/route-command.js', subcommand(() => import('../core/commands/route-command.js'), 'routeCommand', 'status')),
  'qa-loop': command('dist/core/commands/qa-loop-command.js', subcommand(() => import('../core/commands/qa-loop-command.js'), 'qaLoopCommand')),
  research: command('dist/core/commands/research-command.js', subcommand(() => import('../core/commands/research-command.js'), 'researchCommand')),
  autoresearch: command('dist/core/commands/autoresearch-command.js', subcommand(() => import('../core/commands/autoresearch-command.js'), 'autoresearchCommand', 'status')),
  ppt: command('dist/core/commands/ppt-command.js', commandArgsCommand(() => import('../core/commands/ppt-command.js'), 'pptCommand')),
  'image-ux-review': command('dist/core/commands/image-ux-review-command.js', commandArgsCommand(() => import('../core/commands/image-ux-review-command.js'), 'imageUxReviewCommand')),
  'computer-use': command('dist/core/commands/computer-use-command.js', commandArgsCommand(() => import('../core/commands/computer-use-command.js'), 'computerUseCommand')),
  context7: command('dist/cli/context7-command.js', subcommand(() => import('./context7-command.js'), 'context7Command', 'check')),
  'super-search': command('dist/cli/super-search-command.js', subcommand(() => import('./super-search-command.js'), 'superSearchCommand', 'doctor')),
  search: command('dist/commands/search.js', subcommand(() => import('../commands/search.js'), 'run', 'status')),
  recallpulse: command('dist/commands/recallpulse.js', directCommand(() => import('../commands/recallpulse.js'))),
  pipeline: command('dist/commands/pipeline.js', directCommand(() => import('../commands/pipeline.js'))),
  guard: command('dist/commands/guard.js', directCommand(() => import('../commands/guard.js'))),
  conflicts: command('dist/commands/conflicts.js', directCommand(() => import('../commands/conflicts.js'))),
  versioning: command('dist/commands/versioning.js', directCommand(() => import('../commands/versioning.js'))),
  reasoning: command('dist/core/commands/basic-cli.js', basicArgs('reasoningCommand')),
  aliases: command('dist/core/commands/basic-cli.js', basicNoArgs('aliasesCommand')),
  cleanup: command('dist/core/commands/cleanup-command.js', subcommand(() => import('../core/commands/cleanup-command.js'), 'cleanupCommand', 'plan')),
  align: command('dist/core/commands/align-command.js', subcommand(() => import('../core/commands/align-command.js'), 'alignCommand', 'prepare')),
  selftest: command('dist/core/commands/basic-cli.js', basicArgs('selftestCommand')),
  goal: command('dist/core/commands/goal-command.js', subcommand(() => import('../core/commands/goal-command.js'), 'goalCommand')),
  'seo-geo-optimizer': command('dist/core/commands/seo-command.js', argsCommand(() => import('../core/commands/seo-command.js'), 'seoGeoOptimizerCommand')),
  hook: command('dist/commands/hook.js', directCommand(() => import('../commands/hook.js'))),
  profile: command('dist/commands/profile.js', directCommand(() => import('../commands/profile.js'))),
  hproof: command('dist/commands/hproof.js', directCommand(() => import('../commands/hproof.js'))),
  'validate-artifacts': command('dist/core/commands/validate-artifacts-command.js', argsCommand(() => import('../core/commands/validate-artifacts-command.js'), 'validateArtifactsCommand')),
  proof: command('dist/commands/proof.js', directCommand(() => import('../commands/proof.js'))),
  trust: command('dist/core/commands/trust-command.js', argsCommand(() => import('../core/commands/trust-command.js'), 'trustCommand')),
  wrongness: command('dist/core/commands/wrongness-command.js', argsCommand(() => import('../core/commands/wrongness-command.js'), 'wrongnessCommand')),
  'proof-field': command('dist/commands/proof-field.js', directCommand(() => import('../commands/proof-field.js'))),
  'skill-dream': command('dist/core/commands/skill-dream-command.js', subcommand(() => import('../core/commands/skill-dream-command.js'), 'skillDreamCommand', 'status')),
  'code-structure': command('dist/core/commands/code-structure-command.js', subcommand(() => import('../core/commands/code-structure-command.js'), 'codeStructureCommand', 'scan')),
  rust: command('dist/commands/rust.js', directCommand(() => import('../commands/rust.js'))),
  gx: command('dist/core/commands/gx-command.js', subcommand(() => import('../core/commands/gx-command.js'), 'gxCommand', 'validate')),
  eval: command('dist/core/commands/eval-command.js', subcommand(() => import('../core/commands/eval-command.js'), 'evalCommand', 'run')),
  harness: command('dist/core/commands/harness-command.js', subcommand(() => import('../core/commands/harness-command.js'), 'harnessCommand', 'fixture')),
  wiki: command('dist/commands/wiki.js', directCommand(() => import('../commands/wiki.js'))),
  memory: command('dist/commands/memory.js', directCommand(() => import('../commands/memory.js'))),
  gc: command('dist/core/commands/gc-command.js', gcArgs('gcCommand')),
  stats: command('dist/core/commands/gc-command.js', gcArgs('statsCommand')),
  features: command('dist/commands/features.js', directCommand(() => import('../commands/features.js'))),
  'all-features': command('dist/commands/all-features.js', directCommand(() => import('../commands/all-features.js'))),
  perf: command('dist/commands/perf.js', directCommand(() => import('../commands/perf.js'))),
  bench: command('dist/core/commands/bench-command.js', argsCommand(() => import('../core/commands/bench-command.js'), 'benchCommand')),
  'mcp-server': command('dist/core/commands/mcp-server-command.js', argsCommand(() => import('../core/commands/mcp-server-command.js'), 'mcpServerCommand')),
  'agent-bridge': command('dist/core/commands/agent-bridge-command.js', subcommand(() => import('../core/commands/agent-bridge-command.js'), 'agentBridgeCommand', 'setup')),
  decision: command('dist/commands/decision.js', directCommand(() => import('../commands/decision.js'))),
  imagegen: command('dist/commands/imagegen.js', directCommand(() => import('../commands/imagegen.js')))
} as const satisfies Record<CommandNameLite, CommandLoader>;

export const COMMANDS = Object.fromEntries(
  commandManifestNames().map((name) => {
    const { name: _name, ...metadata } = COMMAND_MANIFEST_BY_NAME[name];
    return [name, { ...metadata, ...COMMAND_LOADERS[name] }];
  })
) as { [K in CommandNameLite]: CommandEntry };

export type CommandName = CommandNameLite;

export const LEGACY_COMMAND_ALIASES = LEGACY_COMMAND_ALIASES_LITE;

export const COMMAND_ALIASES = COMMAND_ALIASES_LITE;

export function commandNames(): CommandName[] {
  return commandManifestNames();
}
