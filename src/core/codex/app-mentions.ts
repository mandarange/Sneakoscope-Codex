export const CODEX_APP_MENTIONS_SCHEMA = 'sks.codex-app-mentions.v1'

export function buildCodexAppMentionInventory(input: { files?: string[]; apps?: string[]; commands?: string[] } = {}) {
  return {
    schema: CODEX_APP_MENTIONS_SCHEMA,
    ok: true,
    mentions: [
      ...(input.files || []).map((value) => ({ kind: 'file', value })),
      ...(input.apps || []).map((value) => ({ kind: 'app', value })),
      ...(input.commands || []).map((value) => ({ kind: 'command', value }))
    ],
    completion_surface: ['@file', '@directory', '@app', '$command']
  }
}
