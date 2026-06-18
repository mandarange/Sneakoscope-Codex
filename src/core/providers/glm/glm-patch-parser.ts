export interface GlmParsedPatch {
  readonly patch: string;
  readonly touchedPaths: readonly string[];
  readonly empty: boolean;
}

export function parseUnifiedDiffPatch(patch: string): GlmParsedPatch {
  const touched = new Set<string>();
  for (const line of patch.split(/\r?\n/)) {
    const diff = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diff?.[1]) touched.add(diff[1]);
    if (diff?.[2]) touched.add(diff[2]);
    const file = line.match(/^(?:---|\+\+\+) [ab]\/(.+)$/);
    if (file?.[1] && file[1] !== '/dev/null') touched.add(file[1]);
  }
  return {
    patch,
    touchedPaths: [...touched],
    empty: !patch.trim() || !/^diff --git /m.test(patch)
  };
}
