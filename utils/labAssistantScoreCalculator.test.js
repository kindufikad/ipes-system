const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateLabAssistantScore } = require('../controllers/labAssistantPerformanceController');

test('assigned Lab Assistants use the 50/20/30 weighting', () => {
  const result = calculateLabAssistantScore({
    studentRaw: 80,
    peerRaw: 60,
    deptHeadRaw: 9,
    hasAssignedCourses: true,
    studentSubmissionCount: 1,
    studentRequiredCount: 2,
    peerSubmissionCount: 1,
    deptHeadSubmissionCount: 1,
  });

  assert.equal(result.totalScore, 61);
  assert.equal(result.activeWeight, 100);
  assert.deepEqual(result.weights, { student: 50, peer: 20, deptHead: 30 });
  assert.equal(result.studentWeighted, 40);
  assert.equal(result.peerWeighted, 12);
  assert.equal(result.deptHeadWeighted, 9);
  assert.equal(result.deptHeadRaw, 30);
});

test('unassigned Lab Assistants scale peer and department scores to 40/60', () => {
  const result = calculateLabAssistantScore({
    studentRaw: 80,
    peerRaw: 60,
    deptHeadRaw: 28.02,
    hasAssignedCourses: false,
    peerSubmissionCount: 1,
    deptHeadSubmissionCount: 1,
  });

  assert.equal(result.totalScore, 80.04);
  assert.equal(result.activeWeight, 100);
  assert.deepEqual(result.weights, { student: 0, peer: 40, deptHead: 60 });
  assert.equal(result.studentWeighted, 0);
  assert.equal(result.peerWeighted, 24);
  assert.equal(result.deptHeadWeighted, 56.04);
  assert.equal(result.deptHeadRaw, 93.4);
  assert.equal(result.breakdown.student.isNA, true);
});

test('unassigned Lab Assistants do not require student evaluation completion', () => {
  const result = calculateLabAssistantScore({
    studentRaw: 0,
    peerRaw: 60,
    deptHeadRaw: 9,
    hasAssignedCourses: false,
    peerSubmissionCount: 1,
    deptHeadSubmissionCount: 1,
  });

  assert.equal(result.isComplete, true);
  assert.equal(result.totalScore, 42);
});

test('incomplete categories withhold the total even when partial scores exist', () => {
  const result = calculateLabAssistantScore({
    studentRaw: 93.3,
    peerRaw: 60,
    deptHeadRaw: 30,
    hasAssignedCourses: true,
    peerSubmissionCount: 1,
    deptHeadSubmissionCount: 1,
    studentRequiredCount: 2,
  });

  assert.equal(result.isComplete, false);
  assert.equal(result.totalScore, null);
});

test('a completed zero-valued category counts as submitted', () => {
  const result = calculateLabAssistantScore({
    peerRaw: 0,
    deptHeadRaw: 50,
    hasAssignedCourses: false,
    peerSubmissionCount: 1,
    deptHeadSubmissionCount: 1,
  });

  assert.equal(result.isComplete, true);
  assert.equal(result.totalScore, 30);
});

test('assigned Lab Assistants complete student evaluation at half of registered students', () => {
  const result = calculateLabAssistantScore({
    studentRaw: 80,
    peerRaw: 60,
    deptHeadRaw: 30,
    hasAssignedCourses: true,
    studentSubmissionCount: 2,
    studentRequiredCount: 4,
    peerSubmissionCount: 1,
    deptHeadSubmissionCount: 1,
  });

  assert.equal(result.isStudentComplete, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.totalScore, 82);
});

test('assigned Lab Assistants remain pending below half of registered students', () => {
  const result = calculateLabAssistantScore({
    studentRaw: 80,
    peerRaw: 60,
    deptHeadRaw: 30,
    hasAssignedCourses: true,
    studentSubmissionCount: 1,
    studentRequiredCount: 4,
    peerSubmissionCount: 1,
    deptHeadSubmissionCount: 1,
  });

  assert.equal(result.isStudentComplete, false);
  assert.equal(result.isComplete, false);
  assert.equal(result.totalScore, null);
});
