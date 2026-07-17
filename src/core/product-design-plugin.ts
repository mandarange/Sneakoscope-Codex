export const PRODUCT_DESIGN_REQUIRED_SKILLS = Object.freeze([
  'audit',
  'design-qa',
  'get-context',
  'ideate',
  'image-to-code',
  'index',
  'research',
  'share',
  'url-to-code',
  'user-context'
]);

export const PRODUCT_DESIGN_LEGACY_DESIGN_FALLBACK_SKILLS = Object.freeze([
  'sks-design-artifact-expert',
  'sks-design-ui-editor',
  'sks-design-system-builder',
  'sks-getdesign-reference'
]);

export const PRODUCT_DESIGN_PLUGIN = Object.freeze({
  id: 'product-design@openai-curated-remote',
  name: 'product-design',
  marketplace: 'openai-curated-remote',
  marketplace_kind: 'vertical',
  remote_plugin_id: 'Plugin_fa77aec24fc08191bc6e57f377126d76',
  display_name: 'Product Design',
  app_server: {
    read_params: {
      remoteMarketplaceName: 'openai-curated-remote',
      pluginName: 'Plugin_fa77aec24fc08191bc6e57f377126d76'
    },
    install_params: {
      remoteMarketplaceName: 'openai-curated-remote',
      pluginName: 'Plugin_fa77aec24fc08191bc6e57f377126d76'
    },
    name_lookup_params: {
      remoteMarketplaceName: 'openai-curated-remote',
      pluginName: 'product-design'
    },
    list_params: {
      marketplaceKinds: ['vertical']
    }
  }
});

export const PRODUCT_DESIGN_PIPELINE_STAGES = Object.freeze([
  {
    stage: 'context_intake',
    skills: ['get-context', 'user-context'],
    routes: ['Naruto', 'PPT', 'ImageUXReview'],
    purpose: 'capture product/user/design context before local design.md fallback is hydrated'
  },
  {
    stage: 'research_and_ideation',
    skills: ['research', 'ideate'],
    routes: ['Naruto', 'PPT'],
    purpose: 'ground competitive, audience, and concept exploration before visual decisions'
  },
  {
    stage: 'artifact_generation',
    skills: ['index', 'image-to-code', 'url-to-code'],
    routes: ['Naruto', 'PPT'],
    purpose: 'turn sealed context, screenshots, images, or URLs into prototype/source direction'
  },
  {
    stage: 'design_review',
    skills: ['audit', 'design-qa'],
    routes: ['Naruto', 'PPT', 'ImageUXReview', 'QALoop'],
    purpose: 'audit hierarchy, accessibility, responsiveness, polish, and route-specific UX risk'
  },
  {
    stage: 'delivery',
    skills: ['share'],
    routes: ['PPT', 'Naruto'],
    purpose: 'package or hand off design artifacts when the Codex App plugin exposes sharing'
  }
]);

export function productDesignPluginPolicyText() {
  const stages = PRODUCT_DESIGN_PIPELINE_STAGES
    .map((entry: any) => `${entry.stage}=${entry.skills.join('+')}`)
    .join('; ');
  return `Product Design plugin policy: design-related routes must prefer the Codex App Product Design plugin (${PRODUCT_DESIGN_PLUGIN.id}) from the remote vertical marketplace ${PRODUCT_DESIGN_PLUGIN.marketplace}. Discovery must not rely only on \`codex plugin list\`, because vertical marketplace plugins can be omitted from the local/default catalog; when Product Design is not ready, first run the app-server Product Design ensure path: plugin/read with remote plugin id params ${JSON.stringify(PRODUCT_DESIGN_PLUGIN.app_server.read_params)}, plugin/list with ${JSON.stringify(PRODUCT_DESIGN_PLUGIN.app_server.list_params)} if the id must be rediscovered, and plugin/install with ${JSON.stringify(PRODUCT_DESIGN_PLUGIN.app_server.install_params)} before falling back to legacy design.md skills. Expected ready evidence is installed=true, enabled=true, displayName/name Product Design, remotePluginId ${PRODUCT_DESIGN_PLUGIN.remote_plugin_id}, and skills ${PRODUCT_DESIGN_REQUIRED_SKILLS.join(', ')}. Pipeline mapping: ${stages}. Legacy local design helpers (${PRODUCT_DESIGN_LEGACY_DESIGN_FALLBACK_SKILLS.join(', ')}) are compatibility fallback only when Product Design auto-install/ensure is unavailable or still fails, or when the route explicitly needs an existing project-local design.md; do not auto-create a heavy design.md as the first design step when Product Design is ready.`;
}

export function normalizeProductDesignPluginEvidence(input: any = {}) {
  const detail = input?.plugin || input?.data?.plugin || input;
  const summary = detail?.summary || detail;
  const skills = Array.isArray(detail?.skills)
    ? detail.skills.map((skill: any) => String(skill?.name || skill || '')).filter(Boolean)
    : [];
  const id = String(summary?.id || detail?.id || '');
  const name = String(summary?.name || detail?.name || '');
  const displayName = String(summary?.displayName || detail?.displayName || summary?.display_name || detail?.display_name || name || '');
  const marketplaceName = String(detail?.marketplaceName || input?.marketplaceName || summary?.marketplaceName || '');
  const remotePluginId = String(summary?.remotePluginId || detail?.remotePluginId || summary?.remote_plugin_id || detail?.remote_plugin_id || '');
  const installed = summary?.installed === true || detail?.installed === true;
  const enabled = summary?.enabled === true || detail?.enabled === true;
  const missingSkills = PRODUCT_DESIGN_REQUIRED_SKILLS.filter((skill: any) => !skills.includes(skill));
  const identityOk = id === PRODUCT_DESIGN_PLUGIN.id
    || name === PRODUCT_DESIGN_PLUGIN.name
    || displayName === PRODUCT_DESIGN_PLUGIN.display_name
    || remotePluginId === PRODUCT_DESIGN_PLUGIN.remote_plugin_id;
  const marketplaceOk = !marketplaceName || marketplaceName === PRODUCT_DESIGN_PLUGIN.marketplace;
  const ok = Boolean(installed && enabled && identityOk && marketplaceOk && missingSkills.length === 0);
  return {
    schema: 'sks.product-design-plugin-evidence.v1',
    ok,
    id,
    name,
    display_name: displayName,
    marketplace_name: marketplaceName,
    remote_plugin_id: remotePluginId,
    installed,
    enabled,
    skills,
    missing_skills: missingSkills,
    expected: PRODUCT_DESIGN_PLUGIN,
    blockers: ok ? [] : [
      ...(!installed ? ['product_design_not_installed'] : []),
      ...(!enabled ? ['product_design_not_enabled'] : []),
      ...(!identityOk ? ['product_design_identity_unverified'] : []),
      ...(!marketplaceOk ? ['product_design_wrong_marketplace'] : []),
      ...(missingSkills.length ? ['product_design_skills_missing'] : [])
    ]
  };
}

export function productDesignPluginVisibilityFromCodexPluginList(input: any = {}) {
  const text = JSON.stringify(input || {});
  const listed = text.includes(PRODUCT_DESIGN_PLUGIN.id)
    || text.includes(PRODUCT_DESIGN_PLUGIN.name)
    || text.includes(PRODUCT_DESIGN_PLUGIN.remote_plugin_id);
  return {
    schema: 'sks.product-design-plugin-list-visibility.v1',
    listed,
    detector: 'codex plugin list --json',
    requires_remote_vertical_lookup: !listed,
    remote_marketplace: PRODUCT_DESIGN_PLUGIN.marketplace,
    app_server_read_params: PRODUCT_DESIGN_PLUGIN.app_server.read_params,
    app_server_list_params: PRODUCT_DESIGN_PLUGIN.app_server.list_params
  };
}
