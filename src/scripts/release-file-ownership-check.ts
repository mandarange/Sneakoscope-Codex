#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  inspectReleaseFileOwnership,
  readReleaseFileOwnershipManifest
} from '../core/release/file-ownership.js'
import { writeReleaseJson } from '../core/release/release-pack-receipt.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const manifestFile = path.resolve(root, required('--manifest'))
const base = required('--base')
const head = required('--head')
const manifest = readReleaseFileOwnershipManifest(manifestFile)
const report = inspectReleaseFileOwnership({
  root,
  manifest,
  base,
  head,
  ...(option('--workstream') ? { workstream: option('--workstream') } : {})
})
const owner = report.workstream || 'unresolved'
const output = path.resolve(root, option('--output') || `.sneakoscope/release/6.3.0/ownership-reports/${owner}.json`)
writeReleaseJson(output, report)
console.log(JSON.stringify({ ...report, report_path: path.relative(root, output).split(path.sep).join('/') }, null, 2))
if (!report.ok) process.exitCode = 1

function required(name: string): string {
  const value = option(name)
  if (!value) {
    console.error(`Release file ownership check failed: ${name} is required`)
    process.exit(2)
  }
  return value
}

function option(name: string): string {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}
