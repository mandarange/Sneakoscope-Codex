export function translatePythonCodexSdkEvents(events: unknown[] = []) {
  return events.map((event: any, index) => ({
    schema: 'sks.python-codex-sdk-event.v1',
    index,
    event_type: String(event?.event || 'unknown'),
    thread_id: event?.thread_id ? String(event.thread_id) : null,
    turn_id: event?.turn_id ? String(event.turn_id) : null,
    status: event?.status ? String(event.status) : null,
    retryable: event?.retryable === true,
    message: event?.message ? String(event.message) : null,
    final_response: event?.final_response ? String(event.final_response) : null
  }))
}
