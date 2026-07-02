function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonScript(value: any) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}


export function buildPptHtml({ contract = {}, audience, sourceLedger, factLedger, imageAssetLedger, reviewPolicy, storyboard, styleTokens }: any) {
  const title = escapeHtml(storyboard.title);
  const referenceName = escapeHtml(styleTokens.design_policy?.design_reference_selection?.primary?.name || 'selected design reference');
  const audienceRaw = escapeHtml(audience?.audience_profile?.raw || 'Audience context');
  const stpRaw = escapeHtml(audience?.stp?.raw || 'STP context');
  const decisionRaw = escapeHtml(audience?.decision_context?.raw || storyboard.thesis || '');
  const surfaceRule = styleTokens.layout?.treatment === 'shadow_as_border_minimal_depth'
    ? `box-shadow: 0 0 0 1px ${styleTokens.color.rule}; border: 0;`
    : `border: 1px solid ${styleTokens.color.rule}; box-shadow: none;`;
  const css = `@page { size: 16in 9in; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; background: ${styleTokens.color.bg}; color: ${styleTokens.color.text}; font-family: ${styleTokens.typography.font_stack}; }
.page { width: 100vw; min-height: 100vh; page-break-after: always; padding: 64px 88px 54px; display: grid; grid-template-rows: auto 1fr auto; gap: 34px; }
.topline { display: grid; grid-template-columns: 1fr auto; align-items: end; border-bottom: 1px solid ${styleTokens.color.rule}; padding-bottom: 14px; }
.kicker { color: ${styleTokens.color.primary}; font-size: ${styleTokens.typography.caption_px}px; font-weight: 600; letter-spacing: 0; text-transform: uppercase; }
.reference { color: ${styleTokens.color.muted}; font-size: ${styleTokens.typography.caption_px}px; letter-spacing: 0; }
.content { display: grid; grid-template-columns: minmax(0, 6fr) minmax(320px, 4fr); gap: 58px; align-items: center; }
h1 { margin: 0; font-size: ${styleTokens.typography.display_px}px; line-height: 1.08; letter-spacing: 0; max-width: 1040px; font-weight: 600; }
p { margin: 0; color: ${styleTokens.color.muted}; font-size: ${styleTokens.typography.body_px}px; line-height: ${styleTokens.typography.line_height}; max-width: 920px; }
.claim { display: grid; gap: 26px; }
.evidence { ${surfaceRule} border-radius: ${styleTokens.layout.radius_px}px; background: ${styleTokens.color.surface}; display: grid; }
.image-asset { padding: 12px; border-bottom: 1px solid ${styleTokens.color.rule}; }
.image-asset img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: ${styleTokens.layout.radius_px}px; }
.evidence-row { padding: 22px 24px; border-bottom: 1px solid ${styleTokens.color.rule}; }
.evidence-row:last-child { border-bottom: 0; }
.label { color: ${styleTokens.color.primary}; font-size: ${styleTokens.typography.caption_px}px; font-weight: 600; letter-spacing: 0; text-transform: uppercase; margin-bottom: 8px; }
.value { color: ${styleTokens.color.text}; font-size: 20px; line-height: 1.42; }
.source { display: grid; grid-template-columns: 1fr auto; gap: 24px; color: ${styleTokens.color.muted}; font-size: ${styleTokens.typography.caption_px}px; border-top: 1px solid ${styleTokens.color.rule}; padding-top: 14px; }
.accent { width: 64px; height: 3px; background: ${styleTokens.color.accent}; }`;
  const generatedAssets = (imageAssetLedger?.assets || []).filter((asset: any) => asset.status === 'generated' && asset.html_src);
  const pages = storyboard.pages.map((page: any) => {
    const asset = generatedAssets.find((candidate: any) => Number(candidate.slide) === Number(page.number));
    return `<section class="page">
  <header class="topline">
    <div class="kicker">${escapeHtml(page.kind)} / ${page.number}</div>
    <div class="reference">${referenceName}</div>
  </header>
  <main class="content">
    <div class="claim">
      <div class="accent"></div>
      <h1>${escapeHtml(page.claim)}</h1>
      <p>${escapeHtml(page.support)}</p>
    </div>
    <aside class="evidence" aria-label="decision evidence">
      ${asset ? `<div class="image-asset"><img src="${escapeHtml(asset.html_src)}" alt="${escapeHtml(asset.role || 'generated presentation visual')}"></div>` : ''}
      <div class="evidence-row">
        <div class="label">Audience</div>
        <div class="value">${audienceRaw}</div>
      </div>
      <div class="evidence-row">
        <div class="label">STP</div>
        <div class="value">${stpRaw}</div>
      </div>
      <div class="evidence-row">
        <div class="label">Decision</div>
        <div class="value">${decisionRaw}</div>
      </div>
    </aside>
  </main>
  <div class="source">
    <span>Sources: ${escapeHtml((page.source_ids || []).join(', ') || 'none')}</span>
    <span>${escapeHtml(styleTokens.layout?.composition || 'presentation-grid')}</span>
  </div>
</section>`;
  }).join('\n');
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
<script type="application/json" id="ppt-fact-ledger">${jsonScript(factLedger || null)}</script>
<script type="application/json" id="ppt-image-asset-ledger">${jsonScript(imageAssetLedger || null)}</script>
<script type="application/json" id="ppt-review-policy">${jsonScript(reviewPolicy || null)}</script>
</body>
</html>
`;
}

