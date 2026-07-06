#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const { runInstalledPackageSmoke } = await importDist('core/install/installed-package-smoke.js')
const report = await runInstalledPackageSmoke(root)
assertGate(report.ok, 'installed_package_smoke_failed', report)
emitGate('runtime:installed-smoke', {
  installed_version: report.installed_version,
  commands: report.commands.length,
  tarball: report.tarball
})
