import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js';

export interface AgentConfigFileRepairReport {
  schema: 'sks.agent-config-file-repair.v1';
  generated_at: string;
  ok: boolean;
  apply: boolean;
  config_path: string;
  repaired_paths: string[];
  created_files: string[];
  removed_unsupported_fields: string[];
  blockers: string[];
}

export async function repairAgentConfigFileReferences(input: { root: string; apply?: boolean; reportPath?: string | null }): Promise<AgentConfigFileRepairReport> {
  const root = path.resolve(input.root);
  const configPath = path.join(root, '.codex', 'config.toml');
  const original = await fs.readFile(configPath, 'utf8').catch(() => '');
  const createdFiles: string[] = [];
  const repairedPaths: string[] = [];
  const removedUnsupportedFields: string[] = [];
  let text = original.replace(/^\s*message_role_prefix\s*=.*$/gm, (line) => {
    removedUnsupportedFields.push(line.trim());
    return '';
  });
  text = text.replace(/config_file\s*=\s*"([^"]+)"/g, (_match, value: string) => {
    const absolute = path.isAbsolute(value) ? value : path.join(root, value);
    repairedPaths.push(absolute);
    return `config_file = "${absolute}"`;
  });
  if (input.apply && text !== original) {
    for (const file of repairedPaths) {
      const exists = await fs.stat(file).then((stat) => stat.isFile()).catch(() => false);
      if (!exists) {
        await ensureDir(path.dirname(file));
        await writeTextAtomic(file, '# SKS managed agent config placeholder\n');
        createdFiles.push(file);
      }
    }
    await writeTextAtomic(configPath, text);
  }
  const missing = await missingAgentConfigFiles(text);
  const report: AgentConfigFileRepairReport = {
    schema: 'sks.agent-config-file-repair.v1',
    generated_at: nowIso(),
    ok: missing.length === 0 && !/^\s*message_role_prefix\s*=/m.test(text),
    apply: input.apply === true,
    config_path: configPath,
    repaired_paths: repairedPaths,
    created_files: createdFiles,
    removed_unsupported_fields: removedUnsupportedFields,
    blockers: missing.map((file) => `missing_agent_config_file:${file}`)
  };
  if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', 'agent-config-file-repair.json'), report).catch(() => undefined);
  return report;
}

export async function missingAgentConfigFiles(text: string): Promise<string[]> {
  const rows = [...String(text || '').matchAll(/config_file\s*=\s*"([^"]+)"/g)].map((match) => match[1]).filter((file): file is string => Boolean(file));
  const missing: string[] = [];
  for (const file of rows) {
    if (!path.isAbsolute(file)) {
      missing.push(file);
      continue;
    }
    const ok = await fs.stat(file).then((stat) => stat.isFile()).catch(() => false);
    if (!ok) missing.push(file);
  }
  return missing;
}
