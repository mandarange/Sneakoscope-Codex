import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js';
import { PPT_FIX_TASK_PLAN_ARTIFACT } from './ppt-fix-task-planner.js';

export const PPT_PATCH_HANDOFF_ARTIFACT = 'ppt-patch-handoff.json';
export const PPT_PATCH_RESULT_ARTIFACT = 'ppt-patch-result.json';

export async function writePptPatchHandoff(dir: string, opts: any = {}) {
  const plan = opts.plan || await readJson(path.join(dir, PPT_FIX_TASK_PLAN_ARTIFACT), { tasks: [] });
  const handoff = buildPptPatchHandoff(plan, opts);
  await writeJsonAtomic(path.join(dir, PPT_PATCH_HANDOFF_ARTIFACT), handoff);
  await writeJsonAtomic(path.join(dir, PPT_PATCH_RESULT_ARTIFACT), handoff.result);
  return handoff;
}

export function buildPptPatchHandoff(plan: any = {}, opts: any = {}) {
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const manualDeck = opts.manualDeckPath || null;
  const changedFiles = manualDeck ? [manualDeck] : [];
  const deckModified = Boolean(manualDeck || opts.deckModified === true);
  const result = {
    schema: 'sks.ppt-patch-result.v1',
    created_at: nowIso(),
    changed_slides: tasks.map((task: any) => task.slide_index),
    changed_files: changedFiles,
    deck_modified: deckModified,
    no_op_reason: deckModified ? null : tasks.length ? 'deck_binary_edit_unavailable_manual_handoff_required' : 'no_open_slide_tasks',
    requires_human_review: tasks.some((task: any) => task.requires_human_review) || (!manualDeck && tasks.length > 0),
    re_export_required: deckModified || tasks.length > 0,
    passed: deckModified || tasks.length === 0,
    blockers: !deckModified && tasks.length ? ['deck_binary_edit_unavailable'] : []
  };
  return {
    schema: 'sks.ppt-patch-handoff.v1',
    created_at: nowIso(),
    task_count: tasks.length,
    prompt: buildDeckEditPrompt(plan),
    output_schema: {
      required: ['changed_slides', 'changed_files', 'deck_modified', 'no_op_reason', 'requires_human_review', 're_export_required'],
      forbidden_operations: ['destructive filesystem operations', 'DB writes', 'invented content claims', 'brand changes without user-provided brand guide']
    },
    result,
    passed: result.passed,
    blockers: result.blockers
  };
}

function buildDeckEditPrompt(plan: any = {}) {
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  return [
    'Apply bounded presentation deck edits for the PPT Imagegen Review findings.',
    `Deck path: ${plan.deck_path || '<manual deck required>'}.`,
    `Target slide indexes: ${tasks.map((task: any) => task.slide_index).join(', ') || '<none>'}.`,
    'Use the source slide images, generated gpt-image-2 callout evidence, and issue ledgers as the only visual evidence.',
    'Forbidden operations: destructive file changes, DB writes, invented business/product claims, and broad redesigns outside referenced slides.',
    'Return JSON with changed_slides, changed_files, deck_modified, no_op_reason, requires_human_review, and re_export_required.'
  ].join('\n');
}
