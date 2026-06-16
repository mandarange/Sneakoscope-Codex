import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { missingAgentConfigFiles } from './agent-config-file-repair.js';

export async function postcheckCodexStartupConfig(input: { root: string; reportPath?: string | null }) {
  const root = path.resolve(input.root);
  const configPath = path.join(root, '.codex', 'config.toml');
  const text = await fs.readFile(configPath, 'utf8').catch(() => '');
  const missing = await missingAgentConfigFiles(text);
  const unsupportedRoleFields = /^\s*message_role_prefix\s*=/m.test(text);
  const relativePaths = [...text.matchAll(/config_file\s*=\s*"([^"]+)"/g)].map((match) => match[1]).filter((file) => file && !path.isAbsolute(file));
  const report = {
    schema: 'sks.codex-startup-config-postcheck.v1',
    generated_at: nowIso(),
    ok: missing.length === 0 && relativePaths.length === 0 && !unsupportedRoleFields,
    config_path: configPath,
    missing_config_files: missing,
    relative_config_files: relativePaths,
    unsupported_managed_role_fields: unsupportedRoleFields,
    blockers: [
      ...missing.map((file) => `missing_agent_config_file:${file}`),
      ...relativePaths.map((file) => `relative_agent_config_file:${file}`),
      ...(unsupportedRoleFields ? ['unsupported_message_role_prefix_field'] : [])
    ]
  };
  if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', 'codex-startup-config-postcheck.json'), report).catch(() => undefined);
  return report;
}
