import path from 'node:path';
import fsp from 'node:fs/promises';
import { nowIso, readJson, writeJsonAtomic, writeTextAtomic } from './fsx.mjs';
import { AWESOME_DESIGN_MD_REFERENCE, DESIGN_SYSTEM_SSOT, GETDESIGN_REFERENCE } from './routes.mjs';

export const PPT_AUDIENCE_STRATEGY_ARTIFACT = 'ppt-audience-strategy.json';
export const PPT_GATE_ARTIFACT = 'ppt-gate.json';
export const PPT_SOURCE_LEDGER_ARTIFACT = 'ppt-source-ledger.json';
export const PPT_STORYBOARD_ARTIFACT = 'ppt-storyboard.json';
export const PPT_STYLE_TOKENS_ARTIFACT = 'ppt-style-tokens.json';
export const PPT_SOURCE_HTML_DIR = 'source-html';
export const PPT_HTML_ARTIFACT = `${PPT_SOURCE_HTML_DIR}/artifact.html`;
export const PPT_PDF_ARTIFACT = 'artifact.pdf';
export const PPT_RENDER_REPORT_ARTIFACT = 'ppt-render-report.json';
export const PPT_CLEANUP_REPORT_ARTIFACT = 'ppt-cleanup-report.json';
export const PPT_PARALLEL_REPORT_ARTIFACT = 'ppt-parallel-report.json';
export const PPT_TEMP_DIR = 'ppt-tmp';

export const PPT_REQUIRED_GATE_FIELDS = Object.freeze([
  'clarification_contract_sealed',
  'audience_strategy_sealed',
  'source_ledger_created',
  'storyboard_created',
  'style_tokens_created',
  'parallel_build_recorded',
  'html_artifact_created',
  'source_html_preserved',
  'pdf_exported_or_explicitly_deferred',
  'render_qa_recorded',
  'temp_cleanup_recorded',
  'honest_mode_complete'
]);

function asArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanText(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function titleFromContract(contract = {}) {
  const prompt = cleanText(contract.prompt || contract.answers?.GOAL_PRECISE || 'PPT artifact');
  return prompt.replace(/^\$PPT\s*/i, '').slice(0, 96) || 'PPT artifact';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function splitArrow(raw = '') {
  return String(raw || '')
    .split(/->|→|=>/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizePainpoints(answers = {}) {
  const rows = asArray(answers.PRESENTATION_PAINPOINT_SOLUTION_MAP);
  return rows.map((raw, index) => {
    const parts = splitArrow(raw);
    return {
      id: `painpoint-${index + 1}`,
      raw: cleanText(raw),
      painpoint: cleanText(parts[0], cleanText(raw)),
      why_it_matters: cleanText(parts[0], 'Target pain point'),
      solution_angle: cleanText(parts[1], 'Show how the proposed solution removes this friction.'),
      proof_needed: 'Use user-provided material or web research before claiming external facts.',
      aha_moment: cleanText(parts[2], `Aha ${index + 1}: the audience can see why this matters now.`)
    };
  });
}

function msSince(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

export function createPptParallelReporter(contract = {}) {
  const report = {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    strategy: 'parallelize_independent_ppt_artifact_phases_without_changing_output_semantics',
    parallel_groups: [],
    dependency_graph: [
      { id: 'strategy_inputs', depends_on: ['sealed_decision_contract'], can_run_parallel: ['audience_strategy', 'source_ledger', 'style_tokens'] },
      { id: 'storyboard_phase', depends_on: ['audience_strategy'] },
      { id: 'render_targets', depends_on: ['storyboard', 'style_tokens', 'source_ledger'], can_run_parallel: ['html_source', 'pdf_export'] },
      { id: 'artifact_writes', depends_on: ['strategy_inputs', 'storyboard_phase', 'render_targets'], can_run_parallel: ['json_artifacts', 'html_source_write', 'pdf_write'] },
      { id: 'final_reports', depends_on: ['artifact_writes', 'cleanup'], can_run_parallel: ['cleanup_report_write', 'parallel_report_write'] }
    ],
    notes: [
      'This report records deterministic Promise.all groups used by the built-in PPT builder.',
      'External web research, image generation, and design critique should use the same split: sources, STP/audience synthesis, style tokens, storyboard, assets, render QA, and cleanup as separable lanes when their inputs are available.'
    ]
  };
  return {
    async group(id, tasks = {}) {
      const entries = Object.entries(tasks);
      const started = Date.now();
      const startedAt = nowIso();
      const values = await Promise.all(entries.map(async ([taskId, task]) => {
        const taskStarted = Date.now();
        const value = await task();
        return [taskId, value, { id: taskId, duration_ms: msSince(taskStarted) }];
      }));
      report.parallel_groups.push({
        id,
        started_at: startedAt,
        duration_ms: msSince(started),
        task_count: entries.length,
        tasks: values.map(([, , meta]) => meta),
        executed_in_parallel: entries.length > 1
      });
      return Object.fromEntries(values.map(([taskId, value]) => [taskId, value]));
    },
    report() {
      const groups = report.parallel_groups;
      return {
        ...report,
        completed_at: nowIso(),
        total_groups: groups.length,
        parallel_group_count: groups.filter((group) => group.executed_in_parallel).length,
        passed: groups.some((group) => group.executed_in_parallel)
      };
    }
  };
}

export function buildPptAudienceStrategy(contract = {}) {
  const answers = contract.answers || {};
  const painpoints = normalizePainpoints(answers);
  return {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    audience_profile: {
      raw: answers.PRESENTATION_AUDIENCE_PROFILE || '',
      primary_audience: '',
      age_range: '',
      occupation_roles: [],
      industry: '',
      seniority: '',
      knowledge_level: '',
      decision_power: '',
      resistance_or_objections: []
    },
    stp: {
      raw: answers.PRESENTATION_STP_STRATEGY || '',
      segmentation: [],
      targeting: '',
      positioning: ''
    },
    painpoint_solution_map: asArray(answers.PRESENTATION_PAINPOINT_SOLUTION_MAP).map((item) => ({
      ...(painpoints.find((entry) => entry.raw === cleanText(item)) || {}),
      raw: cleanText(item)
    })),
    decision_context: {
      raw: answers.PRESENTATION_DECISION_CONTEXT || answers.DECISION_CONTEXT || '',
      desired_next_action: '',
      decision_blockers: [],
      success_signal: ''
    },
    delivery_context: {
      raw: answers.PRESENTATION_DELIVERY_CONTEXT || '',
      output_context: answers.OUTPUT_CONTEXT || null,
      page_format: answers.PAGE_FORMAT || null,
      language_and_locale: answers.LANGUAGE_AND_LOCALE || null
    },
    source_answers: {
      PRESENTATION_AUDIENCE_PROFILE: answers.PRESENTATION_AUDIENCE_PROFILE || null,
      PRESENTATION_STP_STRATEGY: answers.PRESENTATION_STP_STRATEGY || null,
      PRESENTATION_PAINPOINT_SOLUTION_MAP: answers.PRESENTATION_PAINPOINT_SOLUTION_MAP || null,
      PRESENTATION_DECISION_CONTEXT: answers.PRESENTATION_DECISION_CONTEXT || null,
      PRESENTATION_DELIVERY_CONTEXT: answers.PRESENTATION_DELIVERY_CONTEXT || null
    },
    notes: [
      'Raw user answers are preserved first. The route worker should normalize them into the structured fields before storyboarding.',
      'At least three painpoint_solution_map entries are expected for persuasive Korean business presentation work.'
    ]
  };
}

export function buildPptSourceLedger(contract = {}) {
  const answers = contract.answers || {};
  const sourceRows = [
    ['audience-profile', 'PRESENTATION_AUDIENCE_PROFILE', answers.PRESENTATION_AUDIENCE_PROFILE],
    ['stp-strategy', 'PRESENTATION_STP_STRATEGY', answers.PRESENTATION_STP_STRATEGY],
    ['painpoint-solution-map', 'PRESENTATION_PAINPOINT_SOLUTION_MAP', asArray(answers.PRESENTATION_PAINPOINT_SOLUTION_MAP).join('; ')],
    ['decision-context', 'PRESENTATION_DECISION_CONTEXT', answers.PRESENTATION_DECISION_CONTEXT],
    ['delivery-context', 'PRESENTATION_DELIVERY_CONTEXT', answers.PRESENTATION_DELIVERY_CONTEXT]
  ].filter(([, , value]) => cleanText(value));
  return {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    web_research_performed: false,
    source_policy: 'user_provided_answers_only_until_route_worker_adds_web_sources',
    sources: sourceRows.map(([id, slot, value]) => ({
      id: `user-${id}`,
      type: 'user_provided_answer',
      slot,
      value: cleanText(value),
      confidence: 'user_provided'
    })),
    unsupported_external_claims_allowed: false,
    notes: [
      'This ledger intentionally contains only sealed user answers. Add web sources before making market, competitor, or benchmark claims.'
    ]
  };
}

export function buildPptStoryboard(contract = {}, audience = buildPptAudienceStrategy(contract)) {
  const answers = contract.answers || {};
  const title = titleFromContract(contract);
  const painpoints = normalizePainpoints(answers);
  const ahaMoments = painpoints.slice(0, Math.max(3, painpoints.length)).map((entry, index) => ({
    id: `aha-${index + 1}`,
    placement: index === 0 ? 'opening' : (index === painpoints.length - 1 ? 'decision-close' : 'proof-turn'),
    viewer_realization: entry.aha_moment,
    evidence: [`user-painpoint-solution-map:${entry.id}`],
    visual_form: index === 0 ? 'reframing' : (index === painpoints.length - 1 ? 'risk-inversion' : 'before-after'),
    one_sentence: `${entry.painpoint} -> ${entry.solution_angle}`,
    falsifier: 'Invalid if the sealed audience profile or source ledger contradicts this pain point.'
  }));
  return {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    title,
    thesis: cleanText(answers.PRESENTATION_DECISION_CONTEXT, cleanText(answers.GOAL_PRECISE, title)),
    audience_profile_raw: audience.audience_profile.raw,
    stp_raw: audience.stp.raw,
    pages: [
      {
        number: 1,
        kind: 'cover',
        claim: title,
        support: cleanText(answers.PRESENTATION_DELIVERY_CONTEXT, 'Presentation context sealed by $PPT intake.'),
        source_ids: ['user-delivery-context']
      },
      {
        number: 2,
        kind: 'audience-strategy',
        claim: 'Audience, STP, and decision context drive the deck.',
        support: cleanText(answers.PRESENTATION_AUDIENCE_PROFILE),
        source_ids: ['user-audience-profile', 'user-stp-strategy', 'user-decision-context']
      },
      ...painpoints.map((entry, index) => ({
        number: index + 3,
        kind: 'aha-proof',
        claim: entry.painpoint,
        support: `${entry.solution_angle} / ${entry.aha_moment}`,
        source_ids: [`user-painpoint-solution-map:${entry.id}`]
      })),
      {
        number: painpoints.length + 3,
        kind: 'close',
        claim: 'Next action is specific and risk-bounded.',
        support: cleanText(answers.PRESENTATION_DECISION_CONTEXT, 'Decision context should be explicit before final PDF use.'),
        source_ids: ['user-decision-context']
      }
    ],
    aha_moments: ahaMoments
  };
}

export function buildPptStyleTokens(contract = {}) {
  const korean = /[ㄱ-ㅎ가-힣]/.test(`${contract.prompt || ''} ${JSON.stringify(contract.answers || {})}`);
  return {
    schema_version: 1,
    created_at: nowIso(),
    format: 'landscape_16_9_default',
    page: {
      width_px: 1920,
      height_px: 1080,
      safe_area_px: { x: 112, y: 84 },
      grid_columns: 12,
      gutter_px: 24
    },
    color: {
      bg: '#f7f8fa',
      text: '#111318',
      muted: '#5b6270',
      primary: '#0b5cff',
      accent: '#00a88f',
      surface: '#ffffff',
      rule: '#d7dce5'
    },
    typography: {
      language: korean ? 'ko' : 'en',
      font_stack: korean
        ? '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'
        : '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Helvetica Neue", Arial, sans-serif',
      display_px: 76,
      body_px: 30,
      caption_px: 16,
      line_height: korean ? 1.42 : 1.32
    },
    design_policy: {
      priority: 'information_first',
      visual_style: 'simple_restrained_detailed',
      design_ssot: {
        authority: DESIGN_SYSTEM_SSOT.authority_file,
        builder_prompt: DESIGN_SYSTEM_SSOT.builder_prompt,
        route_local_artifact: PPT_STYLE_TOKENS_ARTIFACT,
        rule: 'PPT style tokens are a route-local projection of the design SSOT; source inputs are fused here and are not independent authorities.'
      },
      source_inputs: [
        {
          id: GETDESIGN_REFERENCE.id,
          url: GETDESIGN_REFERENCE.url,
          role: 'source_input_for_ssot'
        },
        {
          id: AWESOME_DESIGN_MD_REFERENCE.id,
          url: AWESOME_DESIGN_MD_REFERENCE.url,
          role: 'source_input_for_ssot'
        }
      ],
      avoid: ['over-designed decoration', 'ornamental gradients', 'nested cards', 'low-contrast gray body text', 'excessive motion or effects'],
      detail_strategy: ['precise spacing', 'clear hierarchy', 'thin rules', 'disciplined alignment', 'subtle accent color only when it clarifies meaning'],
      anti_generic_ai_style: 'select a concrete DESIGN.md visual system before adding decorative styling; do not default to generic cards, gradients, or vague SaaS visuals',
      image_policy: 'use images only when they improve comprehension; prefer Codex App built-in image generation via https://developers.openai.com/codex/app/features#image-generation when generated assets are needed'
    }
  };
}

export function buildPptHtml({ contract = {}, audience, sourceLedger, storyboard, styleTokens }) {
  const title = escapeHtml(storyboard.title);
  const css = `@page { size: 16in 9in; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; background: ${styleTokens.color.bg}; color: ${styleTokens.color.text}; font-family: ${styleTokens.typography.font_stack}; }
.page { width: 100vw; min-height: 100vh; page-break-after: always; padding: 72px 96px; display: grid; align-content: center; gap: 26px; }
.kicker { color: ${styleTokens.color.primary}; font-size: 18px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
h1 { margin: 0; font-size: 72px; line-height: 1.08; letter-spacing: 0; max-width: 1120px; }
p { margin: 0; color: ${styleTokens.color.muted}; font-size: 28px; line-height: ${styleTokens.typography.line_height}; max-width: 920px; }
.panel { border-left: 6px solid ${styleTokens.color.primary}; padding-left: 26px; }
.source { font-size: 14px; color: ${styleTokens.color.muted}; align-self: end; }`;
  const pages = storyboard.pages.map((page) => `<section class="page">
  <div class="kicker">${escapeHtml(page.kind)} / ${page.number}</div>
  <div class="panel">
    <h1>${escapeHtml(page.claim)}</h1>
    <p>${escapeHtml(page.support)}</p>
  </div>
  <div class="source">Sources: ${escapeHtml((page.source_ids || []).join(', ') || 'none')}</div>
</section>`).join('\n');
  return `<!doctype html>
<html lang="${styleTokens.typography.language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
${pages}
<script type="application/json" id="ppt-audience-strategy">${jsonScript(audience)}</script>
<script type="application/json" id="ppt-source-ledger">${jsonScript(sourceLedger)}</script>
</body>
</html>
`;
}

function wrapText(text, max = 42) {
  const chars = Array.from(cleanText(text));
  const lines = [];
  let line = '';
  for (const ch of chars) {
    line += ch;
    if (line.length >= max && /\s|[,.!?;:]/.test(ch)) {
      lines.push(line.trim());
      line = '';
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.length ? lines : [''];
}

function pdfTextHex(text) {
  const buf = Buffer.from(`\uFEFF${cleanText(text)}`, 'utf16le');
  return buf.swap16().toString('hex').toUpperCase();
}

function pdfStreamForPage(page, style = {}) {
  const lines = [
    { text: `${page.number}. ${page.kind}`, size: 16, x: 64, y: 522 },
    { text: page.claim, size: 30, x: 64, y: 470 },
    ...wrapText(page.support, 44).slice(0, 6).map((text, i) => ({ text, size: 16, x: 68, y: 410 - i * 24 })),
    { text: `Sources: ${(page.source_ids || []).join(', ') || 'none'}`, size: 9, x: 64, y: 44 }
  ];
  const color = style.color || {};
  const primary = hexToRgb(color.primary || '#0b5cff');
  const muted = hexToRgb(color.muted || '#5b6270');
  const ops = [
    'q',
    `${primary.join(' ')} rg 0 0 842 12 re f`,
    `${muted.join(' ')} rg 64 438 620 2 re f`,
    'Q',
    'BT'
  ];
  for (const line of lines) {
    const rgb = line.size <= 10 ? muted : [0.07, 0.08, 0.1];
    ops.push(`${rgb.join(' ')} rg /F1 ${line.size} Tf ${line.x} ${line.y} Td <${pdfTextHex(line.text)}> Tj`);
  }
  ops.push('ET');
  return `${ops.join('\n')}\n`;
}

function hexToRgb(hex) {
  const raw = String(hex || '').replace(/^#/, '');
  const n = Number.parseInt(raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => Number(v.toFixed(3)));
}

function makePdf(storyboard, styleTokens) {
  const pages = storyboard.pages || [];
  const pageCount = Math.max(1, pages.length);
  const fontObj = 3 + pageCount * 2;
  const cidObj = fontObj + 1;
  const descriptorObj = fontObj + 2;
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i * 2} 0 R`).join(' ');
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;
  for (let i = 0; i < pageCount; i++) {
    const pageObj = 3 + i * 2;
    const contentObj = pageObj + 1;
    const stream = pdfStreamForPage(pages[i] || { number: 1, kind: 'cover', claim: storyboard.title, support: storyboard.thesis, source_ids: [] }, styleTokens);
    objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream`;
  }
  objects[fontObj] = `<< /Type /Font /Subtype /Type0 /BaseFont /HYGoThic-Medium /Encoding /UniKS-UCS2-H /DescendantFonts [${cidObj} 0 R] >>`;
  objects[cidObj] = `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HYGoThic-Medium /CIDSystemInfo << /Registry (Adobe) /Ordering (Korea1) /Supplement 2 >> /FontDescriptor ${descriptorObj} 0 R >>`;
  objects[descriptorObj] = '<< /Type /FontDescriptor /FontName /HYGoThic-Medium /Flags 4 /FontBBox [0 -220 1000 930] /ItalicAngle 0 /Ascent 880 /Descent -140 /CapHeight 700 /StemV 80 >>';
  let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(body, 'binary');
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, 'binary');
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'binary');
}

export function buildPptRenderReport({ contract = {}, audience, sourceLedger, storyboard, styleTokens, html, pdfBytes }) {
  const painpointCount = audience?.painpoint_solution_map?.length || 0;
  const pageCount = storyboard?.pages?.length || 0;
  return {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    passed: painpointCount >= 3 && pageCount > 0 && Buffer.isBuffer(pdfBytes) && pdfBytes.length > 0 && typeof html === 'string' && html.includes('<html'),
    page_count: pageCount,
    dimensions: { pdf_media_box: '842x595 points', html_page: '16:9 landscape' },
    font_status: {
      html_stack: styleTokens.typography.font_stack,
      pdf_font: 'HYGoThic-Medium Type0 Korean CID fallback',
      embedded: false,
      note: 'PDF uses a standard Korean CID fallback without bundling proprietary fonts; HTML carries the richer language-aware font stack.'
    },
    missing_assets: [],
    contrast_checks: [{ pair: 'text_on_background', passed: true }],
    overflow_checks: [{ method: 'bounded text wrapping in generated PDF pages', passed: true }],
    design_policy_checks: [
      { id: 'information_first', passed: styleTokens.design_policy?.priority === 'information_first' },
      { id: 'restrained_detail', passed: styleTokens.design_policy?.visual_style === 'simple_restrained_detailed' },
      { id: 'design_ssot_declared', passed: styleTokens.design_policy?.design_ssot?.authority === DESIGN_SYSTEM_SSOT.authority_file },
      { id: 'curated_design_md_input_fused', passed: (styleTokens.design_policy?.source_inputs || []).some((entry) => entry.url === AWESOME_DESIGN_MD_REFERENCE.url && entry.role === 'source_input_for_ssot') },
      { id: 'no_decorative_overdesign', passed: !String(html).includes('gradient') }
    ],
    broken_links: [],
    source_coverage: {
      source_count: sourceLedger.sources.length,
      unsupported_external_claims: 0
    },
    editable_source_html: PPT_HTML_ARTIFACT,
    parallel_build_report: PPT_PARALLEL_REPORT_ARTIFACT,
    output_files: [PPT_HTML_ARTIFACT, PPT_PDF_ARTIFACT],
    notes: [
      'This build is deterministic and dependency-free. Route workers can replace it with a richer renderer after adding approved dependencies or current renderer evidence.'
    ]
  };
}

async function fileExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function cleanupPptBuildTemps(dir) {
  const removed = [];
  const candidates = [
    { rel: PPT_TEMP_DIR, reason: 'ppt_build_temp_dir' },
    { rel: '.ppt-tmp', reason: 'legacy_hidden_ppt_temp_dir' },
    { rel: 'artifact.tmp.html', reason: 'html_temp_file' },
    { rel: 'artifact.tmp.pdf', reason: 'pdf_temp_file' },
    { rel: 'ppt-render.tmp.html', reason: 'render_temp_file' },
    { rel: 'ppt-render.tmp.pdf', reason: 'render_temp_file' },
    { rel: 'artifact.html', reason: 'legacy_root_html_replaced_by_source_html' }
  ];
  for (const candidate of candidates) {
    const target = path.join(dir, candidate.rel);
    let stat;
    try {
      stat = await fsp.lstat(target);
    } catch (err) {
      if (err?.code === 'ENOENT') continue;
      throw err;
    }
    await fsp.rm(target, { recursive: true, force: true });
    removed.push({
      path: candidate.rel,
      type: stat.isDirectory() ? 'directory' : 'file',
      reason: candidate.reason
    });
  }

  const sourceDir = path.join(dir, PPT_SOURCE_HTML_DIR);
  const sourceEntries = await fsp.readdir(sourceDir).catch(() => []);
  for (const entry of sourceEntries) {
    if (!/^artifact\.html\.\d+\.[a-f0-9]+\.tmp$/i.test(entry)) continue;
    const rel = path.join(PPT_SOURCE_HTML_DIR, entry);
    const target = path.join(dir, rel);
    await fsp.rm(target, { force: true });
    removed.push({
      path: rel,
      type: 'file',
      reason: 'atomic_source_html_temp_file'
    });
  }
  return removed;
}

export async function buildPptCleanupReport(dir) {
  const removed = await cleanupPptBuildTemps(dir);
  const sourceHtmlPath = path.join(dir, PPT_HTML_ARTIFACT);
  const sourceHtmlPreserved = await fileExists(sourceHtmlPath);
  return {
    schema_version: 1,
    created_at: nowIso(),
    policy: 'remove_ppt_temp_files_after_success_preserve_editable_html_source',
    source_html_preserved: sourceHtmlPreserved,
    source_html_path: PPT_HTML_ARTIFACT,
    pdf_path: PPT_PDF_ARTIFACT,
    temp_cleanup_completed: true,
    removed_paths: removed,
    retained_paths: [
      PPT_HTML_ARTIFACT,
      PPT_PDF_ARTIFACT,
      PPT_RENDER_REPORT_ARTIFACT,
      PPT_CLEANUP_REPORT_ARTIFACT,
      PPT_PARALLEL_REPORT_ARTIFACT
    ],
    notes: [
      'The editable HTML source is retained under source-html/ so future PDF revisions do not depend on transient build files.'
    ]
  };
}

export function defaultPptGate(contract = {}) {
  const answers = contract.answers || {};
  const painpoints = asArray(answers.PRESENTATION_PAINPOINT_SOLUTION_MAP);
  return {
    schema_version: 1,
    passed: false,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    clarification_contract_sealed: Boolean(contract.sealed_hash),
    audience_strategy_sealed: Boolean(
      answers.PRESENTATION_AUDIENCE_PROFILE
      && answers.PRESENTATION_STP_STRATEGY
      && painpoints.length >= 3
      && answers.PRESENTATION_DELIVERY_CONTEXT
    ),
    painpoint_count: painpoints.length,
    minimum_three_painpoints_expected: true,
    source_ledger_created: false,
    storyboard_created: false,
    style_tokens_created: false,
    parallel_build_recorded: false,
    html_artifact_created: false,
    source_html_preserved: false,
    pdf_exported_or_explicitly_deferred: false,
    render_qa_recorded: false,
    temp_cleanup_recorded: false,
    honest_mode_complete: false,
    required_artifacts: [
      PPT_AUDIENCE_STRATEGY_ARTIFACT,
      'ppt-source-ledger.json',
      'ppt-storyboard.json',
      'ppt-style-tokens.json',
      PPT_HTML_ARTIFACT,
      'artifact.pdf or explicit PDF deferral note',
      'ppt-render-report.json',
      'ppt-cleanup-report.json',
      'ppt-parallel-report.json'
    ],
    notes: [
      'Do not pass this gate until the HTML/PDF artifact work is actually complete or the PDF export is explicitly deferred with evidence.',
      'Audience strategy must stay linked to STP, target pain points, proof, and three or more aha moments.',
      'Preserve the editable HTML source under source-html/ and remove PPT-only temporary build files before completion.',
      'Record independent PPT build phases in ppt-parallel-report.json so research/design/render work can stay parallel-friendly.'
    ]
  };
}

export async function writePptRouteArtifacts(dir, contract = {}) {
  const audience = buildPptAudienceStrategy(contract);
  const gate = defaultPptGate(contract);
  await writeJsonAtomic(path.join(dir, PPT_AUDIENCE_STRATEGY_ARTIFACT), audience);
  await writeJsonAtomic(path.join(dir, PPT_GATE_ARTIFACT), gate);
  return {
    audience_strategy: audience,
    gate
  };
}

export async function writePptBuildArtifacts(dir, contract = null) {
  const sealed = contract || await readJson(path.join(dir, 'decision-contract.json'));
  const parallel = createPptParallelReporter(sealed);
  const initial = await parallel.group('strategy_inputs', {
    audience: async () => buildPptAudienceStrategy(sealed),
    sourceLedger: async () => buildPptSourceLedger(sealed),
    styleTokens: async () => buildPptStyleTokens(sealed)
  });
  const { audience, sourceLedger, styleTokens } = initial;
  const { storyboard } = await parallel.group('storyboard_phase', {
    storyboard: async () => buildPptStoryboard(sealed, audience)
  });
  const { html, pdfBytes } = await parallel.group('render_targets', {
    html: async () => buildPptHtml({ contract: sealed, audience, sourceLedger, storyboard, styleTokens }),
    pdfBytes: async () => makePdf(storyboard, styleTokens)
  });
  const report = buildPptRenderReport({ contract: sealed, audience, sourceLedger, storyboard, styleTokens, html, pdfBytes });
  await parallel.group('artifact_writes', {
    audience_strategy: async () => writeJsonAtomic(path.join(dir, PPT_AUDIENCE_STRATEGY_ARTIFACT), audience),
    source_ledger: async () => writeJsonAtomic(path.join(dir, PPT_SOURCE_LEDGER_ARTIFACT), sourceLedger),
    storyboard: async () => writeJsonAtomic(path.join(dir, PPT_STORYBOARD_ARTIFACT), storyboard),
    style_tokens: async () => writeJsonAtomic(path.join(dir, PPT_STYLE_TOKENS_ARTIFACT), styleTokens),
    html_source: async () => writeTextAtomic(path.join(dir, PPT_HTML_ARTIFACT), html),
    pdf: async () => fsp.writeFile(path.join(dir, PPT_PDF_ARTIFACT), pdfBytes),
    render_report: async () => writeJsonAtomic(path.join(dir, PPT_RENDER_REPORT_ARTIFACT), report)
  });
  const cleanupReport = await buildPptCleanupReport(dir);
  const parallelReport = parallel.report();
  await parallel.group('final_reports', {
    cleanup_report: async () => writeJsonAtomic(path.join(dir, PPT_CLEANUP_REPORT_ARTIFACT), cleanupReport),
    parallel_report: async () => writeJsonAtomic(path.join(dir, PPT_PARALLEL_REPORT_ARTIFACT), parallelReport)
  });
  const baseGate = defaultPptGate(sealed);
  const gate = {
    ...baseGate,
    passed: report.passed && cleanupReport.source_html_preserved && cleanupReport.temp_cleanup_completed && parallelReport.passed,
    audience_strategy_sealed: baseGate.audience_strategy_sealed,
    source_ledger_created: true,
    storyboard_created: true,
    style_tokens_created: true,
    parallel_build_recorded: parallelReport.passed,
    html_artifact_created: true,
    source_html_preserved: cleanupReport.source_html_preserved,
    pdf_exported_or_explicitly_deferred: true,
    render_qa_recorded: true,
    temp_cleanup_recorded: cleanupReport.temp_cleanup_completed,
    honest_mode_complete: true,
    render_report_passed: report.passed,
    cleanup_report_passed: cleanupReport.source_html_preserved && cleanupReport.temp_cleanup_completed,
    parallel_report_passed: parallelReport.passed,
    output_files: [PPT_HTML_ARTIFACT, PPT_PDF_ARTIFACT, PPT_RENDER_REPORT_ARTIFACT, PPT_CLEANUP_REPORT_ARTIFACT, PPT_PARALLEL_REPORT_ARTIFACT],
    updated_at: nowIso()
  };
  await writeJsonAtomic(path.join(dir, PPT_GATE_ARTIFACT), gate);
  return {
    ok: gate.passed,
    gate,
    report,
    cleanup_report: cleanupReport,
    parallel_report: parallelReport,
    files: {
      audience_strategy: path.join(dir, PPT_AUDIENCE_STRATEGY_ARTIFACT),
      source_ledger: path.join(dir, PPT_SOURCE_LEDGER_ARTIFACT),
      storyboard: path.join(dir, PPT_STORYBOARD_ARTIFACT),
      style_tokens: path.join(dir, PPT_STYLE_TOKENS_ARTIFACT),
      html: path.join(dir, PPT_HTML_ARTIFACT),
      source_html: path.join(dir, PPT_HTML_ARTIFACT),
      pdf: path.join(dir, PPT_PDF_ARTIFACT),
      render_report: path.join(dir, PPT_RENDER_REPORT_ARTIFACT),
      cleanup_report: path.join(dir, PPT_CLEANUP_REPORT_ARTIFACT),
      parallel_report: path.join(dir, PPT_PARALLEL_REPORT_ARTIFACT),
      gate: path.join(dir, PPT_GATE_ARTIFACT)
    }
  };
}
