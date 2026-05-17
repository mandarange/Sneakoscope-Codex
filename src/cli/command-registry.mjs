const legacy = () => import('./legacy-main.mjs');

export const COMMANDS = {
  help: {
    maturity: 'stable',
    summary: 'Show SKS help',
    lazy: () => import('../commands/help.mjs')
  },
  version: {
    maturity: 'stable',
    summary: 'Show SKS version',
    lazy: () => import('../commands/version.mjs')
  },
  commands: {
    maturity: 'stable',
    summary: 'List SKS commands',
    lazy: () => import('../commands/help.mjs')
  },
  root: {
    maturity: 'stable',
    summary: 'Show active SKS root',
    lazy: () => import('../commands/root.mjs')
  },
  features: {
    maturity: 'beta',
    summary: 'Validate feature registry',
    lazy: () => import('../commands/features.mjs')
  },
  'all-features': {
    maturity: 'beta',
    summary: 'Run all-features selftest',
    lazy: () => import('../commands/all-features.mjs')
  },
  hooks: {
    maturity: 'beta',
    summary: 'Explain and inspect Codex hooks',
    lazy: () => import('../commands/hooks.mjs')
  },
  proof: {
    maturity: 'beta',
    summary: 'Show and validate completion proof',
    lazy: () => import('../commands/proof.mjs')
  },
  wiki: {
    maturity: 'beta',
    summary: 'Manage TriWiki and image voxel ledgers',
    lazy: () => import('../commands/wiki.mjs')
  },
  perf: {
    maturity: 'beta',
    summary: 'Run performance checks',
    lazy: () => import('../commands/perf.mjs')
  },
  'codex-lb': {
    maturity: 'beta',
    summary: 'Inspect codex-lb status and circuit health',
    lazy: () => import('../commands/codex-lb.mjs')
  },
  auth: {
    maturity: 'beta',
    summary: 'Alias for codex-lb auth commands',
    lazy: () => import('../commands/codex-lb.mjs')
  },
  postinstall: { maturity: 'stable', summary: 'Run postinstall bootstrap', lazy: legacy },
  wizard: { maturity: 'stable', summary: 'Open setup wizard', lazy: legacy },
  ui: { maturity: 'stable', summary: 'Open setup UI', lazy: legacy },
  'update-check': { maturity: 'stable', summary: 'Check npm package freshness', lazy: legacy },
  usage: { maturity: 'stable', summary: 'Show focused usage topic', lazy: legacy },
  quickstart: { maturity: 'stable', summary: 'Show quickstart flow', lazy: legacy },
  'codex-app': { maturity: 'beta', summary: 'Check Codex App readiness', lazy: () => import('../commands/codex-app.mjs') },
  openclaw: { maturity: 'labs', summary: 'Create OpenClaw skill package', lazy: legacy },
  bootstrap: { maturity: 'stable', summary: 'Initialize SKS project files', lazy: legacy },
  deps: { maturity: 'stable', summary: 'Check or install local dependencies', lazy: legacy },
  'qa-loop': { maturity: 'beta', summary: 'Run QA loop missions', lazy: legacy },
  ppt: { maturity: 'labs', summary: 'Inspect/build PPT artifacts', lazy: legacy },
  'image-ux-review': { maturity: 'labs', summary: 'Inspect image UX artifacts', lazy: legacy },
  'ux-review': { maturity: 'labs', summary: 'Alias for image UX review', lazy: legacy },
  'visual-review': { maturity: 'labs', summary: 'Alias for image UX review', lazy: legacy },
  'ui-ux-review': { maturity: 'labs', summary: 'Alias for image UX review', lazy: legacy },
  context7: { maturity: 'beta', summary: 'Context7 checks and docs', lazy: legacy },
  recallpulse: { maturity: 'labs', summary: 'RecallPulse evidence route', lazy: legacy },
  pipeline: { maturity: 'beta', summary: 'Inspect pipeline missions', lazy: legacy },
  guard: { maturity: 'beta', summary: 'Check harness guard', lazy: legacy },
  conflicts: { maturity: 'beta', summary: 'Check harness conflicts', lazy: legacy },
  versioning: { maturity: 'stable', summary: 'Manage release version metadata', lazy: legacy },
  reasoning: { maturity: 'labs', summary: 'Show reasoning route', lazy: legacy },
  aliases: { maturity: 'stable', summary: 'Show command aliases', lazy: legacy },
  setup: { maturity: 'stable', summary: 'Initialize SKS state', lazy: legacy },
  'fix-path': { maturity: 'stable', summary: 'Repair hook command paths', lazy: legacy },
  doctor: { maturity: 'stable', summary: 'Check and repair SKS install', lazy: () => import('../commands/doctor.mjs') },
  init: { maturity: 'stable', summary: 'Initialize local control surface', lazy: legacy },
  selftest: { maturity: 'stable', summary: 'Run local mock selftest', lazy: legacy },
  goal: { maturity: 'beta', summary: 'Manage Goal bridge workflow', lazy: legacy },
  research: { maturity: 'labs', summary: 'Run research missions', lazy: legacy },
  hook: { maturity: 'beta', summary: 'Codex hook entrypoint', lazy: legacy },
  profile: { maturity: 'labs', summary: 'Inspect/set profile', lazy: legacy },
  hproof: { maturity: 'beta', summary: 'Evaluate H-Proof gate', lazy: legacy },
  'validate-artifacts': { maturity: 'beta', summary: 'Validate mission artifacts', lazy: legacy },
  'proof-field': { maturity: 'beta', summary: 'Scan proof field', lazy: legacy },
  'skill-dream': { maturity: 'labs', summary: 'Track skill dream counters', lazy: legacy },
  'code-structure': { maturity: 'labs', summary: 'Scan source structure', lazy: legacy },
  memory: { maturity: 'labs', summary: 'Run retention checks', lazy: legacy },
  gx: { maturity: 'labs', summary: 'Render/validate GX cartridges', lazy: legacy },
  team: { maturity: 'beta', summary: 'Create and observe Team missions', lazy: legacy },
  db: { maturity: 'beta', summary: 'Inspect DB safety policy', lazy: () => import('../commands/db.mjs') },
  eval: { maturity: 'labs', summary: 'Run eval reports', lazy: legacy },
  harness: { maturity: 'labs', summary: 'Run harness fixtures', lazy: legacy },
  gc: { maturity: 'labs', summary: 'Compact/prune runtime state', lazy: legacy },
  stats: { maturity: 'labs', summary: 'Show storage stats', lazy: legacy },
  tmux: { maturity: 'beta', summary: 'Open/check SKS tmux UI', lazy: legacy },
  'auto-review': { maturity: 'beta', summary: 'Manage auto-review profile', lazy: legacy },
  autoreview: { maturity: 'beta', summary: 'Alias for auto-review', lazy: legacy },
  'dollar-commands': { maturity: 'stable', summary: 'List Codex App dollar commands', lazy: legacy },
  dollars: { maturity: 'stable', summary: 'Alias for dollar-commands', lazy: legacy },
  '$': { maturity: 'stable', summary: 'Alias for dollar-commands', lazy: legacy },
  dfix: { maturity: 'stable', summary: 'Explain DFix route', lazy: legacy }
};

export const COMMAND_ALIASES = {
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version'
};

export function commandNames() {
  return Object.keys(COMMANDS).sort();
}
