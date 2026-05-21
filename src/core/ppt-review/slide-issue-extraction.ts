import fsp from 'node:fs/promises';
import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js';
import { codexSchemaPath, runCodexExecResumeWithOutputSchema, structuredOutputBlocker } from '../codex-exec-output-schema.js';
import { runOpenAIStructuredOutput } from '../structured-output-adapter.js';
import { validateJsonSchemaRecursive } from '../json-schema-validator.js';
import { PPT_SLIDE_CALLOUT_LEDGER_ARTIFACT } from './slide-imagegen-review.js';

export const PPT_SLIDE_ISSUE_LEDGER_ARTIFACT = 'ppt-slide-issue-ledger.json';
export const PPT_DECK_ISSUE_LEDGER_ARTIFACT = 'ppt-deck-issue-ledger.json';

export async function extractSlideIssues(input: any = {}) {
  const root = String(input.root || process.cwd());
  const dir = String(input.dir);
  const mock = input.mock === true;
  const calloutLedger = input.calloutLedger || await readJson(path.join(dir, PPT_SLIDE_CALLOUT_LEDGER_ARTIFACT), {});
  const schemaPath = await codexSchemaPath('ppt-slide-issue-ledger');
  const jsonSchema = await readJson<Record<string, unknown>>(schemaPath);
  let issues: any[] = [];
  const blockers: string[] = [];
  const images = Array.isArray(calloutLedger.generated_slide_callout_images) ? calloutLedger.generated_slide_callout_images : [];
  if (mock) {
    issues = images.flatMap((image: any) => (image.callouts || []).map((callout: any, index: number) => normalizePptIssue(callout, image, index, 'mock_fixture')));
  } else if (input.generatedSlidePath) {
    const extraction = await extractOneGeneratedSlide(root, schemaPath, jsonSchema, input.generatedSlidePath, input.sessionId || null);
    if (extraction.ok) issues = extraction.issues;
    else blockers.push(extraction.blocker?.reason || 'ppt_slide_issue_extraction_missing');
  } else {
    for (const image of images) {
      if (!image.path) continue;
      const extraction = await extractOneGeneratedSlide(root, schemaPath, jsonSchema, image.path, input.sessionId || null, image);
      if (extraction.ok) issues.push(...extraction.issues);
      else blockers.push(extraction.blocker?.reason || 'ppt_slide_issue_extraction_missing');
    }
  }
  if (!issues.length) blockers.push('ppt_slide_issue_extraction_missing');
  const ledger = {
    schema: 'sks.ppt-slide-issue-ledger.v1',
    schema_version: 1,
    created_at: nowIso(),
    issues,
    issue_count: issues.length,
    blocking_issue_count: issues.filter((issue: any) => ['P0', 'P1'].includes(issue.severity) && !['fixed', 'accepted_not_applicable'].includes(issue.status)).length,
    extraction_source: mock ? 'mock_fixture' : input.sessionId ? 'codex_exec_resume_output_schema' : 'structured_outputs_callout_extraction',
    mock_fixture: mock,
    blockers: [...new Set(blockers)],
    validation: validateJsonSchemaRecursive({ schema: 'sks.ppt-slide-issue-ledger.v1', schema_version: 1, issues }, jsonSchema),
    passed: blockers.length === 0
  };
  await writeJsonAtomic(path.join(dir, PPT_SLIDE_ISSUE_LEDGER_ARTIFACT), ledger);
  const deckLedger = buildDeckIssueLedger(ledger, calloutLedger);
  await writeJsonAtomic(path.join(dir, PPT_DECK_ISSUE_LEDGER_ARTIFACT), deckLedger);
  return { slide_issue_ledger: ledger, deck_issue_ledger: deckLedger };
}

export function buildDeckIssueLedger(slideLedger: any = {}, calloutLedger: any = {}) {
  const issues = Array.isArray(slideLedger.issues) ? slideLedger.issues : [];
  const p0p1 = issues.filter((issue: any) => ['P0', 'P1'].includes(issue.severity) && !['fixed', 'accepted_not_applicable'].includes(issue.status));
  const bySlide = new Map<string, any[]>();
  for (const issue of issues) {
    const key = String(issue.slide_index || issue.slide_id || 'unknown');
    bySlide.set(key, [...(bySlide.get(key) || []), issue]);
  }
  return {
    schema: 'sks.ppt-deck-issue-ledger.v1',
    created_at: nowIso(),
    slide_count: Number(calloutLedger.slide_count || bySlide.size || 0),
    issue_count: issues.length,
    p0_p1_count: p0p1.length,
    narrative_flow_issue_count: issues.filter((issue: any) => issue.category === 'narrative').length,
    duplicate_issue_count: duplicateIssueCount(issues),
    slide_priorities: Array.from(bySlide.entries()).map(([slide, rows]) => ({ slide, max_severity: maxSeverity(rows), count: rows.length })),
    scorecard: {
      p0_p1_zero: p0p1.length === 0,
      extraction_complete: slideLedger.blockers?.length === 0,
      deck_recheck_required: p0p1.length > 0
    },
    blockers: slideLedger.blockers || [],
    passed: p0p1.length === 0 && (slideLedger.blockers || []).length === 0,
    mock_fixture: slideLedger.mock_fixture === true
  };
}

async function extractOneGeneratedSlide(root: string, schemaPath: string, jsonSchema: Record<string, unknown>, generatedSlidePath: string, sessionId: string | null, image: any = {}) {
  const prompt = [
    'Extract only visible numbered PPT slide review callouts from the generated review image.',
    'Return schema-valid JSON for sks.ppt-slide-issue-ledger.v1.',
    'Do not invent slide issues or infer hidden business requirements.',
    'Use bbox coordinates in generated image pixels as [x,y,width,height].',
    `Generated slide review image: ${generatedSlidePath}.`
  ].join('\n');
  const provider = sessionId
    ? await runCodexExecResumeWithOutputSchema({
        sessionId,
        prompt,
        outputSchemaPath: schemaPath,
        outputFile: path.join(root, '.sneakoscope', 'tmp', `ppt-slide-issues-${Date.now()}.json`)
      }, { cwd: root })
    : await runOpenAIStructuredOutput({
        prompt,
        schemaName: 'ppt_slide_issue_ledger',
        jsonSchema,
        imagePath: path.resolve(root, generatedSlidePath)
      });
  if (!provider.ok || !provider.parsed_json) {
    return { ok: false, issues: [], blocker: provider.blocker || structuredOutputBlocker('ppt_slide_issue_extraction_missing', 'PPT slide issue extraction did not return schema-valid JSON.') };
  }
  const parsed: any = provider.parsed_json;
  const rows = Array.isArray(parsed.issues) ? parsed.issues : [];
  return {
    ok: rows.length > 0,
    issues: rows.map((row: any, index: number) => normalizePptIssue(row, image, index, sessionId ? 'real_gpt_image_2_callout' : 'structured_outputs_callout_extraction')),
    blocker: rows.length ? null : structuredOutputBlocker('ppt_slide_issue_extraction_missing', 'Generated slide review image yielded no visible callouts.')
  };
}

function normalizePptIssue(issue: any = {}, image: any = {}, index = 0, source = 'real_gpt_image_2_callout') {
  const slideIndex = Number(issue.slide_index || image.slide_index || 1);
  return {
    id: issue.id || `ppt-slide-${slideIndex}-issue-${index + 1}`,
    slide_id: issue.slide_id || image.slide_id || `slide-${slideIndex}`,
    slide_index: slideIndex,
    generated_review_image_id: issue.generated_review_image_id || image.id || `ppt-generated-review-${slideIndex}`,
    callout_id: issue.callout_id || issue.id || `callout-${slideIndex}-${index + 1}`,
    bbox: Array.isArray(issue.bbox) ? issue.bbox : [0, 0, Math.max(1, Number(image.width || 1)), Math.max(1, Number(image.height || 1))],
    severity: ['P0', 'P1', 'P2', 'P3'].includes(issue.severity) ? issue.severity : 'P2',
    category: normalizeCategory(issue.category),
    title: issue.title || 'Slide visual issue',
    detail: issue.detail || 'Issue extracted from a generated PPT slide review image.',
    fix_action: issue.fix_action || 'Apply a targeted slide edit, export the slide, and re-review.',
    target_element: issue.target_element || issue.region || 'slide region',
    confidence: clamp(Number(issue.confidence ?? 0.5), 0, 1),
    source,
    status: issue.status || (issue.severity === 'P3' ? 'suggestion_only' : 'open')
  };
}

function normalizeCategory(value: any) {
  const allowed = new Set(['layout', 'typography', 'contrast', 'content_density', 'narrative', 'accessibility', 'visual_hierarchy', 'data_viz', 'brand', 'other']);
  return allowed.has(String(value)) ? String(value) : 'other';
}

function maxSeverity(rows: any[]) {
  const order = ['P0', 'P1', 'P2', 'P3'];
  return rows.map((row) => row.severity).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] || 'P3';
}

function duplicateIssueCount(issues: any[]) {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const issue of issues) {
    const key = `${issue.slide_index}:${issue.title}:${issue.target_element}`;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  return duplicates;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
