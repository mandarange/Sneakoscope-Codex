import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePackagedMenuBarSourceRoot } from '../menubar/resources.js';

test('Control Center Decisions models decode Jev status and extract mixed JSON', (t) => {
  if (process.platform !== 'darwin') return t.skip('Swift Decisions contract is macOS-only');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-decisions-runtime-'));
  const harness = path.join(root, 'DecisionsHarness.swift');
  const binary = path.join(root, 'decisions-harness');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(harness, `
import Foundation

@main
struct DecisionsHarness {
    static func main() {
        precondition(LocalDecisionCommand.status == ["decision", "status", "--json"])
        precondition(LocalDecisionCommand.enable == [
            "decision", "enable",
            "--provider", "openrouter",
            "--model", "typesafe/jev-1.13",
            "--consent-cloud",
            "--json"
        ])
        precondition(LocalDecisionCommand.disable == ["decision", "disable", "--json"])
        precondition(LocalDecisionCommand.mutationSucceeded(
            ["schema": LocalDecisionCommand.enableSchema, "ok": true],
            schema: LocalDecisionCommand.enableSchema
        ))
        precondition(!LocalDecisionCommand.mutationSucceeded(
            ["schema": LocalDecisionCommand.statusSchema, "ok": true],
            schema: LocalDecisionCommand.enableSchema
        ))

        let mixed = """
        banner { not-json
        {
          "schema": "sks.jev-decision-status.v1",
          "ok": true,
          "mode": "jev",
          "provider": "openrouter",
          "model": "typesafe/jev-1.13",
          "consentCloud": true,
          "credential": { "present": false, "source": null },
          "recovery": { "supported": false, "reason": "unsupported_no_sks_handler" },
          "nextStep": "missing_key"
        }
        trailing { "ok": true, "schema": "sks.noise.v1" }
        """
        guard let payload = LocalDecisionJSON.object(from: mixed),
              let status = LocalDecisionStatus.decode(from: payload) else {
            fatalError("mixed JSON did not decode")
        }
        precondition(status.mode == "jev")
        precondition(status.canDisable)
        precondition(!status.canEnable)
        precondition(!status.badgeReady)
        precondition(status.badgeText == "Jev on · add OpenRouter key")
        precondition(LocalDecisionJSON.statusFailureReason(
            code: 2,
            output: "error: unknown command\\nUsage: sks <command>"
        ).contains("does not include"))
        precondition(LocalDecisionJSON.statusFailureReason(
            code: 1,
            output: "{\\"ok\\":false,\\"reason\\":\\"unknown_command\\"}"
        ).contains("unavailable"))
        print("native-decisions-runtime-ok")
    }
}
`);
  const models = path.join(resolvePackagedMenuBarSourceRoot(), 'Sources', 'LocalDecisionModels.swift');
  const compiled = spawnSync('swiftc', [models, harness, '-o', binary], { encoding: 'utf8' });
  assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
  const executed = spawnSync(binary, [], { encoding: 'utf8' });
  assert.equal(executed.status, 0, executed.stderr || executed.stdout);
  assert.match(executed.stdout, /native-decisions-runtime-ok/);
});
