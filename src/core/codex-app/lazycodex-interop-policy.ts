// @ts-nocheck
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { buildCodexPluginInventory } from '../codex-plugins/codex-plugin-json.js'

export async function buildLazyCodexInteropPolicy(input: {
  root: string
  mode?: 'coexist' | 'sks-primary' | 'handoff-to-omo'
  codexHome?: string
  inventory?: any
}): Promise<any> {
  const root = path.resolve(input.root)
  const inventory = input.inventory || await buildCodexPluginInventory().catch((err: any) => ({ plugins: [], blockers: [err?.message || String(err)] }))
  const codexHome = input.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const skillNames = await discoverSkillNames([path.join(root, '.agents', 'skills'), path.join(codexHome, 'skills')])
  const pluginIds = (inventory.plugins || []).map((plugin: any) => `${plugin.id || ''} ${plugin.name || ''}`.toLowerCase())
  const lazycodexInstalled = pluginIds.some((id: string) => id.includes('omo') || id.includes('lazycodex'))
    || ['ulw-loop', 'ulw-plan', 'start-work'].some((name) => skillNames.includes(name))
  const collisions = ['ulw-loop', 'ulw-plan', 'start-work'].filter((name) => skillNames.includes(name))
  const report = {
    schema: 'sks.lazycodex-interop-policy.v1',
    generated_at: nowIso(),
    ok: true,
    mode: input.mode || 'coexist',
    lazycodex_detected: lazycodexInstalled,
    detection: {
      plugin_inventory_ids: pluginIds,
      skill_names: skillNames,
      collisions
    },
    policy: {
      clobber_lazycodex_skills: false,
      clobber_user_skills: false,
      default_mode: 'coexist',
      explicit_handoff_required: true
    },
    actions: collisions.map((name) => `preserve_existing_skill:${name}`),
    blockers: []
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'lazycodex-interop-policy.json'), report).catch(() => undefined)
  return report
}

async function discoverSkillNames(roots: string[]): Promise<string[]> {
  const names = new Set<string>()
  for (const root of roots) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) if (entry.isDirectory()) names.add(entry.name)
  }
  return [...names].sort()
}
