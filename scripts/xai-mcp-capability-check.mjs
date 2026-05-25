#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const detector = await importDist('core/mcp/xai-mcp-detector.js');
const detection = detector.detectXaiMcpFromConfig([
  { path: 'fixture.toml', source: 'provided', text: '[mcp_servers.grok]\ntools = ["search", "query"]\n' }
]);
assertGate(detection.ok === true, 'X AI detector must not fail');
assertGate(detection.configured === true, 'X AI detector must detect configured Grok MCP');
assertGate(detection.search_capable === true, 'X AI detector must detect search-capable tools');
const missing = detector.detectXaiMcpFromConfig([]);
assertGate(missing.ok === true && missing.status === 'missing', 'missing X AI MCP must be ok fallback');
emitGate('xai-mcp:capability', { configured_status: detection.status, missing_status: missing.status });
