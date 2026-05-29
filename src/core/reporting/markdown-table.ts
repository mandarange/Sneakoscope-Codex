export function markdownTable(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const cleanHeaders = headers.map(formatCell)
  const cleanRows = rows.map((row) => row.map(formatCell))
  return [
    `| ${cleanHeaders.join(' | ')} |`,
    `| ${cleanHeaders.map(() => '---').join(' | ')} |`,
    ...cleanRows.map((row) => `| ${row.join(' | ')} |`)
  ].join('\n')
}

function formatCell(value: string | number | boolean | null | undefined): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, '<br>')
}
