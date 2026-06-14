import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { buildCodexPluginInventory } from '../codex-plugins/codex-plugin-json.js'

interface LazyCodexInventory {
  plugins?: Array<{ id?: unknown; name?: unknown }>
  blockers?: string[]
}

interface LazyCodexInteropPolicy {
  schema: 'sks.lazycodex-interop-policy.v1'
  generated_at: string
  ok: boolean
  mode: 'coexist' | 'sks-primary' | 'handoff-to-omo'
  lazycodex_detected: boolean
  detection: {
    plugin_inventory_ids: string[]
    skill_names: string[]
    collisions: string[]
  }
  policy: {
    clobber_lazycodex_skills: false
    clobber_user_skills: false
    default_mode: 'coexist'
    explicit_handoff_required: true
  }
  actions: string[]
  blockers: string[]
}

export async function buildLazyCodexInteropPolicy(input: {
  root: string
  mode?: 'coexist' | 'sks-primary' | 'handoff-to-omo'
  codexHome?: string
  inventory?: LazyCodexInventory | unknown
}): Promise<LazyCodexInteropPolicy> {
  const root = path.resolve(input.root)
  const inventory = normalizeInventory(input.inventory || await buildCodexPluginInventory().catch((err: unknown) => ({ plugins: [], blockers: [messageOf(err)] })))
  const codexHome = input.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const skillNames = await discoverSkillNames([path.join(root, '.agents', 'skills'), path.join(codexHome, 'skills')])
  const pluginIds = (inventory.plugins || []).map((plugin) => `${plugin.id || ''} ${plugin.name || ''}`.toLowerCase())
  const lazycodexInstalled = pluginIds.some((id) => id.includes('omo') || id.includes('lazycodex'))
    || ['ulw-loop', 'ulw-plan', 'start-work'].some((name) => skillNames.includes(name))
  const collisions = ['ulw-loop', 'ulw-plan', 'start-work'].filter((name) => skillNames.includes(name))
  const report: LazyCodexInteropPolicy = {
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

function normalizeInventory(value: unknown): LazyCodexInventory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { plugins: [], blockers: [] }
  const record = value as { plugins?: unknown; blockers?: unknown }
  return {
    plugins: Array.isArray(record.plugins) ? record.plugins.map((plugin) => plugin && typeof plugin === 'object' ? plugin as { id?: unknown; name?: unknown } : {}) : [],
    blockers: Array.isArray(record.blockers) ? record.blockers.map(String) : []
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function discoverSkillNames(roots: string[]): Promise<string[]> {
  const names = new Set<string>()
  for (const root of roots) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) if (entry.isDirectory()) names.add(entry.name)
  }
  return [...names].sort()
}
