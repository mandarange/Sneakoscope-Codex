import test from 'node:test';
import assert from 'node:assert/strict';
import { promptRequirementItems } from '../questions.js';

test('promptRequirementItems parses a 20-item numbered Korean list into 20 items without truncation', () => {
  let prompt = '';
  for (let i = 1; i <= 20; i += 1) prompt += `${i}. 항목 ${i} 내용입니다\n`;
  const result = promptRequirementItems(prompt);
  assert.equal(result.items.length, 20);
  assert.equal(result.truncated, false);
  assert.equal(result.truncated_count, 0);
  assert.equal(result.items[0]?.text, '항목 1 내용입니다');
  assert.equal(result.items[19]?.text, '항목 20 내용입니다');
});

test('promptRequirementItems still returns a single item for a plain sentence prompt', () => {
  const result = promptRequirementItems('이거 하나만 처리해줘 부탁해');
  assert.equal(result.items.length, 1);
  assert.equal(result.truncated, false);
  assert.equal(result.items[0]?.text, '이거 하나만 처리해줘 부탁해');
});

test('promptRequirementItems still splits an existing bullet-list prompt', () => {
  const result = promptRequirementItems('- foo\n- bar');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.text, 'foo');
  assert.equal(result.items[1]?.text, 'bar');
});

test('promptRequirementItems truncates pathologically large inputs and signals the truncation', () => {
  let prompt = '';
  for (let i = 1; i <= 150; i += 1) prompt += `${i}. item ${i}\n`;
  const result = promptRequirementItems(prompt);
  assert.equal(result.items.length, 128);
  assert.equal(result.truncated, true);
  assert.equal(result.truncated_count, 22);
});
