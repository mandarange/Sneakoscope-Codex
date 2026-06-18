export interface SksIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: 'info' | 'warning' | 'blocked' | 'failed';
  readonly hints?: readonly string[];
  readonly cause?: unknown;
}

export type SksResult<T, E extends SksIssue = SksIssue> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
