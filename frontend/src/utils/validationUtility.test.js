import test from 'node:test';
import assert from 'node:assert/strict';
import { PEER_FEEDBACK_VALIDATION_MESSAGE, validatePeerEvaluationFeedbackPair } from './validationUtility.js';

test('peer feedback comments are optional when blank or whitespace-only', () => {
  assert.equal(validatePeerEvaluationFeedbackPair('', '').valid, true);
  assert.equal(validatePeerEvaluationFeedbackPair('   ', '\n\t').valid, true);
  assert.equal(validatePeerEvaluationFeedbackPair('', 'Clear explanations').valid, true);
  assert.equal(validatePeerEvaluationFeedbackPair('Clear explanations', '').valid, true);
});

test('peer feedback rejects repeated random characters with the friendly message', () => {
  for (const comment of ['hhhkjjkjkl', 'jjhjjj...']) {
    const result = validatePeerEvaluationFeedbackPair(comment, '');
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, [PEER_FEEDBACK_VALIDATION_MESSAGE]);
  }
});

test('peer feedback rejects profanity and abusive language', () => {
  const result = validatePeerEvaluationFeedbackPair('', 'The instructor is an asshole');
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [PEER_FEEDBACK_VALIDATION_MESSAGE]);
});

test('peer feedback accepts concise meaningful comments', () => {
  assert.equal(validatePeerEvaluationFeedbackPair('Clear explanations', '').valid, true);
});
