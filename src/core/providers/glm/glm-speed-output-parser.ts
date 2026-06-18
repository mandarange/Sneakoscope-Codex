export type GlmSpeedOutputKind = 'patch' | 'need_context' | 'blocked' | 'malformed';

export interface GlmSpeedOutputParseResult {
  readonly kind: GlmSpeedOutputKind;
  readonly content: string;
  readonly paths?: readonly string[];
  readonly reason?: string;
}

const ENVELOPES = {
  patch: ['<sks_patch>', '</sks_patch>'],
  need_context: ['<sks_need_context>', '</sks_need_context>'],
  blocked: ['<sks_blocked>', '</sks_blocked>']
} as const;

export function parseGlmSpeedOutput(text: string): GlmSpeedOutputParseResult {
  for (const kind of ['patch', 'need_context', 'blocked'] as const) {
    const extracted = extractEnvelope(text, ENVELOPES[kind][0], ENVELOPES[kind][1]);
    if (extracted !== null) {
      return {
        kind,
        content: extracted,
        ...(kind === 'need_context' ? { paths: parsePaths(extracted) } : {}),
        ...(kind === 'blocked' ? { reason: parseReason(extracted) } : {})
      };
    }
  }
  const cleaned = text.trim();
  return { kind: 'malformed', content: cleaned, reason: 'missing_glm_speed_output_envelope' };
}

function extractEnvelope(text: string, start: string, end: string): string | null {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return null;
  const contentStart = startIndex + start.length;
  const endIndex = text.indexOf(end, contentStart);
  if (endIndex < 0) return null;
  return text.slice(contentStart, endIndex).trim();
}

function parsePaths(content: string): readonly string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s*(.+?)\s*$/)?.[1])
    .filter((value): value is string => Boolean(value));
}

function parseReason(content: string): string {
  return content.match(/reason:\s*(.+)/i)?.[1]?.trim() || content.trim();
}
