declare module '*.mjs' {
  export const main: (...args: unknown[]) => unknown;
  export const helpCommand: (...args: unknown[]) => unknown;
  export const helpFast: (...args: unknown[]) => unknown;
}
