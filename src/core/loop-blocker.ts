import { nowIso, writeJsonAtomic } from './fsx.js';

export interface LoopBlockerEvent {
  reason: string;
  detail?: string | null;
  at?: string;
}

export function detectRepeatedBlocker(events: readonly LoopBlockerEvent[] = [], threshold = 2) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = blockerKey(event);
    counts.set(key, Number(counts.get(key) || 0) + 1);
  }
  const repeated = Array.from(counts.entries())
    .filter(([, count]) => count >= threshold)
    .map(([key, count]) => ({ key, count }));
  return {
    schema: 'sks.loop-blocker-stop.v1',
    ok: repeated.length === 0,
    stop_required: repeated.length > 0,
    threshold,
    repeated,
    status: repeated.length ? 'blocked' : 'clear'
  };
}

export function usageLimitBlocker(detail: unknown = 'usage limit reached') {
  return {
    schema: 'sks.loop-blocker.v1',
    reason: 'usage_limit',
    detail: String(detail || 'usage limit reached'),
    created_at: nowIso(),
    stop_required: true
  };
}

export async function writeLoopBlockerReport(file: string, events: readonly LoopBlockerEvent[] = [], threshold = 2) {
  const detection = detectRepeatedBlocker(events, threshold);
  const report = {
    ...detection,
    generated_at: nowIso(),
    events: events.map((event) => ({ ...event, at: event.at || nowIso() }))
  };
  await writeJsonAtomic(file, report);
  return report;
}

function blockerKey(event: LoopBlockerEvent): string {
  return `${String(event.reason || 'unknown').trim()}::${String(event.detail || '').trim()}`;
}
