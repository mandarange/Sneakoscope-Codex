import net from 'node:net';
import tls from 'node:tls';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { BRIDGE_OFFICIAL_ROUTE_ID, BRIDGE_REMOTE_COMPACTION } from '../bridge-contracts.js';
import { buildOfficialPassthroughWebSocketHeaders, buildProviderWebSocketHeaders } from './header-policy.js';
import { createDesktopBridgeRejectionLogger, desktopBridgeRequestShape, type DesktopBridgeRequestShape } from './rejection-log.js';
import { adaptRequestForRoute, logRequestAdaptation, providerExtraInclude } from './provider-request-compat.js';
import { assertDesktopBridgeRouteContext, ensureDesktopBridgeRemoteTarget, isUnreachableUpstreamError, refreshDesktopBridgeRemoteTarget, resolveAndBindDesktopBridgeRouteContext, resolveCodexSessionIdentity, resolveDesktopBridgeTarget, safeBridgeErrorCode, threadRouteMove } from './security.js';
import { admitCodexLbTurnState } from './codex-lb-turn-state.js';
import {
  ProviderHandoffRefusedError,
  assertProviderHandoffAllowed,
  providerHandoffRefusedEvent,
  stripProviderBoundItems,
  type ThreadRouteMove,
} from './provider-handoff.js';
import { DEFAULT_DESKTOP_BRIDGE_MAX_REQUEST_BODY_BYTES, DesktopBridgeError, type CodexSessionIdentity, type DesktopBridgeRouteContext, type PreparedDesktopBridgeConfig } from './types.js';
import {
  buildCompactionSummaryRequest,
  compactionCreatedEvent,
  compactionFailedEvent,
  compactionResponseEvents,
  expandBridgeCompactionItems,
  newCompactionResponseId,
  parseProviderSummary,
  requestsRemoteCompaction,
  ResponsesContinuationChain,
  safeUpstreamErrorId,
  summaryFailure,
  summaryWithinBounds,
} from './compaction-adapter.js';
import { requestProviderCompactionSummary } from './http-forward.js';
import { modelCapacityAdvisedFrame } from './capacity-retry-advice.js';
import { desktopBridgeModelsEtag, frameWithModelsEtag } from './models-endpoint.js';

const MAX_PENDING_MESSAGES = 256;
const CLOSE_GRACE_MS = 1_000;
/**
 * Codex prewarms a Responses WebSocket at startup and keeps it idle until the
 * first turn, which may be minutes or hours later. An accepted socket that has
 * not sent a create holds no upstream connection, so the only bound it needs
 * is an hour-scale leak guard matched to upstream connection lifetimes; a
 * request-scale timeout here would tear down every prewarmed connection.
 */
const INITIAL_CREATE_TIMEOUT_MS = 60 * 60_000;
const logRejection = createDesktopBridgeRejectionLogger();

export function isResponsesWebSocketRequest(req: IncomingMessage): boolean {
  const pathname = new URL(req.url || '/', 'http://bridge.invalid').pathname;
  return ['/backend-api/codex/responses', '/api/v1/responses', '/v1/responses'].includes(pathname);
}

function bytes(data: RawData): Buffer {
  return Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
}

interface UpstreamFailureEvent {
  status: number | undefined;
  code: unknown;
  type: unknown;
  param: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * An upstream `error` or `response.failed` event's identifiers. Codex-LB
 * answers a create it cannot validate with an `error` event and logs nothing
 * on its side, so this is the only record such a refusal leaves. Nearly every
 * frame is a delta, so a byte check precedes any parse.
 */
function upstreamFailureEvent(frame: Buffer): UpstreamFailureEvent | null {
  if (!frame.includes('"response.failed"') && !frame.includes('"type":"error"') && !frame.includes('"type": "error"')) return null;
  let event: unknown;
  try { event = JSON.parse(frame.toString('utf8')); } catch { return null; }
  if (!isRecord(event) || (event.type !== 'error' && event.type !== 'response.failed')) return null;
  const error = event.type === 'error' ? event.error : isRecord(event.response) ? event.response.error : null;
  const record = isRecord(error) ? error : {};
  return { status: typeof event.status === 'number' ? event.status : undefined, code: record.code, type: record.type, param: record.param };
}

interface PendingMessage {
  data: Buffer;
  binary: boolean;
  create: Record<string, unknown> | null;
  originalBytes: number;
  /** A remote-compaction create on a provider route, answered by the bridge (compaction-adapter.ts). */
  compaction?: Record<string, unknown> | null;
  /** The routed create `data` carries upstream, for the socket's continuation chain. */
  routed?: Record<string, unknown> | null;
}

function withLineage(identity: CodexSessionIdentity, next: CodexSessionIdentity): CodexSessionIdentity {
  return {
    ...identity,
    parent_thread_id: identity.parent_thread_id ?? next.parent_thread_id,
    subagent_kind: identity.subagent_kind ?? next.subagent_kind,
    thread_source: next.thread_source === 'subagent' ? next.thread_source : identity.thread_source ?? next.thread_source,
  };
}

/** Accept locally, then choose the upstream from the first Responses create event. */
export function forwardResponsesWebSocket(req: IncomingMessage, socket: Duplex, head: Buffer, config: PreparedDesktopBridgeConfig): void {
  // Authentication, origin and path validation are performed by the server before dispatch.
  const upgradeIdentity = resolveCodexSessionIdentity(req.headers);
  const maxBytes = config.maxRequestBodyBytes ?? DEFAULT_DESKTOP_BRIDGE_MAX_REQUEST_BODY_BYTES;
  const server = new WebSocketServer({ noServer: true, clientTracking: false, perMessageDeflate: false, maxPayload: maxBytes });
  const modelsEtag = config.modelsCatalog ? desktopBridgeModelsEtag(config.modelsCatalog.generation) : null;
  // This server owns no listening handle.
  try {
    server.handleUpgrade(req, socket, head, (client) => {
      bridge(client);
    });
  } finally { server.close(); }

  function bridge(client: WebSocket): void {
    let identity = upgradeIdentity;
    let upstream: WebSocket | null = null;
    let upstreamSocket: net.Socket | null = null;
    let bound: DesktopBridgeRouteContext | null = null;
    /** The first create moved its thread: the upgrade's turn-state belongs to the route it left. */
    let boundByMove = false;
    let boundBaseUrl: string | null = null;
    let boundCredentialGeneration: string | null = null;
    let boundCredentialFingerprint: string | null = null;
    /** The public model of the latest create; one socket may carry several. */
    let routedModel: string | null = null;
    /** The shape of the latest create relayed upstream, for the refusal that answers it. */
    let routedShape: DesktopBridgeRequestShape | null = null;
    let stopped = false;
    let processing = false;
    let pendingBytes = 0;
    const pending: PendingMessage[] = [];
    let closeTimer: NodeJS.Timeout | null = null;
    let handshakeTimer: NodeJS.Timeout | null = null;
    const chain = new ResponsesContinuationChain(maxBytes);
    const initialTimer = setTimeout(closeUnbound, config.websocketInitialCreateTimeoutMs ?? INITIAL_CREATE_TIMEOUT_MS);
    initialTimer.unref();
    const localSocket = socket as Partial<net.Socket>;
    localSocket.setKeepAlive?.(true, 30_000);

    function stop(): void {
      if (stopped) return;
      stopped = true;
      clearTimeout(initialTimer);
      if (handshakeTimer) clearTimeout(handshakeTimer);
      pending.length = 0; pendingBytes = 0;
      // Bound closing handshakes, including peers that never acknowledge close.
      closeTimer = setTimeout(() => { client.terminate(); upstream?.terminate(); upstreamSocket?.destroy(); }, CLOSE_GRACE_MS);
      closeTimer.unref();
    }
    function fail(error: unknown): void {
      if (stopped) return;
      const code = safeBridgeErrorCode(error);
      logRejection({ code, transport: 'websocket', ...(req.method ? { method: req.method } : {}), ...(req.url ? { url: req.url } : {}) });
      stop();
      if (client.readyState === WebSocket.OPEN) {
        if (client.bufferedAmount < maxBytes) client.send(JSON.stringify({ type: 'error', error: { type: 'sks_bridge_error', code, message: code } }), () => undefined);
        client.close(1011, code.slice(0, 123));
      }
      upstream?.terminate();
      upstreamSocket?.destroy();
    }
    /** An unbound socket is released the way an idle upstream releases one: a normal close, no error event. */
    function closeUnbound(): void {
      if (stopped || bound) return;
      logRejection({ code: 'bridge_websocket_initial_create_timeout', transport: 'websocket', ...(req.method ? { method: req.method } : {}), ...(req.url ? { url: req.url } : {}) });
      stop();
      if (client.readyState === WebSocket.OPEN) client.close(1000, 'bridge_websocket_initial_create_timeout');
    }
    function relay(destination: WebSocket, data: Buffer, binary: boolean): void {
      if (destination.readyState !== WebSocket.OPEN) throw new DesktopBridgeError('bridge_websocket_upstream_unavailable');
      if (destination.bufferedAmount + data.length > maxBytes) throw new DesktopBridgeError('bridge_websocket_backpressure_exceeded');
      destination.send(data, { binary }, (error) => { if (error) fail(error); });
    }
    function routeRequest(model: string) {
      return { public_model: model, session_id: identity.thread_id, pathname: new URL(req.url || '/', 'http://bridge.invalid').pathname, transport: 'websocket' as const, headers: req.headers, identity };
    }
    function assertBinding(route: DesktopBridgeRouteContext): void {
      if (!bound) return;
      const official = route.provider_id === BRIDGE_OFFICIAL_ROUTE_ID;
      const provider = route.provider_id === BRIDGE_OFFICIAL_ROUTE_ID ? null : config.providers[route.provider_id];
      const baseUrl = official ? config.officialRemote?.baseUrl : provider?.base_url;
      if (route.provider_id !== bound.provider_id || baseUrl !== boundBaseUrl
        || (provider && (provider.credential_generation !== boundCredentialGeneration || provider.credential_fingerprint !== boundCredentialFingerprint))) {
        throw new DesktopBridgeError('bridge_websocket_route_change_forbidden');
      }
    }
    async function resolveCreate(message: PendingMessage): Promise<void> {
      const model = message.create?.model;
      if (typeof model !== 'string' || !model.trim()) throw new DesktopBridgeError('bridge_websocket_model_required');
      const nextIdentity = resolveCodexSessionIdentity(req.headers, message.create);
      // The thread keys the pin this socket is bound to; `session_id` routes nothing.
      if (bound && nextIdentity.thread_id && nextIdentity.thread_id !== identity.thread_id) {
        throw new DesktopBridgeError('bridge_codex_session_identity_conflict');
      }
      // The pin identity is the first create's; lineage accumulates, so a
      // socket once marked as a child thread is never routed as a root turn.
      identity = bound ? withLineage(identity, nextIdentity) : nextIdentity;
      const request = routeRequest(model);
      // Do not persist a new session pin for a create we cannot forward on this
      // socket, nor for a move whose history the destination cannot read.
      const planned = assertDesktopBridgeRouteContext(request, config);
      assertProviderHandoffAllowed(message.create, threadRouteMove(request, planned, config));
      assertBinding(planned);
      let move: ThreadRouteMove | null = null;
      const route = await resolveAndBindDesktopBridgeRouteContext(request, config, (resolved) => {
        move = threadRouteMove(request, resolved, config);
        assertProviderHandoffAllowed(message.create, move);
      });
      if (stopped || client.readyState !== WebSocket.OPEN) return;
      assertBinding(route);
      routedModel = route.public_model;
      if (!bound) {
        bound = route;
        boundByMove = Boolean(move);
        await connect(route);
      }
      const create = { ...message.create!, model: route.upstream_model };
      // No upstream can read a bridge-made compaction item; it travels as the summary it carries.
      let rewritten = expandBridgeCompactionItems(create);
      // A thread that moved carries account-bound items of the route it left.
      if (route.session_pin?.handoff_from && stripProviderBoundItems(create, Boolean(move))) rewritten = true;
      // Codex believes it talks to OpenAI and asks for what only OpenAI serves.
      const adapted = adaptRequestForRoute(create, route, providerExtraInclude(config, route));
      if (adapted.length) {
        rewritten = true;
        logRequestAdaptation(config, route, adapted, 'websocket');
      }
      if (BRIDGE_REMOTE_COMPACTION[route.provider_id] === 'bridge_summary' && requestsRemoteCompaction(create)) {
        message.compaction = create;
        return;
      }
      if (route.upstream_model !== model || rewritten) {
        // A re-serialized create is JSON text, and upstreams refuse binary frames.
        message.data = Buffer.from(JSON.stringify(create));
        message.binary = false;
      }
      message.routed = create;
    }
    /** A create refused for a move its history cannot survive: Codex shows why, and the socket stays. */
    function refuseMove(message: PendingMessage, error: ProviderHandoffRefusedError): void {
      const model = typeof message.create?.model === 'string' ? message.create.model : '';
      logRejection({ code: error.code, transport: 'websocket', ...(req.url ? { url: req.url } : {}) });
      relay(client, Buffer.from(JSON.stringify(providerHandoffRefusedEvent(error, newCompactionResponseId(), model))), false);
      const index = pending.indexOf(message);
      if (index >= 0) pending.splice(index, 1);
      pendingBytes -= message.originalBytes;
    }
    /** Answers a provider-route compaction create with a summary from the thread's own model. */
    async function answerCompaction(create: Record<string, unknown>): Promise<void> {
      const route = bound!;
      const provider = config.providers[route.provider_id as Exclude<DesktopBridgeRouteContext['provider_id'], typeof BRIDGE_OFFICIAL_ROUTE_ID>];
      if (!provider) throw new DesktopBridgeError('bridge_provider_route_unavailable');
      const credential = await config.resolveProviderCredential(provider.provider_id, provider.credential_generation);
      const responseId = newCompactionResponseId();
      const send = (event: Record<string, unknown>): void => relay(client, Buffer.from(JSON.stringify(event)), false);
      // A continued socket sent only the delta; the summary needs the conversation.
      const input = chain.fullInput(create);
      if (!input) {
        logRejection({ code: 'bridge_compaction_history_unavailable', transport: 'websocket', provider_id: provider.provider_id, public_model: route.public_model, ...(req.url ? { url: req.url } : {}) });
        send(compactionFailedEvent(responseId, route.public_model, 'bridge_compaction_history_unavailable'));
        return;
      }
      const summaryRequest = buildCompactionSummaryRequest({ ...create, input }, route.upstream_model);
      adaptRequestForRoute(summaryRequest, route, providerExtraInclude(config, route));
      const body = Buffer.from(JSON.stringify(summaryRequest));
      let accepted = false;
      try {
        const call = await requestProviderCompactionSummary(config, { provider, credential, clientHeaders: req.headers, requestUrl: req.url || '/' }, body, () => {
          if (accepted) return;
          accepted = true;
          send(compactionCreatedEvent(responseId, route.public_model));
        });
        if (stopped) return;
        const parsed = parseProviderSummary(call.body.toString('utf8'));
        if (call.status >= 300 || parsed.failed || !summaryWithinBounds(parsed.summary)) {
          const failure = summaryFailure(parsed, call.status);
          logRejection({ code: failure.logCode, transport: 'websocket', status: call.status, provider_id: provider.provider_id, public_model: route.public_model, ...(req.url ? { url: req.url } : {}) });
          send(compactionFailedEvent(responseId, route.public_model, failure.code));
          return;
        }
        const events = compactionResponseEvents(responseId, route.public_model, parsed.summary!, parsed.usage);
        send(events.itemDone);
        send(events.completed);
      } catch (error) {
        if (stopped) return;
        const code = safeBridgeErrorCode(error);
        logRejection({ code: `bridge_compaction_summary_failed:${code}`, transport: 'websocket', ...(req.url ? { url: req.url } : {}) });
        send(compactionFailedEvent(responseId, route.public_model, code));
      }
    }
    async function connect(route: DesktopBridgeRouteContext): Promise<void> {
      const official = route.provider_id === BRIDGE_OFFICIAL_ROUTE_ID;
      // Only a route the bridge compacts for needs the conversation it relays.
      const summarizes = BRIDGE_REMOTE_COMPACTION[route.provider_id] === 'bridge_summary';
      const provider = route.provider_id === BRIDGE_OFFICIAL_ROUTE_ID ? null : config.providers[route.provider_id];
      const remote = official ? config.officialRemote : provider?.remote;
      if (!remote) throw new DesktopBridgeError('bridge_websocket_upstream_unavailable');
      boundBaseUrl = official ? remote.baseUrl : provider!.base_url;
      boundCredentialGeneration = provider?.credential_generation ?? null;
      boundCredentialFingerprint = provider?.credential_fingerprint ?? null;
      const credential = provider ? await config.resolveProviderCredential(provider.provider_id, provider.credential_generation) : null;
      if (credential && (credential.provider_id !== provider!.provider_id || credential.generation !== boundCredentialGeneration
        || (boundCredentialFingerprint && credential.fingerprint !== boundCredentialFingerprint))) throw new DesktopBridgeError('bridge_provider_credential_generation_mismatch');
      await ensureDesktopBridgeRemoteTarget(remote, config.remoteLookup);
      if (stopped || client.readyState !== WebSocket.OPEN) return;
      const target = resolveDesktopBridgeTarget(req.url, remote);
      const outgoing = official ? buildOfficialPassthroughWebSocketHeaders(req.headers, target.host)
        : buildProviderWebSocketHeaders(req.headers, { providerId: provider!.provider_id, authTransport: provider!.auth_transport, credential: credential! }, target.host);
      if (boundByMove) delete outgoing['x-codex-turn-state'];
      else if (provider?.provider_id === 'codex-lb') admitCodexLbTurnState(outgoing, identity.thread_id, credential!.fingerprint);
      // Each leg negotiates its own framing; never reuse the client's key or extensions.
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(outgoing)) {
        if (name.startsWith('sec-websocket-') || name === 'connection' || name === 'upgrade' || name === 'content-length') continue;
        if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
      }
      target.protocol = remote.secure ? 'wss:' : 'ws:';
      let connected = false;
      handshakeTimer = setTimeout(() => {
        if (!connected) void refreshDesktopBridgeRemoteTarget(remote, config.remoteLookup);
        fail(new DesktopBridgeError('bridge_websocket_upstream_handshake_timeout'));
      }, config.connectTimeoutMs);
      handshakeTimer.unref();
      // Dial the validated address directly. Host/SNI retain the original remote identity.
      upstream = new WebSocket(target, client.protocol ? [client.protocol] : [], {
        headers, perMessageDeflate: false, maxPayload: maxBytes,
        handshakeTimeout: config.connectTimeoutMs, followRedirects: false,
        createConnection: () => {
          const connection = remote.secure
            ? tls.connect({ host: remote.address, port: remote.port, ...(remote.tlsServername ? { servername: remote.tlsServername } : {}) })
            : net.connect({ host: remote.address, port: remote.port, family: remote.family });
          upstreamSocket = connection;
          connection.setKeepAlive(true, 30_000);
          connection.once(remote.secure ? 'secureConnect' : 'connect', () => { connected = true; });
          return connection;
        },
      });
      const peer = upstream;
      peer.on('error', (error) => {
        // Heal the validated pin for the client's next connection, without replaying any create.
        if (isUnreachableUpstreamError(error)) void refreshDesktopBridgeRemoteTarget(remote, config.remoteLookup);
        fail(new DesktopBridgeError('bridge_websocket_upstream_unavailable'));
      });
      peer.on('unexpected-response', (_request, response) => {
        response.destroy();
        fail(new DesktopBridgeError(`bridge_websocket_upgrade_failed_${response.statusCode || 502}`));
      });
      peer.on('message', (data, binary) => {
        if (stopped) return;
        let frame = bytes(data);
        // A provider's capacity failure reaches Codex with the retry advice the gateway drops.
        const advised = official || binary ? null : modelCapacityAdvisedFrame(frame);
        if (advised) {
          frame = advised;
          logRejection({ code: 'bridge_upstream_model_capacity_retry_advised', transport: 'websocket', provider_id: route.provider_id, public_model: routedModel ?? route.public_model, ...(req.url ? { url: req.url } : {}) });
        }
        // Codex reads the WebSocket `X-Models-Etag` from this event, never the handshake.
        const advertised = modelsEtag && !binary ? frameWithModelsEtag(frame, modelsEtag) : null;
        if (advertised) frame = advertised;
        const failure = binary ? null : upstreamFailureEvent(frame);
        if (failure) {
          logRejection({
            code: 'bridge_upstream_request_rejected', transport: 'websocket',
            ...(failure.status === undefined ? {} : { status: failure.status, upstream_status: failure.status }),
            provider_id: route.provider_id, public_model: routedModel ?? route.public_model,
            upstream_code: safeUpstreamErrorId(failure.code), upstream_type: safeUpstreamErrorId(failure.type),
            upstream_param: typeof failure.param === 'string' ? failure.param : null,
            request_shape: routedShape, ...(req.url ? { url: req.url } : {}),
          });
        }
        if (summarizes) chain.received(frame);
        try { relay(client, frame, binary); } catch (error) { fail(error); }
      });
      peer.on('close', (code, reason) => {
        upstreamSocket?.destroy();
        stop();
        if (client.readyState === WebSocket.OPEN) {
          if (code === 1005) client.close();
          else client.close(code === 1006 ? 1011 : code, code === 1006 ? 'bridge_websocket_upstream_closed' : reason);
        }
        clearCloseTimer();
      });
      await new Promise<void>((resolve, reject) => {
        peer.once('open', resolve);
        peer.once('error', reject);
        peer.once('close', () => reject(new DesktopBridgeError('bridge_websocket_upstream_closed')));
      });
      if (handshakeTimer) clearTimeout(handshakeTimer);
      clearTimeout(initialTimer);
    }
    async function drain(): Promise<void> {
      if (processing || stopped) return;
      processing = true;
      try {
        while (!bound) {
          const firstCreate = pending.find((message) => message.create);
          if (!firstCreate) return;
          try {
            await resolveCreate(firstCreate);
          } catch (error) {
            if (!(error instanceof ProviderHandoffRefusedError)) throw error;
            refuseMove(firstCreate, error);
            continue;
          }
          // Already validated and rewritten; avoid resolving the alias a second time.
          firstCreate.create = null;
        }
        while (!stopped && client.readyState === WebSocket.OPEN && pending.length) {
          const message = pending[0]!;
          if (message.create) {
            try {
              await resolveCreate(message);
            } catch (error) {
              if (!(error instanceof ProviderHandoffRefusedError)) throw error;
              refuseMove(message, error);
              continue;
            }
          }
          if (stopped || client.readyState !== WebSocket.OPEN) return;
          if (message.compaction) await answerCompaction(message.compaction);
          else {
            relay(upstream!, message.data, message.binary);
            if (message.routed) routedShape = desktopBridgeRequestShape(message.routed);
            // Only a route the bridge compacts for ever answers a compaction itself.
            if (message.routed && bound && BRIDGE_REMOTE_COMPACTION[bound.provider_id] === 'bridge_summary') chain.sent(message.routed, message.data);
          }
          pending.shift();
          pendingBytes -= message.originalBytes;
        }
      } catch (error) { fail(error); }
      finally { processing = false; }
    }
    function clearCloseTimer(): void {
      if (client.readyState === WebSocket.CLOSED && (!upstream || upstream.readyState === WebSocket.CLOSED) && closeTimer) clearTimeout(closeTimer);
    }
    client.on('message', (data, binary) => {
      if (stopped) return;
      const payload = bytes(data);
      let create: Record<string, unknown> | null = null;
      try {
        const parsed: unknown = JSON.parse(payload.toString('utf8'));
        if (parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).type === 'response.create') create = parsed as Record<string, unknown>;
      } catch { /* Unknown native event payloads are forwarded unchanged after routing. */ }
      if (pending.length >= MAX_PENDING_MESSAGES || pendingBytes + payload.length > maxBytes) {
        fail(new DesktopBridgeError('bridge_websocket_pending_limit_exceeded')); return;
      }
      pending.push({ data: payload, binary, create, originalBytes: payload.length }); pendingBytes += payload.length;
      void drain();
    });
    client.on('error', () => { stop(); upstream?.terminate(); upstreamSocket?.destroy(); client.terminate(); });
    client.once('close', (code, reason) => {
      stop();
      if (upstream?.readyState === WebSocket.OPEN) {
        if (code === 1005) upstream.close();
        else upstream.close(code === 1006 ? 1011 : code, reason);
      } else if (upstream?.readyState === WebSocket.CONNECTING) { upstream.terminate(); upstreamSocket?.destroy(); }
      clearCloseTimer();
    });
  }
}
