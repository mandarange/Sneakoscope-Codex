import { PACKAGE_VERSION } from '../core/version.js';
import { ANSI_CODES, paint, resolveZellijTheme } from '../core/zellij/zellij-theme.js';

const theme = resolveZellijTheme();

export const ui = {
  banner(cmd: string) {
    console.log(paint(theme, ANSI_CODES.dim, `SKS ${PACKAGE_VERSION} · ${cmd}`));
  },
  ok(msg: string) {
    console.log(`${paint(theme, ANSI_CODES.green, '✔')} ${msg}`);
  },
  warn(msg: string) {
    console.log(`${paint(theme, ANSI_CODES.yellow, '▲')} ${msg}`);
  },
  fail(msg: string) {
    console.log(`${paint(theme, ANSI_CODES.red, '✖')} ${msg}`);
  },
  step(msg: string) {
    console.log(`${paint(theme, ANSI_CODES.dim, '>')} ${msg}`);
  },
  kv(k: string, v: string) {
    console.log(`  ${paint(theme, ANSI_CODES.dim, k.padEnd(18))} ${v}`);
  },
  table(rows: string[][]) {
    if (!rows.length) return;
    const widths = rows[0]?.map((_cell, index) => Math.max(...rows.map((row) => String(row[index] || '').length))) || [];
    for (const [rowIndex, row] of rows.entries()) {
      const line = row.map((cell, index) => String(cell || '').padEnd(widths[index] || 0)).join('  ').trimEnd();
      console.log(rowIndex === 0 ? paint(theme, ANSI_CODES.dim, line) : line);
    }
  }
};
