import { findLatestMission } from '../mission.mjs';
import { DOLLAR_SKILL_NAMES, RECOMMENDED_SKILLS } from '../routes.mjs';

export const flag = (args = [], name) => args.includes(name);

export function promptOf(args = []) {
  return args.filter((x) => !String(x).startsWith('--')).join(' ').trim();
}

export async function resolveMissionId(root, arg) {
  return (!arg || arg === 'latest') ? findLatestMission(root) : arg;
}

export function readOption(args = [], name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

export function readFlagValue(args = [], name, fallback = null) {
  return readOption(args, name, fallback);
}

export function positionalArgs(args = []) {
  const out = [];
  const valueFlags = new Set([
    '--format', '--iterations', '--out', '--baseline', '--candidate', '--install-scope',
    '--max-cycles', '--cycle-timeout-minutes', '--depth', '--scope', '--transport',
    '--query', '--topic', '--tokens', '--timeout-ms', '--sql', '--command',
    '--project-ref', '--agent', '--phase', '--message', '--role', '--max-anchors',
    '--lines', '--intent', '--changed', '--route', '--skills', '--prompt-signature',
    '--mission-id', '--source', '--image-id', '--bbox', '--label', '--evidence',
    '--claim-id', '--type', '--before', '--after', '--anchors', '--verification',
    '--status', '--scouts'
  ]);
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i]);
    if (valueFlags.has(arg)) {
      i += 1;
      continue;
    }
    if (!arg.startsWith('--')) out.push(arg);
  }
  return out;
}

export function readBoundedIntegerFlag(args, name, fallback, min, max) {
  const raw = Number(readFlagValue(args, name, fallback));
  if (!Number.isFinite(raw)) return Math.max(min, Number.parseInt(fallback, 10) || min);
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

export function readMaxCycles(args, fallback) {
  return readBoundedIntegerFlag(args, '--max-cycles', fallback, 1, 50);
}

export function ambientGoalContinuation() {
  return {
    schema_version: 1,
    enabled: true,
    mode: 'ambient_codex_native_goal_overlay',
    native_slash_command: '/goal',
    non_disruptive: true,
    rule: 'Use Codex native goal persistence to keep long work resumable when available, but never replace Team, TriWiki, verification, or Honest Mode route gates.'
  };
}

export function knownGeneratedSkillNames() {
  return Array.from(new Set([...DOLLAR_SKILL_NAMES, ...RECOMMENDED_SKILLS]));
}

export async function safeReadTextFile(fsp, file, fallback = '') {
  try {
    return await fsp.readFile(file, 'utf8');
  } catch {
    return fallback;
  }
}
