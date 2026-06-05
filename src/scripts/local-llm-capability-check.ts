#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, readText } from './lib/codex-sdk-gate-lib.js';

const mod = await importDist('core/agents/ollama-worker-config.js');
const schemaText = readText('schemas/local-llm/local-model-config.schema.json');
const config = mod.normalizeLocalModelConfig({ enabled: true, status: 'enabled_unverified' });
const mlx = mod.normalizeLocalModelConfig({ enabled: true, provider: 'mlx-lm', model: 'mlx-community/Qwen3.6-35B-A3B-4bit', base_url: 'http://127.0.0.1:8080' });
assertGate(config.schema === 'sks.local-model-config.v2', 'local model config must use v2 schema');
assertGate(config.status === 'enabled_unverified', 'enabled without smoke must be enabled_unverified');
assertGate(mlx.provider === 'mlx-lm' && mlx.base_url === 'http://127.0.0.1:8080', 'local model config must preserve MLX LM provider settings');
assertGate(schemaText.includes('verified'), 'local model schema must include verified status');
assertGate(schemaText.includes('mlx-lm'), 'local model schema must allow MLX LM provider');
emitGate('local-llm:capability', { status: config.status, schema: config.schema, mlx_provider: mlx.provider });
