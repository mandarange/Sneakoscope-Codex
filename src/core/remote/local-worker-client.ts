import path from 'node:path';
import { resolveAllowedProjectRoot } from './machine-registry.js';
import { RemoteWorker } from './worker.js';
import type { RemoteMachineV1, WorkerRequestV1, WorkerResponseV1 } from './types.js';

export interface RemoteLocalWorkerClientOptions {
  readonly machine: RemoteMachineV1;
  readonly projectRoot: string;
  readonly projectId: string;
  readonly workerFactory?: (input: {
    readonly root: string;
    readonly machine: RemoteMachineV1;
    readonly projectId: string;
  }) => RemoteWorker;
}

export class RemoteLocalWorkerClient {
  private readonly root: string;
  private readonly worker: RemoteWorker;
  private ready: Promise<void> | null = null;
  private closed = false;

  constructor(private readonly options: RemoteLocalWorkerClientOptions) {
    if (options.machine.transport !== 'local') throw new Error('local_worker_transport_required');
    this.root = path.resolve(options.projectRoot);
    this.worker = options.workerFactory?.({
      root: this.root,
      machine: options.machine,
      projectId: options.projectId
    }) ?? new RemoteWorker({
      root: this.root,
      machine: options.machine,
      projectId: options.projectId
    });
  }

  async request(request: WorkerRequestV1): Promise<WorkerResponseV1> {
    if (this.closed) throw new Error('local_worker_client_closed');
    this.ready ??= resolveAllowedProjectRoot(this.options.machine, this.root).then(() => undefined);
    await this.ready;
    return this.worker.handle(request);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
