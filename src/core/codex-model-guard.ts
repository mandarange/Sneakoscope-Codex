/**
 * Codex owns the model catalog. SKS must never maintain a finite allowlist or
 * silently replace a model selected by the user, workspace, or Codex client.
 *
 * Reasoning effort remains an SKS scheduling hint because it is independent of
 * the model identifier and can be ignored by clients that do not advertise it.
 */
export const DEFAULT_CODEX_REASONING_EFFORT = 'high';

function copyArgs(args: unknown = []): string[] {
  return Array.isArray(args) ? args.map((value) => String(value)) : [];
}

/** Return Codex arguments exactly as supplied, including future model IDs. */
export function preserveCodexModelArgs(args: unknown = []): string[] {
  return copyArgs(args);
}

/**
 * Backward-compatible aliases for callers compiled against older SKS builds.
 * Despite the historical name, these functions intentionally do not force a
 * model anymore.
 */
export function forceRequiredCodexModelArgs(args: unknown = []): string[] {
  return preserveCodexModelArgs(args);
}

export function forceRequiredCodexModelConfigArgs(args: unknown = []): string[] {
  return preserveCodexModelArgs(args);
}

/** No model is forbidden by SKS; availability is decided by Codex itself. */
export function isForbiddenCodexModel(_value: unknown = ''): boolean {
  return false;
}
