import fs from 'node:fs/promises'
import path from 'node:path'
import { buildCodexExecArgs, findCodexBinary } from '../codex-adapter.js'
import { ensureDir, runProcess, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { codex0139ProbeTail, skippedCodex0139Probe, type Codex0139SingleProbe } from './codex-0139-real-probes.js'

export async function runCodex0139WebSearchRealProbe(input: {
  root: string
  requireReal?: boolean
  allowNetwork?: boolean
  timeoutMs?: number
  codexBin?: string | null
}): Promise<Codex0139SingleProbe> {
  const started = Date.now()
  if (!input.allowNetwork) {
    const skipped = skippedCodex0139Probe('codex_web_search_network_not_allowed', { allow_network: false })
    return input.requireReal ? { ...skipped, blockers: ['codex_web_search_network_not_allowed'] } : skipped
  }
  const codexBin = input.codexBin || await findCodexBinary()
  if (!codexBin) return skippedCodex0139Probe('codex_cli_missing')
  const tempDir = path.join(input.root, '.sneakoscope', 'tmp', 'codex-0139-real-probes', `web-search-${Date.now()}`)
  await ensureDir(tempDir)
  await writeTextAtomic(path.join(tempDir, 'README.md'), 'Temporary Codex 0.139 web-search real probe workspace.\n')
  const outputFile = path.join(tempDir, 'last-message.txt')
  const prompt = 'In code mode, use standalone web search to find the title of https://example.com or OpenAI Codex release 0.139. Return JSON {"used_web_search":true,"answer":"...","sources":[...]}.'
  const args = buildCodexExecArgs({ root: tempDir, prompt, outputFile, json: true, extraArgs: [] })
  const result = await runProcess(codexBin, args, {
    cwd: tempDir,
    timeoutMs: input.timeoutMs || 120000,
    maxOutputBytes: 512 * 1024,
    stdoutFile: path.join(tempDir, 'codex.stdout.log'),
    stderrFile: path.join(tempDir, 'codex.stderr.log')
  }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err?.message || String(err)
  }))
  const output = await fs.readFile(outputFile, 'utf8').catch(() => '')
  const combined = `${(result as any).stdout || ''}\n${(result as any).stderr || ''}\n${output}`
  const sawWebSearchEvent = /\b(web[_ -]?search|search_result|sources?|tool_call|standalone web search)\b/i.test(combined)
  const sawPlaintextResult = /(Example Domain|example\.com|OpenAI|Codex|0\.139)/i.test(combined)
  const resultContainsExpectedMarker = /"used_web_search"\s*:\s*true|used_web_search/i.test(combined) || sawWebSearchEvent
  const ok = (result as any).code === 0 && sawPlaintextResult && resultContainsExpectedMarker
  if (ok) {
    await writeJsonAtomic(path.join(input.root, '.sneakoscope', 'codex-0139-code-mode-web-search-policy.json'), {
      schema: 'sks.codex-0139-code-mode-web-search-policy.v1',
      ok: true,
      generated_at: new Date().toISOString(),
      allow_standalone_web_search_in_code_mode: true,
      real_probe_verified: true,
      evidence: {
        saw_web_search_event: sawWebSearchEvent,
        saw_plaintext_result: sawPlaintextResult,
        result_contains_expected_marker: resultContainsExpectedMarker
      }
    })
  }
  return {
    ok,
    mode: 'actual-cli',
    command_line: [codexBin, ...args],
    duration_ms: Date.now() - started,
    stdout_tail: codex0139ProbeTail((result as any).stdout),
    stderr_tail: codex0139ProbeTail((result as any).stderr),
    artifact_paths: [tempDir, outputFile],
    evidence: {
      saw_web_search_event: sawWebSearchEvent,
      saw_plaintext_result: sawPlaintextResult,
      result_contains_expected_marker: resultContainsExpectedMarker,
      output_file: outputFile
    },
    blockers: ok ? [] : ['codex_web_search_real_probe_failed']
  }
}
