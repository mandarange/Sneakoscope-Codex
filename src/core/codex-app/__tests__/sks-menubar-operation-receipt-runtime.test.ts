import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

test('compiled OperationCoordinator reads and maps the real 14-stage update receipt contract', async (t) => {
  if (process.platform !== 'darwin') return t.skip('Swift runtime receipt harness is macOS-only');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-receipt-runtime-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const receiptPath = path.join(temp, 'update-latest.json');
  await fs.writeFile(receiptPath, `${JSON.stringify({
    schema: 'sks.update-operation.v1',
    id: 'update-runtime-fixture',
    kind: 'update',
    state: 'terminal_uncertain',
    current_stage: 'global_install',
    started_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:02.000Z',
    from_version: '6.2.0',
    target_version: '6.3.0',
    previous_version: '6.2.0',
    rollback_command: 'sks update rollback --version 6.2.0 --json',
    side_effects_started: true,
    stages: [
      { id: 'preflight', ok: true, status: 'completed', updated_at: '2026-07-15T00:00:01.000Z', detail: {} },
      { id: 'global_install', ok: false, status: 'terminal_uncertain', updated_at: '2026-07-15T00:00:02.000Z', detail: {} }
    ],
    result_status: 'terminal_uncertain',
    public_error: 'global install completion could not be confirmed',
    receipt_path: receiptPath
  }, null, 2)}\n`, { mode: 0o600 });
  const harness = path.join(temp, 'Harness.swift');
  const binary = path.join(temp, 'operation-receipt-harness');
  await fs.writeFile(harness, `
import Foundation

enum AppRuntime { static let lastActionLogPath = "/tmp/sks-operation-runtime.log" }

@main
struct Harness {
    static func fixtureReceipt(kind: String = "update", state: String, resultStatus: String? = nil) -> UpdateOperationReceiptSnapshot {
        UpdateOperationReceiptSnapshot(
            schema: "sks.update-operation.v1",
            id: "authority-fixture-\\(kind)-\\(state)-\\(resultStatus ?? "none")",
            kind: kind,
            state: state,
            currentStage: "global_install",
            startedAt: "2026-07-15T00:00:00.000Z",
            updatedAt: "2026-07-15T00:00:02.000Z",
            fromVersion: "6.2.0",
            targetVersion: "6.3.0",
            previousVersion: "6.2.0",
            rollbackCommand: "sks update rollback --version 6.2.0 --json",
            sideEffectsStarted: true,
            stages: [],
            resultStatus: resultStatus,
            publicError: nil,
            receiptPath: "/tmp/update-authority-fixture.json"
        )
    }

    static func main() {
        let directory = CommandLine.arguments[1]
        let receiptPath = CommandLine.arguments[2]
        let coordinator = OperationCoordinator(directory: directory)
        precondition(OperationCoordinator.updateStageOrder.count == 14)
        guard let receipt = coordinator.latestUpdateReceipt() else { fatalError("missing receipt") }
        precondition(receipt.schema == "sks.update-operation.v1")
        precondition(receipt.currentStage == "global_install")
        precondition(receipt.sideEffectsStarted)
        precondition(receipt.rollbackCommand == "sks update rollback --version 6.2.0 --json")
        let output = "{\\\"operation_receipt_path\\\":\\\"\\(receiptPath)\\\"}"
        precondition(coordinator.updateReceipt(fromProcessOutput: output)?.id == receipt.id)
        guard let local = coordinator.begin(kind: "update", mutationGroup: "update", summary: "Update") else { fatalError("begin") }
        let synchronized = coordinator.synchronize(local, with: receipt, processCompleted: true)
        precondition(synchronized.state == .terminalUncertain)
        precondition(synchronized.stage == "global_install")
        precondition(abs((synchronized.progress ?? 0) - (2.0 / 14.0)) < 0.0001)
        precondition(coordinator.latestSnapshot()?.state == .terminalUncertain)
        precondition(coordinator.begin(kind: "retry", mutationGroup: "update", summary: "Retry") != nil)
        precondition(OperationCoordinator.authoritativeState(for: fixtureReceipt(state: "queued"), processCompleted: true) == .terminalUncertain)
        precondition(OperationCoordinator.authoritativeState(for: fixtureReceipt(state: "running"), processCompleted: true) == .terminalUncertain)
        precondition(OperationCoordinator.authoritativeState(for: fixtureReceipt(state: "succeeded", resultStatus: "failed")) == .failed)
        precondition(OperationCoordinator.authoritativeState(for: fixtureReceipt(state: "succeeded", resultStatus: "updated_with_issues")) == .failed)
        precondition(OperationCoordinator.authoritativeState(for: fixtureReceipt(state: "succeeded", resultStatus: "terminal_uncertain")) == .terminalUncertain)
        precondition(OperationCoordinator.authoritativeState(for: fixtureReceipt(state: "rolled_back")) == .failed)
        precondition(OperationCoordinator.authoritativeState(for: fixtureReceipt(kind: "rollback", state: "rolled_back")) == .succeeded)
        precondition(OperationCoordinator.receiptRequiresAction(fixtureReceipt(state: "succeeded", resultStatus: "updated_with_issues")))
        precondition(!OperationCoordinator.receiptRequiresAction(fixtureReceipt(state: "succeeded", resultStatus: "updated")))
        print("update-receipt-runtime-ok")
    }
}
`);
  const source = path.join(process.cwd(), 'native', 'sks-menubar', 'Sources', 'OperationCoordinator.swift');
  const compiled = await run('swiftc', [source, harness, '-o', binary]);
  assert.equal(compiled.code, 0, `${compiled.stdout}\n${compiled.stderr}`);
  const executed = await run(binary, [temp, receiptPath]);
  assert.equal(executed.code, 0, `${executed.stdout}\n${executed.stderr}`);
  assert.match(executed.stdout, /update-receipt-runtime-ok/);
});

test('native reliability source binds menu-open expiry, status keys, and receipt-driven update UI', async () => {
  const sourceRoot = path.join(process.cwd(), 'native', 'sks-menubar', 'Sources');
  const statusItem = await fs.readFile(path.join(sourceRoot, 'StatusItemController.swift'), 'utf8');
  const overview = await fs.readFile(path.join(sourceRoot, 'OverviewViewController.swift'), 'utf8');
  const updates = await fs.readFile(path.join(sourceRoot, 'UpdatesViewController.swift'), 'utf8');
  assert.match(statusItem, /func menuWillOpen\(_ menu: NSMenu\)[\s\S]*refreshExpiredUpdateStatusIfNeeded\(\)/);
  assert.match(statusItem, /guard !updateRefreshInFlight, StatusItemController\.updateStatusNeedsRefresh\(update\) else \{ return \}/);
  assert.match(statusItem, /\["update", "status", "--json"\]/);
  assert.match(statusItem, /update\["source"\] as\? String == "disabled"/);
  assert.match(statusItem, /expiry <= now/);
  assert.match(overview, /menu\?\["expected_version"\]/);
  assert.match(overview, /menu\?\["installed_version"\]/);
  assert.doesNotMatch(overview, /menu\?\["expected"\]|menu\?\["installed"\]/);
  assert.match(updates, /OperationCoordinator\.updateStageOrder\.count/);
  assert.match(updates, /operations\.updateReceipt\(fromProcessOutput: result\.output\)/);
  assert.match(updates, /operations\.synchronize\(operation, with: receipt, processCompleted: true\)/);
  assert.match(updates, /OperationCoordinator\.authoritativeState\(for: receipt, processCompleted: true\)/);
  assert.match(updates, /Menu Bar expected .*expected_version.*installed .*installed_version/s);
  assert.match(updates, /Last checked .*generatedAt.*expires .*expiresAt/s);
  assert.match(updates, /Rollback .*receipt\.rollbackCommand/);
  assert.match(updates, /state: \.terminalUncertain/);
});

function run(command: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
