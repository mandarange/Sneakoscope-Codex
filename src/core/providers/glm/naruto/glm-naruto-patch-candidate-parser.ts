import { parseUnifiedDiffPatch } from '../glm-patch-parser.js';

export interface GlmNarutoParsedPatchCandidate {
  readonly ok: boolean;
  readonly body: string;
  readonly patch: string;
  readonly touched_paths: readonly string[];
  readonly blockers: readonly string[];
}

const CANDIDATE_OPEN = '<sks_patch_candidate>';
const CANDIDATE_CLOSE = '</sks_patch_candidate>';
const LEGACY_PATCH_OPEN = '<sks_patch>';

export function parseGlmNarutoPatchCandidate(text: string): GlmNarutoParsedPatchCandidate {
  const blockers: string[] = [];
  if (text.includes(LEGACY_PATCH_OPEN) && !text.includes(CANDIDATE_OPEN)) {
    return failed(text, ['legacy_sks_patch_envelope_rejected']);
  }

  const body = unwrapCandidateBody(text);
  if (!body.ok) return failed(text, body.blockers);

  const extracted = extractPatchSection(body.body);
  if (!extracted.ok) return failed(body.body, extracted.blockers);

  const parsed = parseUnifiedDiffPatch(extracted.patch);
  if (parsed.empty) blockers.push('patch_missing_unified_diff');

  return {
    ok: blockers.length === 0,
    body: body.body,
    patch: extracted.patch,
    touched_paths: parsed.touchedPaths,
    blockers
  };
}

function unwrapCandidateBody(text: string): { ok: true; body: string } | { ok: false; blockers: readonly string[] } {
  const start = text.indexOf(CANDIDATE_OPEN);
  const end = text.indexOf(CANDIDATE_CLOSE);
  if (start >= 0 || end >= 0) {
    if (start < 0 || end <= start) return { ok: false, blockers: ['malformed_patch_candidate_envelope'] };
    return { ok: true, body: text.slice(start + CANDIDATE_OPEN.length, end).trim() };
  }
  if (/^\s*patch\s*:/im.test(text)) return { ok: true, body: text.trim() };
  return { ok: false, blockers: ['missing_patch_candidate_envelope'] };
}

function extractPatchSection(body: string): { ok: true; patch: string } | { ok: false; blockers: readonly string[] } {
  const lines = body.split(/\r?\n/);
  const patchLine = lines.findIndex((line) => /^\s*patch\s*:/i.test(line));
  if (patchLine < 0) return { ok: false, blockers: ['missing_patch_section'] };

  const firstLine = lines[patchLine] || '';
  const inline = firstLine.replace(/^\s*patch\s*:\s*/i, '');
  const tail = inline.trim() ? [inline, ...lines.slice(patchLine + 1)] : lines.slice(patchLine + 1);
  const raw = tail.join('\n').replace(/^\s*```(?:diff|patch)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const diffIndex = raw.search(/^diff --git /m);
  if (diffIndex < 0) return { ok: false, blockers: ['patch_missing_diff_git'] };
  return { ok: true, patch: raw.slice(diffIndex).trimEnd() + '\n' };
}

function failed(body: string, blockers: readonly string[]): GlmNarutoParsedPatchCandidate {
  return {
    ok: false,
    body,
    patch: '',
    touched_paths: [],
    blockers
  };
}
