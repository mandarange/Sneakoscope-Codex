import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import {
  buildOfficialSubagentCodexArgs,
  buildOfficialSubagentChildEnv,
  codexAppSessionKey,
  detectCodexAppSession,
  runOfficialSubagentWorkflow
} from '../official-subagent-runner.js'
import { writeNarutoGate } from '../official-subagent-preparation.js'
import { trustedHostCapabilityReceiptBindingBlockers } from '../subagent-evidence.js'
import { addMcpServer, editMcpServer } from '../../mcp-config/mutation.js'
import type { CodexCliMutationOperation, CodexMcpCliPort } from '../../mcp-config/codex-cli-adapter.js'
import { runProcess, sha256 } from '../../fsx.js'
import {
  authorizeAndMergeHostCapabilityPreToolObservation,
  bindParentSummaryToHostCapabilityEvidence,
  createHostCapabilityEventCollector,
  createHostCapabilityHookRuntimeBinding,
  hostCapabilityCodexConfigArgs,
  inspectHostCapabilityRuntime,
  mergeHostCapabilityPostToolObservation,
  sanitizeHostCapabilityPostToolUse,
  sanitizeHostCapabilityPreToolUse,
  type HostCapabilityExecutionEvidence,
  requestHostCapabilities
} from '../../agent-bridge/host-capability-runtime.js'

class UnavailableMcpCli implements CodexMcpCliPort {
  async list() {
    return { available: false, ok: false, rows: [], public_error: 'codex_cli_not_found' }
  }

  async transform(_before: string, _operation: CodexCliMutationOperation) {
    return {
      available: false,
      ok: false,
      used: false,
      text: null,
      unsupported_reason: 'codex_cli_not_found',
      public_error: null
    }
  }

  async login() {
    return { available: false, ok: false, public_error: 'codex_cli_not_found' }
  }

  async logout() {
    return { available: false, ok: false, public_error: 'codex_cli_not_found' }
  }
}

function hostCapabilityDependencies(toolNames: string[]) {
  return {
    inventory: async () => ({
      schema: 'sks.mcp-inventory.v2',
      ok: true,
      scope: 'project',
      source: 'fixture_inventory',
      servers: [{
        name: 'acas-tools',
        enabled: true,
        enabled_tools: [...toolNames],
        disabled_tools: []
      }],
      server_count: 1,
      enabled_count: 1,
      failed_count: 0,
      blockers: [],
      warnings: []
    }) as any,
    health: async () => ({
      schema: 'sks.mcp-health.v1',
      ok: true,
      name: 'acas-tools',
      scope: 'project',
      status: 'healthy',
      tool_names: [...toolNames]
    }) as any
  }
}

function completedHostToolEvent(input: {
  tool: string
  path?: string
  artifact?: Record<string, unknown>
}) {
  return JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'mcp_tool_call',
      server: 'acas-tools',
      tool: input.tool,
      status: 'completed',
      ...(input.path ? { arguments: { path: input.path } } : {}),
      result: {
        structured_content: input.artifact
          ? { artifact: input.artifact }
          : input.tool === 'spreadsheet_inspect'
            ? {
                ok: true,
                ...(input.path ? { path: input.path } : {}),
                sheet_names: ['Summary'],
                row_counts: { Summary: 1 },
                formulas: [],
                error_cells: []
              }
            : { ok: true, ...(input.path ? { path: input.path } : {}) }
      }
    }
  })
}

function completedArtifactHostToolEvent(tool: string, toolUseId: string, artifactPath: string): string {
  return JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'mcp_tool_call',
      server: 'acas-tools',
      tool,
      status: 'completed',
      id: toolUseId,
      arguments: { path: artifactPath },
      result: {
        structured_content: {
          artifact: {
            path: artifactPath,
            kind: 'text',
            media_type: 'text/plain',
            sha256: `sha256:${sha256(`contents:${artifactPath}`)}`,
            bytes: artifactPath.length,
            role: 'deliverable'
          }
        }
      }
    }
  })
}

async function artifactCollectorEvidence(count: number): Promise<HostCapabilityExecutionEvidence> {
  const request = requestHostCapabilities('Create and save files in the workspace.')
  const runtime = await inspectHostCapabilityRuntime({
    root: process.cwd(),
    request,
    projectTrusted: true,
    dependencies: hostCapabilityDependencies(['write_file'])
  })
  assert.equal(runtime.ok, true)
  const collector = createHostCapabilityEventCollector(runtime)
  for (let index = count - 1; index >= 0; index -= 1) {
    const artifactPath = `reports/artifact-${String(index).padStart(2, '0')}.txt`
    collector.push(`${completedArtifactHostToolEvent('write_file', `tool-${index}`, artifactPath)}\n`)
  }
  return collector.finish()
}

function prePayload(toolUseId: string, tool: string, toolInput: Record<string, unknown> = {}) {
  return {
    tool_use_id: toolUseId,
    tool_name: `mcp__acas-tools__${tool}`,
    tool_input: toolInput
  }
}

function postPayload(
  toolUseId: string,
  tool: string,
  toolInput: Record<string, unknown>,
  toolResponse: Record<string, unknown>
) {
  return {
    ...prePayload(toolUseId, tool, toolInput),
    tool_response: toolResponse
  }
}

test('standalone parent args launch one Sol Max Codex parent with the official thread budget', () => {
  const args = buildOfficialSubagentCodexArgs({
    prompt: 'delegate and wait',
    maxThreads: 12,
    parentSummaryFile: '/tmp/parent-summary.txt'
  })
  assert.deepEqual(args.slice(0, 6), ['exec', '--json', '-m', 'gpt-5.6-sol', '-c', 'model_reasoning_effort="max"'])
  assert.ok(args.includes('model_provider="openai"'))
  assert.ok(args.includes('forced_login_method="chatgpt"'))
  assert.ok(args.includes('agents.max_threads=12'))
  assert.ok(args.includes('agents.max_depth=1'))
  assert.equal(args.filter((arg) => arg === 'exec').length, 1)
})

test('app sessions return delegation context without launching nested Codex', async () => {
  let launched = false
  const result = await runOfficialSubagentWorkflow({
    root: process.cwd(),
    goal: 'delegate and wait',
    prompt: 'delegate and wait',
    requestedSubagents: 8,
    maxThreads: 12,
    appSession: true,
    runProcessImpl: async () => {
      launched = true
      throw new Error('must not launch')
    }
  })
  assert.equal(launched, false)
  assert.equal(result.status, 'delegation_context_ready')
  assert.equal(result.ok, false)
  assert.equal(result.prepared, true)
  assert.equal(result.completion_evidence, false)
  assert.equal(result.parent_model, 'gpt-5.6-sol')
  assert.equal(result.parent_reasoning_effort, 'max')
})

test('standalone host-capability requests fail closed before project inventory, health, or Codex spawn', async () => {
  let projectCalls = 0
  let launched = false
  const result = await runOfficialSubagentWorkflow({
    root: process.cwd(),
    goal: 'Create and deliver an Excel workbook.',
    prompt: 'delegation prompt',
    requestedSubagents: 1,
    maxThreads: 1,
    appSession: false,
    hostCapabilityDependencies: {
      inventory: async () => {
        projectCalls += 1
        throw new Error('standalone project inventory must not run')
      },
      health: async () => {
        projectCalls += 1
        throw new Error('standalone project health must not run')
      }
    } as any,
    runProcessImpl: async () => {
      launched = true
      throw new Error('must not launch')
    }
  })

  assert.equal(projectCalls, 0)
  assert.equal(launched, false)
  assert.equal(result.ok, false)
  assert.equal(result.status, 'host_capability_blocked')
  assert.ok(result.blockers.includes('host_capability_project_trust_missing'))
  assert.equal(result.host_capability_evidence.ok, false)
})

test('trusted host runtime allowlists requested ACAS tools and projects only hashed JSONL evidence', async () => {
  const tools = ['spreadsheet_create', 'spreadsheet_inspect', 'spreadsheet_update', 'slack_send']
  const artifact = {
    path: 'reports/monthly.xlsx',
    kind: 'spreadsheet',
    media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sha256: `sha256:${'a'.repeat(64)}`,
    bytes: 4,
    role: 'deliverable'
  }
  const runtime = await inspectHostCapabilityRuntime({
    root: process.cwd(),
    request: requestHostCapabilities('Create and deliver an Excel workbook.'),
    projectTrusted: true,
    dependencies: hostCapabilityDependencies(tools)
  })
  const launchedArgs = hostCapabilityCodexConfigArgs(runtime)
  const collector = createHostCapabilityEventCollector(runtime)
  for (const line of [
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'mcp_tool_call',
        server: 'acas-tools',
        tool: 'spreadsheet_create',
        status: 'completed',
        arguments: { path: artifact.path, api_key: 'raw-jsonl-secret-must-not-return' },
        result: { structured_content: { artifact } }
      }
    }),
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'mcp_tool_call',
        server: 'acas-tools',
        tool: 'spreadsheet_inspect',
        status: 'completed',
        arguments: { path: artifact.path },
        result: {
          structured_content: {
            ok: true,
            path: artifact.path,
            sheet_names: ['Summary'],
            row_counts: { Summary: 1 },
            formulas: [],
            error_cells: []
          }
        }
      }
    })
  ]) collector.push(`${line}\n`)
  const evidence = collector.finish()

  assert.equal(runtime.ok, true)
  assert.ok(launchedArgs.includes('mcp_servers."acas-tools".enabled_tools=["spreadsheet_create", "spreadsheet_inspect", "spreadsheet_update"]'))
  assert.ok(launchedArgs.includes('mcp_servers."acas-tools".disabled_tools=["slack_send"]'))
  assert.deepEqual(evidence.artifacts, [artifact])
  assert.equal(evidence.capabilities_used.every((row: any) => row.status === 'passed'), true)

  const rebound = bindParentSummaryToHostCapabilityEvidence({
    schema: 'sks.subagent-parent-summary.v1',
    status: 'completed',
    summary: 'unobserved claim',
    thread_outcomes: [{ thread_id: 'thread-a', status: 'completed', summary: 'complete' }],
    artifacts: [{ ...artifact, bytes: 999 }],
    capabilities_used: [],
    blockers: []
  }, evidence)
  assert.equal((rebound.value as any).status, 'blocked')
  assert.deepEqual((rebound.value as any).artifacts, [artifact])
  assert.ok(rebound.blockers.includes('host_artifact_parent_receipts_mismatch'))
})

test('host capability requests select the minimum task tools and recognize workbook population', async () => {
  const workspaceTools = [
    'read_file',
    'write_file',
    'edit_file',
    'find_workspace_files',
    'list_workspace',
    'download_url_to_workspace'
  ]
  const readRequest = requestHostCapabilities('Read README.md from the workspace.')
  assert.deepEqual(readRequest.tool_names, ['read_file'])
  const readRuntime = await inspectHostCapabilityRuntime({
    root: process.cwd(),
    request: readRequest,
    projectTrusted: true,
    dependencies: hostCapabilityDependencies(workspaceTools)
  })
  assert.equal(readRuntime.ok, true)
  assert.deepEqual(readRuntime.allowed_tool_names, ['read_file'])
  assert.ok(readRuntime.denied_tool_names.includes('write_file'))
  assert.ok(readRuntime.denied_tool_names.includes('download_url_to_workspace'))

  const editRequest = requestHostCapabilities('Populate quarterly numbers into reports/q3.xlsx.')
  assert.ok(editRequest.workflows.includes('spreadsheet_edit'))
  assert.deepEqual(editRequest.tool_names, ['spreadsheet_inspect', 'spreadsheet_update'])
  const editRuntime = await inspectHostCapabilityRuntime({
    root: process.cwd(),
    request: editRequest,
    projectTrusted: true,
    dependencies: hostCapabilityDependencies(['spreadsheet_create', 'spreadsheet_inspect', 'spreadsheet_update'])
  })
  assert.equal(editRuntime.ok, true)
  assert.deepEqual(editRuntime.allowed_tool_names, ['spreadsheet_inspect', 'spreadsheet_update'])

  for (const prompt of [
    'Analyze the database module data flow and report code-review findings.',
    'Update the spreadsheet parser unit tests.',
    'Create tests for the PDF renderer.',
    'Run the database query unit tests.',
    'Execute the read-only database query integration tests.',
    'Update the documentation explaining how to create an Excel workbook.',
    'Update the documentation explaining how to build an Excel workbook.',
    'Update the documentation explaining how to prepare an Excel report.',
    'Update the documentation explaining how to populate a new Excel workbook.',
    'Explain how to build an Excel workbook.',
    'Show me how to prepare an Excel report.',
    'How do I populate a new Excel workbook?',
    'Explain how to get active customer records from the database.',
    'Show me how to read the latest rows in the database.',
    'How do I pull Q2 sales from the database?',
    'Build the Excel workbook parser.',
    'Prepare Excel workbook tests.'
  ]) {
    assert.deepEqual(requestHostCapabilities(prompt), {
      capability_ids: [],
      workflows: [],
      tool_names: []
    }, prompt)
  }

  for (const prompt of [
    'Convert data.csv to XLSX',
    'Export these rows as XLSX'
  ]) {
    assert.deepEqual(requestHostCapabilities(prompt), {
      capability_ids: ['host.artifact.receipt.v1', 'host.spreadsheet.workbook.v1'],
      workflows: ['artifact_delivery', 'spreadsheet_create'],
      tool_names: ['spreadsheet_create', 'spreadsheet_inspect', 'spreadsheet_update']
    }, prompt)
  }

  for (const prompt of [
    'Show me sales data from the database',
    'List active customer records from the database',
    'Get active customer records from the database',
    'Please read the latest rows in the database'
  ]) {
    assert.deepEqual(requestHostCapabilities(prompt), {
      capability_ids: ['host.datasource.query.readonly.v1', 'host.datasource.schema.v1'],
      workflows: ['datasource_query'],
      tool_names: ['datasource_query_readonly', 'datasource_schema_context']
    }, prompt)
  }

  assert.deepEqual(
    requestHostCapabilities('Pull Q2 sales from the database and export them as XLSX.'),
    {
      capability_ids: [
        'host.artifact.receipt.v1',
        'host.datasource.query.readonly.v1',
        'host.datasource.schema.v1',
        'host.spreadsheet.workbook.v1'
      ],
      workflows: ['artifact_delivery', 'datasource_query', 'spreadsheet_create'],
      tool_names: [
        'datasource_query_readonly',
        'datasource_schema_context',
        'spreadsheet_create',
        'spreadsheet_inspect',
        'spreadsheet_update'
      ]
    }
  )

  for (const prompt of [
    'Build an Excel workbook.',
    'Prepare an Excel report.',
    'Populate a new Excel workbook.'
  ]) {
    assert.deepEqual(requestHostCapabilities(prompt), {
      capability_ids: ['host.artifact.receipt.v1', 'host.spreadsheet.workbook.v1'],
      workflows: ['artifact_delivery', 'spreadsheet_create'],
      tool_names: ['spreadsheet_create', 'spreadsheet_inspect', 'spreadsheet_update']
    }, prompt)
  }

  for (const prompt of [
    'Write SQL to fetch customer data; do not execute it.',
    'Write SQL to fetch customer data without running it.',
    'Write SQL to fetch customer data without running the query.',
    'Write SQL to fetch customer data without actually executing it.'
  ]) {
    assert.deepEqual(requestHostCapabilities(prompt), {
      capability_ids: ['host.datasource.schema.v1'],
      workflows: ['datasource_sql_generation'],
      tool_names: ['datasource_schema_context']
    }, prompt)
  }

  assert.deepEqual(
    requestHostCapabilities('Write SQL to fetch customer data and execute it.'),
    {
      capability_ids: ['host.datasource.query.readonly.v1', 'host.datasource.schema.v1'],
      workflows: ['datasource_query', 'datasource_sql_generation'],
      tool_names: ['datasource_query_readonly', 'datasource_schema_context']
    }
  )

  for (const prompt of [
    'Write SQL to fetch customer data; do not execute it. Then read the latest rows in the database.',
    'Write SQL to fetch customer data without running it. Then show current rows from the database.'
  ]) {
    assert.deepEqual(requestHostCapabilities(prompt), {
      capability_ids: ['host.datasource.query.readonly.v1', 'host.datasource.schema.v1'],
      workflows: ['datasource_query', 'datasource_sql_generation'],
      tool_names: ['datasource_query_readonly', 'datasource_schema_context']
    }, prompt)
  }

  assert.deepEqual(
    requestHostCapabilities('Update the workbook parser, then build an Excel workbook.'),
    {
      capability_ids: ['host.artifact.receipt.v1', 'host.spreadsheet.workbook.v1'],
      workflows: ['artifact_delivery', 'spreadsheet_create'],
      tool_names: ['spreadsheet_create', 'spreadsheet_inspect', 'spreadsheet_update']
    }
  )

  assert.deepEqual(
    requestHostCapabilities('Test the database and get active customer records from the database.'),
    {
      capability_ids: ['host.datasource.query.readonly.v1', 'host.datasource.schema.v1'],
      workflows: ['datasource_query'],
      tool_names: ['datasource_query_readonly', 'datasource_schema_context']
    }
  )

  assert.deepEqual(
    requestHostCapabilities('Create an Excel workbook and update it.'),
    {
      capability_ids: ['host.artifact.receipt.v1', 'host.spreadsheet.workbook.v1'],
      workflows: ['artifact_delivery', 'spreadsheet_create', 'spreadsheet_edit'],
      tool_names: ['spreadsheet_create', 'spreadsheet_inspect', 'spreadsheet_update']
    }
  )

  assert.deepEqual(
    requestHostCapabilities('Update the PDF renderer code, then create a PDF document.'),
    {
      capability_ids: ['host.artifact.receipt.v1', 'host.document.render.v1', 'host.workspace.files.v1'],
      workflows: ['artifact_delivery', 'document_render', 'workspace_files'],
      tool_names: ['html_to_pdf', 'write_file']
    }
  )

  for (const [prompt, capability] of [
    ['Test the database and fetch customer data.', 'host.datasource.query.readonly.v1'],
    ['In this test, analyze database data and report anomalies.', 'host.datasource.query.readonly.v1'],
    ['Test the PDF and export it.', 'host.document.render.v1'],
    ['Update the spreadsheet with the latest test results.', 'host.spreadsheet.workbook.v1'],
    ['Inspect reports/q3.xlsx and update it with integration test results.', 'host.spreadsheet.workbook.v1'],
    ['최신 테스트 결과로 스프레드시트를 업데이트해줘.', 'host.spreadsheet.workbook.v1']
  ] as const) {
    assert.ok(requestHostCapabilities(prompt).capability_ids.includes(capability), prompt)
  }
})

test('spreadsheet evidence requires one bounded mutation, a final inspect, and one resource identity', async () => {
  const workbookPath = 'reports/q3.xlsx'
  const createArtifact = {
    path: workbookPath,
    kind: 'spreadsheet',
    media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sha256: `sha256:${'a'.repeat(64)}`,
    bytes: 10,
    role: 'deliverable'
  }
  const updateArtifact = { ...createArtifact, sha256: `sha256:${'b'.repeat(64)}`, bytes: 12 }
  const request = requestHostCapabilities('Create and deliver an Excel workbook.')
  const runtime = await inspectHostCapabilityRuntime({
    root: process.cwd(),
    request,
    projectTrusted: true,
    dependencies: hostCapabilityDependencies(['spreadsheet_create', 'spreadsheet_inspect', 'spreadsheet_update'])
  })
  assert.equal(runtime.ok, true)

  const missingFinalInspect = createHostCapabilityEventCollector(runtime)
  for (const event of [
    completedHostToolEvent({ tool: 'spreadsheet_create', path: workbookPath, artifact: createArtifact }),
    completedHostToolEvent({ tool: 'spreadsheet_inspect', path: workbookPath }),
    completedHostToolEvent({ tool: 'spreadsheet_update', path: workbookPath, artifact: updateArtifact })
  ]) missingFinalInspect.push(`${event}\n`)
  const missingFinalEvidence = missingFinalInspect.finish()
  assert.equal(missingFinalEvidence.ok, false)
  assert.ok(missingFinalEvidence.blockers.includes('host_capability_spreadsheet_create_sequence_invalid'))

  const repeatedUpdate = createHostCapabilityEventCollector(runtime)
  for (const event of [
    completedHostToolEvent({ tool: 'spreadsheet_create', path: workbookPath, artifact: createArtifact }),
    completedHostToolEvent({ tool: 'spreadsheet_inspect', path: workbookPath }),
    completedHostToolEvent({ tool: 'spreadsheet_update', path: workbookPath, artifact: updateArtifact }),
    completedHostToolEvent({ tool: 'spreadsheet_inspect', path: workbookPath }),
    completedHostToolEvent({ tool: 'spreadsheet_update', path: workbookPath, artifact: { ...updateArtifact, sha256: `sha256:${'c'.repeat(64)}` } }),
    completedHostToolEvent({ tool: 'spreadsheet_inspect', path: workbookPath })
  ]) repeatedUpdate.push(`${event}\n`)
  const repeatedUpdateEvidence = repeatedUpdate.finish()
  assert.equal(repeatedUpdateEvidence.ok, false)
  assert.ok(repeatedUpdateEvidence.blockers.includes('host_capability_spreadsheet_create_update_count_invalid'))

  const resourceMismatch = createHostCapabilityEventCollector(runtime)
  for (const event of [
    completedHostToolEvent({ tool: 'spreadsheet_create', path: workbookPath, artifact: createArtifact }),
    completedHostToolEvent({ tool: 'spreadsheet_inspect', path: 'reports/other.xlsx' })
  ]) resourceMismatch.push(`${event}\n`)
  const resourceMismatchEvidence = resourceMismatch.finish()
  assert.equal(resourceMismatchEvidence.ok, false)
  assert.ok(resourceMismatchEvidence.blockers.includes('host_capability_spreadsheet_resource_mismatch'))

  const receiptResourceMismatch = createHostCapabilityEventCollector(runtime)
  for (const event of [
    completedHostToolEvent({
      tool: 'spreadsheet_create',
      path: workbookPath,
      artifact: { ...createArtifact, path: 'reports/other.xlsx' }
    }),
    completedHostToolEvent({ tool: 'spreadsheet_inspect', path: workbookPath })
  ]) receiptResourceMismatch.push(`${event}\n`)
  const receiptResourceMismatchEvidence = receiptResourceMismatch.finish()
  assert.equal(receiptResourceMismatchEvidence.ok, false)
  assert.ok(receiptResourceMismatchEvidence.blockers.includes('host_capability_spreadsheet_resource_mismatch'))
  assert.ok(receiptResourceMismatchEvidence.blockers.includes('host_capability_spreadsheet_final_artifact_missing'))

  const invalidReceipts = [
    ...(['scratch', 'temp', 'log'] as const).map((role) => ({ label: role, artifact: { ...createArtifact, role } })),
    { label: 'text kind', artifact: { ...createArtifact, kind: 'text' } },
    { label: 'text media', artifact: { ...createArtifact, media_type: 'text/plain' } },
    { label: 'text extension', artifact: { ...createArtifact, path: 'reports/q3.txt' } }
  ]
  for (const invalid of invalidReceipts) {
    const invalidReceipt = createHostCapabilityEventCollector(runtime)
    for (const event of [
      completedHostToolEvent({ tool: 'spreadsheet_create', path: workbookPath, artifact: invalid.artifact }),
      completedHostToolEvent({ tool: 'spreadsheet_inspect', path: workbookPath })
    ]) invalidReceipt.push(`${event}\n`)
    const invalidReceiptEvidence = invalidReceipt.finish()
    assert.equal(invalidReceiptEvidence.ok, false, invalid.label)
    assert.ok(invalidReceiptEvidence.blockers.includes('host_capability_spreadsheet_final_artifact_missing'), invalid.label)
  }

  const detachedMutationReceipt = createHostCapabilityEventCollector(runtime)
  for (const event of [
    completedHostToolEvent({ tool: 'spreadsheet_create', path: workbookPath, artifact: createArtifact }),
    completedHostToolEvent({ tool: 'spreadsheet_inspect', path: workbookPath }),
    completedHostToolEvent({ tool: 'spreadsheet_update', path: workbookPath }),
    completedHostToolEvent({ tool: 'spreadsheet_inspect', path: workbookPath })
  ]) detachedMutationReceipt.push(`${event}\n`)
  const detachedMutationEvidence = detachedMutationReceipt.finish()
  assert.equal(detachedMutationEvidence.ok, false)
  assert.ok(detachedMutationEvidence.blockers.includes('host_capability_spreadsheet_final_artifact_missing'))

  for (const unsafePath of ['reports/./q3.xlsx', 'reports/archive/../q3.xlsx', '/reports/q3.xlsx', 'C:/reports/q3.xlsx', 'reports\\q3.xlsx']) {
    const unsafeReceipt = createHostCapabilityEventCollector(runtime)
    for (const event of [
      completedHostToolEvent({
        tool: 'spreadsheet_create',
        path: workbookPath,
        artifact: { ...createArtifact, path: unsafePath }
      }),
      completedHostToolEvent({ tool: 'spreadsheet_inspect', path: workbookPath })
    ]) unsafeReceipt.push(`${event}\n`)
    const unsafeReceiptEvidence = unsafeReceipt.finish()
    assert.equal(unsafeReceiptEvidence.ok, false, unsafePath)
    assert.ok(unsafeReceiptEvidence.blockers.includes('host_capability_spreadsheet_final_artifact_missing'), unsafePath)
  }

  const valid = createHostCapabilityEventCollector(runtime)
  for (const event of [
    completedHostToolEvent({ tool: 'spreadsheet_create', path: workbookPath, artifact: createArtifact }),
    completedHostToolEvent({ tool: 'spreadsheet_inspect', path: workbookPath }),
    completedHostToolEvent({ tool: 'spreadsheet_update', path: workbookPath, artifact: updateArtifact }),
    completedHostToolEvent({ tool: 'spreadsheet_inspect', path: workbookPath })
  ]) valid.push(`${event}\n`)
  const validEvidence = valid.finish()
  assert.equal(validEvidence.ok, true)
  assert.equal(validEvidence.artifacts.length, 1)
  assert.deepEqual(trustedHostCapabilityReceiptBindingBlockers(validEvidence), [])
})

test('document evidence requires an editable source before render and a render artifact receipt', async () => {
  const request = requestHostCapabilities('Create and deliver a PDF document.')
  assert.deepEqual(request.tool_names, ['html_to_pdf', 'write_file'])
  const runtime = await inspectHostCapabilityRuntime({
    root: process.cwd(),
    request,
    projectTrusted: true,
    dependencies: hostCapabilityDependencies(['write_file', 'edit_file', 'html_to_pdf', 'html_to_screenshot'])
  })
  assert.equal(runtime.ok, true)
  assert.deepEqual(runtime.allowed_tool_names, ['html_to_pdf', 'write_file'])
  const pdfArtifact = {
    path: 'reports/brief.pdf',
    kind: 'pdf',
    media_type: 'application/pdf',
    sha256: `sha256:${'d'.repeat(64)}`,
    bytes: 20,
    role: 'deliverable'
  }

  const renderOnly = createHostCapabilityEventCollector(runtime)
  renderOnly.push(`${completedHostToolEvent({ tool: 'html_to_pdf', path: 'reports/brief.pdf', artifact: pdfArtifact })}\n`)
  const renderOnlyEvidence = renderOnly.finish()
  assert.equal(renderOnlyEvidence.ok, false)
  assert.ok(renderOnlyEvidence.blockers.includes('host_capability_document_source_sequence_invalid'))

  const invalidRenderReceipts = [
    ...(['scratch', 'temp', 'log'] as const).map((role) => ({ label: role, artifact: { ...pdfArtifact, role } })),
    { label: 'png kind', artifact: { ...pdfArtifact, kind: 'png' } },
    { label: 'png media', artifact: { ...pdfArtifact, media_type: 'image/png' } },
    { label: 'png extension', artifact: { ...pdfArtifact, path: 'reports/brief.png' } }
  ]
  for (const invalid of invalidRenderReceipts) {
    const invalidRenderReceipt = createHostCapabilityEventCollector(runtime)
    invalidRenderReceipt.push(`${completedHostToolEvent({ tool: 'write_file', path: 'reports/brief.html' })}\n`)
    invalidRenderReceipt.push(`${completedHostToolEvent({
      tool: 'html_to_pdf',
      path: 'reports/brief.pdf',
      artifact: invalid.artifact
    })}\n`)
    const invalidRenderReceiptEvidence = invalidRenderReceipt.finish()
    assert.equal(invalidRenderReceiptEvidence.ok, false, invalid.label)
    assert.ok(invalidRenderReceiptEvidence.blockers.includes('host_capability_document_render_artifact_missing'), invalid.label)
  }

  const detachedRenderReceipt = createHostCapabilityEventCollector(runtime)
  detachedRenderReceipt.push(`${completedHostToolEvent({ tool: 'write_file', path: 'reports/brief.html' })}\n`)
  detachedRenderReceipt.push(`${completedHostToolEvent({ tool: 'html_to_pdf', path: 'reports/brief.pdf', artifact: pdfArtifact })}\n`)
  detachedRenderReceipt.push(`${completedHostToolEvent({ tool: 'html_to_pdf', path: 'reports/final.pdf' })}\n`)
  const detachedRenderReceiptEvidence = detachedRenderReceipt.finish()
  assert.equal(detachedRenderReceiptEvidence.ok, false)
  assert.ok(detachedRenderReceiptEvidence.blockers.includes('host_capability_document_render_artifact_missing'))

  const valid = createHostCapabilityEventCollector(runtime)
  valid.push(`${completedHostToolEvent({
    tool: 'write_file',
    path: 'reports/brief.html',
    artifact: {
      path: 'reports/brief.html',
      kind: 'html',
      media_type: 'text/html',
      sha256: `sha256:${'e'.repeat(64)}`,
      bytes: 12,
      role: 'scratch'
    }
  })}\n`)
  valid.push(`${completedHostToolEvent({ tool: 'html_to_pdf', path: 'reports/brief.pdf', artifact: pdfArtifact })}\n`)
  const validEvidence = valid.finish()
  assert.equal(validEvidence.ok, true)
  assert.deepEqual(trustedHostCapabilityReceiptBindingBlockers(validEvidence), [])

  const pngRequest = requestHostCapabilities('Create and deliver a PNG document screenshot.')
  const pngRuntime = await inspectHostCapabilityRuntime({
    root: process.cwd(),
    request: pngRequest,
    projectTrusted: true,
    dependencies: hostCapabilityDependencies(['write_file', 'html_to_screenshot'])
  })
  const validPng = createHostCapabilityEventCollector(pngRuntime)
  validPng.push(`${completedHostToolEvent({ tool: 'write_file', path: 'reports/brief.html' })}\n`)
  validPng.push(`${completedHostToolEvent({
    tool: 'html_to_screenshot',
    path: 'reports/brief.png',
    artifact: {
      path: 'reports/brief.png',
      kind: 'png',
      media_type: 'image/png',
      sha256: `sha256:${'f'.repeat(64)}`,
      bytes: 24,
      role: 'deliverable'
    }
  })}\n`)
  const validPngEvidence = validPng.finish()
  assert.equal(validPngEvidence.ok, true)
  assert.deepEqual(trustedHostCapabilityReceiptBindingBlockers(validPngEvidence), [])
})

test('collector binds 8, 10, 12, and 64 artifacts to exact canonical source events without reconstruction', async () => {
  for (const count of [8, 10, 12, 64]) {
    const evidence = await artifactCollectorEvidence(count)
    assert.equal(evidence.ok, true, `${count} artifacts`)
    assert.equal(evidence.artifacts.length, count)
    assert.equal(evidence.artifact_sources.length, count)
    assert.deepEqual(
      evidence.artifact_sources.map((source) => source.path),
      evidence.artifacts.map((artifact) => artifact.path),
      `${count} artifacts use the public canonical artifact order`
    )
    assert.deepEqual(trustedHostCapabilityReceiptBindingBlockers(evidence), [], `${count} artifacts`)
  }
})

test('trusted receipt binding rejects forged, missing, and duplicate artifact source mappings', async () => {
  const trusted = await artifactCollectorEvidence(8)
  const forged = {
    ...trusted,
    artifact_sources: trusted.artifact_sources.map((source, index) => index === 0
      ? { ...source, source_event_sha256: `sha256:${'f'.repeat(64)}` }
      : source)
  }
  assert.ok(trustedHostCapabilityReceiptBindingBlockers(forged).includes('host_artifact_source_mapping_forged'))

  const missing = { ...trusted, artifact_sources: trusted.artifact_sources.slice(1) }
  assert.ok(trustedHostCapabilityReceiptBindingBlockers(missing).includes('host_artifact_source_mapping_missing'))

  const duplicate = {
    ...trusted,
    artifact_sources: [trusted.artifact_sources[0]!, ...trusted.artifact_sources.slice(0, -1)]
  }
  assert.ok(trustedHostCapabilityReceiptBindingBlockers(duplicate).includes('host_artifact_source_mapping_duplicate'))
})

test('atomic reservations deny query races until one completed schema call and remain idempotent by tool_use_id', async () => {
  const request = requestHostCapabilities('Get customer records from the database.')
  const runtime = await inspectHostCapabilityRuntime({
    root: process.cwd(),
    request,
    projectTrusted: true,
    dependencies: hostCapabilityDependencies(['datasource_schema_context', 'datasource_query_readonly'])
  })
  const binding = createHostCapabilityHookRuntimeBinding({
    missionId: 'mission', workflowRunId: 'run', sessionScope: 'session', runtime
  })
  const query = sanitizeHostCapabilityPreToolUse(runtime, prePayload('query-1', 'datasource_query_readonly', {
    datasource: 'main', schema_snapshot_id: 'snapshot', query: 'select 1'
  }))!
  const deniedBeforeSchema = authorizeAndMergeHostCapabilityPreToolObservation({ binding, observation: query })
  assert.equal(deniedBeforeSchema.decision, 'denied')
  assert.equal(deniedBeforeSchema.blocker, 'host_capability_readonly_query_schema_not_completed')
  const deniedReplay = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: deniedBeforeSchema.observations, observation: query
  })
  assert.equal(deniedReplay.decision, 'denied')
  assert.equal(deniedReplay.blocker, 'host_tool_reservation_replay_denied')

  const schema = sanitizeHostCapabilityPreToolUse(runtime, prePayload('schema-1', 'datasource_schema_context', {
    datasource: 'main'
  }))!
  const schemaReserved = authorizeAndMergeHostCapabilityPreToolObservation({ binding, observation: schema })
  const deniedWhilePending = authorizeAndMergeHostCapabilityPreToolObservation({
    binding,
    current: schemaReserved.observations,
    observation: { ...query, tool_use_id_sha256: `sha256:${sha256('query-2')}` }
  })
  assert.equal(deniedWhilePending.blocker, 'host_capability_readonly_query_schema_not_completed')

  const schemaPost = sanitizeHostCapabilityPostToolUse(postPayload(
    'schema-1',
    'datasource_schema_context',
    { datasource: 'main' },
    { structured_content: { datasource: 'main', schema_snapshot_id: 'snapshot' } }
  ))!
  const afterSchema = mergeHostCapabilityPostToolObservation({
    binding, current: schemaReserved.observations, observation: schemaPost
  })
  const wrongDatasource = sanitizeHostCapabilityPreToolUse(runtime, prePayload('query-wrong-datasource', 'datasource_query_readonly', {
    datasource: 'other', schema_snapshot_id: 'snapshot', query: 'select 1'
  }))!
  const deniedWrongDatasource = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: afterSchema, observation: wrongDatasource
  })
  assert.equal(deniedWrongDatasource.blocker, 'host_capability_readonly_query_datasource_mismatch')
  const wrongSnapshot = sanitizeHostCapabilityPreToolUse(runtime, prePayload('query-wrong-snapshot', 'datasource_query_readonly', {
    datasource: 'main', schema_snapshot_id: 'other-snapshot', query: 'select 1'
  }))!
  const deniedWrongSnapshot = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: afterSchema, observation: wrongSnapshot
  })
  assert.equal(deniedWrongSnapshot.blocker, 'host_capability_readonly_query_schema_mismatch')
  const queryReserved = authorizeAndMergeHostCapabilityPreToolObservation({
    binding,
    current: afterSchema,
    observation: query
  })
  assert.equal(queryReserved.decision, 'allowed')
  assert.equal(queryReserved.observation.reservation_status, 'pending')

  const repeated = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: queryReserved.observations, observation: query
  })
  assert.deepEqual(repeated.observations, queryReserved.observations)
  assert.deepEqual(repeated.observation, queryReserved.observation)

  const secondQuery = sanitizeHostCapabilityPreToolUse(runtime, prePayload('query-3', 'datasource_query_readonly', {
    datasource: 'main', schema_snapshot_id: 'snapshot', query: 'select 2'
  }))!
  const deniedSecond = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: queryReserved.observations, observation: secondQuery
  })
  assert.equal(deniedSecond.blocker, 'host_capability_readonly_query_already_reserved')

  const queryPost = sanitizeHostCapabilityPostToolUse(postPayload(
    'query-1',
    'datasource_query_readonly',
    { datasource: 'main', schema_snapshot_id: 'snapshot', query: 'select 1' },
    {
      structured_content: {
        datasource: 'main',
        schema_snapshot_id: 'snapshot',
        query_sha256: `sha256:${sha256('select 1')}`,
        row_count: 1,
        column_count: 1,
        truncated: false,
        status: 'passed'
      }
    }
  ))!
  const afterQuery = mergeHostCapabilityPostToolObservation({
    binding, current: queryReserved.observations, observation: queryPost
  })
  const completedReplay = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: afterQuery, observation: query
  })
  assert.equal(completedReplay.decision, 'denied')
  assert.equal(completedReplay.blocker, 'host_tool_reservation_replay_completed')
  const duplicatePost = mergeHostCapabilityPostToolObservation({
    binding, current: afterQuery, observation: queryPost
  })
  assert.ok(duplicatePost.blockers.includes('host_tool_call_post_replay:datasource_query_readonly'))

  const failedSchema = sanitizeHostCapabilityPreToolUse(runtime, prePayload('schema-failed', 'datasource_schema_context', {
    datasource: 'main'
  }))!
  const failedSchemaReserved = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: afterQuery, observation: failedSchema
  })
  const failedSchemaPost = sanitizeHostCapabilityPostToolUse(postPayload(
    'schema-failed',
    'datasource_schema_context',
    { datasource: 'main' },
    { isError: true, structured_content: { datasource: 'main', schema_snapshot_id: 'snapshot-failed' } }
  ))!
  const afterFailedSchema = mergeHostCapabilityPostToolObservation({
    binding, current: failedSchemaReserved.observations, observation: failedSchemaPost
  })
  const failedReplay = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: afterFailedSchema, observation: failedSchema
  })
  assert.equal(failedReplay.decision, 'denied')
  assert.equal(failedReplay.blocker, 'host_tool_reservation_replay_failed')
  const afterBoundedPreObservationEviction = {
    ...afterQuery,
    pre_tool_uses: afterQuery.pre_tool_uses.filter((row) => row.tool !== 'datasource_query_readonly')
  }
  const deniedAfterEviction = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: afterBoundedPreObservationEviction, observation: secondQuery
  })
  assert.equal(deniedAfterEviction.blocker, 'host_capability_readonly_query_already_reserved')
})

test('atomic spreadsheet create reservations allow one pending ID and deny distinct or terminal replays', async () => {
  const request = requestHostCapabilities('Create and deliver an Excel workbook.')
  const runtime = await inspectHostCapabilityRuntime({
    root: process.cwd(),
    request,
    projectTrusted: true,
    dependencies: hostCapabilityDependencies(['spreadsheet_create', 'spreadsheet_inspect', 'spreadsheet_update'])
  })
  const binding = createHostCapabilityHookRuntimeBinding({
    missionId: 'mission', workflowRunId: 'run', sessionScope: 'session', runtime
  })
  const first = sanitizeHostCapabilityPreToolUse(runtime, prePayload('create-1', 'spreadsheet_create', {
    path: 'reports/book.xlsx'
  }))!
  const second = sanitizeHostCapabilityPreToolUse(runtime, prePayload('create-2', 'spreadsheet_create', {
    path: 'reports/book.xlsx'
  }))!
  const reserved = authorizeAndMergeHostCapabilityPreToolObservation({ binding, observation: first })
  assert.equal(reserved.decision, 'allowed')
  const pendingReplay = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: reserved.observations, observation: first
  })
  assert.equal(pendingReplay.decision, 'allowed')
  assert.deepEqual(pendingReplay.observations, reserved.observations)
  const distinctDenied = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: reserved.observations, observation: second
  })
  assert.equal(distinctDenied.decision, 'denied')
  assert.equal(distinctDenied.blocker, 'host_capability_spreadsheet_create_already_reserved')

  const post = sanitizeHostCapabilityPostToolUse(postPayload(
    'create-1',
    'spreadsheet_create',
    { path: 'reports/book.xlsx' },
    { structured_content: { ok: true, path: 'reports/book.xlsx' } }
  ))!
  const completed = mergeHostCapabilityPostToolObservation({
    binding, current: reserved.observations, observation: post
  })
  const completedReplay = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: completed, observation: first
  })
  assert.equal(completedReplay.decision, 'denied')
  assert.equal(completedReplay.blocker, 'host_tool_reservation_replay_completed')
  const afterCompletionDenied = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: completed, observation: second
  })
  assert.equal(afterCompletionDenied.blocker, 'host_capability_spreadsheet_create_already_reserved')
})

test('atomic spreadsheet update reservations require a completed same-workbook inspect and allow one update', async () => {
  const request = requestHostCapabilities('Update the spreadsheet with the latest results.')
  const runtime = await inspectHostCapabilityRuntime({
    root: process.cwd(),
    request,
    projectTrusted: true,
    dependencies: hostCapabilityDependencies(['spreadsheet_inspect', 'spreadsheet_update'])
  })
  const binding = createHostCapabilityHookRuntimeBinding({
    missionId: 'mission', workflowRunId: 'run', sessionScope: 'session', runtime
  })
  const update = sanitizeHostCapabilityPreToolUse(runtime, prePayload('update-1', 'spreadsheet_update', {
    path: 'reports/book.xlsx'
  }))!
  const deniedBeforeInspect = authorizeAndMergeHostCapabilityPreToolObservation({ binding, observation: update })
  assert.equal(deniedBeforeInspect.blocker, 'host_capability_spreadsheet_update_inspection_not_completed')

  const inspect = sanitizeHostCapabilityPreToolUse(runtime, prePayload('inspect-1', 'spreadsheet_inspect', {
    path: 'reports/book.xlsx'
  }))!
  const inspectReserved = authorizeAndMergeHostCapabilityPreToolObservation({ binding, observation: inspect })
  const inspectPost = sanitizeHostCapabilityPostToolUse(postPayload(
    'inspect-1',
    'spreadsheet_inspect',
    { path: 'reports/book.xlsx' },
    {
      structured_content: {
        ok: true,
        path: 'reports/book.xlsx',
        sheet_names: ['Summary'],
        row_counts: { Summary: 1 },
        formulas: [],
        error_cells: []
      }
    }
  ))!
  const afterInspect = mergeHostCapabilityPostToolObservation({
    binding, current: inspectReserved.observations, observation: inspectPost
  })

  const wrongResource = sanitizeHostCapabilityPreToolUse(runtime, prePayload('update-wrong', 'spreadsheet_update', {
    path: 'reports/other.xlsx'
  }))!
  const deniedWrongResource = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: afterInspect, observation: wrongResource
  })
  assert.equal(deniedWrongResource.blocker, 'host_capability_spreadsheet_update_resource_mismatch')

  const reserved = authorizeAndMergeHostCapabilityPreToolObservation({ binding, current: afterInspect, observation: update })
  assert.equal(reserved.decision, 'allowed')
  const secondUpdate = sanitizeHostCapabilityPreToolUse(runtime, prePayload('update-2', 'spreadsheet_update', {
    path: 'reports/book.xlsx'
  }))!
  const deniedSecond = authorizeAndMergeHostCapabilityPreToolObservation({
    binding, current: reserved.observations, observation: secondUpdate
  })
  assert.equal(deniedSecond.blocker, 'host_capability_spreadsheet_update_already_reserved')

  const updatePost = sanitizeHostCapabilityPostToolUse(postPayload(
    'update-1', 'spreadsheet_update', { path: 'reports/book.xlsx' }, { structured_content: { ok: true, path: 'reports/book.xlsx' } }
  ))!
  const completed = mergeHostCapabilityPostToolObservation({
    binding, current: reserved.observations, observation: updatePost
  })
  assert.equal(
    completed.pre_tool_uses.find((row) => row.tool_use_id_sha256 === update.tool_use_id_sha256)?.reservation_status,
    'completed'
  )
})

test('Codex thread environment selects the in-app path unless standalone is explicit', () => {
  assert.equal(detectCodexAppSession({ CODEX_THREAD_ID: 'thread' }), true)
  assert.equal(detectCodexAppSession({ CODEX_THREAD_ID: 'thread', SKS_NARUTO_STANDALONE_CLI: '1' }), false)
  assert.equal(detectCodexAppSession({ SKS_NARUTO_APP_SESSION: '1' }), true)
  assert.equal(codexAppSessionKey({ CODEX_THREAD_ID: 'thread' }), 'thread')
  assert.equal(codexAppSessionKey({ SKS_NARUTO_APP_SESSION: '1' }), null)
  assert.equal(codexAppSessionKey({ CODEX_THREAD_ID: 'thread', SKS_NARUTO_STANDALONE_CLI: '1' }), null)
})

test('standalone child environment keeps only the official runtime allowlist and launch ownership', () => {
  const allowedHostKeys = [
    'SKS_AGENT_MODE',
    'ACAS_AGENT_SLUG',
    'ACAS_AGENT_WORKSPACE',
    'ALFREDO_AGENT_SOULS_FILE',
    'ACAS_CHROME_PATH',
    'ACAS_HTML_TO_PDF_ENGINE',
    'ACAS_HTML_TO_PDF_ALLOW_CHROME_CLI_FALLBACK'
  ] as const
  const deniedHostKeys = [
    'ACAS_CONNECTION_TOKEN',
    'ACAS_CENTER_BASE_URL',
    'ACAS_CENTRAL_API_BASE',
    'ACAS_EDGE_NODE_SLUG',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENROUTER_API_KEY',
    'CODEX_LB_API_KEY',
    'SLACK_BOT_TOKEN',
    'HTTPS_PROXY'
  ] as const
  const env = buildOfficialSubagentChildEnv({
    missionId: 'M-isolated-parent',
    env: {
      HOME: '/tmp/official-home',
      CODEX_HOME: '/tmp/official-home/.codex',
      PATH: '/usr/bin:/bin',
      OPENAI_API_KEY: 'sk-official-auth',
      CODEX_API_KEY: 'codex-api-auth',
      CODEX_AUTH_TOKEN: 'codex-auth-token',
      OPENAI_ORGANIZATION: 'org-must-not-inherit',
      OPENAI_PROJECT: 'project-must-not-inherit',
      HTTPS_PROXY: 'https://proxy.example.test',
      CODEX_THREAD_ID: 'must-not-inherit-app-session',
      CODEX_LB_API_KEY: 'must-not-inherit-lb-auth',
      AWS_SECRET_ACCESS_KEY: 'must-not-inherit-cloud-auth',
      PROJECT_MCP_ALLOWED: 'must-not-inherit-arbitrary-project-env',
      SKS_AGENT_MODE: '1',
      ACAS_AGENT_SLUG: 'agent-slug',
      ACAS_AGENT_WORKSPACE: '/tmp/agent-workspace',
      ALFREDO_AGENT_SOULS_FILE: '/tmp/souls.json',
      ACAS_CHROME_PATH: '/tmp/chrome',
      ACAS_HTML_TO_PDF_ENGINE: 'chrome',
      ACAS_HTML_TO_PDF_ALLOW_CHROME_CLI_FALLBACK: '1',
      ACAS_CONNECTION_TOKEN: 'must-not-inherit-connection-token',
      ACAS_CENTER_BASE_URL: 'https://center.example.test',
      ACAS_CENTRAL_API_BASE: 'https://central.example.test',
      ACAS_EDGE_NODE_SLUG: 'edge-node',
      ANTHROPIC_API_KEY: 'anthropic-secret',
      OPENROUTER_API_KEY: 'openrouter-secret',
      SLACK_BOT_TOKEN: 'slack-secret',
      HTTP_PROXY: 'http://proxy.example.test',
      ALL_PROXY: 'socks5://proxy.example.test'
    }
  })
  assert.equal(env.HOME, '/tmp/official-home')
  assert.equal(env.CODEX_HOME, '/tmp/official-home/.codex')
  assert.equal(env.PATH, '/usr/bin:/bin')
  assert.equal(env.SKS_NARUTO_STANDALONE_CLI, '0')
  assert.equal(env.SKS_NARUTO_PARENT_LAUNCH, '1')
  assert.equal(env.SKS_NARUTO_PARENT_MISSION_ID, 'M-isolated-parent')
  assert.deepEqual(allowedHostKeys.map((key) => env[key]), [
    '1',
    'agent-slug',
    '/tmp/agent-workspace',
    '/tmp/souls.json',
    '/tmp/chrome',
    'chrome',
    '1'
  ])
  assert.deepEqual(deniedHostKeys.map((key) => env[key]), Array.from({ length: deniedHostKeys.length }, () => undefined))
  assert.equal(env.CODEX_API_KEY, undefined)
  assert.equal(env.CODEX_AUTH_TOKEN, undefined)
  assert.equal(env.OPENAI_ORGANIZATION, undefined)
  assert.equal(env.OPENAI_PROJECT, undefined)
  assert.equal(env.CODEX_THREAD_ID, undefined)
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined)
  assert.equal(env.PROJECT_MCP_ALLOWED, undefined)
  assert.equal(env.HTTP_PROXY, undefined)
  assert.equal(env.ALL_PROXY, undefined)
})

test('standalone parent replaces the real child environment and redacts inherited secret values from output', { timeout: 20_000 }, async (t) => {
  if (process.platform === 'win32') return t.skip('executable fixture uses a POSIX shebang')
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-env-isolation-'))
  const home = path.join(root, 'home')
  const codexHome = path.join(home, '.codex')
  const fakeCodex = path.join(root, 'codex-env-fixture.mjs')
  const envReceipt = path.join(root, 'child-env.json')
  const inheritedAuthSecret = 'sk-official-child-auth-secret'
  const blockedSecret = 'blocked-host-secret-value'
  const previousHostSecret = process.env.HOST_INHERITED_SECRET
  process.env.HOST_INHERITED_SECRET = blockedSecret
  t.after(async () => {
    if (previousHostSecret === undefined) delete process.env.HOST_INHERITED_SECRET
    else process.env.HOST_INHERITED_SECRET = previousHostSecret
    await fsp.rm(root, { recursive: true, force: true })
  })
  await fsp.mkdir(codexHome, { recursive: true })
  await fsp.writeFile(fakeCodex, [
    '#!/usr/bin/env node',
    "import fs from 'node:fs'",
    `fs.writeFileSync(${JSON.stringify(envReceipt)}, JSON.stringify(process.env))`,
    "const args = process.argv.slice(2)",
    "const outputIndex = args.indexOf('--output-last-message')",
    "const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : ''",
    `console.log('stdout auth=${inheritedAuthSecret} blocked=${blockedSecret} short=ok')`,
    `console.error('stderr auth=${inheritedAuthSecret} blocked=${blockedSecret} short=ok')`,
    `fs.writeFileSync(outputFile, 'summary auth=${inheritedAuthSecret} blocked=${blockedSecret} short=ok')`
  ].join('\n'), { mode: 0o700 })

  const result = await runOfficialSubagentWorkflow({
    root,
    goal: 'inspect isolated environment',
    prompt: 'inspect isolated environment',
    requestedSubagents: 1,
    maxThreads: 1,
    appSession: false,
    missionId: 'M-real-env-isolation',
    codexBin: fakeCodex,
    runProcessImpl: async (_command, args, options) => runProcess(fakeCodex, args, options),
    env: {
      HOME: home,
      CODEX_HOME: codexHome,
      PATH: process.env.PATH,
      OPENAI_API_KEY: inheritedAuthSecret,
      SHORT_TOKEN: 'ok',
      HTTPS_PROXY: 'https://user:proxy-secret@proxy.example.test',
      CODEX_THREAD_ID: 'outer-app-thread',
      CODEX_LB_API_KEY: 'blocked-lb-secret',
      UNRELATED_RUNTIME_VALUE: 'must-not-reach-child'
    }
  })

  const actualChildEnv = JSON.parse(await fsp.readFile(envReceipt, 'utf8'))
  assert.equal(actualChildEnv.HOME, home)
  assert.equal(actualChildEnv.CODEX_HOME, codexHome)
  assert.equal(actualChildEnv.OPENAI_API_KEY, undefined)
  assert.equal(actualChildEnv.HTTPS_PROXY, undefined)
  assert.equal(actualChildEnv.SKS_NARUTO_PARENT_MISSION_ID, 'M-real-env-isolation')
  assert.equal(actualChildEnv.CODEX_THREAD_ID, undefined)
  assert.equal(actualChildEnv.CODEX_LB_API_KEY, undefined)
  assert.equal(actualChildEnv.UNRELATED_RUNTIME_VALUE, undefined)
  assert.equal(actualChildEnv.HOST_INHERITED_SECRET, undefined)
  assert.doesNotMatch(result.process.stdout_tail, new RegExp(inheritedAuthSecret + '|' + blockedSecret))
  assert.doesNotMatch(result.process.stderr_tail, new RegExp(inheritedAuthSecret + '|' + blockedSecret))
  assert.doesNotMatch(result.parent_summary, new RegExp(inheritedAuthSecret + '|' + blockedSecret))
  assert.equal(result.process.stdout_tail, '')
  assert.match(result.process.stderr_tail, /stderr auth=<redacted> blocked=<redacted> short=ok/)
  assert.equal(result.parent_summary, 'summary auth=<redacted> blocked=<redacted> short=ok')
})

test('production standalone launch rejects arbitrary executable overrides outside the explicit process seam', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-executable-override-'))
  const home = path.join(root, 'home')
  const codexHome = path.join(home, '.codex')
  await fsp.mkdir(codexHome, { recursive: true })
  try {
    const result = await runOfficialSubagentWorkflow({
      root,
      goal: 'must use official package runtime',
      prompt: 'must use official package runtime',
      requestedSubagents: 1,
      maxThreads: 1,
      appSession: false,
      codexBin: path.join(root, 'untrusted-codex'),
      env: {
        HOME: home,
        CODEX_HOME: codexHome,
        PATH: root
      }
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 'trusted_runtime_blocked')
    assert.deepEqual(result.blockers, ['codex_parent_executable_override_forbidden'])
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('Naruto gate cannot pass when the required SSOT guard artifact is missing', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-naruto-gate-ssot-'))
  try {
    await writeNarutoGate(dir, {
      missionId: 'M-ssot-missing',
      workflowRunId: 'run-ssot-missing',
      evidence: {
        ok: true,
        run_id: 'run-ssot-missing',
        requested_subagents: 1,
        started_threads: 1,
        completed_threads: 1,
        failed_threads: 0,
        parent_summary_present: true,
        event_sources: ['SubagentStart', 'SubagentStop']
      },
      passed: true,
      blockers: []
    })
    const gate = JSON.parse(await fsp.readFile(path.join(dir, 'naruto-gate.json'), 'utf8'))
    assert.equal(gate.passed, false)
    assert.equal(gate.ssot_guard, false)
    assert.ok(gate.blockers.some((item: string) => item.startsWith('ssot-guard.json:')))
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('standalone parent launch exports the owning mission id to child hooks', async () => {
  let childEnv: NodeJS.ProcessEnv | undefined
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-oauth-'))
  try {
    await runOfficialSubagentWorkflow({
      root: process.cwd(),
      goal: 'delegate and wait',
      prompt: 'delegate and wait',
      requestedSubagents: 2,
      maxThreads: 2,
      appSession: false,
      missionId: 'M-parent-owner',
      env: {
        HOME: home,
        CODEX_HOME: path.join(home, '.codex'),
        SKS_PROVIDER: '',
        SKS_USE_CODEX_LB: '',
        SKS_MODEL_PROVIDER: '',
        CODEX_MODEL_PROVIDER: '',
        OPENAI_MODEL_PROVIDER: ''
      },
      runProcessImpl: async (_command, _args, opts: any) => {
        childEnv = opts.env
        assert.equal(opts.envMode, 'replace')
        return { code: 1, stdout: '', stderr: 'fixture stop', stdoutBytes: 0, stderrBytes: 12, truncated: false, timedOut: false }
      }
    })
    assert.equal(childEnv?.SKS_NARUTO_PARENT_LAUNCH, '1')
    assert.equal(childEnv?.SKS_NARUTO_PARENT_MISSION_ID, 'M-parent-owner')
  } finally {
    await fsp.rm(home, { recursive: true, force: true })
  }
})

test('standalone parent registers the child PID before waiting and exposes a bounded registration blocker', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-spawn-registration-'))
  let registeredPid: number | null = null
  try {
    const result = await runOfficialSubagentWorkflow({
      root: process.cwd(),
      goal: 'delegate and wait',
      prompt: 'delegate and wait',
      requestedSubagents: 1,
      maxThreads: 1,
      appSession: false,
      env: {
        HOME: home,
        CODEX_HOME: path.join(home, '.codex'),
        SKS_PROVIDER: '',
        SKS_USE_CODEX_LB: '',
        SKS_MODEL_PROVIDER: '',
        CODEX_MODEL_PROVIDER: '',
        OPENAI_MODEL_PROVIDER: ''
      },
      onChildSpawn: async (pid) => {
        registeredPid = pid
      },
      runProcessImpl: async (_command, _args, opts: any) => {
        await opts.onSpawn?.(43210)
        return {
          code: -1,
          pid: 43210,
          stdout: '',
          stderr: '',
          stdoutBytes: 0,
          stderrBytes: 0,
          truncated: false,
          timedOut: false,
          spawnRegistrationFailed: true
        }
      }
    })
    assert.equal(registeredPid, 43210)
    assert.deepEqual(result.blockers, ['codex_parent_spawn_registration_failed'])
  } finally {
    await fsp.rm(home, { recursive: true, force: true })
  }
})

test('standalone parent converts timeout and non-zero exits into bounded blocker codes', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-bounded-failure-'))
  try {
    const cases = [
      {
        process: {
          code: null,
          stdout: '',
          stderr: 'raw timeout detail must not become a blocker',
          stdoutBytes: 0,
          stderrBytes: 44,
          truncated: false,
          timedOut: true
        },
        blocker: 'codex_parent_timeout'
      },
      {
        process: {
          code: 70,
          stdout: '',
          stderr: 'raw MCP protocol failure detail must not become a blocker',
          stdoutBytes: 0,
          stderrBytes: 55,
          truncated: false,
          timedOut: false
        },
        blocker: 'codex_parent_exit:70'
      }
    ]
    for (const fixture of cases) {
      const result = await runOfficialSubagentWorkflow({
        root: process.cwd(),
        goal: 'delegate and wait',
        prompt: 'delegate and wait',
        requestedSubagents: 1,
        maxThreads: 1,
        appSession: false,
        env: {
          HOME: home,
          CODEX_HOME: path.join(home, '.codex'),
          SKS_PROVIDER: '',
          SKS_USE_CODEX_LB: '',
          SKS_MODEL_PROVIDER: '',
          CODEX_MODEL_PROVIDER: '',
          OPENAI_MODEL_PROVIDER: ''
        },
        runProcessImpl: async () => fixture.process
      })
      assert.deepEqual(result.blockers, [fixture.blocker])
      assert.equal(JSON.stringify(result.blockers).includes('raw MCP'), false)
      assert.equal(JSON.stringify(result.blockers).includes('raw timeout'), false)
    }
  } finally {
    await fsp.rm(home, { recursive: true, force: true })
  }
})

test('standalone official subagent launch overrides selected codex-lb with the native provider', async () => {
  let authorization: string | undefined
  const server = http.createServer((request, response) => {
    authorization = request.headers.authorization
    response.writeHead(200, {
      'content-type': 'application/json',
      'x-app-version': '1.20.0'
    })
    response.end(JSON.stringify({ status: 'ok' }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture server address missing')
  const baseUrl = `http://127.0.0.1:${address.port}/backend-api/codex`
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-codex-lb-'))
  const home = path.join(root, 'home')
  const codexHome = path.join(home, '.codex')
  await fsp.mkdir(codexHome, { recursive: true })
  await fsp.writeFile(path.join(codexHome, 'config.toml'), [
    'model_provider = "codex-lb"',
    '',
    '[model_providers.codex-lb]',
    `base_url = "${baseUrl}"`,
    ''
  ].join('\n'))
  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    CODEX_LB_BASE_URL: baseUrl,
    CODEX_LB_API_KEY: 'sk-official-subagent-secret'
  }
  let launches = 0
  const runProcessImpl = async () => {
    launches += 1
    return { code: 1, stdout: '', stderr: 'fixture stop', stdoutBytes: 0, stderrBytes: 12, truncated: false, timedOut: false }
  }
  try {
    const result = await runOfficialSubagentWorkflow({
      root,
      goal: 'delegate and wait',
      prompt: 'delegate and wait',
      requestedSubagents: 2,
      maxThreads: 2,
      appSession: false,
      env,
      runProcessImpl
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 'parent_failed')
    assert.equal(result.tool_output_recovery.status, 'not_selected')
    assert.equal(launches, 1)
    assert.equal(authorization, undefined)
    assert.doesNotMatch(JSON.stringify(result), /sk-official-subagent-secret/)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('standalone Naruto parent consumes the existing project MCP config and calls its read-only stdio tool', { timeout: 20_000 }, async (t) => {
  if (process.platform === 'win32') return t.skip('executable fixture uses a POSIX shebang')
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-project-mcp-'))
  const home = path.join(root, 'home')
  const project = path.join(root, 'project')
  const codexHome = path.join(home, '.codex')
  const serverFile = path.join(project, 'project-read-tool.mjs')
  const fakeCodex = path.join(root, 'codex-fixture.mjs')
  const callReceipt = path.join(project, 'project-mcp-call.json')
  await fsp.mkdir(codexHome, { recursive: true })
  await fsp.mkdir(path.join(project, '.codex'), { recursive: true })
  t.after(async () => fsp.rm(root, { recursive: true, force: true }))

  await fsp.writeFile(serverFile, [
    "import readline from 'node:readline'",
    "const tools = ['read_project_marker', 'datasource_schema_context', 'datasource_query_readonly', 'spreadsheet_create', 'spreadsheet_inspect', 'spreadsheet_update'].map((name) => ({ name, description: `Fixture tool ${name}`, inputSchema: { type: 'object', additionalProperties: false } }))",
    "const rl = readline.createInterface({ input: process.stdin })",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line)",
    "  if (message.method === 'initialize') console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} } } }))",
    "  if (message.method === 'tools/list') console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools } }))",
    "  if (message.method === 'tools/call') console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'project-mcp-ok' }], isError: false } }))",
    "})"
  ].join('\n'), { mode: 0o600 })

  await fsp.writeFile(fakeCodex, [
    '#!/usr/bin/env node',
    "import fs from 'node:fs'",
    "import path from 'node:path'",
    "import readline from 'node:readline'",
    "import { spawn } from 'node:child_process'",
    "const args = process.argv.slice(2)",
    "const outputIndex = args.indexOf('--output-last-message')",
    "const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : ''",
    "const configFile = path.join(process.cwd(), '.codex', 'config.toml')",
    "const config = fs.readFileSync(configFile, 'utf8')",
    "const match = config.match(/\\[mcp_servers\\.(?:project_probe|\"project_probe\")\\]([\\s\\S]*?)(?=\\n\\[|$)/)",
    "if (!match) throw new Error('project_mcp_block_missing')",
    "const block = match[1]",
    "const commandLine = block.split(/\\r?\\n/).find((line) => /^command\\s*=/.test(line))",
    "const argsLine = block.split(/\\r?\\n/).find((line) => /^args\\s*=/.test(line))",
    "const command = JSON.parse(String(commandLine || '').replace(/^command\\s*=\\s*/, ''))",
    "const childArgs = argsLine ? JSON.parse(argsLine.replace(/^args\\s*=\\s*/, '')) : []",
    "const child = spawn(command, childArgs, { cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })",
    "const lines = readline.createInterface({ input: child.stdout })",
    "const pending = new Map()",
    "lines.on('line', (line) => { const message = JSON.parse(line); const resolve = pending.get(message.id); if (resolve) { pending.delete(message.id); resolve(message) } })",
    "const request = (id, method, params = {}) => new Promise((resolve, reject) => { pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\\n'); setTimeout(() => reject(new Error('fixture_mcp_timeout')), 3000).unref() })",
    "await request(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } })",
    "child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\\n')",
    "const listed = await request(2, 'tools/list')",
    "if (!listed.result.tools.some((tool) => tool.name === 'read_project_marker')) throw new Error('project_mcp_tool_missing')",
    "for (const name of ['datasource_schema_context', 'datasource_query_readonly', 'spreadsheet_create', 'spreadsheet_inspect', 'spreadsheet_update']) if (!listed.result.tools.some((tool) => tool.name === name)) throw new Error(`project_mcp_capability_tool_missing:${name}`)",
    "const called = await request(3, 'tools/call', { name: 'read_project_marker', arguments: {} })",
    "const text = called.result.content?.[0]?.text",
    "fs.writeFileSync(path.join(process.cwd(), 'project-mcp-call.json'), JSON.stringify({ tool: 'read_project_marker', text }))",
    "if (text !== 'project-mcp-ok') throw new Error('project_mcp_tool_result_invalid')",
    "child.stdin.end()",
    "child.kill('SIGTERM')",
    "if (!outputFile) throw new Error('parent_summary_output_missing')",
    "fs.writeFileSync(outputFile, 'project MCP fixture complete')"
  ].join('\n'), { mode: 0o700 })

  const cli = new UnavailableMcpCli()
  const previousAllowed = process.env.PROJECT_MCP_ALLOWED
  process.env.PROJECT_MCP_ALLOWED = 'runtime-value-must-not-be-written'
  t.after(() => {
    if (previousAllowed === undefined) delete process.env.PROJECT_MCP_ALLOWED
    else process.env.PROJECT_MCP_ALLOWED = previousAllowed
  })
  const registration = {
    schema: 'sks.mcp-server-config.v2',
    name: 'project_probe',
    transport: 'stdio',
    command: process.execPath,
    args: [serverFile],
    env_vars: ['PROJECT_MCP_ALLOWED'],
    cwd: project,
    enabled_tools: [
      'read_project_marker',
      'datasource_schema_context',
      'datasource_query_readonly',
      'spreadsheet_create',
      'spreadsheet_inspect',
      'spreadsheet_update'
    ],
    default_tools_approval_mode: 'auto',
    required: true
  }
  const added = await addMcpServer(registration, 'project', {
    projectRoot: project,
    projectTrusted: true,
    confirmProjectMutation: true,
    cli
  })
  assert.equal(added.ok, true)
  const reapplied = await editMcpServer('project_probe', registration, 'project', {
    projectRoot: project,
    projectTrusted: true,
    confirmProjectMutation: true,
    cli
  })
  assert.equal(reapplied.ok, true)
  const config = await fsp.readFile(path.join(project, '.codex', 'config.toml'), 'utf8')
  assert.equal((config.match(/\[mcp_servers\."project_probe"\]/g) || []).length, 1)
  assert.match(config, /env_vars = \["PROJECT_MCP_ALLOWED"\]/)
  assert.doesNotMatch(config, /runtime-value-must-not-be-written/)

  const result = await runOfficialSubagentWorkflow({
    root: project,
    goal: 'Use the registered read-only project tool and report its marker.',
    prompt: 'Use the registered read-only project tool and report its marker.',
    requestedSubagents: 1,
    maxThreads: 1,
    appSession: false,
    missionId: 'M-project-mcp-fixture',
    codexBin: fakeCodex,
    runProcessImpl: async (_command, args, options) => runProcess(fakeCodex, args, options),
    env: {
      HOME: home,
      CODEX_HOME: codexHome,
      SKS_PROVIDER: '',
      SKS_USE_CODEX_LB: '',
      SKS_MODEL_PROVIDER: '',
      CODEX_MODEL_PROVIDER: '',
      OPENAI_MODEL_PROVIDER: ''
    }
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'parent_completed')
  assert.equal(result.parent_summary, 'project MCP fixture complete')
  assert.deepEqual(JSON.parse(await fsp.readFile(callReceipt, 'utf8')), {
    tool: 'read_project_marker',
    text: 'project-mcp-ok'
  })
})
