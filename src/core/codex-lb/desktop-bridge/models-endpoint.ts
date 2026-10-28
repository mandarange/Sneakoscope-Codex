/**
 * The bridge's own model list, so Codex sees a refreshed catalog without a
 * restart.
 *
 * Codex fetches `GET {base_url}/models?client_version=…` and keeps the
 * response's `ETag`; every Responses reply can carry `X-Models-Etag`, and a
 * value that differs from the kept one makes Codex fetch the list again
 * (codex-rs models-manager `refresh_if_new_etag`, exact string comparison). On
 * HTTP the value is a response header; on the Responses WebSocket it rides a
 * `codex.response.metadata` event's `headers` (codex-api
 * endpoint/responses_websocket.rs), never the 101 handshake. Both the official
 * backend and Codex-LB send their own value, which would point Codex at a list
 * the bridge does not serve, so the bridge's replaces it on every route.
 */
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';

export const DESKTOP_BRIDGE_MODELS_PATHS: readonly string[] = ['/backend-api/codex/models', '/api/v1/models', '/v1/models'];

/** The active combined catalog as the bridge serves it: rows exactly as `model_catalog_json` holds them. */
export interface DesktopBridgeModelsCatalog {
  generation: string;
  models: readonly Record<string, unknown>[];
}

/** Unquoted and used byte-for-byte in `ETag` and `x-models-etag`: Codex compares the two as strings. */
export function desktopBridgeModelsEtag(generation: string): string {
  return `sksb-${generation.slice(0, 16)}`;
}

export function isDesktopBridgeModelsRequest(req: IncomingMessage, pathname: string): boolean {
  return (req.method === 'GET' || req.method === 'HEAD') && DESKTOP_BRIDGE_MODELS_PATHS.includes(pathname);
}

function versionParts(value: unknown): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value ?? '').trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function newerThan(left: readonly number[], right: readonly number[]): boolean {
  for (let index = 0; index < 3; index += 1) {
    if (left[index]! !== right[index]!) return left[index]! > right[index]!;
  }
  return false;
}

/** The rows a client of `clientVersion` can use: none whose `minimal_client_version` is newer. */
export function modelsForClient(catalog: DesktopBridgeModelsCatalog, clientVersion: string | null): Record<string, unknown>[] {
  const client = versionParts(clientVersion);
  if (!client) return [...catalog.models];
  return catalog.models.filter((row) => {
    const minimum = versionParts(row.minimal_client_version);
    return !minimum || !newerThan(minimum, client);
  });
}

export function answerDesktopBridgeModels(req: IncomingMessage, res: ServerResponse, catalog: DesktopBridgeModelsCatalog): void {
  const etag = desktopBridgeModelsEtag(catalog.generation);
  const headers: OutgoingHttpHeaders = { etag, 'cache-control': 'no-store', 'content-type': 'application/json' };
  const ifNoneMatch = String(req.headers['if-none-match'] || '').split(',').map((value) => value.trim());
  if (ifNoneMatch.includes(etag)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const clientVersion = new URL(String(req.url || '/'), 'http://bridge.invalid').searchParams.get('client_version');
  const body = Buffer.from(JSON.stringify({ models: modelsForClient(catalog, clientVersion) }));
  res.writeHead(200, { ...headers, 'content-length': String(body.length) });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * An upstream `codex.response.metadata` frame advertising `etag` in place of
 * whatever the upstream sent, or null for any other frame (and one that
 * already says exactly this). Nearly every frame is a delta, so a byte check
 * precedes any parse.
 */
export function frameWithModelsEtag(frame: Buffer, etag: string): Buffer | null {
  if (!frame.includes('"codex.response.metadata"')) return null;
  let event: unknown;
  try { event = JSON.parse(frame.toString('utf8')); } catch { return null; }
  if (!isRecord(event) || event.type !== 'codex.response.metadata') return null;
  const headers = isRecord(event.headers) ? event.headers : {};
  const others = Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'x-models-etag');
  if (headers['x-models-etag'] === etag && others.length === Object.keys(headers).length - 1) return null;
  return Buffer.from(JSON.stringify({ ...event, headers: { ...Object.fromEntries(others), 'x-models-etag': etag } }));
}
