import path from 'node:path';
import { codexSchemaPath, runCodexExecResumeWithOutputSchema, structuredOutputBlocker } from '../codex-exec-output-schema.js';
import { readJson } from '../fsx.js';
import { runOpenAIStructuredOutput } from '../structured-output-adapter.js';
import { generatedImageMetadata } from './imagegen-adapter.js';
import { buildIssueLedgerFromGeneratedCallouts } from './callout-extraction.js';

export interface RealCalloutExtractionInput {
  root: string;
  generatedImagePath: string;
  sourceScreenshot?: Record<string, unknown> | null;
  sessionId?: string | null;
  prompt?: string | null;
}

export async function extractRealCallouts(input: RealCalloutExtractionInput) {
  const schemaPath = await codexSchemaPath('image-ux-issue-ledger');
  const jsonSchema = await readJson<Record<string, unknown>>(schemaPath);
  const prompt = input.prompt || buildRealCalloutExtractionPrompt(input);
  const generated = await generatedImageMetadata(input.root, input.generatedImagePath, {
    real_generated: true,
    source_screen_id: input.sourceScreenshot?.id || 'screen-1'
  });

  let providerResult: any = null;
  if (input.sessionId) {
    providerResult = await runCodexExecResumeWithOutputSchema({
      sessionId: input.sessionId,
      prompt,
      outputSchemaPath: schemaPath,
      outputFile: path.join(input.root, '.sneakoscope', 'tmp', `ux-callout-extraction-${Date.now()}.json`)
    });
  } else {
    providerResult = await runOpenAIStructuredOutput({
      prompt,
      schemaName: 'image_ux_issue_ledger',
      jsonSchema,
      imagePath: path.resolve(input.root, input.generatedImagePath)
    });
  }

  if (!providerResult.ok || !providerResult.parsed_json) {
    return {
      schema: 'sks.image-ux-real-callout-extraction.v1',
      ok: false,
      status: providerResult.status || 'blocked',
      provider: providerResult.provider || 'codex_exec_resume_output_schema',
      blocker: providerResult.blocker || structuredOutputBlocker('callout_extraction_schema_failed', 'Callout extraction did not return schema-valid JSON.'),
      generated_image_sha256: generated.sha256,
      issue_ledger: buildIssueLedgerFromGeneratedCallouts({
        schema: 'sks.image-ux-generated-review-ledger.v2',
        generated_review_images: [{ ...generated, callout_extraction_status: 'pending', callouts: [] }],
        passed: true
      })
    };
  }

  const parsed = providerResult.parsed_json as any;
  const rows = Array.isArray(parsed.issues) ? parsed.issues : [];
  const ledger = buildIssueLedgerFromGeneratedCallouts({
    schema: 'sks.image-ux-generated-review-ledger.v2',
    generated_review_images: [{
      ...generated,
      extraction_provider: providerResult.provider || 'codex_exec_resume_output_schema',
      callout_extraction_status: 'succeeded',
      callouts: rows
    }],
    passed: true
  });
  return {
    schema: 'sks.image-ux-real-callout-extraction.v1',
    ok: ledger.validation.ok && ledger.issues.length > 0,
    status: ledger.validation.ok && ledger.issues.length > 0 ? 'extracted' : 'blocked',
    provider: providerResult.provider || 'codex_exec_resume_output_schema',
    generated_image_sha256: generated.sha256,
    issue_ledger: ledger,
    blocker: ledger.issues.length ? null : structuredOutputBlocker('callout_extraction_schema_failed', 'Generated image did not yield visible callouts.')
  };
}

export function buildRealCalloutExtractionPrompt(input: RealCalloutExtractionInput) {
  const source = input.sourceScreenshot || {};
  return [
    'Analyze the generated UX review image pixels directly.',
    'Return only visible numbered callouts from the generated image.',
    'Do not invent issues, requirements, or invisible callouts.',
    'Return bbox coordinates in the generated image coordinate system as [x,y,width,height].',
    'If severity text is not visible, set severity_visible=false and choose the closest severity with low confidence.',
    'Set callout_number_visible=false when the number is unclear.',
    'Include bbox_confidence and text_ocr_confidence from 0 to 1.',
    `Generated image path: ${input.generatedImagePath}.`,
    source.id ? `Source screenshot id: ${source.id}.` : '',
    source.sha256 ? `Source screenshot sha256: ${source.sha256}.` : ''
  ].filter(Boolean).join('\n');
}
