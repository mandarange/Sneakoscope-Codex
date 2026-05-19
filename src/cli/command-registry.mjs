function argsCommand(loader, exportName) {
  return async () => {
    const mod = await loader();
    return { run: (_command, args = []) => mod[exportName](args) };
  };
}

function noArgsCommand(loader, exportName) {
  return async () => {
    const mod = await loader();
    return { run: () => mod[exportName]() };
  };
}

function commandArgsCommand(loader, exportName) {
  return async () => {
    const mod = await loader();
    return { run: (command, args = []) => mod[exportName](command, args) };
  };
}

function subcommand(loader, exportName, fallbackSubcommand) {
  return async () => {
    const mod = await loader();
    return {
      run: (_command, args = []) => {
        const [subcommandName = fallbackSubcommand, ...rest] = args;
        return mod[exportName](subcommandName, rest);
      }
    };
  };
}

const basicArgs = (exportName) => argsCommand(() => import('../core/commands/basic-cli.mjs'), exportName);
const basicNoArgs = (exportName) => noArgsCommand(() => import('../core/commands/basic-cli.mjs'), exportName);
const gcArgs = (exportName) => argsCommand(() => import('../core/commands/gc-command.mjs'), exportName);

export const COMMANDS = {
  help: { maturity: 'stable', summary: 'Show SKS help', lazy: () => import('../commands/help.mjs') },
  version: { maturity: 'stable', summary: 'Show SKS version', lazy: () => import('../commands/version.mjs') },
  commands: { maturity: 'stable', summary: 'List SKS commands', lazy: basicArgs('commandsCommand') },
  run: { maturity: 'beta', summary: 'Classify and start a task through the SKS trust kernel', lazy: argsCommand(() => import('../core/commands/run-command.mjs'), 'runCommand') },
  status: { maturity: 'stable', summary: 'Show concise active mission and trust status', lazy: argsCommand(() => import('../core/commands/status-command.mjs'), 'statusCommand') },
  root: { maturity: 'stable', summary: 'Show active SKS root', lazy: () => import('../commands/root.mjs') },
  'update-check': { maturity: 'stable', summary: 'Check npm package freshness', lazy: basicArgs('updateCheckCommand') },
  wizard: { maturity: 'stable', summary: 'Open setup wizard help', lazy: basicNoArgs('quickstartCommand') },
  usage: { maturity: 'stable', summary: 'Show focused usage topic', lazy: basicArgs('usageCommand') },
  quickstart: { maturity: 'stable', summary: 'Show quickstart flow', lazy: basicNoArgs('quickstartCommand') },
  setup: { maturity: 'stable', summary: 'Initialize SKS state', lazy: basicArgs('setupCommand') },
  bootstrap: { maturity: 'stable', summary: 'Initialize SKS project files', lazy: basicArgs('bootstrapCommand') },
  init: { maturity: 'stable', summary: 'Initialize local control surface', lazy: basicArgs('initCommand') },
  deps: { maturity: 'stable', summary: 'Check local dependencies', lazy: subcommand(() => import('../core/commands/basic-cli.mjs'), 'depsCommand', 'check') },
  'fix-path': { maturity: 'stable', summary: 'Repair hook command paths', lazy: basicArgs('fixPathCommand') },
  doctor: { maturity: 'stable', summary: 'Check and repair SKS install', lazy: () => import('../commands/doctor.mjs') },
  paths: { maturity: 'beta', summary: 'Inspect SKS managed paths', lazy: argsCommand(() => import('../core/commands/paths-command.mjs'), 'pathsCommand') },
  rollback: { maturity: 'beta', summary: 'List or apply managed-path rollback actions', lazy: argsCommand(() => import('../core/commands/rollback-command.mjs'), 'rollbackCommand') },
  postinstall: { maturity: 'stable', summary: 'Run postinstall bootstrap', lazy: basicArgs('postinstallCommand') },
  codex: { maturity: 'beta', summary: 'Check Codex CLI compatibility and vendored hook schemas', lazy: () => import('../commands/codex.mjs') },
  'codex-app': { maturity: 'beta', summary: 'Check Codex App readiness', lazy: () => import('../commands/codex-app.mjs') },
  'codex-lb': { maturity: 'beta', summary: 'Inspect codex-lb status and circuit health', lazy: () => import('../commands/codex-lb.mjs') },
  auth: { maturity: 'beta', summary: 'Alias for codex-lb auth commands', lazy: () => import('../commands/codex-lb.mjs') },
  hooks: { maturity: 'beta', summary: 'Explain and inspect Codex hooks', lazy: () => import('../commands/hooks.mjs') },
  openclaw: { maturity: 'labs', summary: 'Create OpenClaw skill package', lazy: () => import('../commands/openclaw.mjs') },
  tmux: { maturity: 'beta', summary: 'Open/check SKS tmux UI', lazy: () => import('../commands/tmux.mjs') },
  mad: { maturity: 'beta', summary: 'MAD-SKS tmux permission launcher', lazy: () => import('../commands/mad-sks.mjs') },
  'mad-sks': { maturity: 'beta', summary: 'MAD-SKS scoped permission modifier', lazy: () => import('../commands/mad-sks.mjs') },
  'auto-review': { maturity: 'beta', summary: 'Manage auto-review profile', lazy: () => import('../commands/auto-review.mjs') },
  autoreview: { maturity: 'beta', summary: 'Alias for auto-review', lazy: () => import('../commands/auto-review.mjs') },
  'dollar-commands': { maturity: 'stable', summary: 'List Codex App dollar commands', lazy: basicArgs('dollarCommandsCommand') },
  dollars: { maturity: 'stable', summary: 'Alias for dollar-commands', lazy: basicArgs('dollarCommandsCommand') },
  '$': { maturity: 'stable', summary: 'Alias for dollar-commands', lazy: basicArgs('dollarCommandsCommand') },
  commit: { maturity: 'stable', summary: 'Create a simple git commit', lazy: () => import('../commands/commit.mjs') },
  'commit-and-push': { maturity: 'stable', summary: 'Create a simple git commit and push', lazy: () => import('../commands/commit-and-push.mjs') },
  dfix: { maturity: 'stable', summary: 'Explain DFix route', lazy: basicNoArgs('dfixCommand') },
  team: { maturity: 'beta', summary: 'Create and observe Team missions', lazy: argsCommand(() => import('../core/commands/team-command.mjs'), 'team') },
  'qa-loop': { maturity: 'beta', summary: 'Run QA loop missions', lazy: subcommand(() => import('../core/commands/qa-loop-command.mjs'), 'qaLoopCommand') },
  research: { maturity: 'labs', summary: 'Run research missions', lazy: subcommand(() => import('../core/commands/research-command.mjs'), 'researchCommand') },
  autoresearch: { maturity: 'labs', summary: 'Alias for research/autoresearch route', lazy: subcommand(() => import('../core/commands/autoresearch-command.mjs'), 'autoresearchCommand', 'status') },
  ppt: { maturity: 'labs', summary: 'Inspect/build PPT artifacts', lazy: commandArgsCommand(() => import('../core/commands/ppt-command.mjs'), 'pptCommand') },
  'image-ux-review': { maturity: 'labs', summary: 'Inspect image UX artifacts', lazy: commandArgsCommand(() => import('../core/commands/image-ux-review-command.mjs'), 'imageUxReviewCommand') },
  'ux-review': { maturity: 'labs', summary: 'Alias for image UX review', lazy: commandArgsCommand(() => import('../core/commands/image-ux-review-command.mjs'), 'imageUxReviewCommand') },
  'visual-review': { maturity: 'labs', summary: 'Alias for image UX review', lazy: commandArgsCommand(() => import('../core/commands/image-ux-review-command.mjs'), 'imageUxReviewCommand') },
  'ui-ux-review': { maturity: 'labs', summary: 'Alias for image UX review', lazy: commandArgsCommand(() => import('../core/commands/image-ux-review-command.mjs'), 'imageUxReviewCommand') },
  'computer-use': { maturity: 'beta', summary: 'Record Computer Use visual evidence', lazy: commandArgsCommand(() => import('../core/commands/computer-use-command.mjs'), 'computerUseCommand') },
  cu: { maturity: 'beta', summary: 'Alias for Computer Use', lazy: commandArgsCommand(() => import('../core/commands/computer-use-command.mjs'), 'computerUseCommand') },
  context7: { maturity: 'beta', summary: 'Context7 checks and docs', lazy: subcommand(() => import('./context7-command.mjs'), 'context7Command', 'check') },
  recallpulse: { maturity: 'labs', summary: 'RecallPulse evidence route', lazy: () => import('../commands/recallpulse.mjs') },
  pipeline: { maturity: 'beta', summary: 'Inspect pipeline missions', lazy: () => import('../commands/pipeline.mjs') },
  scouts: { maturity: 'beta', summary: 'Run the default read-only 5-scout intake phase', lazy: () => import('../commands/scouts.mjs') },
  scout: { maturity: 'beta', summary: 'Alias for scouts', lazy: () => import('../commands/scouts.mjs') },
  guard: { maturity: 'beta', summary: 'Check harness guard', lazy: () => import('../commands/guard.mjs') },
  conflicts: { maturity: 'beta', summary: 'Check harness conflicts', lazy: () => import('../commands/conflicts.mjs') },
  versioning: { maturity: 'stable', summary: 'Manage release version metadata', lazy: () => import('../commands/versioning.mjs') },
  reasoning: { maturity: 'labs', summary: 'Show reasoning route', lazy: basicArgs('reasoningCommand') },
  aliases: { maturity: 'stable', summary: 'Show command aliases', lazy: basicNoArgs('aliasesCommand') },
  selftest: { maturity: 'stable', summary: 'Run local mock selftest', lazy: basicArgs('selftestCommand') },
  goal: { maturity: 'beta', summary: 'Manage Goal bridge workflow', lazy: subcommand(() => import('../core/commands/goal-command.mjs'), 'goalCommand') },
  hook: { maturity: 'beta', summary: 'Codex hook entrypoint', lazy: () => import('../commands/hook.mjs') },
  profile: { maturity: 'labs', summary: 'Inspect/set profile', lazy: () => import('../commands/profile.mjs') },
  hproof: { maturity: 'beta', summary: 'Evaluate H-Proof gate', lazy: () => import('../commands/hproof.mjs') },
  'validate-artifacts': { maturity: 'beta', summary: 'Validate mission artifacts', lazy: argsCommand(() => import('../core/commands/validate-artifacts-command.mjs'), 'validateArtifactsCommand') },
  proof: { maturity: 'beta', summary: 'Show and validate completion proof', lazy: () => import('../commands/proof.mjs') },
  trust: { maturity: 'beta', summary: 'Report and validate route trust kernel evidence', lazy: argsCommand(() => import('../core/commands/trust-command.mjs'), 'trustCommand') },
  'proof-field': { maturity: 'beta', summary: 'Scan proof field', lazy: () => import('../commands/proof-field.mjs') },
  'skill-dream': { maturity: 'labs', summary: 'Track skill dream counters', lazy: subcommand(() => import('../core/commands/skill-dream-command.mjs'), 'skillDreamCommand', 'status') },
  'code-structure': { maturity: 'labs', summary: 'Scan source structure', lazy: subcommand(() => import('../core/commands/code-structure-command.mjs'), 'codeStructureCommand', 'scan') },
  rust: { maturity: 'beta', summary: 'Inspect optional Rust accelerator status and smoke parity', lazy: () => import('../commands/rust.mjs') },
  memory: { maturity: 'labs', summary: 'Run retention checks', lazy: subcommand(() => import('../core/commands/gc-command.mjs'), 'memoryCommand') },
  gx: { maturity: 'labs', summary: 'Render/validate GX cartridges', lazy: subcommand(() => import('../core/commands/gx-command.mjs'), 'gxCommand', 'validate') },
  db: { maturity: 'beta', summary: 'Inspect DB safety policy', lazy: subcommand(() => import('../core/commands/db-command.mjs'), 'dbCommand', 'policy') },
  eval: { maturity: 'labs', summary: 'Run eval reports', lazy: subcommand(() => import('../core/commands/eval-command.mjs'), 'evalCommand', 'run') },
  harness: { maturity: 'labs', summary: 'Run harness fixtures', lazy: subcommand(() => import('../core/commands/harness-command.mjs'), 'harnessCommand', 'fixture') },
  wiki: { maturity: 'beta', summary: 'Manage TriWiki and image voxel ledgers', lazy: () => import('../commands/wiki.mjs') },
  gc: { maturity: 'labs', summary: 'Compact/prune runtime state', lazy: gcArgs('gcCommand') },
  stats: { maturity: 'labs', summary: 'Show storage stats', lazy: gcArgs('statsCommand') },
  features: { maturity: 'beta', summary: 'Validate feature registry', lazy: () => import('../commands/features.mjs') },
  'all-features': { maturity: 'beta', summary: 'Run all-features selftest', lazy: () => import('../commands/all-features.mjs') },
  perf: { maturity: 'beta', summary: 'Run performance checks', lazy: () => import('../commands/perf.mjs') },
  bench: { maturity: 'beta', summary: 'Run core trust-kernel benchmark budgets', lazy: argsCommand(() => import('../core/commands/bench-command.mjs'), 'benchCommand') }
};

export const COMMAND_ALIASES = {
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
  '--mad': 'mad',
  '--MAD': 'mad',
  '--mad-sks': 'mad-sks'
};

export function commandNames() {
  return Object.keys(COMMANDS).sort();
}
