import { compactMcpToolSchema } from '../mcp/mcp-0-134-policy.js'

export function buildCodex0139RichToolSchemaFixture() {
  return {
    type: 'object',
    description: 'Codex 0.139 rich tool schema preservation fixture',
    oneOf: [
      { required: ['mode'], properties: { mode: { const: 'guided' } } },
      { required: ['query'], properties: { query: { type: 'string' } } }
    ],
    allOf: [
      { required: ['kind'] },
      { properties: { kind: { enum: ['search', 'inspect'] } } }
    ],
    required: ['kind', 'payload'],
    properties: {
      kind: { enum: ['search', 'inspect'] },
      payload: {
        type: 'object',
        required: ['target'],
        properties: {
          target: { type: 'string' },
          filters: {
            type: 'object',
            properties: {
              depth: { enum: ['shallow', 'deep'] }
            }
          }
        }
      }
    }
  }
}

export function passCodex0139RichToolSchemaThroughBridge(schema: any = buildCodex0139RichToolSchemaFixture()) {
  return compactMcpToolSchema(schema, 128).schema
}

export function evaluateCodex0139RichToolSchemaPreservation(schema: any = buildCodex0139RichToolSchemaFixture()) {
  const bridged = passCodex0139RichToolSchemaThroughBridge(schema)
  const required = Array.isArray(bridged?.required) ? bridged.required : []
  const result = {
    schema: 'sks.codex-0139-rich-tool-schema-preservation.v1',
    ok: Array.isArray(bridged?.oneOf)
      && Array.isArray(bridged?.allOf)
      && Boolean(bridged?.properties?.payload?.properties?.target)
      && required.includes('kind')
      && required.includes('payload'),
    top_level_oneOf_preserved: Array.isArray(bridged?.oneOf),
    top_level_allOf_preserved: Array.isArray(bridged?.allOf),
    nested_structure_preserved: Boolean(bridged?.properties?.payload?.properties?.target),
    required_fields_retained: required.includes('kind') && required.includes('payload'),
    bridged_schema: bridged
  }
  return {
    ...result,
    blockers: result.ok ? [] : ['codex_rich_tool_schema_preservation_failed']
  }
}
