import path from 'node:path';
import { exists, packageRoot, readJson } from '../fsx.js';
import { CODEX_HOOK_SCHEMA_BASELINE_TAG, CODEX_HOOK_SCHEMA_VERSION } from './codex-version-policy.js';
export {
  CODEX_HOOK_EVENTS,
  CODEX_HOOK_EVENT_TO_FILE_STEM,
  codexHookEventName,
  type CodexHookEventName
} from './codex-hook-events.js';
import { CODEX_HOOK_EVENTS, CODEX_HOOK_EVENT_TO_FILE_STEM, type CodexHookEventName } from './codex-hook-events.js';

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
    tag: CODEX_HOOK_SCHEMA_BASELINE_TAG,
    codex_version: CODEX_HOOK_SCHEMA_VERSION,
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
    && metadata.tag === CODEX_HOOK_SCHEMA_BASELINE_TAG
    && typeof metadata.commit === 'string'
    && Boolean(metadata.commit)
    && typeof metadata.captured_at === 'string'
    && Boolean(metadata.captured_at)
    && CODEX_HOOK_EVENTS.length === 10;
  const eventCountOk = CODEX_HOOK_EVENTS.length === 10;
  const missingEvents = ['SubagentStart', 'SubagentStop'].filter((event) => !CODEX_HOOK_EVENTS.includes(event as CodexHookEventName));
  return {
    schema: 'sks.codex-hook-schema-snapshot-report.v1',
    ok,
    baseline: CODEX_HOOK_SCHEMA_BASELINE_TAG,
    supported_events: CODEX_HOOK_EVENTS,
    supported_events_count: CODEX_HOOK_EVENTS.length,
    expected_schema_files_count: CODEX_HOOK_EVENTS.length * 2,
    schema_files_count: files.length,
    event_count_ok: eventCountOk,
    missing_events: missingEvents,
    release_blockers: [
      ...(!eventCountOk ? ['hook_event_count_less_than_10'] : []),
      ...(missingEvents.length ? ['missing_subagent_hook_events'] : []),
      ...(files.length !== CODEX_HOOK_EVENTS.length * 2 ? ['schema_files_count_not_20'] : [])
    ],
    metadata,
    files
  };
}

function candidateSnapshotDirs(): string[] {
  const root = packageRoot();
  return [
    path.join(root, 'src', 'vendor', 'openai-codex', CODEX_HOOK_SCHEMA_BASELINE_TAG, 'hooks'),
    path.join(root, 'dist', 'vendor', 'openai-codex', CODEX_HOOK_SCHEMA_BASELINE_TAG, 'hooks')
  ];
}
