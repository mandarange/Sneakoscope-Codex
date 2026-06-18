import { handleSksdRequest, sksdStart, sksdStatus, sksdStop, sksdWarm, type SksdState } from './sksd.js';
import { writeSksdIpcMessage } from './sksd-ipc.js';

export function runSksdClient(root: string, action: 'status' | 'warm' | 'stop' | 'start' = 'status'): SksdState {
  writeSksdIpcMessage(root, action, action === 'warm' ? { type: 'warm', root } : action === 'stop' ? { type: 'stop' } : { type: 'status' });
  if (action === 'start') return sksdStart(root);
  if (action === 'warm') return sksdWarm(root);
  if (action === 'stop') return sksdStop(root);
  return sksdStatus(root);
}

export { handleSksdRequest };
