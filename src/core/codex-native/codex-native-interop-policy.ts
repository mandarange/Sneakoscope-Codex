import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { buildCodexPluginInventory } from '../codex-plugins/codex-plugin-json.js';
import { currentCodexSkillRoots } from './sks-skill-paths.js';

interface CodexNativeInventory {
  plugins?: Array<{ id?: unknown; name?: unknown }>;
  blockers?: string[];
}

export interface CodexNativeInteropPolicy {
  schema: 'sks.codex-native-interop-policy.v1';
  generated_at: string;
  ok: boolean;
  mode: 'coexist' | 'sks-primary';
  detection: {
    plugin_inventory_ids: string[];
    skill_names: string[];
    preserved_skill_names: string[];
  };
  policy: {
    clobber_user_skills: false;
    clobber_external_route_assets: false;
    explicit_handoff_required: true;
    artifact_names_brand_neutral: true;
  };
  actions: string[];
  blockers: string[];
}

const RESERVED_EXTERNAL_ROUTE_SKILLS = ['ulw-loop', 'ulw-plan', 'start-work'];

export async function buildCodexNativeInteropPolicy(input: {
  root: string;
  mode?: 'coexist' | 'sks-primary';
  codexHome?: string;
  inventory?: CodexNativeInventory | unknown;
}): Promise<CodexNativeInteropPolicy> {
  const root = path.resolve(input.root);
  const inventory = normalizeInventory(input.inventory || await buildCodexPluginInventory().catch((err: unknown) => ({ plugins: [], blockers: [messageOf(err)] })));
  const codexHome = input.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const skillNames = await discoverSkillNames(currentCodexSkillRoots({ root, codexHome }).map((entry) => entry.root));
  const pluginIds = (inventory.plugins || []).map((plugin) => `${plugin.id || ''} ${plugin.name || ''}`.toLowerCase()).filter(Boolean);
  const preservedSkillNames = RESERVED_EXTERNAL_ROUTE_SKILLS.filter((name) => skillNames.includes(name));
  const report: CodexNativeInteropPolicy = {
    schema: 'sks.codex-native-interop-policy.v1',
    generated_at: nowIso(),
    ok: true,
    mode: input.mode || 'coexist',
    detection: {
      plugin_inventory_ids: pluginIds,
      skill_names: skillNames,
      preserved_skill_names: preservedSkillNames
    },
    policy: {
      clobber_user_skills: false,
      clobber_external_route_assets: false,
      explicit_handoff_required: true,
      artifact_names_brand_neutral: true
    },
    actions: preservedSkillNames.map((name) => `preserve_existing_skill:${name}`),
    blockers: []
  };
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-native-interop-policy.json'), report).catch(() => undefined);
  return report;
}

function normalizeInventory(value: unknown): CodexNativeInventory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { plugins: [], blockers: [] };
  const record = value as { plugins?: unknown; blockers?: unknown };
  return {
    plugins: Array.isArray(record.plugins) ? record.plugins.map((plugin) => plugin && typeof plugin === 'object' ? plugin as { id?: unknown; name?: unknown } : {}) : [],
    blockers: Array.isArray(record.blockers) ? record.blockers.map(String) : []
  };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function discoverSkillNames(roots: string[]): Promise<string[]> {
  const names = new Set<string>();
  for (const root of roots) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) if (entry.isDirectory()) names.add(entry.name);
  }
  return [...names].sort();
}
