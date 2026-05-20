import path from 'node:path';
import { exists, packageRoot, readJson } from '../fsx.js';
import { CODEX_REQUIRED_BASELINE_TAG, CODEX_REQUIRED_VERSION } from './codex-version-policy.js';

export const CODEX_HOOK_EVENTS = [
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'SessionStart',
  'UserPromptSubmit',
  'Stop'
] as const;

export type CodexHookEventName = typeof CODEX_HOOK_EVENTS[number];

export const CODEX_HOOK_EVENT_TO_FILE_STEM: Record<CodexHookEventName, string> = {
  PreToolUse: 'pre-tool-use',
  PermissionRequest: 'permission-request',
  PostToolUse: 'post-tool-use',
  PreCompact: 'pre-compact',
  PostCompact: 'post-compact',
  SessionStart: 'session-start',
  UserPromptSubmit: 'user-prompt-submit',
  Stop: 'stop'
};

export function codexHookEventName(value: unknown): CodexHookEventName | null {
  const normalized = String(value || '').replace(/[_\s]+/g, '-').toLowerCase();
  if (normalized === 'pre-tool' || normalized === 'pre-tool-use' || normalized === 'pretooluse') return 'PreToolUse';
  if (normalized === 'permission-request' || normalized === 'permissionrequest') return 'PermissionRequest';
  if (normalized === 'post-tool' || normalized === 'post-tool-use' || normalized === 'posttooluse') return 'PostToolUse';
  if (normalized === 'pre-compact' || normalized === 'precompact') return 'PreCompact';
  if (normalized === 'post-compact' || normalized === 'postcompact') return 'PostCompact';
  if (normalized === 'session-start' || normalized === 'sessionstart') return 'SessionStart';
  if (normalized === 'user-prompt-submit' || normalized === 'userpromptsubmit') return 'UserPromptSubmit';
  if (normalized === 'stop') return 'Stop';
  return CODEX_HOOK_EVENTS.find((event) => event.toLowerCase() === normalized.toLowerCase()) ?? null;
}

export async function codexHookSchemaPath(event: CodexHookEventName, direction: 'input' | 'output' = 'output'): Promise<string> {
  const stem = CODEX_HOOK_EVENT_TO_FILE_STEM[event];
  const file = `${stem}.command.${direction}.schema.json`;
  for (const base of candidateSnapshotDirs()) {
    const candidate = path.join(base, file);
    if (await exists(candidate)) return candidate;
  }
  return path.join(candidateSnapshotDirs()[0] || packageRoot(), file);
}

export async function readCodexHookSchema(event: CodexHookEventName, direction: 'input' | 'output' = 'output') {
  return readJson(await codexHookSchemaPath(event, direction), {});
}

export async function readCodexSchemaSnapshotMetadata() {
  for (const base of candidateSnapshotDirs()) {
    const candidate = path.join(base, 'snapshot-metadata.json');
    if (await exists(candidate)) return readJson(candidate, {});
  }
  return {
    schema: 'sks.codex-hook-schema-snapshot.v1',
    upstream: 'openai/codex',
    tag: CODEX_REQUIRED_BASELINE_TAG,
    codex_version: CODEX_REQUIRED_VERSION,
    status: 'missing'
  };
}

export async function codexSchemaSnapshotReport() {
  const metadata = await readCodexSchemaSnapshotMetadata();
  const files = [];
  for (const event of CODEX_HOOK_EVENTS) {
    for (const direction of ['input', 'output'] as const) {
      const file = await codexHookSchemaPath(event, direction);
      const present = await exists(file);
      const parsed = present ? await readJson(file, null).catch(() => null) : null;
      files.push({ event, direction, path: file, exists: present, valid_json: Boolean(parsed && typeof parsed === 'object') });
    }
  }
  const ok = files.every((file) => file.exists && file.valid_json)
    && metadata.upstream === 'openai/codex'
    && metadata.tag === CODEX_REQUIRED_BASELINE_TAG
    && typeof metadata.commit === 'string'
    && Boolean(metadata.commit)
    && typeof metadata.captured_at === 'string'
    && Boolean(metadata.captured_at);
  return {
    schema: 'sks.codex-hook-schema-snapshot-report.v1',
    ok,
    baseline: CODEX_REQUIRED_BASELINE_TAG,
    metadata,
    files
  };
}

function candidateSnapshotDirs(): string[] {
  const root = packageRoot();
  return [
    path.join(root, 'src', 'vendor', 'openai-codex', CODEX_REQUIRED_BASELINE_TAG, 'hooks'),
    path.join(root, 'dist', 'vendor', 'openai-codex', CODEX_REQUIRED_BASELINE_TAG, 'hooks')
  ];
}
