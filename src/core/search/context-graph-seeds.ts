import { isWorkspaceRelativePosixPath } from '../triwiki/context-graph/paths.js';

const GLOB_META = /[*?[\]{}!]/;

/**
 * Workspace-relative paths usable as a traversal focus. Glob patterns are dropped
 * rather than half-interpreted: the graph focus is a path prefix test, not a matcher.
 */
export function contextGraphFocusPaths(patterns: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of patterns ?? []) {
    const candidate = String(raw ?? '').trim().replace(/^\.\//, '').replace(/\/+$/, '');
    if (!candidate || GLOB_META.test(candidate)) continue;
    if (!isWorkspaceRelativePosixPath(candidate)) continue;
    if (!out.includes(candidate)) out.push(candidate);
  }
  return out;
}

