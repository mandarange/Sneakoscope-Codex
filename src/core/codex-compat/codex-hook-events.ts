export const CODEX_HOOK_EVENTS = [
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'SessionStart',
  'UserPromptSubmit',
  'SubagentStart',
  'SubagentStop',
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
  SubagentStart: 'subagent-start',
  SubagentStop: 'subagent-stop',
  Stop: 'stop'
};

export const CODEX_HOOK_EVENT_STATE_KEYS: Record<CodexHookEventName, string> = {
  PreToolUse: 'pre_tool_use',
  PermissionRequest: 'permission_request',
  PostToolUse: 'post_tool_use',
  PreCompact: 'pre_compact',
  PostCompact: 'post_compact',
  SessionStart: 'session_start',
  UserPromptSubmit: 'user_prompt_submit',
  SubagentStart: 'subagent_start',
  SubagentStop: 'subagent_stop',
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
  if (normalized === 'subagent-start' || normalized === 'subagentstart') return 'SubagentStart';
  if (normalized === 'subagent-stop' || normalized === 'subagentstop') return 'SubagentStop';
  if (normalized === 'stop') return 'Stop';
  return CODEX_HOOK_EVENTS.find((event) => event.toLowerCase() === normalized.toLowerCase()) ?? null;
}

export function codexHookEventStateKey(event: CodexHookEventName): string {
  return CODEX_HOOK_EVENT_STATE_KEYS[event];
}
