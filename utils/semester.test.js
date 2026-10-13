const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStudentSemesterFilter, getSemesterComparisonValues, isAllSemester } = require('./semester');

test('All Semester representations do not add a semester SQL filter', () => {
  for (const value of [undefined, '', 'ALL', 'all', ' All ']) {
    assert.equal(isAllSemester(value), true);
    assert.deepEqual(buildStudentSemesterFilter(value), null);
  }
});

test('Specific semesters match labels and numerical equivalents', () => {
  assert.deepEqual(getSemesterComparisonValues('I'), ['1', 'i', 'Semester i', 'Semester 1']);
  assert.deepEqual(getSemesterComparisonValues('Semester II'), ['2', 'ii', 'Semester ii', 'Semester 2']);
  assert.deepEqual(buildStudentSemesterFilter('Semester I'), {
    sql: 'LOWER(TRIM(s.semester)) IN (?, ?, ?, ?)',
    params: ['1', 'i', 'Semester i', 'Semester 1'],
  });
  assert.deepEqual(buildStudentSemesterFilter('2'), {
    sql: 'LOWER(TRIM(s.semester)) IN (?, ?, ?, ?)',
    params: ['2', 'ii', 'Semester ii', 'Semester 2'],
  });
});

test('Unknown semester values do not create a broad query', () => {
  assert.equal(isAllSemester('Unknown'), false);
  assert.deepEqual(getSemesterComparisonValues('Unknown'), []);
  assert.deepEqual(buildStudentSemesterFilter('Unknown'), {
    sql: '1 = 0',
    params: [],
  });
});
