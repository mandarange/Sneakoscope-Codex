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
const EXTERNAL_ROUTE_RESERVED = new Set(['ulw-loop', 'ulw-plan', 'start-work'])

interface CodexSkillSyncReport {
  schema: 'sks.codex-skill-sync.v1'
  generated_at: string
  ok: boolean
  apply: boolean
  skills_root: string
  desired_skills: string[]
  existing_skills: string[]
  created: string[]
  skipped: string[]
  external_route_names_preserved: string[]
  interop: {
    mode: 'coexist'
    clobbered_external_routes: false
    clobbered_user_skills: false
  }
  blockers: string[]
}

export async function syncCodexSksSkills(input: {
  root: string
  apply?: boolean
  skillsRoot?: string
}): Promise<CodexSkillSyncReport> {
  const root = path.resolve(input.root)
  const skillsRoot = input.skillsRoot || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills')
  const existing = await listSkillNames(skillsRoot)
  const collisions = existing.filter((name) => EXTERNAL_ROUTE_RESERVED.has(name))
  const desired = SKS_SKILLS.map((skill) => skillName(skill))
  const created: string[] = []
  const skipped: string[] = []
  if (input.apply === true) {
    await ensureDir(skillsRoot)
    for (const name of desired) {
      if (EXTERNAL_ROUTE_RESERVED.has(name)) {
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
  const report: CodexSkillSyncReport = {
    schema: 'sks.codex-skill-sync.v1',
    generated_at: nowIso(),
    ok: true,
    apply: input.apply === true,
    skills_root: skillsRoot,
    desired_skills: desired,
    existing_skills: existing,
    created,
    skipped,
    external_route_names_preserved: collisions,
    interop: {
      mode: 'coexist',
      clobbered_external_routes: false,
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

function skillName(value: string): string {
  return value.replace(/^\$/, '').toLowerCase()
}

function skillContent(name: string): string {
  const profile = skillProfile(name)
  const body = [
    '---',
    `name: ${name}`,
    `description: SKS managed Codex App route bridge for ${profile.command}.`,
    '---',
    '',
    '<!-- BEGIN SKS MANAGED SKILL -->',
    `Command: ${profile.command}`,
    `Purpose: ${profile.purpose}`,
    `Use when: ${profile.when}`,
    `Route: ${profile.command}`,
    `Evidence: ${profile.evidence}`,
    'Safety: keep route state bounded, preserve user and external route assets, and stop on hard blockers instead of fabricating fallback behavior.',
    'Proof paths: write the route-local mission artifact named in Evidence before claiming completion.',
    'Failure recovery: if a proof path cannot be produced, record the blocker and continue only when the selected SKS route has another allowed evidence path.',
    `Fallback: ${profile.fallback}`,
    `checksum: ${hash(`${name}:${profile.command}:${profile.evidence}:${profile.fallback}`)}`,
    '<!-- END SKS MANAGED SKILL -->',
    ''
  ].join('\n')
  return body
}

function skillProfile(name: string): { command: string; purpose: string; when: string; evidence: string; fallback: string } {
  const table: Record<string, { command: string; purpose: string; when: string; evidence: string; fallback: string }> = {
    loop: {
      command: '$Loop',
      purpose: 'compile persisted route work into bounded loop plans with continuation evidence.',
      when: 'a mission needs stage-by-stage execution, memory hints, or resume-safe artifacts.',
      evidence: '.sneakoscope/loops/** plus codex-app-execution-profile.json',
      fallback: 'use message-role routing when native agent_type is not verified.'
    },
    naruto: {
      command: '$Naruto',
      purpose: 'fan out bounded native worker lanes for high-scale review or implementation.',
      when: 'parallel lanes are explicitly selected by the route and parent integration remains owner.',
      evidence: 'naruto work graph, worker ledgers, and execution profile payloads.',
      fallback: 'degrade to message-role workers without dropping proof artifacts.'
    },
    'qa-loop': {
      command: '$QA-LOOP',
      purpose: 'dogfood UI/API behavior with gate artifacts and current execution profile.',
      when: 'route completion needs human-proxy verification or app handoff checks.',
      evidence: 'qa-loop gate/result ledgers and codex-app-execution-profile.json.',
      fallback: 'record the unavailable surface as blocked rather than inventing visual proof.'
    },
    research: {
      command: '$Research',
      purpose: 'run evidence-bound research cycles with source routing and synthesis ledgers.',
      when: 'the request depends on discovery, evaluation, or external-source claims.',
      evidence: 'research plan, source ledger, cycle record, and execution profile routing.',
      fallback: 'mark unavailable source tools explicitly and avoid unsupported live-accuracy claims.'
    },
    dfix: {
      command: '$DFix',
      purpose: 'perform tiny direct fixes without the full Team route.',
      when: 'copy/config/docs/labels/spacing/translation/mechanical edits are truly narrow.',
      evidence: 'focused diff plus DFix Honest check.',
      fallback: 'route broad implementation through Team/Loop instead.'
    },
    'image-ux-review': {
      command: '$Image-UX-Review',
      purpose: 'produce generated annotated UI review images and extract issue ledgers.',
      when: 'visual UX critique is requested from screenshots or app captures.',
      evidence: 'source inventory, generated annotation images, extracted issue ledger.',
      fallback: 'block if raster annotation cannot be produced.'
    },
    'computer-use': {
      command: '$Computer-Use',
      purpose: 'operate native macOS desktop apps through the fast Computer Use lane.',
      when: 'the task depends on non-web desktop UI or OS settings.',
      evidence: 'desktop interaction notes/screenshots where available.',
      fallback: 'use Browser/Chrome only for web targets.'
    },
    'init-deep': {
      command: '$Init-Deep',
      purpose: 'refresh project-local memory, directory AGENTS sections, and loop memory hints.',
      when: 'a route needs deeper local context or directory-specific instruction recall.',
      evidence: '.sneakoscope/context/AGENTS.generated.md and managed directory AGENTS blocks.',
      fallback: 'preserve user content and skip directories that cannot be safely updated.'
    }
  }
  return table[name] || {
    command: `$${name}`,
    purpose: 'bridge an SKS managed Codex App route.',
    when: 'the matching SKS route is explicitly requested.',
    evidence: '.sneakoscope route artifacts.',
    fallback: 'record blockers with evidence.'
  }
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(`sks-skill:${value}`).digest('hex').slice(0, 12)
}
