#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
process.env.SKS_CODEX_0139_FAKE = '1'
process.env.SKS_CODEX_VERSION_FAKE = 'codex-cli 0.139.0'
const mod = await importDist('core/codex-control/codex-0139-capability.js')
const cap = await mod.detectCodex0139Capability({ codexBin: 'codex' })
assertGate(cap.ok === true, 'Codex 0.139 capability detector must accept 0.139.0', cap)
assertGate(
  cap.supports_code_mode_web_search
    && cap.supports_rich_tool_schemas
    && cap.supports_doctor_env_details
    && cap.supports_marketplace_source_field
    && cap.supports_plugin_catalog_cache
    && cap.supports_sandbox_profile_alias
    && cap.supports_interrupt_agent_rename,
  '0.139 feature flags missing',
  cap
)

// Older Codex must NOT claim 0.139 features.
process.env.SKS_CODEX_VERSION_FAKE = 'codex-cli 0.138.0'
const older = await mod.detectCodex0139Capability({ codexBin: 'codex' })
assertGate(older.ok === false && older.supports_code_mode_web_search === false, '0.138 must not claim 0.139 features', older)

// Marketplace source-field parser accepts array and wrapped shapes.
assertGate(mod.marketplaceSourcesPresent(JSON.stringify([{ name: 'm', source: 'https://example.com/catalog.json' }])) === true, 'marketplace source array shape', {})
assertGate(mod.marketplaceSourcesPresent(JSON.stringify({ marketplaces: [{ name: 'm', source: 'git' }] })) === true, 'marketplace source wrapped shape', {})
assertGate(mod.marketplaceSourcesPresent(JSON.stringify({ marketplaces: [{ name: 'm', root: '/tmp/codex-marketplace' }] })) === true, 'marketplace root locator wrapped shape', {})
assertGate(mod.marketplaceSourcesPresent('not json') === false, 'marketplace parser rejects non-JSON', {})

emitGate('codex:0139-capability', { parsed_version: cap.parsed_version })
