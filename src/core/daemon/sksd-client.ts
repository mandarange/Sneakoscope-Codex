import { sksdStatus, sksdStop, sksdWarm, type SksdState } from './sksd.js';

export function runSksdClient(root: string, action: 'status' | 'warm' | 'stop'): SksdState {
  if (action === 'warm') return sksdWarm(root);
  if (action === 'stop') return sksdStop(root);
  return sksdStatus(root);
}
