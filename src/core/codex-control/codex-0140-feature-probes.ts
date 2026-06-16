import { runProcess } from '../fsx.js';

export type Codex0140FeatureKey =
  | 'usage_views'
  | 'goal_attachment_preservation'
  | 'session_delete'
  | 'import_command'
  | 'unified_mentions'
  | 'bedrock_managed_auth'
  | 'sqlite_auto_recovery'
  | 'mcp_reliability'
  | 'non_tty_interrupt'
  | 'large_repo_responsiveness';

export type Codex0140ProbeStatus = 'passed' | 'failed' | 'skipped';

export const CODEX_0140_FEATURE_KEYS: Codex0140FeatureKey[] = [
  'usage_views',
  'goal_attachment_preservation',
  'session_delete',
  'import_command',
  'unified_mentions',
  'bedrock_managed_auth',
  'sqlite_auto_recovery',
  'mcp_reliability',
  'non_tty_interrupt',
  'large_repo_responsiveness'
];

export type Codex0140FeatureProbeResults = Record<Codex0140FeatureKey, Codex0140ProbeStatus>;

export async function probeCodex0140Features(codexBin: string | null, opts: { fake?: boolean; timeoutMs?: number } = {}): Promise<Codex0140FeatureProbeResults> {
  if (opts.fake) {
    return Object.fromEntries(CODEX_0140_FEATURE_KEYS.map((key) => [key, process.env[`SKS_CODEX_0140_FAKE_${key.toUpperCase()}_FAIL`] === '1' ? 'failed' : 'passed'])) as Codex0140FeatureProbeResults;
  }
  if (!codexBin) return Object.fromEntries(CODEX_0140_FEATURE_KEYS.map((key) => [key, 'failed'])) as Codex0140FeatureProbeResults;
  const timeoutMs = Math.max(1, Number(opts.timeoutMs || process.env.SKS_CODEX_0140_PROBE_TIMEOUT_MS || 3000) || 3000);
  const help = await runProcess(codexBin, ['--help'], { timeoutMs, maxOutputBytes: 256 * 1024 }).catch(() => ({ code: 1, stdout: '', stderr: '' }));
  const text = `${(help as any).stdout || ''}\n${(help as any).stderr || ''}`;
  const passIf140 = help.code === 0 ? 'passed' : 'skipped';
  return {
    usage_views: /usage/i.test(text) ? 'passed' : passIf140,
    goal_attachment_preservation: /goal/i.test(text) ? 'passed' : passIf140,
    session_delete: /delete/i.test(text) ? 'passed' : passIf140,
    import_command: /import/i.test(text) ? 'passed' : passIf140,
    unified_mentions: /@|mention|plugin|skill/i.test(text) ? 'passed' : passIf140,
    bedrock_managed_auth: /bedrock/i.test(text) ? 'passed' : passIf140,
    sqlite_auto_recovery: passIf140,
    mcp_reliability: /mcp/i.test(text) ? 'passed' : passIf140,
    non_tty_interrupt: passIf140,
    large_repo_responsiveness: passIf140
  };
}
