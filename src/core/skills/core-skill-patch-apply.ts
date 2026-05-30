import { createCandidateCard, cardBodyHash } from './core-skill-card.js'
import { sectionSlug, validatePatch } from './core-skill-patch.js'
import type { CoreSkillCard, CoreSkillPatch, PatchApplyResult, SkillPatchOp } from './core-skill-types.js'

/**
 * Apply a validated SkillPatch to a single skill card, producing a NEW candidate
 * card. Never touches code/config/global files. Records before/after body hashes.
 */
export function applyPatch(card: CoreSkillCard, patch: CoreSkillPatch): PatchApplyResult {
  const beforeHash = cardBodyHash(card.body)
  const validation = validatePatch(patch, card)
  if (!validation.ok) {
    return { ok: false, blockers: validation.blockers, before_hash: beforeHash, after_hash: beforeHash, candidate: null }
  }
  let body = String(card.body)
  const blockers: string[] = []
  for (const op of patch.operations) {
    const next = applyOp(body, op)
    if (next.blocker) blockers.push(next.blocker)
    else body = next.body
  }
  if (blockers.length) {
    return { ok: false, blockers, before_hash: beforeHash, after_hash: cardBodyHash(body), candidate: null }
  }
  const candidate = createCandidateCard({
    skillId: card.skill_id,
    route: card.route,
    baseVersion: card.version,
    body,
    rolloutSet: card.created_from?.rollout_set ?? null,
    optimizerEpoch: (card.created_from?.optimizer_epoch ?? 0) + 1
  })
  return { ok: true, blockers: [], before_hash: beforeHash, after_hash: cardBodyHash(body), candidate }
}

function applyOp(body: string, op: SkillPatchOp): { body: string; blocker?: string } {
  if (op.op === 'replace') {
    if (!body.includes(op.before)) return { body, blocker: `replace_before_not_found:${op.target}` }
    return { body: replaceFirst(body, op.before, op.after) }
  }
  if (op.op === 'delete') {
    if (typeof op.text === 'string' && op.text) {
      if (!body.includes(op.text)) return { body, blocker: `delete_text_not_found:${op.target}` }
      return { body: replaceFirst(body, op.text, '') }
    }
    // Whole-section delete.
    const removed = removeSection(body, op.target)
    if (removed === null) return { body, blocker: `delete_section_not_found:${op.target}` }
    return { body: removed }
  }
  // add
  const text = String(op.text ?? '')
  return { body: addToSection(body, op.target, text) }
}

function replaceFirst(body: string, before: string, after: string): string {
  const idx = body.indexOf(before)
  if (idx === -1) return body
  return body.slice(0, idx) + after + body.slice(idx + before.length)
}

function targetSlug(target: string): string {
  return sectionSlug(target.includes(':') ? target.split(':').slice(1).join(':') : target)
}

function sectionBounds(lines: string[], slug: string): { start: number; end: number } | null {
  const start = lines.findIndex((line) => /^#{1,6}\s+/.test(line) && sectionSlug(line) === slug)
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s+/.test(lines[i] || '')) {
      end = i
      break
    }
  }
  return { start, end }
}

function removeSection(body: string, target: string): string | null {
  const lines = body.split('\n')
  const bounds = sectionBounds(lines, targetSlug(target))
  if (!bounds) return null
  lines.splice(bounds.start, bounds.end - bounds.start)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

function addToSection(body: string, target: string, text: string): string {
  const slug = targetSlug(target)
  const lines = body.split('\n')
  const bounds = sectionBounds(lines, slug)
  if (bounds) {
    lines.splice(bounds.end, 0, text)
    return lines.join('\n')
  }
  // Section missing: append a new section with a readable title.
  const title = (target.includes(':') ? target.split(':').slice(1).join(':') : target).trim()
  const trimmed = body.replace(/\s+$/, '')
  return `${trimmed}\n\n## ${title}\n${text}\n`
}
