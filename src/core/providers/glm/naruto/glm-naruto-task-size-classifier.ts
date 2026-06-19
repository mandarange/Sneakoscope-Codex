export interface GlmTaskSizeClassification {
  readonly kind: 'tiny_single_file' | 'parallelizable_multi_file' | 'unknown';
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export function classifyGlmTaskSize(task: string): GlmTaskSizeClassification {
  const paths = [...new Set(task.match(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g) ?? [])];
  const lower = task.toLowerCase();
  if (paths.length === 1 && /\b(tiny|small|simple|copy|spacing|label|one file|single-file)\b/.test(lower)) {
    return { kind: 'tiny_single_file', confidence: 0.82, reasons: ['one_mentioned_file', 'tiny_task_language'] };
  }
  if (paths.length > 1 || /\b(parallel|multi-file|refactor|route|scheduler|coverage|benchmark)\b/.test(lower)) {
    return { kind: 'parallelizable_multi_file', confidence: 0.78, reasons: paths.length > 1 ? ['multiple_mentioned_files'] : ['parallelizable_task_language'] };
  }
  return { kind: 'unknown', confidence: 0.4, reasons: ['insufficient_task_shape_evidence'] };
}
