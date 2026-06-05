export interface OpenAiCompatibleLocalRequest {
  endpoint: string
  model: string
  messages: Array<{ role: string; content: string }>
  temperature?: number
}

export async function callOpenAiCompatibleLocalChat(input: OpenAiCompatibleLocalRequest, timeoutMs = 20_000) {
  try {
    const response = await fetch(`${input.endpoint.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0
      }),
      signal: AbortSignal.timeout(timeoutMs)
    })
    const text = await response.text()
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? JSON.parse(text) : null,
      error: response.ok ? null : text.slice(0, 500)
    }
  } catch (error: unknown) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
