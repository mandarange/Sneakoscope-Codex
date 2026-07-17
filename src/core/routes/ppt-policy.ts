import { PRODUCT_DESIGN_LEGACY_DESIGN_FALLBACK_SKILLS, PRODUCT_DESIGN_PLUGIN, productDesignPluginPolicyText } from '../product-design-plugin.js';
import { CODEX_APP_IMAGE_GENERATION_DOC_URL, CODEX_IMAGEGEN_REQUIRED_POLICY } from './evidence.js';
import { DESIGN_SYSTEM_SSOT, PRODUCT_DESIGN_PLUGIN_TOOL_ALLOWLIST } from './design-policy.js';

export const PPT_PIPELINE_SKILL_ALLOWLIST = Object.freeze([
  'sks-ppt',
  'sks-imagegen',
  'sks-getdesign-reference',
  'sks-prompt-pipeline',
  'sks-reflection',
  'sks-honest-mode'
]);

export const PPT_CONDITIONAL_SKILL_ALLOWLIST = Object.freeze([]);

export const PPT_PIPELINE_MCP_ALLOWLIST = Object.freeze([
  {
    mcp: 'context7',
    condition: 'only_when_current_external_documentation_is_required_for_sources_or_package_api_usage'
  }
]);

export function pptPipelineAllowlistPolicyText() {
  const conditionalSkills = PPT_CONDITIONAL_SKILL_ALLOWLIST.length
    ? PPT_CONDITIONAL_SKILL_ALLOWLIST.map((entry: any) => `${entry.skill}=${entry.condition}`).join('; ')
    : 'none';
  return `PPT pipeline allowlist: during $PPT design/render work, ignore installed skills and MCPs that are not explicitly part of the $PPT pipeline. The purpose is to prevent AI-like generic presentation design: decorative gradients, nested cards, vague SaaS visuals, and style choices not grounded in the audience, source material, Product Design plugin evidence, getdesign fallback reference, or the project design cache. Required SKS skills are ${PPT_PIPELINE_SKILL_ALLOWLIST.join(', ')}. Product Design plugin tools are allowed and preferred for design work: ${PRODUCT_DESIGN_PLUGIN_TOOL_ALLOWLIST.join(', ')}. Use ${PRODUCT_DESIGN_PLUGIN.id} first for get-context/user-context intake, research/ideate exploration, index/image-to-code/url-to-code artifact direction, audit/design-qa review, and share handoff when available. The imagegen skill is required for $PPT so Codex App can invoke official built-in $imagegen/gpt-image-2 for every generated raster asset or generated visual-review image; do not route PPT imagery through direct API fallback. Do not use generic design skills such as ${PRODUCT_DESIGN_LEGACY_DESIGN_FALLBACK_SKILLS.join(', ')} for $PPT just because they are installed. $PPT design must use Product Design plugin first; if unavailable, use getdesign-reference plus the built-in PPT design implementation pipeline: existing ${DESIGN_SYSTEM_SSOT.authority_file} when present, ${DESIGN_SYSTEM_SSOT.builder_prompt} as fallback builder prompt when missing, and route-local ppt-style-tokens.json as the fused design projection. Conditional skills/MCPs are allowed only when their condition is sealed in the contract: ${conditionalSkills}; ${PPT_PIPELINE_MCP_ALLOWLIST.map((entry: any) => `${entry.mcp}=${entry.condition}`).join('; ')}. Fact, image, and review evidence are first-class artifacts: gather user-provided context and required web/Context7 evidence into ppt-fact-ledger.json, block unsupported critical claims, plan required image resources through ppt-image-asset-ledger.json, then run a bounded review loop recorded in ppt-review-policy.json, ppt-review-ledger.json, and ppt-iteration-report.json. Required raster asset or generated visual-review evidence must come from Codex App $imagegen/gpt-image-2; direct API fallback, placeholder files, and prose-only substitutes do not satisfy the route gate. The review loop caps full-deck passes at 2, slide retries at 2, requires P0/P1 issue count to be zero, targets score >= 0.88, and stops when improvement delta is below 0.03 or evidence is missing. For Codex App visual critique, invoke $imagegen/gpt-image-2 (${CODEX_APP_IMAGE_GENERATION_DOC_URL}) when required; never simulate missing gpt-image-2 output. If required image-review evidence is unavailable, record the blocker instead of passing the gate. ${productDesignPluginPolicyText()} ${CODEX_IMAGEGEN_REQUIRED_POLICY}`;
}
