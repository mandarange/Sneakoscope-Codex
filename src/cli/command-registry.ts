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
import {
  argsCommand,
  command,
  commandArgsCommand,
  directCommand,
  noArgsCommand,
  subcommand,
  type CommandLoader,
  type CommandModule
} from './command-loaders.js';

export type { ArgsRun, CommandArgsRun, CommandLoader, CommandModule, CommandRun, SubcommandRun } from './command-loaders.js';

export type CommandRisk = CommandRiskLite;
export type CommandLatency = CommandLatencyLite;
export type CommandInputProfile = CommandInputProfileLite;

/**
 * Everything about a command except how to load it comes from
 * command-manifest-lite.ts; this registry adds only the lazy loader and the
 * package file the loader needs.
 */
export type CommandEntry = Omit<CommandManifestLiteEntry, 'name'> & {
  lazy: () => Promise<CommandModule>;
  packageRequiredFiles: readonly string[];
};

const basicModule = '../core/commands/basic-cli.js';
const basicArgs = (exportName: string) => argsCommand(() => import(basicModule), exportName);
const basicNoArgs = (exportName: string) => noArgsCommand(() => import(basicModule), exportName);
const gcArgs = (exportName: 'gcCommand' | 'statsCommand' | 'memoryCommand') =>
  argsCommand(() => import('../core/commands/gc-command.js'), exportName);

const COMMAND_LOADERS = {
  help: command('dist/commands/help.js', directCommand(() => import('../commands/help.js'))),
  version: command('dist/commands/version.js', directCommand(() => import('../commands/version.js'))),
  commands: command('dist/core/commands/basic-cli.js', basicArgs('commandsCommand')),
  triwiki: command('dist/core/commands/triwiki-command.js', argsCommand(() => import('../core/commands/triwiki-command.js'), 'triwikiCommand')),
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
  reasoning: command('dist/core/commands/basic-cli.js', basicArgs('reasoningCommand')),
  aliases: command('dist/core/commands/basic-cli.js', basicNoArgs('aliasesCommand')),
  cleanup: command('dist/core/commands/cleanup-command.js', subcommand(() => import('../core/commands/cleanup-command.js'), 'cleanupCommand', 'plan')),
  align: command('dist/core/commands/align-command.js', subcommand(() => import('../core/commands/align-command.js'), 'alignCommand', 'prepare')),
  selftest: command('dist/core/commands/basic-cli.js', basicArgs('selftestCommand')),
  goal: command('dist/core/commands/goal-command.js', subcommand(() => import('../core/commands/goal-command.js'), 'goalCommand')),
  'seo-geo-optimizer': command('dist/core/commands/seo-command.js', argsCommand(() => import('../core/commands/seo-command.js'), 'seoGeoOptimizerCommand')),
  hook: command('dist/commands/hook.js', directCommand(() => import('../commands/hook.js'))),
  proof: command('dist/commands/proof.js', directCommand(() => import('../commands/proof.js'))),
  wrongness: command('dist/core/commands/wrongness-command.js', argsCommand(() => import('../core/commands/wrongness-command.js'), 'wrongnessCommand')),
  'skill-dream': command('dist/core/commands/skill-dream-command.js', subcommand(() => import('../core/commands/skill-dream-command.js'), 'skillDreamCommand', 'status')),
  'code-structure': command('dist/core/commands/code-structure-command.js', subcommand(() => import('../core/commands/code-structure-command.js'), 'codeStructureCommand', 'scan')),
  eval: command('dist/core/commands/eval-command.js', subcommand(() => import('../core/commands/eval-command.js'), 'evalCommand', 'run')),
  gx: command('dist/core/commands/gx-command.js', subcommand(() => import('../core/commands/gx-command.js'), 'gxCommand', 'validate')),
  wiki: command('dist/commands/wiki.js', directCommand(() => import('../commands/wiki.js'))),
  memory: command('dist/commands/memory.js', directCommand(() => import('../commands/memory.js'))),
  gc: command('dist/core/commands/gc-command.js', gcArgs('gcCommand')),
  stats: command('dist/core/commands/gc-command.js', gcArgs('statsCommand')),
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
