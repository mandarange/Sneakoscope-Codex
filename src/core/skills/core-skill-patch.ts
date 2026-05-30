import crypto from 'node:crypto'
import {
  CORE_SKILL_PATCH_SCHEMA,
  FORBIDDEN_PATCH_TARGET_RE,
  SKILL_PATCH_TARGET_RE,
  type CoreSkillCard,
  type CoreSkillPatch,
  type PatchValidationResult,
  type SkillPatchOp
} from './core-skill-types.js'

export function patchHash(patch: CoreSkillPatch): string {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(patch))).digest('hex')
}

function canonical(patch: CoreSkillPatch) {
  return {
    skill_id: patch.skill_id,
    base_version: patch.base_version,
    operations: patch.operations,
    textual_learning_rate: patch.textual_learning_rate
  }
}

function deletedLength(op: Extract<SkillPatchOp, { op: 'delete' }>, card: CoreSkillCard | null): number {
  if (typeof op.text === 'string') return op.text.length
  if (card && op.target) {
    // Whole-section delete: approximate removed length as the section block size.
    const block = sectionBlock(card.body, op.target)
    if (block) return block.length
  }
  return 0
}

/**
 * Validate a SkillPatch: op whitelist, single-document scope, no code/config/global
 * targets, and textual learning-rate budget. Pure; never mutates anything.
 */
export function validatePatch(patch: any, card: CoreSkillCard | null = null): PatchValidationResult {
  const blockers: string[] = []
  let added = 0
  let deleted = 0
  let replaced = 0
  if (!patch || typeof patch !== 'object') {
    return { ok: false, blockers: ['patch_not_object'], added_chars: 0, deleted_chars: 0, replaced_chars: 0 }
  }
  if (patch.schema !== CORE_SKILL_PATCH_SCHEMA) blockers.push('patch_schema_mismatch')
  if (typeof patch.skill_id !== 'string' || !patch.skill_id) blockers.push('patch_missing_skill_id')
  if (!Number.isInteger(patch.base_version)) blockers.push('patch_missing_base_version')
  if (card && patch.skill_id !== card.skill_id) blockers.push('patch_targets_other_skill')
  if (card && patch.base_version !== card.version) blockers.push('patch_base_version_mismatch')
  const lr = patch.textual_learning_rate
  if (!lr || typeof lr.max_added_chars !== 'number' || typeof lr.max_deleted_chars !== 'number' || typeof lr.max_replaced_chars !== 'number') {
    blockers.push('patch_missing_learning_rate')
  }
  if (!Array.isArray(patch.operations) || patch.operations.length === 0) {
    blockers.push('patch_no_operations')
  } else {
    for (const op of patch.operations) {
      if (!op || !['add', 'delete', 'replace'].includes(op.op)) {
        blockers.push(`patch_bad_op:${op?.op}`)
        continue
      }
      // Every op must target the single skill document (a section/sentence/paragraph),
      // never a filesystem/code/config path.
      if (typeof op.target !== 'string' || !op.target) blockers.push('patch_op_missing_target')
      else if (FORBIDDEN_PATCH_TARGET_RE.test(op.target)) blockers.push(`patch_target_is_external:${op.target}`)
      else if (!SKILL_PATCH_TARGET_RE.test(op.target)) blockers.push(`patch_target_invalid:${op.target}`)
      if (op.op === 'add') added += String(op.text ?? '').length
      else if (op.op === 'replace') {
        added += String(op.after ?? '').length
        deleted += String(op.before ?? '').length
        replaced += String(op.before ?? '').length + String(op.after ?? '').length
      } else if (op.op === 'delete') deleted += deletedLength(op, card)
    }
  }
  if (lr) {
    if (added > lr.max_added_chars) blockers.push('budget_added_chars_exceeded')
    if (deleted > lr.max_deleted_chars) blockers.push('budget_deleted_chars_exceeded')
    if (replaced > lr.max_replaced_chars) blockers.push('budget_replaced_chars_exceeded')
  }
  return { ok: blockers.length === 0, blockers, added_chars: added, deleted_chars: deleted, replaced_chars: replaced }
}

/** Extract the markdown "## <slug>" section block (header + body) for a target like "section:foo". */
export function sectionBlock(body: string, target: string): string | null {
  const slug = target.includes(':') ? target.split(':').slice(1).join(':') : target
  const lines = String(body || '').split('\n')
  const headerIdx = lines.findIndex((line) => /^#{1,6}\s+/.test(line) && sectionSlug(line) === sectionSlug(slug))
  if (headerIdx === -1) return null
  let end = lines.length
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s+/.test(lines[i] || '')) {
      end = i
      break
    }
  }
  return lines.slice(headerIdx, end).join('\n')
}

export function sectionSlug(value: string): string {
  return String(value || '')
    .replace(/^#{1,6}\s+/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
