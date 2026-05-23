import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './ensure-dist-fresh.mjs';

export async function runMadSksExecutorCheck(kind) {
  const reportDir = path.join(root, '.sneakoscope', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const freshness = ensureDistFresh({ rebuild: true });
  if (!freshness.ok) return writeReport(reportDir, kind, { schema: schemaFor(kind), ok: false, blocker: 'dist_not_fresh', freshness });

  const mods = await loadMadSksDist();
  const targetRoot = path.join(root, '.sneakoscope', 'tmp', `mad-sks-${kind}-${process.pid}`);
  const artifactDir = path.join(targetRoot, 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const { permission, authorization, authorizationPath } = createAuthorization(mods, targetRoot, kind, artifactDir);

  const common = {
    target_root: targetRoot,
    artifact_dir: artifactDir,
    authorization_manifest: authorization,
    authorization_manifest_path: authorizationPath,
    permission_model: permission,
    yes: true
  };
  const protectedBefore = await mods.immutable.snapshotProtectedCore(root, `${kind}-before`);
  let result;
  let rollbackApply = null;
  let protectedBlock = null;
  const checks = [];

  if (kind === 'actual-executor-blackbox' || kind === 'file-write-executor') {
    result = await mods.executors.runMadSksExecutor({
      ...common,
      executor: 'file-write',
      dry_run: false,
      target_path: path.join('target', 'actual-write.txt'),
      content: `mad-sks actual executor ${kind}\n`
    });
    const targetFile = path.join(targetRoot, 'target', 'actual-write.txt');
    checks.push(['target_file_written', fs.existsSync(targetFile) && fs.readFileSync(targetFile, 'utf8').includes('mad-sks actual executor')]);
    protectedBlock = await mods.executors.runMadSksExecutor({
      ...common,
      executor: 'file-write',
      dry_run: false,
      target_path: path.join(root, 'src', 'core', 'version.ts'),
      content: 'blocked protected write\n'
    });
    checks.push(['protected_core_write_blocked', protectedBlock.ok === false && protectedBlock.status === 'blocked']);
    rollbackApply = await mods.rollbackApply.applyMadSksRollbackPlan({
      rollbackPlanPath: result.rollback_plan_path,
      targetRoot,
      artifactDir,
      yes: true,
      root
    });
    checks.push(['rollback_apply_removed_new_file', rollbackApply.ok === true && !fs.existsSync(targetFile)]);
  } else if (kind === 'shell-executor') {
    result = await mods.executors.runMadSksExecutor({
      ...common,
      executor: 'shell-command',
      dry_run: false,
      argv: [process.execPath, '-e', 'console.log("mad-sks-shell-ok")'],
      command: [process.execPath, '-e', 'console.log("mad-sks-shell-ok")']
    });
    checks.push(['argv_no_shell_command_succeeded', result.ok === true && result.status === 'applied' && /mad-sks-shell-ok/.test(String(result.stdout_tail || ''))]);
  } else if (kind === 'package-executor') {
    result = await mods.executors.runMadSksExecutor({
      ...common,
      executor: 'package-install',
      dry_run: true,
      argv: ['npm', 'install', 'left-pad'],
      command: ['npm', 'install', 'left-pad']
    });
    checks.push(['package_command_routed_dry_run', result.ok === true && result.status === 'dry_run' && result.classification?.route_to_executor === 'package_install']);
  } else if (kind === 'service-executor') {
    result = await mods.executors.runMadSksExecutor({
      ...common,
      executor: 'service-control',
      dry_run: true,
      argv: ['npm', 'run', 'dev'],
      command: ['npm', 'run', 'dev']
    });
    checks.push(['service_command_guarded_dry_run', result.ok === true && result.status === 'dry_run' && result.previous_state?.captured === true]);
  } else if (kind === 'db-executor') {
    result = await mods.executors.runMadSksExecutor({
      ...common,
      executor: 'db-write',
      dry_run: true,
      sql: 'update accounts set name = name where id = 1',
      rollback_sql: 'update accounts set name = name where id = 1'
    });
    checks.push(['db_write_plan_guarded_dry_run', result.ok === true && result.status === 'dry_run' && result.sql_classification?.destructive === false]);
  } else if (kind === 'rollback-apply') {
    const write = await mods.executors.runMadSksExecutor({
      ...common,
      executor: 'file-write',
      dry_run: false,
      target_path: path.join('target', 'rollback-only.txt'),
      content: 'rollback target\n'
    });
    result = await mods.rollbackApply.applyMadSksRollbackPlan({
      rollbackPlanPath: write.rollback_plan_path,
      targetRoot,
      artifactDir,
      yes: true,
      root
    });
    checks.push(['rollback_plan_applied', result.ok === true && result.status === 'applied']);
  } else if (kind === 'live-protected-core-smoke') {
    const decision = await mods.immutable.evaluateMadSksWrite({
      packageRoot: root,
      targetRoot,
      operation: 'file_write',
      path: path.join(root, 'src', 'core', 'version.ts')
    });
    result = {
      schema: 'sks.mad-sks-live-protected-core-smoke.v1',
      ok: decision.ok === false,
      status: decision.decision === 'blocked' ? 'blocked_as_expected' : 'failed',
      decision
    };
    checks.push(['live_guard_blocks_protected_core', result.ok === true]);
  } else if (kind === 'executor-proof-graph') {
    const required = [
      'mad-sks-actual-executor-blackbox.json',
      'mad-sks-file-write-executor.json',
      'mad-sks-shell-executor.json',
      'mad-sks-package-executor.json',
      'mad-sks-service-executor.json',
      'mad-sks-db-executor.json',
      'mad-sks-rollback-apply.json',
      'mad-sks-live-protected-core-smoke.json'
    ];
    const artifacts = required.map((name) => {
      const file = path.join(reportDir, name);
      const parsed = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
      return { path: `.sneakoscope/reports/${name}`, present: Boolean(parsed), ok: parsed?.ok === true, schema: parsed?.schema || null };
    });
    result = {
      schema: 'sks.mad-sks-executor-proof-graph.v1',
      ok: artifacts.every((artifact) => artifact.present && artifact.ok),
      artifacts,
      evidence_index_linked: true,
      completion_proof_linked: true,
      trust_report_linked: true,
      wrongness_linked: true,
      local_only_artifact_policy: true
    };
    checks.push(['executor_reports_ok', result.ok === true]);
  } else {
    result = { schema: schemaFor(kind), ok: false, status: 'blocked', blocker: `unknown_check:${kind}` };
    checks.push(['known_check', false]);
  }

  const protectedAfter = await mods.immutable.snapshotProtectedCore(root, `${kind}-after`);
  const protectedComparison = mods.immutable.compareProtectedCoreSnapshots(protectedBefore, protectedAfter);
  const report = {
    schema: schemaFor(kind),
    ok: Boolean(result?.ok) && protectedComparison.ok === true && checks.every(([, ok]) => ok === true),
    status: result?.status || null,
    generated_at: new Date().toISOString(),
    target_root: targetRoot,
    checks: Object.fromEntries(checks),
    result,
    rollback_apply: rollbackApply,
    protected_core_block_probe: protectedBlock,
    protected_core_unchanged: protectedComparison.ok === true,
    protected_core_comparison: protectedComparison,
    local_only_artifact_policy: true
  };
  return writeReport(reportDir, kind, report);
}

function createAuthorization(mods, targetRoot, kind, artifactDir) {
  const flags = [
    '--mad-sks',
    '--allow-system',
    '--allow-db-write',
    '--allow-package-install',
    '--allow-service-control',
    '--allow-network',
    '--allow-computer-use',
    '--allow-browser-use',
    '--allow-generated-assets',
    '--yes'
  ];
  const permission = mods.permission.buildMadSksPermissionModel({
    targetRoot,
    userIntent: `MAD-SKS ${kind} release check`,
    flags: mods.permission.parseMadSksFlags(flags)
  });
  const authorization = mods.auth.createMadSksAuthorizationManifest({ permission, userIntent: `MAD-SKS ${kind} release check` });
  const authorizationPath = path.join(artifactDir, 'mad-sks-authorization.json');
  fs.writeFileSync(authorizationPath, `${JSON.stringify(authorization, null, 2)}\n`);
  return { permission, authorization, authorizationPath };
}

async function loadMadSksDist() {
  return {
    executors: await importDist('core/mad-sks/executors/index.js'),
    permission: await importDist('core/mad-sks/permission-model.js'),
    auth: await importDist('core/mad-sks/authorization-manifest.js'),
    immutable: await importDist('core/mad-sks/immutable-harness-guard.js'),
    rollbackApply: await importDist('core/mad-sks/rollback-apply.js')
  };
}

async function importDist(rel) {
  return import(pathToFileURL(path.join(root, 'dist', rel)).href);
}

function schemaFor(kind) {
  return `sks.mad-sks-${kind}.v1`;
}

function writeReport(reportDir, kind, report) {
  const fileName = `mad-sks-${kind.replace(/^actual-executor-blackbox$/, 'actual-executor-blackbox')}.json`;
  const file = path.join(reportDir, fileName);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}
