import test from 'node:test';
import assert from 'node:assert/strict';
import { getReportCompletion } from './reportCompletion.js';

test('lab assistants without courses do not require student evaluation', () => {
  const result = getReportCompletion({
    role: 'Lab Assistant',
    hasCourseAssigned: false,
    hasDeptHeadEval: true,
    hasPeerEval: true,
    finalScore: 75,
    isComplete: false,
    can_print: false,
  });

  assert.equal(result.canPrint, true);
  assert.deepEqual(result.missing, []);
});

test('lab assistants with courses require student evaluation', () => {
  const result = getReportCompletion({
    role: 'Lab Assistant',
    hasCourseAssigned: true,
    hasDeptHeadEval: true,
    hasPeerEval: true,
    finalScore: 75,
  });

  assert.equal(result.hasStudentEval, false);
  assert.equal(result.canPrint, false);
  assert.deepEqual(result.missing, ['Student Evaluation is pending']);
});

test('incomplete peer or department evaluations remain blocked', () => {
  const result = getReportCompletion({
    role: 'Lab Assistant',
    hasCourseAssigned: false,
    hasDeptHeadEval: false,
    hasPeerEval: true,
    finalScore: 75,
  });

  assert.equal(result.canPrint, false);
  assert.deepEqual(result.missing, ['Department Head Evaluation is pending']);
});

test('required peer count cannot be mistaken for completed peer submissions', () => {
  const result = getReportCompletion({
    role: 'Instructor',
    hasCourseAssigned: true,
    student_completed: 12,
    required_student_evaluators: 12,
    peer_completed: 0,
    peer_required: 6,
    hasDeptHeadEval: true,
    finalScore: 46.65,
  });

  assert.equal(result.hasPeerEval, false);
  assert.equal(result.canPrint, false);
  assert.deepEqual(result.missing, ['Peer Evaluation is pending']);
});

test('one peer submission completes the peer category', () => {
  const result = getReportCompletion({
    role: 'Instructor',
    hasCourseAssigned: true,
    student_completed: 12,
    required_student_evaluators: 12,
    peer_completed: 5,
    peer_required: 6,
    hasDeptHeadEval: true,
    finalScore: 46.65,
  });

  assert.equal(result.hasPeerEval, true);
  assert.equal(result.canPrint, true);
});

test('half of registered student submissions completes the student category', () => {
  const result = getReportCompletion({
    role: 'Instructor',
    hasCourseAssigned: true,
    student_completed: 6,
    student_required: 12,
    peer_completed: 1,
    peer_required: 6,
    peer_required: 6,
    dept_head_completed: 1,
    finalScore: 46.65,
  });

  assert.equal(result.hasStudentEval, true);
  assert.equal(result.canPrint, true);
});

test('fewer than half of registered student submissions remains pending', () => {
  const result = getReportCompletion({
    role: 'Instructor',
    hasCourseAssigned: true,
    student_completed: 5,
    student_required: 12,
    peer_completed: 1,
    dept_head_completed: 1,
    finalScore: 46.65,
  });

  assert.equal(result.hasStudentEval, false);
  assert.equal(result.canPrint, false);
});

test('computed backend completion enables printing when count metadata is omitted', () => {
  const result = getReportCompletion({
    role: 'Instructor',
    final_score: 93.1,
    isComplete: true,
  });

  assert.equal(result.hasValidFinalScore, true);
  assert.equal(result.canPrint, true);
  assert.deepEqual(result.missing, []);
});

test('a score cannot bypass incomplete categories or a stale false completion flag', () => {
  const result = getReportCompletion({
    role: 'Instructor',
    final_score: 93.1,
    isComplete: false,
  });

  assert.equal(result.canPrint, false);
  assert.deepEqual(result.missing, [
    'Student Evaluation is pending',
    'Department Head Evaluation is pending',
    'Peer Evaluation is pending',
  ]);
});
