import { nowIso } from '../fsx.js';
import { AWESOME_DESIGN_MD_REFERENCE, CODEX_APP_IMAGE_GENERATION_DOC_URL, DESIGN_SYSTEM_SSOT, GETDESIGN_REFERENCE, PPT_CONDITIONAL_SKILL_ALLOWLIST, PPT_PIPELINE_MCP_ALLOWLIST, PPT_PIPELINE_SKILL_ALLOWLIST } from '../routes.js';
import { PRODUCT_DESIGN_LEGACY_DESIGN_FALLBACK_SKILLS, PRODUCT_DESIGN_PIPELINE_STAGES, PRODUCT_DESIGN_PLUGIN, PRODUCT_DESIGN_REQUIRED_SKILLS } from '../product-design-plugin.js';
import { PPT_STYLE_TOKENS_ARTIFACT } from './artifacts.js';

function cleanText(value: any, fallback: any = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

export const PPT_DESIGN_REFERENCE_PROFILES = Object.freeze([
  {
    id: 'awesome-design-md:ibm',
    name: 'IBM Carbon enterprise',
    source_url: 'https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/ibm/DESIGN.md',
    source_summary: 'enterprise Carbon-style system: white surfaces, charcoal text, IBM Blue as the single accent, flat square tiles, thin rules, no shadow',
    keywords: ['enterprise', 'b2b', 'investor', 'vc', 'strategy', 'proposal', 'board', 'finance', 'risk', 'compliance', '운영', '투자', '의사결정', '리스크', '전략'],
    tokens: {
      bg: '#ffffff',
      text: '#161616',
      muted: '#525252',
      primary: '#0f62fe',
      accent: '#393939',
      surface: '#f4f4f4',
      rule: '#e0e0e0',
      display_px: 64,
      body_px: 28,
      caption_px: 15,
      line_height: 1.36,
      radius_px: 2,
      treatment: 'flat_thin_rules_no_shadow',
      composition: 'enterprise_evidence_grid',
      mono_label: 'uppercase technical labels, sparse blue accent, source-visible rows'
    },
    applied_rules: [
      'use white/charcoal enterprise canvas',
      'reserve IBM Blue for one decision/action accent',
      'prefer thin rules and square evidence rows over decorative cards',
      'avoid shadows, gradients, and ornamental surfaces'
    ]
  },
  {
    id: 'awesome-design-md:vercel',
    name: 'Vercel developer infrastructure',
    source_url: 'https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/vercel/DESIGN.md',
    source_summary: 'developer-infrastructure minimalism: white canvas, near-black type, shadow-as-border, mono technical labels, functional blue/red/pink workflow accents',
    keywords: ['developer', 'devtools', 'api', 'sdk', 'cloud', 'infra', 'saas', 'technical', 'codex', 'ai', 'agent', '배포', '개발자', '기술', '자동화'],
    tokens: {
      bg: '#ffffff',
      text: '#171717',
      muted: '#4d4d4d',
      primary: '#0072f5',
      accent: '#ff5b4f',
      surface: '#fafafa',
      rule: '#ebebeb',
      display_px: 66,
      body_px: 28,
      caption_px: 14,
      line_height: 1.34,
      radius_px: 8,
      treatment: 'shadow_as_border_minimal_depth',
      composition: 'technical_pipeline_grid',
      mono_label: 'mono labels, workflow accent only when it clarifies sequence'
    },
    applied_rules: [
      'use near-black text on a white technical canvas',
      'show structure through shadow-as-border or one-pixel rules',
      'use mono labels for sources and technical evidence',
      'keep color functional rather than decorative'
    ]
  },
  {
    id: 'awesome-design-md:linear',
    name: 'Linear precision operations',
    source_url: 'https://github.com/VoltAgent/awesome-design-md',
    source_summary: 'ultra-minimal precise product-management system: restrained neutral surfaces, exact spacing, one controlled purple accent',
    keywords: ['roadmap', 'product', 'ops', 'workflow', 'issue', 'planning', 'productivity', '운영', '워크플로우', '프로덕트', '계획'],
    tokens: {
      bg: '#f7f8fb',
      text: '#101114',
      muted: '#5f6673',
      primary: '#5e6ad2',
      accent: '#26a69a',
      surface: '#ffffff',
      rule: '#dfe3ea',
      display_px: 62,
      body_px: 27,
      caption_px: 14,
      line_height: 1.38,
      radius_px: 6,
      treatment: 'precise_subtle_product_grid',
      composition: 'operational_decision_matrix',
      mono_label: 'compact status labels, dense but quiet operations layout'
    },
    applied_rules: [
      'use a quiet operational canvas with dense hierarchy',
      'keep the purple accent sparse and semantic',
      'make comparison rows easy to scan',
      'avoid marketing-style hero composition'
    ]
  }
]);


export function buildPptStyleTokens(contract: any = {}) {
  const korean = /[ㄱ-ㅎ가-힣]/.test(`${contract.prompt || ''} ${JSON.stringify(contract.answers || {})}`);
  const reference = selectPptDesignReference(contract);
  const refTokens = reference.applied_token_profile.color;
  const fontStack = korean
    ? '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'
    : reference.primary.id.endsWith(':ibm')
      ? '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, Arial, sans-serif'
      : '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Helvetica Neue", Arial, sans-serif';
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
      bg: refTokens.bg,
      text: refTokens.text,
      muted: refTokens.muted,
      primary: refTokens.primary,
      accent: refTokens.accent,
      surface: refTokens.surface,
      rule: refTokens.rule
    },
    typography: {
      language: korean ? 'ko' : 'en',
      font_stack: fontStack,
      display_px: refTokens.display_px,
      body_px: refTokens.body_px,
      caption_px: refTokens.caption_px,
      line_height: korean ? Math.max(1.4, refTokens.line_height) : refTokens.line_height,
      letter_spacing: 0
    },
    layout: {
      composition: refTokens.composition,
      treatment: refTokens.treatment,
      radius_px: refTokens.radius_px,
      rule_px: 1,
      source_rail: true,
      evidence_grid: true,
      mono_label: refTokens.mono_label
    },
    design_policy: {
      priority: 'information_first',
      visual_style: 'simple_restrained_detailed',
      pipeline_allowlist: {
        required_skills: [...PPT_PIPELINE_SKILL_ALLOWLIST],
        conditional_skills: [...PPT_CONDITIONAL_SKILL_ALLOWLIST],
        allowed_mcp_servers: [...PPT_PIPELINE_MCP_ALLOWLIST],
        primary_design_plugin: PRODUCT_DESIGN_PLUGIN.id,
        product_design_tools: [...PRODUCT_DESIGN_REQUIRED_SKILLS],
        product_design_stage_map: [...PRODUCT_DESIGN_PIPELINE_STAGES],
        ignore_installed_out_of_pipeline_skills: true,
        ignored_design_skills_even_if_installed: [...PRODUCT_DESIGN_LEGACY_DESIGN_FALLBACK_SKILLS],
        anti_ai_design_goal: 'prevent AI-like generic presentation design by forcing decisions through Product Design plugin evidence, audience, sources, and route-local style tokens instead of freeform decorative design skills',
        rule: 'PPT design and render work must use Product Design plugin first plus only the route allowlist. Installed skills or MCP servers outside this allowlist are ignored unless the sealed PPT contract explicitly activates a conditional entry.'
      },
      design_ssot: {
        primary_authority: PRODUCT_DESIGN_PLUGIN.id,
        authority: DESIGN_SYSTEM_SSOT.authority_file,
        builder_prompt: DESIGN_SYSTEM_SSOT.builder_prompt,
        route_local_artifact: PPT_STYLE_TOKENS_ARTIFACT,
        mode: 'product_design_primary_with_local_fallback_cache',
        rule: 'PPT style tokens are a route-local projection of Product Design plugin evidence when available; design.md/getdesign fallback inputs are selected, fused, and applied here rather than kept as independent authorities.'
      },
      product_design_plugin: {
        id: PRODUCT_DESIGN_PLUGIN.id,
        display_name: PRODUCT_DESIGN_PLUGIN.display_name,
        marketplace: PRODUCT_DESIGN_PLUGIN.marketplace,
        marketplace_kind: PRODUCT_DESIGN_PLUGIN.marketplace_kind,
        remote_plugin_id: PRODUCT_DESIGN_PLUGIN.remote_plugin_id,
        app_server_read_params: PRODUCT_DESIGN_PLUGIN.app_server.read_params,
        required_skills: [...PRODUCT_DESIGN_REQUIRED_SKILLS],
        stage_map: [...PRODUCT_DESIGN_PIPELINE_STAGES]
      },
      design_reference_selection: reference,
      source_inputs: [
        {
          id: PRODUCT_DESIGN_PLUGIN.id,
          url: PRODUCT_DESIGN_PLUGIN.marketplace,
          role: 'primary_codex_app_design_plugin'
        },
        {
          id: GETDESIGN_REFERENCE.id,
          url: GETDESIGN_REFERENCE.url,
          role: 'fallback_source_input_for_ssot'
        },
        {
          id: AWESOME_DESIGN_MD_REFERENCE.id,
          url: AWESOME_DESIGN_MD_REFERENCE.url,
          role: 'fallback_source_input_for_ssot'
        }
      ],
      avoid: ['over-designed decoration', 'ornamental gradients', 'nested cards', 'low-contrast gray body text', 'excessive motion or effects'],
      detail_strategy: ['precise spacing', 'clear hierarchy', 'thin rules', 'disciplined alignment', 'visible source rails', 'subtle accent color only when it clarifies meaning'],
      anti_generic_ai_style: 'prevent AI-like design: select and apply a concrete awesome-design-md reference profile before styling; do not default to generic cards, gradients, vague SaaS visuals, oversized decoration, or unsupported image-like flourishes',
      image_policy: 'use images only when they improve comprehension; prefer Codex App built-in image generation via https://learn.chatgpt.com/docs/image-generation when generated assets are needed'
    }
  };
}

export function selectPptDesignReference(contract: any = {}) {
  const text = cleanText(`${contract.prompt || ''} ${JSON.stringify(contract.answers || {})}`).toLowerCase();
  const scored = PPT_DESIGN_REFERENCE_PROFILES.map((profile: any) => {
    const score = profile.keywords.reduce((sum: any, keyword: any) => sum + (text.includes(String(keyword).toLowerCase()) ? 1 : 0), 0);
    return { profile, score };
  }).sort((a: any, b: any) => b.score - a.score);
  const topScore = scored[0]?.score ?? 0;
  const primary: any = topScore > 0 ? scored[0]?.profile : PPT_DESIGN_REFERENCE_PROFILES[0];
  const secondary: any = scored.find((entry: any) => entry.profile.id !== primary.id && entry.score > 0)?.profile || PPT_DESIGN_REFERENCE_PROFILES.find((entry: any) => entry.id !== primary.id);
  return {
    source: AWESOME_DESIGN_MD_REFERENCE.url,
    selection_method: 'keyword_match_against_sealed_ppt_contract',
    primary: {
      id: primary.id,
      name: primary.name,
      source_url: primary.source_url,
      source_summary: primary.source_summary,
      applied_rules: primary.applied_rules
    },
    secondary: secondary ? {
      id: secondary.id,
      name: secondary.name,
      source_url: secondary.source_url,
      source_summary: secondary.source_summary,
      applied_rules: secondary.applied_rules.slice(0, 2)
    } : null,
    selected_sources: [primary, secondary].filter(Boolean).map((profile: any) => ({
      id: profile.id,
      name: profile.name,
      source_url: profile.source_url,
      role: profile.id === primary.id ? 'primary_style_reference' : 'secondary_guardrail_reference'
    })),
    applied_token_profile: {
      color: primary.tokens,
      composition: primary.tokens.composition,
      treatment: primary.tokens.treatment
    },
    selection_reason: topScore > 0
      ? `matched ${topScore} contract keyword(s) to ${primary.name}`
      : `no strong domain match; defaulted to ${primary.name} for restrained business presentation output`
  };
}
