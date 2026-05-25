import { normalizeVerificationOutput } from './verification-dag.js'

export class VerificationArtifactLock {
  private readonly locked = new Set<string>()
  constructor(private readonly cwd: string = process.cwd()) {}

  canAcquire(outputs: readonly string[] = []): boolean {
    return outputs.every((output) => !this.locked.has(normalizeVerificationOutput(output, this.cwd)))
  }

  acquire(outputs: readonly string[] = []): void {
    if (!this.canAcquire(outputs)) throw new Error('verification artifact output already locked')
    for (const output of outputs) this.locked.add(normalizeVerificationOutput(output, this.cwd))
  }

  release(outputs: readonly string[] = []): void {
    for (const output of outputs) this.locked.delete(normalizeVerificationOutput(output, this.cwd))
  }
}
