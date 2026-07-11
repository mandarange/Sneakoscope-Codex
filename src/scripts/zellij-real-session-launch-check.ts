#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const args = process.argv.slice(2);
const runSuffix = `${process.pid}-${Date.now().toString(36)}`;
const missionId = readArg(args, '--mission') || `M-zellij-real-check-${runSuffix}`;
const sessionName = readArg(args, '--session') || `sks-real-${runSuffix}`;
const requireReal = process.env.SKS_REQUIRE_ZELLIJ === '1' || args.includes('--require-real');
const mainOnly = args.includes('--main-only') || process.env.SKS_ZELLIJ_MAIN_ONLY === '1';
const ownedSession = args.includes('--owned-session');
const ownerToken = String(process.env.SKS_ZELLIJ_CHECK_OWNER_TOKEN || '');
const launcher = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-launcher.js')).href);
const command = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-command.js')).href);
const screenProof = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-screen-proof.js')).href);
const socketDir = command.resolveZellijProcessEnvMeta().zellij_socket_dir;
const missionRoot = path.join(root, '.sneakoscope', 'missions', missionId);
const ownershipPath = path.join(missionRoot, 'zellij-real-session-ownership.json');
const expectedLayoutPath = path.join(root, '.sneakoscope', 'layouts', `mad-${missionId}.kdl`);
let ownership = null;

if (ownedSession) {
  if (!isSafeOwnedSocketDir(socketDir)) fail('zellij_owned_socket_dir_invalid', { socket_dir: socketDir });
  if (ownerToken.length < 32) fail('zellij_owner_token_missing', { owner_token_present: ownerToken.length > 0 });
  const [markerExists, socketExists] = await Promise.all([exists(ownershipPath), exists(socketDir)]);
  if (markerExists) fail('zellij_ownership_marker_collision', { ownership_path: ownershipPath });
  if (socketExists) fail('zellij_owned_socket_dir_collision', { socket_dir: socketDir });
  ownership = {
    schema: 'sks.zellij-real-session-ownership.v1',
    mission_id: missionId,
    session_name: sessionName,
    socket_dir: socketDir,
    owner_token_sha256: hashOwnerToken(ownerToken),
    cleanup_authorized: true,
    layout_cleanup_authorized: true,
    layout_path: expectedLayoutPath,
    layout_sha256: null,
    state: 'prepared',
    session_created: false
  };
  await fs.mkdir(missionRoot, { recursive: true });
  await fs.writeFile(ownershipPath, `${JSON.stringify(ownership, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

const report = await launcher.launchMadZellijUi(['--session', sessionName], {
  root,
  missionId,
  ledgerRoot: path.join(root, '.sneakoscope', 'missions', missionId, 'agents'),
  dryRun: false,
  requireZellij: requireReal,
  slotCount: 1
});
const sessionCollision = Array.isArray(report?.launch?.create_background?.warnings)
  && report.launch.create_background.warnings.some((warning) => String(warning).startsWith('zellij_session_already_exists:'));
const layoutPathValid = !ownedSession || path.resolve(String(report?.layout_path || '')) === path.resolve(expectedLayoutPath);
const layoutSha256 = ownedSession && layoutPathValid ? await sha256File(expectedLayoutPath) : null;
if (ownership) {
  ownership = {
    ...ownership,
    state: report?.launch?.create_background?.ok === true && !sessionCollision ? 'launched' : 'launch_failed',
    session_created: report?.launch?.create_background?.ok === true && !sessionCollision,
    layout_path_valid: layoutPathValid,
    layout_sha256: layoutSha256,
    launch_exit_code: report?.launch?.create_background?.exit_code ?? null
  };
  await fs.writeFile(ownershipPath, `${JSON.stringify(ownership, null, 2)}\n`, { mode: 0o600 });
}

const heartbeatPath = path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-lane-renderer-heartbeat.jsonl');
const heartbeat = mainOnly
  ? { ok: true, heartbeat_present: false, waited_ms: 0, timeout_ms: 0, blocker: null, skipped: true }
  : await screenProof.waitForLaneHeartbeat(heartbeatPath, { timeoutMs: 5000 });
const blockers = [
  ...(sessionCollision ? ['zellij_session_name_collision'] : []),
  ...(ownedSession && !layoutPathValid ? ['zellij_owned_layout_path_invalid'] : []),
  ...(ownedSession && !layoutSha256 ? ['zellij_owned_layout_hash_missing'] : []),
  ...(requireReal && report.ok !== true ? ['zellij_real_session_launch_failed'] : []),
  ...(requireReal && heartbeat.blocker ? [heartbeat.blocker] : [])
];
const gate = {
  schema: 'sks.zellij-real-session-launch-check.v1',
  ok: requireReal ? (report.ok === true && heartbeat.ok === true && blockers.length === 0) : (report.ok === true && blockers.length === 0),
  integration_optional: !requireReal,
  main_only: mainOnly,
  mission_id: missionId,
  session_name: sessionName,
  owned_session: ownedSession,
  ownership_path: ownership ? ownershipPath : null,
  socket_dir: socketDir,
  heartbeat: { path: heartbeatPath, present: heartbeat.heartbeat_present, waited_ms: heartbeat.waited_ms, timeout_ms: heartbeat.timeout_ms },
  blockers,
  report
};
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'zellij-real-session-launch.json'), `${JSON.stringify(gate, null, 2)}\n`);
emit(gate);

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-real-session-launch-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
function readArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || null : null;
}

function hashOwnerToken(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

async function sha256File(file) {
  return fs.readFile(file).then((data) => createHash('sha256').update(data).digest('hex')).catch(() => null);
}

function isSafeOwnedSocketDir(value) {
  if (!value) return false;
  const resolved = path.resolve(String(value));
  return path.dirname(resolved) === '/tmp' && /^sks-zj-rr-[A-Za-z0-9-]+$/.test(path.basename(resolved));
}

async function exists(value) {
  if (!value) return false;
  return fs.access(value).then(() => true).catch(() => false);
}
