import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

test('Menu Bar ProcessClient suppresses arbitrary secure stdin echoes in UI output and the 0600 action log', async (t) => {
  if (process.platform !== 'darwin') return t.skip('AppKit runtime required');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-process-secret-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const action = path.join(temp, 'action.sh');
  const harness = path.join(temp, 'Harness.swift');
  const binary = path.join(temp, 'process-client-harness');
  const log = path.join(temp, 'last-action.log');

  await fs.writeFile(action, `#!/bin/sh
printf 'args:%s\\n' "$*"
IFS= read -r value || true
printf 'reflected:%s\\n' "$value"
`, { mode: 0o755 });
  await fs.writeFile(harness, `
import Foundation

@main
struct Harness {
    static func waitForResult(_ client: ProcessClient, arguments: [String], stdin: String) -> ProcessResult {
        var captured: ProcessResult?
        client.run(arguments, stdin: stdin) { result in captured = result }
        while captured == nil {
            _ = RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.01))
        }
        return captured!
    }

    static func main() throws {
        let action = CommandLine.arguments[1]
        let log = CommandLine.arguments[2]
        let root = CommandLine.arguments[3]
        let client = ProcessClient(actionScript: action, logPath: log, projectRoot: root)
        let sentinel = "opaque value " + UUID().uuidString.lowercased() + " +/!?=[]{}"
        let reflected = "reflected:" + sentinel
        precondition(client.redact(reflected).contains(sentinel))
        precondition(!client.redact(reflected, sensitiveValues: [sentinel]).contains(sentinel))

        let secure = waitForResult(
            client,
            arguments: ["codex-lb", "set-key", "--api-key-stdin", "--json"],
            stdin: sentinel + "\\n"
        )
        precondition(secure.code == 0)
        precondition(!secure.output.contains(sentinel))
        precondition(secure.output == "Secure input operation completed. Child output was suppressed.")
        let secureLog = try String(contentsOfFile: log, encoding: .utf8)
        precondition(!secureLog.contains(sentinel))
        precondition(secureLog.contains("--api-key-stdin"))
        precondition(secureLog.contains("Child output was suppressed."))
        let permissions = try FileManager.default.attributesOfItem(atPath: log)[.posixPermissions] as? NSNumber
        precondition(permissions?.intValue == 0o600)

        let ordinary = "ordinary-input"
        let normal = waitForResult(client, arguments: ["echo"], stdin: ordinary + "\\n")
        precondition(normal.code == 0)
        precondition(normal.output.contains(ordinary))
        let normalLog = try String(contentsOfFile: log, encoding: .utf8)
        precondition(normalLog.contains(ordinary))
        print("process-client-secret-runtime-ok")
    }
}
`);

  const source = path.join(process.cwd(), 'native', 'sks-menubar', 'Sources', 'ProcessClient.swift');
  const compiled = await run('swiftc', ['-framework', 'Cocoa', source, harness, '-o', binary]);
  assert.equal(compiled.code, 0, `${compiled.stdout}\n${compiled.stderr}`);
  const executed = await run(binary, [action, log, temp]);
  assert.equal(executed.code, 0, `${executed.stdout}\n${executed.stderr}`);
  assert.match(executed.stdout, /process-client-secret-runtime-ok/);
});

function run(command, args) {
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
