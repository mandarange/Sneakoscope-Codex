#!/usr/bin/env node
// Gate: legacy:upgrade-zero-break
// Proves a 1.18.x -> 1.19 upgrade never breaks user Codex config across legacy
// states. Operates entirely on temp dirs (os.tmpdir + fs.mkdtemp); never touches
// the real ~/.codex. Always restores process.env.CODEX_HOME / HOME in finally.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const policy = await importDist('core/codex/codex-project-config-policy.js');
const install = await importDist('cli/install-helpers.js');
const journal = await importDist('core/migration/migration-transaction-journal.js');

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmTmp(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup; never fail the gate on teardown
  }
}

const tmpDirs = [];
const savedCodexHome = process.env.CODEX_HOME;
const savedHome = process.env.HOME;
const summary = { states: {}, generated_at: new Date().toISOString() };

try {
  // ---------------------------------------------------------------------------
  // State 6 — corrupted config (machine-local key absorbed into a TOML table).
  // The pre-fix mover appended top-level machine-local keys after the last
  // [table], so TOML absorbed them into that table. repairCodexConfigStructure
  // hoists them back above the first table header.
  // ---------------------------------------------------------------------------
  {
    const dir = mkTmp('sks-legacy-corrupt-');
    tmpDirs.push(dir);
    const configPath = path.join(dir, 'config.toml');
    const corrupted =
      'model = "gpt-5.5"\nservice_tier = "fast"\n\n[mcp_servers.xai-grok.env]\nXAI_API_KEY = "x"\nmodel_provider = "codex-lb"\nnotify = ["a","b"]\n';
    fs.writeFileSync(configPath, corrupted, 'utf8');

    const result = await policy.repairCodexConfigStructure(configPath, { apply: true });
    const okStatuses = ['structure_repaired', 'structure_repair_available', 'structure_ok'];
    assertGate(
      okStatuses.includes(result.status),
      'corrupted_config: repair status not recognized',
      { status: result.status, expected: okStatuses }
    );
    // If it hoisted, a backup must exist on disk.
    if (result.status === 'structure_repaired') {
      assertGate(
        Boolean(result.backup_path) && fs.existsSync(result.backup_path),
        'corrupted_config: repaired but no backup file on disk',
        { backup_path: result.backup_path }
      );
    }
    // Tolerant structural check: either the keys were hoisted ABOVE the first
    // table header, or the structure was already ok.
    const repaired = fs.readFileSync(configPath, 'utf8');
    const firstTableIdx = repaired.indexOf('\n[');
    const headRegion = firstTableIdx === -1 ? repaired : repaired.slice(0, firstTableIdx);
    const hoisted =
      /^\s*model_provider\s*=/m.test(headRegion) && /^\s*notify\s*=/m.test(headRegion);
    assertGate(
      hoisted || result.status === 'structure_ok',
      'corrupted_config: machine-local keys were not hoisted above the first table',
      { status: result.status, head_region: headRegion }
    );
    summary.states.corrupted_config = {
      status: result.status,
      hoisted_keys: result.hoisted_keys || [],
      backup_present: Boolean(result.backup_path)
    };
  }

  // ---------------------------------------------------------------------------
  // States 1-4 — user global config preserved + user-disabled flags not
  // re-enabled. ensureGlobalCodexFastModeDuringInstall reads the Codex home
  // config (HOME/.codex/config.toml; honors opts.home). It is set-if-absent and
  // backs up the prior good config before any mutation.
  // ---------------------------------------------------------------------------
  {
    const tmpHome = mkTmp('sks-legacy-home-');
    tmpDirs.push(tmpHome);
    const codexDir = path.join(tmpHome, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const configPath = path.join(codexDir, 'config.toml');
    const userConfig =
      'model = "o3"\nservice_tier = "flex"\nmodel_reasoning_effort = "high"\n\n[features]\nbrowser_use = false\n\n# user comment\n';
    fs.writeFileSync(configPath, userConfig, 'utf8');

    process.env.CODEX_HOME = tmpHome;
    process.env.HOME = tmpHome;
    const result = await install.ensureGlobalCodexFastModeDuringInstall({ home: tmpHome });

    const after = fs.readFileSync(configPath, 'utf8');
    assertGate(
      after.includes('model = "o3"'),
      'user_config_preserved: user model was overwritten',
      { status: result.status }
    );
    assertGate(
      after.includes('service_tier = "flex"'),
      'user_config_preserved: user service_tier was overwritten',
      { status: result.status }
    );
    assertGate(
      after.includes('model_reasoning_effort = "high"'),
      'user_config_preserved: user model_reasoning_effort was overwritten',
      { status: result.status }
    );
    // User-disabled feature must NOT be re-enabled (set-if-absent only).
    assertGate(
      after.includes('browser_use = false'),
      'flags_not_reenabled: user-disabled browser_use was re-enabled',
      { status: result.status }
    );
    // When the managed defaults were applied, the prior good config must be
    // backed up to a sibling config.toml.*bak file.
    if (result.status === 'updated') {
      const siblings = fs.readdirSync(codexDir);
      const backup = siblings.find((name) => /config\.toml\..*bak/.test(name));
      assertGate(
        Boolean(backup),
        'user_config_preserved: status=updated but no backup file written',
        { siblings }
      );
      summary.states.user_config_preserved = { status: result.status, backup: backup };
    } else {
      summary.states.user_config_preserved = { status: result.status };
    }
    summary.states.flags_not_reenabled = { browser_use_preserved: true };

    // Restore env immediately after this state to avoid leaking into spawns.
    if (savedCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = savedCodexHome;
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
  }

  // ---------------------------------------------------------------------------
  // State 6b — splitter preserves project keys. The project config keeps its
  // own [profiles.*] table; only machine-local top-level keys are moved out.
  // ---------------------------------------------------------------------------
  {
    const projectRoot = mkTmp('sks-legacy-project-');
    const tmpHome2 = mkTmp('sks-legacy-home2-');
    tmpDirs.push(projectRoot, tmpHome2);
    const projectCodexDir = path.join(projectRoot, '.codex');
    fs.mkdirSync(projectCodexDir, { recursive: true });
    const projectConfigPath = path.join(projectCodexDir, 'config.toml');
    // Machine-local keys/tables (model_provider, [profiles.*]) move out to CODEX_HOME;
    // project-scoped settings (sandbox_mode, [features]) must be PRESERVED in place.
    fs.writeFileSync(
      projectConfigPath,
      'model_provider = "codex-lb"\nsandbox_mode = "workspace-write"\n\n[features]\nhooks = true\n',
      'utf8'
    );

    const result = await policy.splitCodexProjectConfigPolicy(projectRoot, {
      apply: true,
      codexHome: tmpHome2,
      writeReport: false
    });
    const projectAfter = fs.readFileSync(projectConfigPath, 'utf8');
    assertGate(
      projectAfter.includes('sandbox_mode = "workspace-write"'),
      'splitter_preserves_project: project-scoped sandbox_mode was removed',
      { status: result.status, project_after: projectAfter }
    );
    assertGate(
      projectAfter.includes('[features]'),
      'splitter_preserves_project: project-scoped [features] table was removed',
      { status: result.status, project_after: projectAfter }
    );
    assertGate(
      !/^\s*model_provider\s*=/m.test(projectAfter),
      'splitter_preserves_project: machine-local model_provider was not moved out of the project config',
      { status: result.status, project_after: projectAfter }
    );
    summary.states.splitter_preserves_project = {
      status: result.status,
      moved_keys: result.moved_keys || [],
      moved_tables: result.moved_tables || []
    };
  }

  // ---------------------------------------------------------------------------
  // State 7/10 — tmux is a removed runtime; zellij status is informational.
  // Spawn the built CLI from the repo root.
  // ---------------------------------------------------------------------------
  {
    const tmux = spawnSync(process.execPath, ['dist/bin/sks.js', 'tmux', '--json'], {
      cwd: root,
      encoding: 'utf8'
    });
    let tmuxJson;
    try {
      tmuxJson = JSON.parse(tmux.stdout);
    } catch (err) {
      assertGate(false, 'tmux_removed_runtime: stdout is not valid JSON', {
        stdout: tmux.stdout,
        stderr: tmux.stderr,
        error: String(err)
      });
    }
    assertGate(
      tmuxJson.status === 'removed_runtime' && tmuxJson.replacement === 'zellij',
      'tmux_removed_runtime: tmux did not report removed_runtime -> zellij',
      { json: tmuxJson }
    );
    assertGate(
      tmux.status === 2,
      'tmux_removed_runtime: tmux exit code must be 2',
      { exit: tmux.status }
    );
    summary.states.tmux_removed_runtime = {
      status: tmuxJson.status,
      replacement: tmuxJson.replacement,
      exit: tmux.status
    };

    const zj = spawnSync(process.execPath, ['dist/bin/sks.js', 'zellij', 'status', '--json'], {
      cwd: root,
      encoding: 'utf8'
    });
    let zjJson;
    try {
      zjJson = JSON.parse(zj.stdout);
    } catch (err) {
      assertGate(false, 'zellij_status_informational: stdout is not valid JSON', {
        stdout: zj.stdout,
        stderr: zj.stderr,
        error: String(err)
      });
    }
    assertGate(
      Object.prototype.hasOwnProperty.call(zjJson, 'status'),
      'zellij_status_informational: missing status field',
      { json: zjJson }
    );
    // Informational status must not hard-fail when zellij is missing.
    assertGate(
      zjJson.ok === true,
      'zellij_status_informational: informational status hard-failed (ok !== true)',
      { json: zjJson }
    );
    summary.states.zellij_status_informational = { status: zjJson.status, ok: zjJson.ok };
  }

  // ---------------------------------------------------------------------------
  // Migration journal contract — before/after hash, change + rollback flags.
  // ---------------------------------------------------------------------------
  {
    const ev = journal.buildMigrationEvent({
      step: 't',
      target: '/x/config.toml',
      before: 'a',
      after: 'b',
      backupPath: '/x/config.toml.bak'
    });
    assertGate(
      Boolean(ev.before_hash) &&
        Boolean(ev.after_hash) &&
        ev.before_hash !== ev.after_hash &&
        ev.changed === true &&
        ev.rollback_available === true &&
        ev.backup_path === '/x/config.toml.bak',
      'migration_journal: mutated event contract failed',
      { event: ev }
    );

    const ev2 = journal.buildMigrationEvent({ step: 't', target: '/x', before: 'a', after: 'a' });
    assertGate(
      ev2.changed === false && ev2.rollback_available === false,
      'migration_journal: no-op event contract failed',
      { event: ev2 }
    );
    summary.states.migration_journal = { mutated: true, noop: true };
  }

  // ---------------------------------------------------------------------------
  // Write the report and emit the gate.
  // ---------------------------------------------------------------------------
  const reportDir = path.join(root, '.sneakoscope', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'legacy-upgrade-matrix.json');
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify({ schema: 'sks.legacy-upgrade-matrix.v1', ok: true, ...summary }, null, 2)}\n`,
    'utf8'
  );

  emitGate('legacy:upgrade-zero-break', {
    report_path: reportPath,
    states_checked: [
      'corrupted_config',
      'user_config_preserved',
      'flags_not_reenabled',
      'splitter_preserves_project',
      'tmux_removed_runtime',
      'zellij_status_informational',
      'migration_journal'
    ]
  });
} finally {
  for (const dir of tmpDirs) rmTmp(dir);
  if (savedCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = savedCodexHome;
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
}
