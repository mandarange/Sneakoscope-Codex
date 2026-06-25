export async function xaiCommand(sub: string = 'check', args: string[] = []) {
  const json = args.includes('--json')
  const action = sub || 'check'
  const result = {
    schema: 'sks.xai-compat.v1',
    ok: action !== 'setup',
    status: 'deprecated',
    action,
    setup_performed: false,
    xai_required: false,
    replacement: {
      doctor: 'sks ultra-search doctor',
      x_search: 'sks ultra-search x "<query>"',
      migration: 'sks ultra-search migrate-xai [--apply]'
    },
    blockers: action === 'setup' ? ['xai_setup_removed_use_ultra_search'] : [],
    warnings: ['sks_xai_is_deprecated_and_does_not_configure_mcp_or_require_XAI_API_KEY']
  }
  if (json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log('`sks xai` is deprecated. UltraSearch no longer requires xAI/Grok or XAI_API_KEY.')
    console.log('Use: sks ultra-search doctor')
    console.log('Use: sks ultra-search x "<query>"')
    if (action === 'setup') {
      console.log('No MCP setup was performed.')
      process.exitCode = 1
    }
  }
  return result
}

export function xaiMcpToml(): string {
  return ''
}
