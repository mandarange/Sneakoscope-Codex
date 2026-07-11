#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: false });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const args = process.argv.slice(2);
const missionId = readArg(args, '--mission');
const sessionName = readArg(args, '--session') || 'sks-real';
const socketDir = readArg(args, '--owned-socket-dir');
const ownerToken = String(process.env.SKS_ZELLIJ_CHECK_OWNER_TOKEN || '');
const command = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-command.js')).href);
const ownershipPath = missionId ? path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-real-session-ownership.json') : null;
const expectedLayoutPath = missionId ? path.join(root, '.sneakoscope', 'layouts', `mad-${missionId}.kdl`) : null;
const ownership = ownershipPath ? await readJson(ownershipPath) : null;
const ownershipBlockers = [
  ...(!missionId ? ['zellij_cleanup_mission_missing'] : []),
  ...(!isSafeOwnedSocketDir(socketDir) ? ['zellij_cleanup_owned_socket_dir_invalid'] : []),
  ...(ownerToken.length < 32 ? ['zellij_cleanup_owner_token_missing'] : []),
  ...(!ownership ? ['zellij_cleanup_ownership_marker_missing'] : []),
  ...(ownership && ownership.schema !== 'sks.zellij-real-session-ownership.v1' ? ['zellij_cleanup_ownership_schema_invalid'] : []),
  ...(ownership && ownership.mission_id !== missionId ? ['zellij_cleanup_mission_mismatch'] : []),
  ...(ownership && ownership.session_name !== sessionName ? ['zellij_cleanup_session_mismatch'] : []),
  ...(ownership && path.resolve(String(ownership.socket_dir || '')) !== path.resolve(String(socketDir || '')) ? ['zellij_cleanup_socket_dir_mismatch'] : []),
  ...(ownership && ownership.owner_token_sha256 !== hashOwnerToken(ownerToken) ? ['zellij_cleanup_owner_token_mismatch'] : []),
  ...(ownership && ownership.cleanup_authorized !== true ? ['zellij_cleanup_not_authorized'] : []),
  ...(ownership && ownership.layout_cleanup_authorized !== true ? ['zellij_cleanup_layout_not_authorized'] : []),
  ...(ownership && path.resolve(String(ownership.layout_path || '')) !== path.resolve(String(expectedLayoutPath || '')) ? ['zellij_cleanup_layout_path_mismatch'] : [])
];

if (ownershipBlockers.length > 0) {
  emit({
    schema: 'sks.zellij-real-session-cleanup-check.v1',
    ok: false,
    mutation_attempted: false,
    mission_id: missionId,
    session_name: sessionName,
    socket_dir: socketDir,
    ownership_path: ownershipPath,
    blockers: ownershipBlockers
  });
} else {
  const beforeEntries = await socketEntries(socketDir);
  const result = await command.runZellij(['kill-session', sessionName], {
    cwd: root,
    env: { ZELLIJ_SOCKET_DIR: socketDir },
    timeoutMs: 5000,
    optional: true
  });
  const remainingEntries = await waitForSocketEntriesToClear(socketDir, 2000);
  const sessionRemoved = !remainingEntries.includes(sessionName);
  const socketExclusive = remainingEntries.length === 0;
  const layoutPresentBefore = await exists(expectedLayoutPath);
  const layoutSha256Before = layoutPresentBefore ? await sha256File(expectedLayoutPath) : null;
  const layoutHashMatches = !layoutPresentBefore || !ownership.layout_sha256 || layoutSha256Before === ownership.layout_sha256;
  let socketDirRemoved = false;
  let layoutRemoved = false;
  if (sessionRemoved && socketExclusive) {
    await fs.rm(socketDir, { recursive: true, force: true });
    socketDirRemoved = !(await exists(socketDir));
    if (socketDirRemoved && layoutHashMatches) {
      await fs.rm(expectedLayoutPath, { force: true });
      layoutRemoved = !(await exists(expectedLayoutPath));
    }
  }
  const blockers = [
    ...(!sessionRemoved ? ['zellij_cleanup_session_still_present'] : []),
    ...(!socketExclusive ? ['zellij_cleanup_owned_socket_dir_not_empty'] : []),
    ...(!socketDirRemoved ? ['zellij_cleanup_socket_dir_not_removed'] : []),
    ...(!layoutHashMatches ? ['zellij_cleanup_layout_hash_mismatch'] : []),
    ...(!layoutRemoved ? ['zellij_cleanup_layout_not_removed'] : [])
  ];
  const report = {
    schema: 'sks.zellij-real-session-cleanup-check.v1',
    ok: blockers.length === 0,
    mutation_attempted: true,
    mission_id: missionId,
    session_name: sessionName,
    socket_dir: socketDir,
    ownership_path: ownershipPath,
    session_present_before: beforeEntries.includes(sessionName),
    session_removed: sessionRemoved,
    socket_dir_exclusive: socketExclusive,
    socket_dir_removed: socketDirRemoved,
    layout_path: expectedLayoutPath,
    layout_sha256: ownership.layout_sha256 || null,
    layout_sha256_before_cleanup: layoutSha256Before,
    layout_hash_matches: layoutHashMatches,
    layout_removed: layoutRemoved,
    remaining_socket_entries: remainingEntries,
    result,
    blockers,
    warnings: result.ok ? [] : ['zellij_kill_session_nonzero_but_absence_verified']
  };
  await fs.writeFile(path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-real-session-cleanup.json'), `${JSON.stringify(report, null, 2)}\n`);
  emit(report);
}

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-real-session-cleanup-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
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

async function readJson(file) {
  return fs.readFile(file, 'utf8').then((text) => JSON.parse(text)).catch(() => null);
}

async function socketEntries(socketDir) {
  if (!socketDir) return [];
  return fs.readdir(path.join(socketDir, 'contract_version_1')).catch(() => []);
}

async function waitForSocketEntriesToClear(socketDir, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const entries = await socketEntries(socketDir);
    if (entries.length === 0 || Date.now() >= deadline) return entries;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function exists(value) {
  return fs.access(value).then(() => true).catch(() => false);
}
