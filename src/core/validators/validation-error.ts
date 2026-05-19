export class ValidationError extends Error {
  constructor(schemaName: string, detail: any = 'invalid runtime artifact') {
    super(`${schemaName}: ${detail}`);
    this.name = 'ValidationError';
  }
}
