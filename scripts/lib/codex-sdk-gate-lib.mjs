import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist, readJson, readText, root } from '../sks-1-18-gate-lib.mjs';

export { assertGate, emitGate, importDist, readJson, readText, root };

export async function readJsonFile(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function readTextFile(file) {
  return fs.readFile(file, 'utf8');
}

export async function runFakeCodexSdkTaskFixture(label = 'fixture', extra = {}) {
  const mod = await importDist('core/codex-control/codex-control-plane.js');
  const schema = await importDist('core/codex-control/schemas/agent-worker-result.schema.js');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `sks-codex-sdk-${label}-`));
  const old = snapshotEnv();
  process.env.NODE_ENV = 'test';
  process.env.SKS_CODEX_SDK_FAKE = '1';
  try {
    const result = await mod.runCodexTask({
      route: extra.route || '$Agent',
      missionId: extra.missionId || `M-${label}`,
      workItemId: extra.workItemId || `${label}-work-item`,
      slotId: extra.slotId || 'slot-001',
      generationIndex: extra.generationIndex || 1,
      sessionId: extra.sessionId || `${label}-session`,
      cwd: root,
      prompt: extra.prompt || `Hermetic Codex SDK gate fixture ${label}`,
      inputFiles: [],
      inputImages: [],
      outputSchemaId: schema.CODEX_AGENT_WORKER_RESULT_SCHEMA_ID,
      outputSchema: schema.codexAgentWorkerResultSchema,
      sandboxPolicy: extra.sandboxPolicy || 'read-only',
      requestedScopeContract: {
        id: `${label}-scope`,
        route: extra.route || '$Agent',
        read_only: extra.sandboxPolicy !== 'workspace-write',
        allowed_paths: extra.allowedPaths || [],
        write_paths: extra.allowedPaths || [],
        user_confirmed_full_access: false,
        mad_sks_authorized: true,
        ...(extra.requestedScopeContract || {})
      },
      mutationLedgerRoot: tmp,
      zellijPaneId: extra.zellijPaneId || null
    });
    const proof = await readJsonFile(path.join(tmp, 'codex-control-proof.json'));
    const registry = await readJsonFile(path.join(tmp, 'codex-thread-registry.json'));
    const worker = await readJsonFile(path.join(tmp, 'codex-sdk-worker-result.json'));
    const eventText = await fs.readFile(path.join(tmp, 'codex-sdk-events.jsonl'), 'utf8');
    const events = eventText.split(/\n/).filter(Boolean).map((line) => JSON.parse(line));
    return { tmp, result, proof, registry, worker, events };
  } finally {
    restoreEnv(old);
  }
}

export function packageScripts() {
  return readJson('package.json').scripts || {};
}

export function assertSourceIncludes(file, tokens) {
  const text = readText(file);
  for (const token of tokens) assertGate(text.includes(token), `${file} missing token ${token}`);
  return text;
}

export function assertScriptPresent(name) {
  const scripts = packageScripts();
  assertGate(Boolean(scripts[name]), `package script missing: ${name}`, { script: name });
  return scripts[name];
}

function snapshotEnv() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    SKS_CODEX_SDK_FAKE: process.env.SKS_CODEX_SDK_FAKE,
    SKS_CODEX_SDK_FIXTURE: process.env.SKS_CODEX_SDK_FIXTURE
  };
}

function restoreEnv(old) {
  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
