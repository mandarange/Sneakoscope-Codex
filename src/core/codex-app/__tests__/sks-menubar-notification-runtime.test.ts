import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

test('notification action identifiers dispatch the exact closures in a compiled Swift harness', async (t) => {
  if (process.platform !== 'darwin') return t.skip('AppKit and UserNotifications runtime required');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-notification-runtime-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const harness = path.join(temp, 'Harness.swift');
  const binary = path.join(temp, 'notification-harness');
  await fs.writeFile(harness, `
import Foundation
import UserNotifications

@main
struct Harness {
    static func main() {
        let coordinator = NotificationCoordinator()
        var calls: [String] = []
        coordinator.onOpenControlCenter = { calls.append("center") }
        coordinator.onOpenLog = { calls.append("log") }
        coordinator.onRetryOperation = { calls.append("retry") }
        coordinator.onOpenDashboard = { calls.append("dashboard") }
        let routes = [
            coordinator.dispatchActionIdentifier("OPEN_LOG"),
            coordinator.dispatchActionIdentifier("RETRY_OPERATION"),
            coordinator.dispatchActionIdentifier("OPEN_DASHBOARD"),
            coordinator.dispatchActionIdentifier("OPEN_CONTROL_CENTER"),
            coordinator.dispatchActionIdentifier(UNNotificationDismissActionIdentifier)
        ]
        precondition(routes == ["open_log", "retry_operation", "open_dashboard", "open_control_center", "dismissed"])
        precondition(calls == ["log", "retry", "dashboard", "center"])
        precondition(NotificationCoordinator.authorizationIsDenied(.denied))
        precondition(!NotificationCoordinator.authorizationIsDenied(.authorized))
        precondition(!NotificationCoordinator.authorizationIsDenied(.notDetermined))
        precondition(NotificationCoordinator.categoryIdentifier() == "SKS_OPERATION_RESULT")
        precondition(NotificationCoordinator.categoryIdentifier(failed: true) == "SKS_ACTION_REQUIRED")
        precondition(NotificationCoordinator.categoryIdentifier(actionRequired: true) == "SKS_ACTION_REQUIRED")
        let available = #"{"schema":"sks.update-status.v3","update_count":1,"sks":{"update_available":true}}"#
        let rebuild = #"{"schema":"sks.update-status.v3","menubar":{"rebuild_required":true}}"#
        let current = #"{"schema":"sks.update-status.v3","update_count":0,"sks":{"update_available":false},"codex_cli":{"update_available":false},"menubar":{"rebuild_required":false}}"#
        precondition(NotificationCoordinator.updateIsAvailable(in: available))
        precondition(NotificationCoordinator.updateIsAvailable(in: rebuild))
        precondition(!NotificationCoordinator.updateIsAvailable(in: current))
        precondition(!NotificationCoordinator.updateIsAvailable(in: "not-json"))
        precondition(NotificationCoordinator.categoryIdentifier(updateStatusOutput: available) == "SKS_UPDATE_AVAILABLE")
        precondition(NotificationCoordinator.categoryIdentifier(updateStatusOutput: current) == "SKS_OPERATION_RESULT")
        precondition(NotificationCoordinator.categoryIdentifier(updateStatusOutput: available, failed: true) == "SKS_ACTION_REQUIRED")
        print("notification-runtime-ok")
    }
}
`);
  const source = path.join(
    process.cwd(),
    'native',
    'sks-menubar',
    'Sources',
    'NotificationCoordinator.swift'
  );
  const compiled = await run('swiftc', [source, harness, '-o', binary]);
  assert.equal(compiled.code, 0, `${compiled.stdout}\n${compiled.stderr}`);
  const executed = await run(binary, []);
  assert.equal(executed.code, 0, `${executed.stdout}\n${executed.stderr}`);
  assert.match(executed.stdout, /notification-runtime-ok/);
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
