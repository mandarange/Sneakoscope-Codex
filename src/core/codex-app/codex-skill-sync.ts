// @ts-nocheck
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { ensureDir, nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

const SKS_SKILLS = [
  '$Loop',
  '$Naruto',
  '$QA-LOOP',
  '$Research',
  '$DFix',
  '$Image-UX-Review',
  '$Computer-Use',
  '$Init-Deep'
]
const LAZYCODEX_RESERVED = new Set(['ulw-loop', 'ulw-plan', 'start-work'])

export async function syncCodexSksSkills(input: {
  root: string
  apply?: boolean
  skillsRoot?: string
}): Promise<any> {
  const root = path.resolve(input.root)
  const skillsRoot = input.skillsRoot || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills')
  const existing = await listSkillNames(skillsRoot)
  const collisions = existing.filter((name) => LAZYCODEX_RESERVED.has(name))
  const desired = SKS_SKILLS.map((skill) => skillName(skill))
  const created: string[] = []
  const skipped: string[] = []
  if (input.apply === true) {
    await ensureDir(skillsRoot)
    for (const name of desired) {
      if (LAZYCODEX_RESERVED.has(name)) {
        skipped.push(name)
        continue
      }
      const dir = path.join(skillsRoot, name)
      const file = path.join(dir, 'SKILL.md')
      const content = skillContent(name)
      const current = await fs.readFile(file, 'utf8').catch(() => '')
      if (current && !current.includes('BEGIN SKS MANAGED SKILL')) {
        skipped.push(name)
        continue
      }
      await ensureDir(dir)
      await writeTextAtomic(file, content)
      created.push(file)
    }
  }
  const report = {
    schema: 'sks.codex-skill-sync.v1',
    generated_at: nowIso(),
    ok: true,
    apply: input.apply === true,
    skills_root: skillsRoot,
    desired_skills: desired,
    existing_skills: existing,
    created,
    skipped,
    lazycodex_reserved_present: collisions,
    interop: {
      mode: 'coexist',
      clobbered_lazycodex: false,
      clobbered_user_skills: false
    },
    blockers: []
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-skill-sync.json'), report).catch(() => undefined)
  return report
}

async function listSkillNames(root: string): Promise<string[]> {
  const rows = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  return rows.filter((row) => row.isDirectory()).map((row) => row.name).sort()
}

function skillName(value: string) {
  return value.replace(/^\$/, '').toLowerCase()
}

function skillContent(name: string) {
  const body = [
    '---',
    `name: ${name}`,
    `description: SKS managed Codex App route bridge for $${name}.`,
    '---',
    '',
    '<!-- BEGIN SKS MANAGED SKILL -->',
    `Invoke the matching SKS route for $${name}. Do not overwrite user or LazyCodex/OmO skills.`,
    `checksum: ${hash(name)}`,
    '<!-- END SKS MANAGED SKILL -->',
    ''
  ].join('\n')
  return body
}

function hash(value: string) {
  return crypto.createHash('sha256').update(`sks-skill:${value}`).digest('hex').slice(0, 12)
}
