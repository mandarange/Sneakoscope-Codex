import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runNativeCliWorker } from '../../dist/core/agents/native-cli-worker.js';
import { classifyOllamaWorkerSlice } from '../../dist/core/agents/agent-runner-ollama.js';

test('native worker backend router launches process child and marks generated patch source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-router-test-'));
  const old = snapshotEnv();
  process.env.SKS_DISABLE_ROUTE_RECURSION = '1';
  process.env.SKS_AGENT_WORKER = '1';
  try {
    const result = await runNativeCliWorker({
      intakeJson: {
        mission_id: 'M-router-test',
        backend: 'process',
        agent_root: root,
        agent: { id: 'agent-router', session_id: 'session-router', slot_id: 'slot-001', generation_index: 1, persona_id: 'executor' },
        slice: { id: 'task-router', write_paths: ['owned.txt'], description: 'process child route' },
        worker_artifact_dir: 'sessions/slot-001/gen-1/worker',
        result_path: 'sessions/slot-001/gen-1/worker/worker-result.json',
        heartbeat_path: 'sessions/slot-001/gen-1/worker/worker-heartbeat.jsonl',
        patch_envelope_path: 'sessions/slot-001/gen-1/worker/worker-patch-envelope.json',
        fast_mode: true,
        service_tier: 'fast'
      }
    });
    assert.equal(result.status, 'done');
    assert.equal(result.backend_router_report.selected_backend, 'process');
    assert.equal(result.patch_envelopes[0].source, 'process_generated');
    assert.equal(typeof result.backend_router_report.child_process_ids[0], 'number');
  } finally {
    restoreEnv(old);
  }
});

test('native worker backend router launches ollama worker and marks local model patch proof', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-router-ollama-test-'));
  const old = snapshotEnv();
  const oldFetch = globalThis.fetch;
  process.env.SKS_DISABLE_ROUTE_RECURSION = '1';
  process.env.SKS_AGENT_WORKER = '1';
  process.env.SKS_OLLAMA_WORKERS = '1';
  process.env.SKS_LOCAL_MODEL_CONFIG = path.join(root, 'local-model.json');
  await writeVerifiedLocalModelConfig(root);
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    assert.equal(body.think, false);
    assert.match(body.prompt, /consult the TriWiki context below first/);
    assert.match(body.prompt, /Context7 or official vendor docs/);
    assert.match(body.prompt, /stack-current-docs\.md/);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'rafw007/qwen36-a3b-claude-coder:q4_K_M',
        done: true,
        response: JSON.stringify({
        summary: 'local simple code patch ready',
        findings: ['simple write produced'],
        patch_envelopes: [{
          path: 'owned.txt',
          content: 'local patch\n'
        }]
      })
      })
    };
  };
  try {
    const result = await runNativeCliWorker({
      intakeJson: {
        mission_id: 'M-router-ollama-test',
        backend: 'ollama',
        agent_root: root,
        agent: { id: 'agent-ollama', session_id: 'session-ollama', slot_id: 'slot-001', generation_index: 1, persona_id: 'implementer' },
        slice: { id: 'task-ollama', role: 'implementer', write_paths: ['owned.txt'], description: 'simple code write only' },
        worker_artifact_dir: 'sessions/slot-001/gen-1/worker',
        result_path: 'sessions/slot-001/gen-1/worker/worker-result.json',
        heartbeat_path: 'sessions/slot-001/gen-1/worker/worker-heartbeat.jsonl',
        patch_envelope_path: 'sessions/slot-001/gen-1/worker/worker-patch-envelope.json',
        fast_mode: true,
        service_tier: 'fast'
      }
    });
    assert.equal(result.status, 'done');
    assert.equal(result.backend_router_report.selected_backend, 'ollama');
    assert.equal(result.patch_envelopes[0].source, 'model_authored');
    assert.match(result.patch_envelopes[0].backend_ollama_request_id, /^ollama:/);
    assert.equal(result.patch_envelopes[0].operations[0].path, 'owned.txt');
    const requestArtifact = JSON.parse(await fs.readFile(path.join(root, 'sessions/slot-001/gen-1/worker/ollama-request.json'), 'utf8'));
    assert.equal(requestArtifact.stack_current_docs_required, true);
    assert.equal(requestArtifact.triwiki_context.triwiki_context_consulted, false);
    const triwikiArtifact = JSON.parse(await fs.readFile(path.join(root, 'sessions/slot-001/gen-1/worker/ollama-triwiki-context.json'), 'utf8'));
    assert.equal(triwikiArtifact.stack_current_docs_policy.current_docs_source, 'Context7 or official vendor docs');
  } finally {
    globalThis.fetch = oldFetch;
    restoreEnv(old);
  }
});

test('ollama worker accepts worker JSON from thinking field', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-router-ollama-thinking-test-'));
  const old = snapshotEnv();
  const oldFetch = globalThis.fetch;
  process.env.SKS_DISABLE_ROUTE_RECURSION = '1';
  process.env.SKS_AGENT_WORKER = '1';
  process.env.SKS_OLLAMA_WORKERS = '1';
  process.env.SKS_LOCAL_MODEL_CONFIG = path.join(root, 'local-model.json');
  await writeVerifiedLocalModelConfig(root);
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      model: 'rafw007/qwen36-a3b-claude-coder:q4_K_M',
      done: true,
      response: '',
      thinking: JSON.stringify({
        summary: 'local collection complete',
        findings: ['thinking field carried worker json'],
        proposed_changes: [],
        patch_envelopes: []
      })
    })
  });
  try {
    const result = await runNativeCliWorker({
      intakeJson: {
        mission_id: 'M-router-ollama-thinking-test',
        backend: 'ollama',
        agent_root: root,
        agent: { id: 'agent-ollama', session_id: 'session-ollama', slot_id: 'slot-001', generation_index: 1, persona_id: 'implementer' },
        slice: { id: 'task-ollama', role: 'implementer', description: 'simple collect inventory only' },
        worker_artifact_dir: 'sessions/slot-001/gen-1/worker',
        result_path: 'sessions/slot-001/gen-1/worker/worker-result.json',
        heartbeat_path: 'sessions/slot-001/gen-1/worker/worker-heartbeat.jsonl',
        patch_envelope_path: 'sessions/slot-001/gen-1/worker/worker-patch-envelope.json',
        fast_mode: true,
        service_tier: 'fast'
      }
    });
    assert.equal(result.status, 'done');
    assert.equal(result.backend_router_report.selected_backend, 'ollama');
    assert.equal(result.summary, 'local collection complete');
    const responseArtifact = JSON.parse(await fs.readFile(path.join(root, 'sessions/slot-001/gen-1/worker/ollama-response.json'), 'utf8'));
    assert.equal(responseArtifact.response_source, 'thinking');
  } finally {
    globalThis.fetch = oldFetch;
    restoreEnv(old);
  }
});

test('ollama worker normalizes flat path content envelopes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-router-ollama-flat-test-'));
  const old = snapshotEnv();
  const oldFetch = globalThis.fetch;
  process.env.SKS_DISABLE_ROUTE_RECURSION = '1';
  process.env.SKS_AGENT_WORKER = '1';
  process.env.SKS_OLLAMA_WORKERS = '1';
  process.env.SKS_LOCAL_MODEL_CONFIG = path.join(root, 'local-model.json');
  await writeVerifiedLocalModelConfig(root);
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      model: 'rafw007/qwen36-a3b-claude-coder:q4_K_M',
      done: true,
      response: JSON.stringify({
        summary: 'flat patch ready',
        findings: ['flat path content envelope emitted'],
        patch_envelopes: [{ path: 'owned.ts', content: 'export const LOCAL_WORKER_SMOKE = true;\n' }]
      })
    })
  });
  try {
    const result = await runNativeCliWorker({
      intakeJson: {
        mission_id: 'M-router-ollama-flat-test',
        backend: 'ollama',
        agent_root: root,
        agent: { id: 'agent-ollama', session_id: 'session-ollama', slot_id: 'slot-001', generation_index: 1, persona_id: 'implementer' },
        slice: { id: 'task-ollama', role: 'implementer', write_paths: ['owned.ts'], description: 'simple code write only' },
        worker_artifact_dir: 'sessions/slot-001/gen-1/worker',
        result_path: 'sessions/slot-001/gen-1/worker/worker-result.json',
        heartbeat_path: 'sessions/slot-001/gen-1/worker/worker-heartbeat.jsonl',
        patch_envelope_path: 'sessions/slot-001/gen-1/worker/worker-patch-envelope.json',
        fast_mode: true,
        service_tier: 'fast'
      }
    });
    assert.equal(result.status, 'done');
    assert.equal(result.patch_envelopes[0].operations[0].op, 'write');
    assert.equal(result.patch_envelopes[0].operations[0].path, 'owned.ts');
    assert.match(result.patch_envelopes[0].operations[0].content, /LOCAL_WORKER_SMOKE/);
  } finally {
    globalThis.fetch = oldFetch;
    restoreEnv(old);
  }
});

test('enabled local model auto-selects ollama for simple codex-sdk worker slice', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-router-ollama-auto-test-'));
  const old = snapshotEnv();
  const oldFetch = globalThis.fetch;
  process.env.SKS_DISABLE_ROUTE_RECURSION = '1';
  process.env.SKS_AGENT_WORKER = '1';
  process.env.SKS_OLLAMA_WORKERS = '1';
  process.env.SKS_LOCAL_MODEL_CONFIG = path.join(root, 'local-model.json');
  await writeVerifiedLocalModelConfig(root);
  // Auto-select now routes through the local-llm control plane (selected
  // backend 'local-llm', not 'ollama'), which enforces the full
  // sks.agent-worker-result.v1 structured-output schema — the mock must
  // return a schema-valid worker result, not the legacy flat ollama JSON.
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      model: 'rafw007/qwen36-a3b-claude-coder:q4_K_M',
      done: true,
      response: JSON.stringify({
        status: 'done',
        summary: 'auto local patch ready',
        findings: ['codex-sdk default auto-selected local worker'],
        changed_files: ['owned.ts'],
        patch_envelopes: [{
          schema: 'sks.agent-patch-envelope.v1',
          source: 'model_authored',
          agent_id: 'agent-ollama',
          session_id: 'session-ollama',
          slot_id: 'slot-001',
          generation_index: 1,
          task_slice_id: 'task-ollama',
          lease_id: 'task-ollama',
          allowed_paths: ['owned.ts'],
          operations: [{ op: 'write', path: 'owned.ts', search: '', replace: '', content: 'export const AUTO_LOCAL_WORKER = true;\n', diff: '' }],
          rationale: 'simple code write'
        }],
        verification: { status: 'passed', checks: ['local-worker-self-check'] },
        rollback_notes: [],
        blockers: []
      })
    })
  });
  try {
    const result = await runNativeCliWorker({
      intakeJson: {
        mission_id: 'M-router-ollama-auto-test',
        backend: 'codex-sdk',
        agent_root: root,
        agent: { id: 'agent-ollama', session_id: 'session-ollama', slot_id: 'slot-001', generation_index: 1, persona_id: 'implementer' },
        slice: { id: 'task-ollama', role: 'implementer', write_paths: ['owned.ts'], description: 'simple code write only' },
        worker_artifact_dir: 'sessions/slot-001/gen-1/worker',
        result_path: 'sessions/slot-001/gen-1/worker/worker-result.json',
        heartbeat_path: 'sessions/slot-001/gen-1/worker/worker-heartbeat.jsonl',
        patch_envelope_path: 'sessions/slot-001/gen-1/worker/worker-patch-envelope.json',
        fast_mode: true,
        service_tier: 'fast'
      }
    });
    assert.equal(result.status, 'done');
    assert.equal(result.backend_router_report.requested_backend, 'codex-sdk');
    assert.equal(result.backend_router_report.selected_backend, 'local-llm');
    assert.equal(result.patch_envelopes[0].operations[0].path, 'owned.ts');
  } finally {
    globalThis.fetch = oldFetch;
    restoreEnv(old);
  }
});

test('ollama worker policy blocks strategy and design work', () => {
  const policy = classifyOllamaWorkerSlice({
    id: 'strategy-task',
    role: 'architect',
    description: 'plan the architecture and design the implementation strategy',
    write_paths: ['owned.txt']
  }, { route: '$Team', agent: { role: 'architect' } });
  assert.equal(policy.ok, false);
  assert.match(policy.blockers.join('\n'), /strategy_planning_design|role_blocked/);
});

// The router only routes to the local model when the stored local-model config
// is enabled AND verified by a fresh smoke run (status gate added after these
// tests were written). Write a verified fixture so the tests exercise the
// routing/policy logic instead of failing on `local_llm_enabled_unverified`.
async function writeVerifiedLocalModelConfig(root) {
  await fs.writeFile(path.join(root, 'local-model.json'), JSON.stringify({
    schema: 'sks.local-model-config.v2',
    enabled: true,
    status: 'verified',
    provider: 'ollama',
    model: 'rafw007/qwen36-a3b-claude-coder:q4_K_M',
    base_url: 'http://127.0.0.1:11434',
    think: false,
    capability: { api_reachable: true, model_installed: true },
    last_smoke: { ok: true, schema_valid: true, ran_at: new Date().toISOString(), status: 'verified' }
  }));
}

function snapshotEnv() {
  return {
    SKS_DISABLE_ROUTE_RECURSION: process.env.SKS_DISABLE_ROUTE_RECURSION,
    SKS_AGENT_WORKER: process.env.SKS_AGENT_WORKER,
    SKS_OLLAMA_WORKERS: process.env.SKS_OLLAMA_WORKERS,
    SKS_LOCAL_MODEL_CONFIG: process.env.SKS_LOCAL_MODEL_CONFIG
  };
}

function restoreEnv(old) {
  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
