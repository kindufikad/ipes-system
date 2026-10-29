import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEvaluationDeadline } from './formatEvaluationDeadline.js';

test('formats a date-only deadline without an empty time', () => {
  assert.equal(formatEvaluationDeadline('2026-10-12', 'en-US'), '10/12/2026');
});

test('formats an explicit deadline time', () => {
  assert.equal(formatEvaluationDeadline('2026-10-12T23:59:00', 'en-US'), '10/12/2026, 11:59 PM');
});

test('formats the date and removes an empty time placeholder', () => {
  assert.equal(formatEvaluationDeadline('2026-10-12 — : —', 'en-US'), '10/12/2026');
});

test('does not render a date when the input is entirely invalid', () => {
  assert.equal(formatEvaluationDeadline('— : —', 'en-US'), '—');
});