import * as http from 'node:http';
import path from 'node:path';
import { flag } from '../../cli/args.js';
import { printJson } from '../../cli/output.js';
import { ui } from '../../cli/cli-theme.js';
import { DASHBOARD_HTML } from '../ui/dashboard-html.js';
import { findLatestMission, missionDir } from '../mission.js';
import { nowIso, projectRoot, readJson, readText, runProcess } from '../fsx.js';
import { readZellijSlotTelemetrySnapshot } from '../zellij/zellij-slot-telemetry.js';

export async function uiCommand(args: string[] = []) {
  const root = path.resolve(String(readOption(args, '--root', '') || await projectRoot()));
  if (flag(args, '--once')) {
    const state = await collectUiState(root, String(readOption(args, '--mission', 'latest') || 'latest'));
    if (flag(args, '--json')) return printJson(state);
    ui.banner('ui');
    ui.ok(`state ${state.mission_id || 'latest'} ${state.gates.length} gates`);
    return state;
  }
  const requestedPort = Number(readOption(args, '--port', '4477'));
  const port = Number.isFinite(requestedPort) && requestedPort > 0 ? Math.floor(requestedPort) : 4477;
  const mission = String(readOption(args, '--mission', 'latest') || 'latest');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(DASHBOARD_HTML);
        return;
      }
      if (url.pathname === '/events') return sseStream(res, root, String(url.searchParams.get('mission') || mission));
      if (url.pathname === '/api/state') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(await collectUiState(root, String(url.searchParams.get('mission') || mission))));
        return;
      }
      res.writeHead(404);
      res.end('not found');
    } catch (err: any) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: sanitizeText(err?.message || String(err)) }));
    }
  });
  const actualPort = await listenLocal(server, port);
  const url = `http://127.0.0.1:${actualPort}`;
  ui.banner('ui');
  ui.ok(`dashboard ${url}`);
  void runProcess('/usr/bin/open', [url], { timeoutMs: 5000, maxOutputBytes: 4096 }).catch(() => undefined);
  return new Promise(() => undefined);
}

export async function collectUiState(root: string, missionInput: string = 'latest') {
  const missionId = missionInput === 'latest' ? await findLatestMission(root) : missionInput;
  const snapshot = missionId ? await readZellijSlotTelemetrySnapshot(root, missionId).catch(() => null) : null;
  const gates = missionId ? await readLatestGateSummaries(root, missionId) : [];
  const events = missionId ? await tailJsonl(path.join(missionDir(root, missionId), 'events.jsonl'), 30) : [];
  const mission = missionId ? await readJson<any>(path.join(missionDir(root, missionId), 'mission.json'), null).catch(() => null) : null;
  return sanitizeForUi({
    schema: 'sks.ui-state.v1',
    ok: true,
    ts: nowIso(),
    mission_id: missionId,
    route: mission?.mode || mission?.route || null,
    snapshot,
    gates,
    events
  });
}

async function sseStream(res: http.ServerResponse, root: string, mission: string) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-store',
    connection: 'keep-alive'
  });
  const tick = async () => {
    const state = await collectUiState(root, mission).catch((err: any) => ({ ok: false, ts: nowIso(), error: sanitizeText(err?.message || String(err)) }));
    res.write(`data: ${JSON.stringify(state)}\n\n`);
  };
  await tick();
  const timer = setInterval(tick, 1000);
  res.on('close', () => clearInterval(timer));
}

async function readLatestGateSummaries(root: string, missionId: string) {
  const dir = missionDir(root, missionId);
  const files = ['stop-gate.json', 'naruto-gate.json', 'team-gate.json', 'qa-gate.json', 'reflection-gate.json', 'completion-proof.json'];
  const rows = [];
  for (const file of files) {
    const gate = await readJson<any>(path.join(dir, file), null).catch(() => null);
    if (!gate) continue;
    rows.push({
      id: file,
      ok: gate.passed === true || gate.ok === true || gate.status === 'passed',
      missing: Array.isArray(gate.missing) ? gate.missing : Array.isArray(gate.blockers) ? gate.blockers : [],
      source: `.sneakoscope/missions/${missionId}/${file}`
    });
  }
  return rows;
}

async function tailJsonl(file: string, limit: number) {
  const text = await readText(file, '').catch(() => '');
  return String(text || '').split(/\r?\n/).filter(Boolean).slice(-limit).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { ts: null, type: 'raw', text: line.slice(0, 500) };
    }
  });
}

async function listenLocal(server: http.Server, startPort: number): Promise<number> {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = startPort + offset;
    const result = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.off('listening', onListen);
        resolve({ ok: false, code: err.code || 'listen_failed' });
      };
      const onListen = () => {
        server.off('error', onError);
        resolve({ ok: true });
      };
      server.once('error', onError);
      server.once('listening', onListen);
      server.listen(port, '127.0.0.1');
    });
    if (result.ok) return port;
    if (result.code !== 'EADDRINUSE') throw new Error(`dashboard listen failed: ${result.code}`);
  }
  throw new Error('dashboard listen failed: no available localhost port');
}

function sanitizeForUi(value: any): any {
  if (Array.isArray(value)) return value.map((item) => sanitizeForUi(item));
  if (!value || typeof value !== 'object') return typeof value === 'string' ? sanitizeText(value) : value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/(?:key|token|secret|password|credential|cookie|auth)/i.test(key)) continue;
    out[key] = sanitizeForUi(child);
  }
  return out;
}

function sanitizeText(value: unknown): string {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted]')
    .replace(/(?:api[_-]?key|secret|token|password|credential)/ig, '[redacted-field]')
    .slice(0, 2000);
}

function readOption(args: string[] = [], name: string, fallback: unknown = null) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1];
  const prefixed = args.find((arg) => String(arg).startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}
