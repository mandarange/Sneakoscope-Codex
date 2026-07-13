import path from 'node:path';
import { readJson, readText } from '../fsx.js';
import { missionDir } from '../mission.js';

const TEAM_DIGEST_MAX_EVENTS = 4;
const TEAM_DIGEST_MESSAGE_CHARS = 180;
const TEAM_DIGEST_CONTEXT_CHARS = 1600;
const TEAM_DIGEST_SYSTEM_CHARS = 260;

export async function teamLiveDigest(root: any, state: any = {}) {
  if (!isTeamState(state) || !state.mission_id) return null;
  const id = String(state.mission_id);
  const dir = missionDir(root, id);
  const dashboard = await readJson(path.join(dir, 'team-dashboard.json'), null).catch(() => null);
  const transcript = await readText(path.join(dir, 'team-transcript.jsonl'), '').catch(() => '');
  let events = transcript.split(/\n/).filter(Boolean).slice(-TEAM_DIGEST_MAX_EVENTS * 3).map(parseTeamTranscriptLine).filter(Boolean);
  let source = 'team-transcript.jsonl';
  if (!events.length) {
    const live = await readText(path.join(dir, 'team-live.md'), '').catch(() => '');
    events = live.split(/\n/).filter((line: any) => /^- \d{4}-\d{2}-\d{2}T/.test(line.trim())).slice(-TEAM_DIGEST_MAX_EVENTS).map(parseTeamLiveLine).filter(Boolean);
    source = 'team-live.md';
  }
  if (!events.length) {
    events = dashboard?.latest_messages || [];
    source = 'team-dashboard.json';
  }
  events = normalizeTeamEvents(events).slice(-TEAM_DIGEST_MAX_EVENTS);
  if (!events.length) return null;

  const phase = oneLine(state.phase || dashboard?.phase || 'TEAM', 48);
  const lines = events.map(formatTeamDigestEvent);
  const context = boundText([
    `SKS Team live digest: mission ${id}, phase ${phase}, source ${source}.`,
    `Open live view with: sks team watch ${id}`,
    'Recent events:',
    ...lines.map((line: any) => `- ${line}`)
  ].join('\n'), TEAM_DIGEST_CONTEXT_CHARS);
  const system = boundText(`SKS Team live: ${lines.at(-1) || `${id} ${phase}`}`, TEAM_DIGEST_SYSTEM_CHARS);
  return { context, system };
}

function isTeamState(state: any = {}) {
  const values = [state.mode, state.route, state.route_command, state.stop_gate].map((value: any) => String(value || '').toLowerCase());
  return values.some((value: any) => value === 'team' || value === '$team' || value.includes('team-gate'));
}

function normalizeTeamEvents(events: any = []) {
  return events.map((event: any) => ({
    ts: String(event?.ts || ''),
    agent: oneLine(event?.agent || 'unknown', 40),
    phase: oneLine(event?.phase || 'general', 48),
    message: oneLine(event?.message || '', TEAM_DIGEST_MESSAGE_CHARS)
  })).filter((event: any) => event.message);
}

function parseTeamTranscriptLine(line: any) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function parseTeamLiveLine(line: any) {
  const match = String(line || '').trim().match(/^-\s+(\S+)\s+\[([^\]]+)\]\s+([^:]+):\s*(.*)$/);
  if (!match) return null;
  return { ts: match[1], phase: match[2], agent: match[3], message: match[4] };
}

function formatTeamDigestEvent(event: any) {
  const ts = shortIsoTime(event.ts);
  return `${ts} [${event.phase}] ${event.agent}: ${event.message}`;
}

function shortIsoTime(ts: any) {
  return String(ts || '').replace(/^\d{4}-\d{2}-\d{2}T/, '').replace(/\.\d{3}Z$/, 'Z') || 'recent';
}

function oneLine(value: any, limit: any) {
  return boundText(String(value || '').replace(/\s+/g, ' ').trim(), limit);
}

function boundText(value: any, limit: any) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function joinSystemMessages(...parts: any[]) {
  return boundText(parts.filter(Boolean).join(' | '), 420);
}
