#!/usr/bin/env node
// @ts-nocheck
import { PRODUCT_DESIGN_PIPELINE_STAGES, PRODUCT_DESIGN_PLUGIN, PRODUCT_DESIGN_REQUIRED_SKILLS, normalizeProductDesignPluginEvidence, productDesignPluginVisibilityFromCodexPluginList } from '../core/product-design-plugin.js';
import { assertGate, emitGate, readText, releaseGateIds } from './lib/codex-sdk-gate-lib.js';

const routesSource = readText('src/core/routes.ts');
const routeConstantsSource = readText('src/core/routes/constants.ts');
const routeDesignPolicySource = readText('src/core/routes/design-policy.ts');
const routePptPolicySource = readText('src/core/routes/ppt-policy.ts');
const routePolicySource = [routesSource, routeConstantsSource, routeDesignPolicySource, routePptPolicySource].join('\n');
const productDesignSource = readText('src/core/product-design-plugin.ts');
const pptSource = [
  readText('src/core/ppt.ts'),
  readText('src/core/ppt/style-tokens.ts')
].join('\n');
const codexAppSource = readText('src/core/codex-app.ts');
const initSkillsSource = readText('src/core/init/skills.ts');
const releaseGates = releaseGateIds();

assertGate(PRODUCT_DESIGN_PLUGIN.id === 'product-design@openai-curated-remote', 'Product Design plugin id must use the remote marketplace');
assertGate(PRODUCT_DESIGN_PLUGIN.marketplace === 'openai-curated-remote', 'Product Design marketplace must be openai-curated-remote');
assertGate(PRODUCT_DESIGN_PLUGIN.marketplace_kind === 'vertical', 'Product Design marketplace kind must be vertical');
assertGate(PRODUCT_DESIGN_PLUGIN.remote_plugin_id === 'Plugin_fa77aec24fc08191bc6e57f377126d76', 'Product Design remote plugin id mismatch');
assertGate(PRODUCT_DESIGN_PLUGIN.app_server.read_params.remoteMarketplaceName === 'openai-curated-remote', 'plugin/read remote marketplace missing');
assertGate(PRODUCT_DESIGN_PLUGIN.app_server.install_params.remoteMarketplaceName === 'openai-curated-remote', 'plugin/install remote marketplace missing');
assertGate(PRODUCT_DESIGN_PLUGIN.app_server.read_params.pluginName === PRODUCT_DESIGN_PLUGIN.remote_plugin_id, 'plugin/read must use Product Design remote plugin id');
assertGate(PRODUCT_DESIGN_PLUGIN.app_server.install_params.pluginName === PRODUCT_DESIGN_PLUGIN.remote_plugin_id, 'plugin/install must use Product Design remote plugin id');
assertGate(PRODUCT_DESIGN_PLUGIN.app_server.list_params.marketplaceKinds.includes('vertical'), 'plugin/list must query vertical marketplaces');

for (const skill of ['audit', 'design-qa', 'get-context', 'ideate', 'image-to-code', 'index', 'research', 'share', 'url-to-code', 'user-context']) {
  assertGate(PRODUCT_DESIGN_REQUIRED_SKILLS.includes(skill), `Product Design required skill missing: ${skill}`);
}
assertGate(PRODUCT_DESIGN_PIPELINE_STAGES.length >= 5, 'Product Design pipeline stage map too small');

const fakeReadResponse = {
  plugin: {
    marketplaceName: PRODUCT_DESIGN_PLUGIN.marketplace,
    summary: {
      id: PRODUCT_DESIGN_PLUGIN.id,
      remotePluginId: PRODUCT_DESIGN_PLUGIN.remote_plugin_id,
      name: PRODUCT_DESIGN_PLUGIN.name,
      installed: true,
      enabled: true
    },
    skills: PRODUCT_DESIGN_REQUIRED_SKILLS.map((name) => ({ name, enabled: true }))
  }
};
const evidence = normalizeProductDesignPluginEvidence(fakeReadResponse);
assertGate(evidence.ok, 'app-server plugin/read evidence parser must accept ready Product Design response', evidence);

const hiddenFromLocalList = productDesignPluginVisibilityFromCodexPluginList({ installed: [{ id: 'browser@openai-bundled' }] });
assertGate(hiddenFromLocalList.requires_remote_vertical_lookup, 'missing local plugin-list entry must require remote vertical lookup');

for (const token of [
  'productDesignPluginPolicyText',
  'Product Design plugin tools are allowed and preferred',
  'project-local cache/compatibility authority',
  'PRODUCT_DESIGN_PLUGIN_TOOL_ALLOWLIST'
]) {
  assertGate(routePolicySource.includes(token), `route policy modules missing Product Design routing token: ${token}`);
}

const recommendedSkillsBlock = routeConstantsSource.match(/export const RECOMMENDED_SKILLS = \[([\s\S]*?)\];/)?.[1] || '';
for (const legacySkill of ['design-artifact-expert', 'design-system-builder', 'design-ui-editor']) {
  assertGate(!recommendedSkillsBlock.includes(legacySkill), `legacy design skill should not stay in RECOMMENDED_SKILLS: ${legacySkill}`);
}

for (const token of [
  'Product Design plugin policy',
  'openai-curated-remote',
  'plugin/read',
  'plugin/install',
  'auto-install/ensure',
  'vertical',
  'compatibility fallback only',
  'PRODUCT_DESIGN_LEGACY_DESIGN_FALLBACK_SKILLS'
]) {
  assertGate(productDesignSource.includes(token), `product-design-plugin.ts missing policy token: ${token}`);
}

assertGate(
  routePolicySource.includes('Product Design plugin first'),
  'route-owned design policy must prefer the Product Design plugin'
);
for (const token of ['design-system-builder', 'design-ui-editor', 'design-artifact-expert']) {
  assertGate(initSkillsSource.includes(token), `generated design fallback skill missing token: ${token}`);
}

for (const token of [
  'product_design_plugin',
  'primary_design_plugin',
  'legacy_design_skills_fallback_only',
  'remote_plugin_id'
]) {
  assertGate(pptSource.includes(token), `ppt.ts missing Product Design evidence token: ${token}`);
}

for (const token of [
  'codexProductDesignPluginStatus',
  'design_product',
  'ensureProductDesignPluginInstalled',
  'product_design_remote_vertical_lookup_required',
  'remote vertical marketplace plugin'
]) {
  assertGate(codexAppSource.includes(token), `codex-app.ts missing Product Design readiness token: ${token}`);
}

assertGate(releaseGates.has('codex:product-design-plugin-routing'), 'release gate DAG must include Product Design routing gate');

emitGate('codex:product-design-plugin-routing', {
  plugin_id: PRODUCT_DESIGN_PLUGIN.id,
  remote_plugin_id: PRODUCT_DESIGN_PLUGIN.remote_plugin_id,
  required_skills: PRODUCT_DESIGN_REQUIRED_SKILLS.length,
  stages: PRODUCT_DESIGN_PIPELINE_STAGES.length,
  local_list_hidden_requires_remote_lookup: hiddenFromLocalList.requires_remote_vertical_lookup
});
