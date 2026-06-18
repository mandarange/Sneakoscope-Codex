export interface GlmNarutoParsedHunk {
  readonly file: string;
  readonly old_start: number;
  readonly old_lines: number;
  readonly new_start: number;
  readonly new_lines: number;
  readonly header: string;
}

export function parseUnifiedDiffHunks(patch: string): readonly GlmNarutoParsedHunk[] {
  const hunks: GlmNarutoParsedHunk[] = [];
  let currentFile: string | null = null;
  for (const line of patch.split(/\r?\n/)) {
    const diff = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diff?.[2]) {
      currentFile = diff[2];
      continue;
    }
    const file = line.match(/^\+\+\+ b\/(.+)$/);
    if (file?.[1] && file[1] !== '/dev/null') currentFile = file[1];
    const hunk = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunk && currentFile) {
      hunks.push({
        file: currentFile,
        old_start: Number(hunk[1]),
        old_lines: Number(hunk[2] || 1),
        new_start: Number(hunk[3]),
        new_lines: Number(hunk[4] || 1),
        header: line
      });
    }
  }
  return hunks;
}

export function hunksOverlap(left: GlmNarutoParsedHunk, right: GlmNarutoParsedHunk): boolean {
  if (left.file !== right.file) return false;
  return rangesOverlap(left.old_start, left.old_start + Math.max(1, left.old_lines) - 1, right.old_start, right.old_start + Math.max(1, right.old_lines) - 1)
    || rangesOverlap(left.new_start, left.new_start + Math.max(1, left.new_lines) - 1, right.new_start, right.new_start + Math.max(1, right.new_lines) - 1);
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
