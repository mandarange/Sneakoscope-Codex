export const CODEX_HOOK_ISSUE_CATEGORIES = Object.freeze([
  'schema_violation',
  'upstream_semantic_unsupported',
  'sks_zero_warning_disallowed',
  'legacy_shape',
  'policy_disallowed'
] as const);

export type CodexHookIssueCategory = typeof CODEX_HOOK_ISSUE_CATEGORIES[number];

export interface CodexHookIssue {
  category: CodexHookIssueCategory;
  code: string;
  message: string;
  path?: string;
  upstream_supported?: boolean;
  sks_disallowed?: boolean;
}

export function makeCodexHookIssue(category: CodexHookIssueCategory, code: string, message: string, opts: {
  path?: string;
  upstream_supported?: boolean;
  sks_disallowed?: boolean;
} = {}): CodexHookIssue {
  const issue: CodexHookIssue = {
    category,
    code: normalizeIssueCode(code),
    message
  };
  if (opts.path) issue.path = opts.path;
  if (opts.upstream_supported !== undefined) issue.upstream_supported = opts.upstream_supported;
  if (opts.sks_disallowed !== undefined) issue.sks_disallowed = opts.sks_disallowed;
  return issue;
}

export function schemaIssueToCodexHookIssue(issue: string): CodexHookIssue {
  const path = issue.split(':')[0] || '$';
  const code = issue.includes(':unknown_field') ? 'unknown_field'
    : issue.includes(':required') ? 'required'
      : issue.includes(':type:') ? 'type'
        : issue.includes(':enum') ? 'enum'
          : issue.includes(':const') ? 'const'
            : 'schema_violation';
  return makeCodexHookIssue('schema_violation', code, `Codex hook output schema violation: ${issue}`, {
    path,
    upstream_supported: false,
    sks_disallowed: true
  });
}

export function dedupeCodexHookIssues(issues: readonly CodexHookIssue[]): CodexHookIssue[] {
  const seen = new Set<string>();
  const out: CodexHookIssue[] = [];
  for (const issue of issues) {
    const key = [issue.category, issue.code, issue.path || '', issue.message].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

export function codexHookIssuesByCategory(issues: readonly CodexHookIssue[]): Record<CodexHookIssueCategory, number> {
  const summary: Record<CodexHookIssueCategory, number> = {
    schema_violation: 0,
    upstream_semantic_unsupported: 0,
    sks_zero_warning_disallowed: 0,
    legacy_shape: 0,
    policy_disallowed: 0
  };
  for (const issue of issues) summary[issue.category] += 1;
  return summary;
}

export function codexHookIssueWarningString(issue: CodexHookIssue): string {
  if (issue.code.startsWith('legacy_top_level_')) return `legacy_top_level:${issue.code.slice('legacy_top_level_'.length)}`;
  if (issue.code.startsWith('permission_request_reserved_')) return `permission_request_reserved:${reservedPermissionRequestFieldName(issue.code.slice('permission_request_reserved_'.length))}`;
  if (issue.code === 'snake_case') return `${issue.path || '$'}:snake_case`;
  if (issue.category === 'schema_violation') return `${issue.path || '$'}:${issue.code}`;
  if (issue.category === 'upstream_semantic_unsupported') return `semantic_unsupported:${issue.message}`;
  if (issue.category === 'sks_zero_warning_disallowed') return `sks_zero_warning_disallowed:${issue.code}`;
  if (issue.category === 'legacy_shape') return `legacy_shape:${issue.code}`;
  return `policy_disallowed:${issue.code}`;
}

function reservedPermissionRequestFieldName(value: string): string {
  if (value === 'updated_input') return 'updatedInput';
  if (value === 'updated_permissions') return 'updatedPermissions';
  return value;
}

function normalizeIssueCode(value: string): string {
  return String(value || 'issue')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'issue';
}
