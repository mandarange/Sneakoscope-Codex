export interface SksIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: 'info' | 'warning' | 'blocked' | 'failed';
  readonly hints?: readonly string[];
  readonly cause?: unknown;
}

