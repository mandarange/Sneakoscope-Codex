import { checkAndApplyGlmPatch } from '../glm-patch-apply.js';
import type { GlmNarutoPatchEnvelope } from './glm-naruto-types.js';

export function combineGlmNarutoPatches(envelopes: readonly GlmNarutoPatchEnvelope[], selectedPatchIds: readonly string[]): string {
  const selected = selectedPatchIds
    .map((patchId) => envelopes.find((env) => env.worker_id === patchId || env.patch_sha256 === patchId))
    .filter((env): env is GlmNarutoPatchEnvelope => Boolean(env))
    .sort((a, b) => a.worker_id.localeCompare(b.worker_id));
  return mergeDiffSections(selected.flatMap((env) => splitDiffSections(env.patch)));
}

export async function checkAndApplyCombinedGlmNarutoPatch(input: {
  readonly cwd: string;
  readonly envelopes: readonly GlmNarutoPatchEnvelope[];
  readonly selectedPatchIds: readonly string[];
  readonly apply: boolean;
}): Promise<{ readonly ok: boolean; readonly patch: string; readonly applied: readonly string[]; readonly blocker?: string }> {
  const patch = combineGlmNarutoPatches(input.envelopes, input.selectedPatchIds);
  if (!patch.trim()) return { ok: false, patch, applied: [], blocker: 'combined_patch_empty' };
  const checked = await checkAndApplyGlmPatch({ cwd: input.cwd, patch, apply: input.apply });
  if (!checked.ok) return { ok: false, patch, applied: [], blocker: checked.error.code };
  return { ok: true, patch, applied: input.selectedPatchIds };
}

interface DiffSection {
  readonly file: string;
  readonly header: readonly string[];
  readonly hunks: readonly string[];
}

function mergeDiffSections(sections: readonly DiffSection[]): string {
  const byFile = new Map<string, DiffSection[]>();
  for (const section of sections) byFile.set(section.file, [...(byFile.get(section.file) || []), section]);
  const merged: string[] = [];
  for (const [file] of byFile) {
    const group = byFile.get(file)!;
    const first = group[0]!;
    merged.push([...first.header, ...group.flatMap((section) => section.hunks)].join('\n').trimEnd());
  }
  return merged.filter(Boolean).join('\n\n') + (merged.length ? '\n' : '');
}

function splitDiffSections(patch: string): DiffSection[] {
  const rawSections = patch
    .split(/(?=^diff --git )/m)
    .map((section) => section.trim())
    .filter(Boolean);
  return rawSections.map((section) => {
    const lines = section.split(/\r?\n/);
    const diff = lines[0]?.match(/^diff --git a\/(.+?) b\/(.+)$/);
    const file = diff?.[2] || diff?.[1] || lines[0] || 'unknown';
    const firstHunk = lines.findIndex((line) => line.startsWith('@@ '));
    if (firstHunk < 0) return { file, header: lines, hunks: [] };
    return {
      file,
      header: lines.slice(0, firstHunk),
      hunks: lines.slice(firstHunk)
    };
  });
}
