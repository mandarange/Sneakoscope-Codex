import os from 'node:os';
import path from 'node:path';
import { ensureDir, exists, readText, writeTextAtomic } from '../fsx.js';
import { codexLbEnvPath, codexLbMetadataPath, normalizeCodexLbBaseUrl } from './codex-lb-env.js';

export type CodexLbApiKeySource = 'hidden_prompt' | 'stdin' | 'keychain_existing';
export type CodexLbShellProfileChoice = 'zsh' | 'bash' | 'fish' | 'all' | 'skip';
export type CodexLbPersistenceMode =
  | 'durable_env_file'
  | 'durable_keychain'
  | 'shell_profile'
  | 'process_only_ephemeral'
  | 'none';
export type CodexLbSetupActionType =
  | 'write_config_provider'
  | 'select_default_provider'
  | 'write_env_file'
  | 'store_keychain'
  | 'sync_launchctl'
  | 'install_shell_profile_snippet'
  | 'run_health_check'
  | 'write_metadata';

export interface CodexLbSetupAnswers {
  host_or_base_url: string;
  api_key_source: CodexLbApiKeySource;
  use_as_default_provider: boolean;
  write_env_file: boolean;
  store_keychain: boolean;
  sync_launchctl: boolean;
  install_shell_profile: CodexLbShellProfileChoice;
  run_health_check: boolean;
  allow_insecure_localhost: boolean;
}

export interface CodexLbSetupAction {
  type: CodexLbSetupActionType;
  target: string;
  effect: string;
  command?: string;
}

export interface CodexLbSetupPlan {
  schema: 'sks.codex-lb-setup-plan.v1';
  base_url: string;
  actions: CodexLbSetupAction[];
  expected_actions: CodexLbSetupAction[];
  selected_persistence_modes: CodexLbPersistenceMode[];
  persistence: CodexLbPersistenceSummary;
  redactions: string[];
  warnings: string[];
  blockers: string[];
}

export interface CodexLbPersistenceSummary {
  selected_modes: CodexLbPersistenceMode[];
  applied_modes: CodexLbPersistenceMode[];
  effective_mode: CodexLbPersistenceMode;
  durable: boolean;
  warning: string | null;
  warnings: string[];
}

export function buildCodexLbSetupPlan(answers: CodexLbSetupAnswers, opts: {
  home?: string;
  configPath?: string;
  envPath?: string;
  metadataPath?: string;
} = {}): CodexLbSetupPlan {
  const home = opts.home || process.env.HOME || os.homedir();
  const baseUrl = normalizeCodexLbBaseUrl(answers.host_or_base_url);
  const configPath = opts.configPath || path.join(home, '.codex', 'config.toml');
  const envPath = opts.envPath || codexLbEnvPath(home);
  const metadataPath = opts.metadataPath || codexLbMetadataPath(home);
  const blockers: string[] = [];
  if (!baseUrl) blockers.push('missing_host_or_base_url');
  if (answers.install_shell_profile !== 'skip' && !answers.write_env_file) blockers.push('shell_profile_snippet_requires_env_file');
  const actions: CodexLbSetupAction[] = [
    { type: 'write_config_provider', target: configPath, effect: 'write or update [model_providers.codex-lb] with name="openai", the normalized base URL, CODEX_LB_API_KEY env_key, WebSocket support, and requires_openai_auth=true for Codex App routing' }
  ];
  if (answers.use_as_default_provider) {
    actions.push({ type: 'select_default_provider', target: configPath, effect: 'set top-level model_provider = "codex-lb"' });
  }
  if (answers.write_env_file) {
    actions.push({ type: 'write_env_file', target: envPath, effect: 'write CODEX_LB_BASE_URL and redacted CODEX_LB_API_KEY env loader with chmod 0600' });
  }
  if (answers.store_keychain) {
    actions.push({ type: 'store_keychain', target: 'macOS Keychain service sks-codex-lb', effect: 'store the redacted codex-lb API key through Security.framework with stdin-only secret input' });
  }
  if (answers.sync_launchctl) {
    actions.push({ type: 'sync_launchctl', target: 'macOS launchctl user environment', effect: 'sync non-secret CODEX_LB_BASE_URL only and remove API-key launchd env', command: 'launchctl setenv CODEX_LB_BASE_URL ...; launchctl unsetenv CODEX_LB_API_KEY OPENROUTER_API_KEY' });
  }
  if (answers.install_shell_profile !== 'skip') {
    actions.push({ type: 'install_shell_profile_snippet', target: profileTargets(home, answers.install_shell_profile).join(', '), effect: `install managed shell snippet for ${answers.install_shell_profile}` });
  }
  if (answers.run_health_check) {
    actions.push({ type: 'run_health_check', target: 'codex-lb response chain', effect: 'run codex-lb health check after apply' });
  }
  actions.push({ type: 'write_metadata', target: metadataPath, effect: 'write redacted setup metadata and key fingerprint with chmod 0600' });
  const selectedModes = selectedCodexLbPersistenceModes(answers);
  const persistence = codexLbPersistenceSummary({
    selectedModes,
    appliedModes: selectedModes.length ? [] : ['process_only_ephemeral'],
    processOnly: selectedModes.length === 0
  });
  return {
    schema: 'sks.codex-lb-setup-plan.v1',
    base_url: baseUrl,
    actions,
    expected_actions: actions,
    selected_persistence_modes: selectedModes.length ? selectedModes : ['process_only_ephemeral'],
    persistence,
    redactions: ['CODEX_LB_API_KEY', 'api_key', 'sk-*', 'sk-clb-*'],
    warnings: persistence.warnings,
    blockers
  };
}

export function renderCodexLbSetupPlan(plan: CodexLbSetupPlan): string {
  const lines = [
    'codex-lb setup plan',
    `base_url: ${plan.base_url || '(missing)'}`,
    'actions:'
  ];
  for (const action of plan.actions) lines.push(`- ${action.type}: ${action.target} (${action.effect})`);
  if (plan.persistence.warning) lines.push(`warning: ${plan.persistence.warning}`);
  if (plan.blockers.length) {
    lines.push('blockers:');
    for (const blocker of plan.blockers) lines.push(`- ${blocker}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function installCodexLbShellProfileSnippet(opts: {
  home?: string;
  envPath: string;
  shellProfile: CodexLbShellProfileChoice;
}): Promise<{ ok: boolean; status: string; files: string[]; skipped?: boolean; reason?: string }> {
  if (opts.shellProfile === 'skip') return { ok: true, status: 'skipped', skipped: true, files: [] };
  if (!(await exists(opts.envPath))) {
    return { ok: true, status: 'skipped', skipped: true, reason: 'env_file_not_written', files: [] };
  }
  const home = opts.home || process.env.HOME || os.homedir();
  const files = profileTargets(home, opts.shellProfile);
  for (const file of files) {
    const current = await readText(file, '');
    const block = shellProfileBlock(file, opts.envPath);
    await ensureDir(path.dirname(file));
    await writeTextAtomic(file, upsertManagedBlock(current, block));
  }
  return { ok: true, status: 'installed', files };
}

export function selectedCodexLbPersistenceModes(answers: Pick<CodexLbSetupAnswers, 'write_env_file' | 'store_keychain' | 'sync_launchctl' | 'install_shell_profile'>): CodexLbPersistenceMode[] {
  const modes: CodexLbPersistenceMode[] = [];
  if (answers.write_env_file) modes.push('durable_env_file');
  if (answers.store_keychain) modes.push('durable_keychain');
  if (answers.install_shell_profile !== 'skip') modes.push('shell_profile');
  return modes;
}

export function codexLbPersistenceSummary({
  selectedModes = [],
  appliedModes = [],
  processOnly = false
}: {
  selectedModes?: CodexLbPersistenceMode[];
  appliedModes?: CodexLbPersistenceMode[];
  processOnly?: boolean;
} = {}): CodexLbPersistenceSummary {
  const selected = normalizePersistenceModes(selectedModes);
  const applied = normalizePersistenceModes(appliedModes);
  const effective = applied.find((mode) => mode !== 'process_only_ephemeral' && mode !== 'none')
    || selected.find((mode) => mode !== 'process_only_ephemeral' && mode !== 'none')
    || (processOnly || applied.includes('process_only_ephemeral') || selected.length === 0 ? 'process_only_ephemeral' : 'none');
  const durable = ['durable_env_file', 'durable_keychain', 'shell_profile'].some((mode) => applied.includes(mode as CodexLbPersistenceMode) || selected.includes(mode as CodexLbPersistenceMode));
  const warnings = effective === 'process_only_ephemeral'
    ? [
      'process_only_ephemeral',
      'next_shell_requires_setup_or_env',
      'Codex App GUI launch may not see credentials'
    ]
    : [];
  return {
    selected_modes: selected.length ? selected : ['process_only_ephemeral'],
    applied_modes: applied.length ? applied : (effective === 'none' ? ['none'] : [effective]),
    effective_mode: effective,
    durable,
    warning: warnings[0] || null,
    warnings
  };
}

function normalizePersistenceModes(modes: CodexLbPersistenceMode[] = []) {
  const allowed = new Set<CodexLbPersistenceMode>([
    'durable_env_file',
    'durable_keychain',
    'shell_profile',
    'process_only_ephemeral',
    'none'
  ]);
  return [...new Set(modes.filter((mode) => allowed.has(mode)))];
}

function profileTargets(home: string, choice: CodexLbShellProfileChoice): string[] {
  const targets: Record<Exclude<CodexLbShellProfileChoice, 'all' | 'skip'>, string> = {
    zsh: path.join(home, '.zshrc'),
    bash: path.join(home, '.bashrc'),
    fish: path.join(home, '.config', 'fish', 'config.fish')
  };
  if (choice === 'all') return [targets.zsh, targets.bash, targets.fish];
  if (choice === 'skip') return [];
  return [targets[choice]];
}

function shellProfileBlock(file: string, envPath: string): string {
  const fish = file.endsWith(path.join('fish', 'config.fish'));
  const sourceLine = fish
    ? `test -f ${fishQuote(envPath)}; and source ${fishQuote(envPath)}`
    : `[ -f ${shellSingleQuote(envPath)} ] && . ${shellSingleQuote(envPath)}`;
  return [
    '# BEGIN SKS CODEX-LB',
    sourceLine,
    '# END SKS CODEX-LB'
  ].join('\n');
}

function upsertManagedBlock(text: string, block: string): string {
  const re = /# BEGIN SKS CODEX-LB[\s\S]*?# END SKS CODEX-LB/g;
  const trimmed = String(text || '').trimEnd();
  const next = re.test(trimmed) ? trimmed.replace(re, block) : `${trimmed}${trimmed ? '\n\n' : ''}${block}`;
  return `${next.trimEnd()}\n`;
}

function shellSingleQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function fishQuote(value: string): string {
  return `'${String(value).replace(/'/g, "\\'")}'`;
}
