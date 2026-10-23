import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import type { BridgeProviderId } from '../bridge-contracts.js';
import { rewriteLocationHeader } from './location-rewrite.js';
import type {
  DesktopBridgeProviderAuthTransport,
  DesktopBridgeResolvedCredential,
} from './types.js';
import { DesktopBridgeError } from './types.js';

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const INTERNAL_PREFIX = 'x-sks-';
const REQUEST_HEADER_ALLOWLIST = new Set([
  'accept', 'accept-encoding', 'cache-control', 'content-encoding', 'content-length', 'content-type',
]);
// Codex session metadata; redacted from the bridge log like credentials.
const CODEX_LOCAL_HEADERS = new Set([
  'thread-id', 'thread_id', 'session-id', 'session_id', 'x-client-request-id',
  'x-codex-installation-id', 'x-codex-turn-metadata', 'x-codex-window-id', 'x-codex-turn-state',
  'originator', 'openai-beta',
]);
/**
 * The client's own identity on an official-shaped request. Codex-LB
 * authenticates with its own key and discards these, and a ChatGPT token it
 * did receive would be the operator's credential leaving for a third party.
 */
const CLIENT_IDENTITY_HEADERS = new Set(['authorization', 'cookie', 'chatgpt-account-id']);
const NEVER_FORWARD_FROM_CLIENT = new Set([
  'authorization', 'cookie', 'forwarded', 'proxy-authorization', 'x-api-key', 'x-codex-lb-api-key',
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-port', 'x-forwarded-proto', 'x-real-ip',
]);
const NEVER_FORWARD_TO_CLIENT = new Set([
  'authorization', 'cookie', 'proxy-authenticate', 'proxy-authorization', 'set-cookie', 'x-api-key', 'x-codex-lb-api-key',
]);
const OPENROUTER_CLIENT_HEADERS = new Set(['http-referer', 'x-title']);
const WEBSOCKET_HEADER_ALLOWLIST = new Set([
  'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions',
]);

function connectionTokens(inbound: IncomingHttpHeaders): Set<string> {
  const values = Array.isArray(inbound.connection) ? inbound.connection : inbound.connection ? [inbound.connection] : [];
  return new Set(values.flatMap((v) => v.split(',')).map((v) => v.trim().toLowerCase()).filter(Boolean));
}

function injectCredential(
  result: OutgoingHttpHeaders,
  providerId: BridgeProviderId,
  transport: DesktopBridgeProviderAuthTransport,
  credential: DesktopBridgeResolvedCredential,
): void {
  if (credential.provider_id !== providerId || !credential.value || /[\r\n\0]/.test(credential.value)) {
    throw new DesktopBridgeError('bridge_provider_credential_invalid');
  }
  if (providerId === 'openrouter' && transport !== 'openrouter-bearer') throw new DesktopBridgeError('bridge_provider_auth_transport_mismatch');
  if (providerId === 'codex-lb' && transport === 'openrouter-bearer') throw new DesktopBridgeError('bridge_provider_auth_transport_mismatch');
  if (transport === 'x-codex-lb-api-key') result['x-codex-lb-api-key'] = credential.value;
  else result.authorization = `Bearer ${credential.value}`;
}

/**
 * Codex-LB is a protocol-transparent proxy of the official backend, so it gets
 * the official route's headers with only the identity swapped: the key
 * replaces the client's credentials. A narrower list cost it what it keys on —
 * user-agent and originator (native-client detection: raw event lifecycle, no
 * synthetic failures), the turn-state that pins a turn to its account, the
 * client version, and subagent lineage. A turn-state Codex-LB did not issue is
 * dropped by the caller (codex-lb-turn-state.ts). OpenRouter is a third party
 * and receives the content headers only.
 */
export function buildProviderUpstreamHeaders(
  inbound: IncomingHttpHeaders,
  context: {
    providerId: BridgeProviderId;
    authTransport: DesktopBridgeProviderAuthTransport;
    credential: DesktopBridgeResolvedCredential;
  },
  upstreamHost: string,
): OutgoingHttpHeaders {
  if (context.providerId === 'codex-lb') {
    const result = buildOfficialPassthroughHeaders(inbound, upstreamHost);
    for (const name of CLIENT_IDENTITY_HEADERS) delete result[name];
    injectCredential(result, context.providerId, context.authTransport, context.credential);
    return result;
  }
  const result: OutgoingHttpHeaders = {};
  for (const [rawName, rawValue] of Object.entries(inbound)) {
    if (rawValue === undefined) continue;
    const name = rawName.toLowerCase();
    if (!REQUEST_HEADER_ALLOWLIST.has(name) && !(context.providerId === 'openrouter' && OPENROUTER_CLIENT_HEADERS.has(name))) continue;
    result[name] = rawValue;
  }
  result.host = upstreamHost;
  injectCredential(result, context.providerId, context.authTransport, context.credential);
  return result;
}

/**
 * Headers the bridge must never forward even on official passthrough: its own
 * credential channels, proxy metadata, and loopback network attribution. The
 * client's Authorization, cookies, and account headers (chatgpt-account-id)
 * pass through untouched — official passthrough exists precisely so the
 * operator's own ChatGPT identity reaches the official upstream, which is what
 * Codex Apps connector links, conversation affinity, and plan quotas bind to.
 */
const OFFICIAL_PASSTHROUGH_STRIP = new Set([
  'forwarded', 'proxy-authorization', 'x-api-key', 'x-codex-lb-api-key',
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-port', 'x-forwarded-proto', 'x-real-ip',
  'host',
]);

export function buildOfficialPassthroughHeaders(inbound: IncomingHttpHeaders, upstreamHost: string): OutgoingHttpHeaders {
  const result: OutgoingHttpHeaders = {};
  const dynamic = connectionTokens(inbound);
  for (const [rawName, rawValue] of Object.entries(inbound)) {
    if (rawValue === undefined) continue;
    const name = rawName.toLowerCase();
    if (HOP_BY_HOP.has(name) || dynamic.has(name)) continue;
    if (name.startsWith(INTERNAL_PREFIX)) continue;
    if (OFFICIAL_PASSTHROUGH_STRIP.has(name)) continue;
    result[name] = rawValue;
  }
  result.host = upstreamHost;
  // Credential non-crossing, asserted both ways: a provider key must never ride
  // a passthrough request, exactly as the client's token never rides a provider
  // request.
  if (result['x-codex-lb-api-key'] !== undefined) throw new DesktopBridgeError('bridge_provider_credential_invalid');
  return result;
}

export function buildOfficialPassthroughWebSocketHeaders(inbound: IncomingHttpHeaders, upstreamHost: string): OutgoingHttpHeaders {
  const result = buildOfficialPassthroughHeaders(inbound, upstreamHost);
  for (const [rawName, rawValue] of Object.entries(inbound)) {
    if (rawValue === undefined) continue;
    const name = rawName.toLowerCase();
    if (WEBSOCKET_HEADER_ALLOWLIST.has(name)) result[name] = rawValue;
  }
  result.connection = 'Upgrade';
  result.upgrade = 'websocket';
  return result;
}

export function buildProviderWebSocketHeaders(
  inbound: IncomingHttpHeaders,
  context: Parameters<typeof buildProviderUpstreamHeaders>[1],
  upstreamHost: string,
): OutgoingHttpHeaders {
  const result = buildProviderUpstreamHeaders(inbound, context, upstreamHost);
  for (const [rawName, rawValue] of Object.entries(inbound)) {
    if (rawValue === undefined) continue;
    const name = rawName.toLowerCase();
    if (WEBSOCKET_HEADER_ALLOWLIST.has(name)) result[name] = rawValue;
  }
  result.connection = 'Upgrade';
  result.upgrade = 'websocket';
  return result;
}

export function rewriteResponseHeaders(inbound: IncomingHttpHeaders, providerBaseUrl: string, localOrigin: string): OutgoingHttpHeaders {
  const result: OutgoingHttpHeaders = {};
  const dynamic = connectionTokens(inbound);
  for (const [rawName, rawValue] of Object.entries(inbound)) {
    if (rawValue === undefined) continue;
    const name = rawName.toLowerCase();
    if (HOP_BY_HOP.has(name) || dynamic.has(name) || NEVER_FORWARD_TO_CLIENT.has(name) || name.startsWith('access-control-')) continue;
    if (name === 'location') {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      if (values.length !== 1 || !values[0]) throw new DesktopBridgeError('bridge_location_header_invalid');
      result.location = rewriteLocationHeader(values[0], providerBaseUrl, localOrigin);
    } else result[name] = rawValue;
  }
  return result;
}

export function isRedactedHeaderName(name: string): boolean {
  const normalized = name.toLowerCase();
  return NEVER_FORWARD_FROM_CLIENT.has(normalized)
    || NEVER_FORWARD_TO_CLIENT.has(normalized)
    || CODEX_LOCAL_HEADERS.has(normalized)
    || normalized.startsWith(INTERNAL_PREFIX);
}

export function redactHeaderValue(name: string, value: unknown): string {
  return isRedactedHeaderName(name) ? '[REDACTED]' : String(value ?? '');
}
