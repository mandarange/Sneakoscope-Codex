import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWorkerPromptText, WORKER_PROMPT_TEXT_MAX_CHARS } from '../normalize-worker-prompt-text.js'

test('preserves newlines and does not truncate an 8000-char prompt with embedded newlines', () => {
  const paragraph = 'line one has some   irregular\tspacing here\n'
  const input = paragraph.repeat(200) + 'final line without trailing newline'
  assert.ok(input.length > 8000, 'fixture must be at least 8000 chars')
  const result = normalizeWorkerPromptText(input)
  assert.equal(result.truncated, false)
  assert.equal(result.dropped_chars, 0)
  const newlineCountInput = (input.match(/\n/g) || []).length
  const newlineCountOutput = (result.text.match(/\n/g) || []).length
  assert.equal(newlineCountOutput, newlineCountInput)
  assert.ok(result.text.length <= WORKER_PROMPT_TEXT_MAX_CHARS)
})

test('collapses horizontal whitespace but keeps single newlines intact', () => {
  const input = 'first   line\twith tabs\nsecond line\n\n\n\nthird line after many blank lines'
  const result = normalizeWorkerPromptText(input)
  assert.equal(result.text, 'first line with tabs\nsecond line\n\nthird line after many blank lines')
  assert.equal(result.truncated, false)
})

test('signals truncation explicitly instead of silently cutting beyond the cap', () => {
  const input = 'x'.repeat(WORKER_PROMPT_TEXT_MAX_CHARS + 500)
  const result = normalizeWorkerPromptText(input)
  assert.equal(result.truncated, true)
  assert.equal(result.dropped_chars, 500)
  assert.equal(result.text.length, WORKER_PROMPT_TEXT_MAX_CHARS)
})

test('handles null/undefined input without throwing', () => {
  const result = normalizeWorkerPromptText(undefined)
  assert.equal(result.text, '')
  assert.equal(result.truncated, false)
  assert.equal(result.dropped_chars, 0)
})
