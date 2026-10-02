import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const BELOW_FLOOR_CODEX_VERSION_TEXT = 'codex-cli 0.100.0'

export interface CodexNativeRuntimeFixture {
  root: string
  missionId: string
  matrixPath: string
  env: NodeJS.ProcessEnv
}

export async function createCodexNativeRuntimeFixture(input: {
  hook: 'approved' | 'unknown' | 'pending_review'
  agentType: 'supported' | 'unsupported'
  appHandoff: boolean
  imagePathExposure: boolean
  mcpCandidates: boolean
  codeModeWebSearch: boolean
}): Promise<CodexNativeRuntimeFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-native-e2e-'))
  const missionId = `M-check-${Date.now().toString(36)}`
  const home = path.join(root, 'home')
  const codexHome = path.join(root, 'codex-home')
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(codexHome, { recursive: true })
  await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true })
  await fs.mkdir(path.join(root, '.sneakoscope', 'missions', missionId), { recursive: true })
  await fs.mkdir(path.join(root, 'src', 'core', 'loops'), { recursive: true })
  await fs.mkdir(path.join(root, 'src', 'core', 'qa'), { recursive: true })
  await fs.mkdir(path.join(root, 'src', 'core', 'research'), { recursive: true })
  await fs.mkdir(path.join(root, 'docs'), { recursive: true })
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture","version":"3.1.7","scripts":{}}\n', 'utf8')
  await fs.writeFile(path.join(root, 'src', 'core', 'loops', 'fixture.ts'), 'export const loopFixture = true\n', 'utf8')
  await fs.writeFile(path.join(root, 'src', 'core', 'qa', 'fixture.ts'), 'export const qaFixture = true\n', 'utf8')
  await fs.writeFile(path.join(root, 'src', 'core', 'research', 'fixture.ts'), 'export const researchFixture = true\n', 'utf8')
  await fs.writeFile(path.join(root, 'docs', 'fixture.md'), '# Fixture\n', 'utf8')
  return {
    root,
    missionId,
    matrixPath: path.join(root, '.sneakoscope', 'reports', 'codex-native-feature-matrix.json'),
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
      CODEX_BIN: 'codex',
      SKS_CODEX_PLUGIN_JSON_FAKE: '1',
      SKS_CODEX_HOOK_APPROVAL_FIXTURE: input.hook,
      SKS_CODEX_AGENT_TYPE_FIXTURE: input.agentType,
      SKS_CODEX_PLUGIN_JSON_FAKE_NO_MCP: input.mcpCandidates ? '0' : '1',
      // App handoff, image path exposure and code-mode web search all follow the Codex version now, so
      // switching any of them off models a Codex below the supported floor.
      ...(input.appHandoff && input.imagePathExposure && input.codeModeWebSearch ? {} : { SKS_CODEX_VERSION_FAKE: BELOW_FLOOR_CODEX_VERSION_TEXT }),
      SKS_LOOP_RUNTIME_FIXTURE: '1',
      SKS_TEST_RUNTIME_FIXTURE_ALLOWED: '1'
    }
  }
}

export async function withFixtureEnv<T>(fixture: CodexNativeRuntimeFixture, fn: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(fixture.env)) {
    previous.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await fn()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
