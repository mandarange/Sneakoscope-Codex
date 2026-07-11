import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { codexProviderModelUiStatus } from '../../codex-app.js'

test('selected codex-lb readiness is not blocked by optional GLM/OpenRouter setup', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-provider-ui-root-'))
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-provider-ui-home-'))
  const codexHome = path.join(home, '.codex')
  await fs.mkdir(codexHome, { recursive: true })
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(home, { recursive: true, force: true })
  })

  await fs.writeFile(path.join(codexHome, 'config.toml'), [
    'model_provider = "codex-lb"',
    '[model_providers.codex-lb]',
    'name = "openai"',
    'base_url = "https://lb.example.test/backend-api/codex"',
    'wire_api = "responses"',
    'env_key = "CODEX_LB_API_KEY"',
    'supports_websockets = true',
    'requires_openai_auth = true',
    ''
  ].join('\n'))
  await fs.writeFile(path.join(codexHome, 'sks-codex-lb.env'), [
    "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'",
    "export CODEX_LB_API_KEY='fixture-secret'",
    ''
  ].join('\n'))

  const status = await codexProviderModelUiStatus({
    home,
    cwd: root,
    env: { HOME: home },
    codexLbModelCatalog: {
      ok: true,
      models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
      blockers: []
    }
  })

  assert.equal(status.selected_provider, 'codex-lb')
  assert.equal(status.selected_provider_ok, true)
  assert.deepEqual(status.selected_provider_blockers, [])
  assert.equal(status.ok, true)
  assert.equal(status.status, 'ready')
  assert.deepEqual(status.blockers, [])
  assert.equal(status.optional_provider_status, 'setup_available')
  assert.ok(status.optional_provider_blockers.includes('glm_openrouter_provider_missing'))
  assert.ok(status.optional_provider_blockers.includes('openrouter_key_missing'))
})
