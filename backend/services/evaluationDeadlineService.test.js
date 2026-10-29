const test = require('node:test');
const assert = require('node:assert/strict');
const { getAutoLockDeadlineEnabled, resolveDepartmentEvaluationDeadline, isEvaluationDeadlineExpired } = require('./evaluationDeadlineService');

test('missing auto-lock setting defaults to disabled', async () => {
  const pool = { query: async () => [[]] };

  assert.equal(await getAutoLockDeadlineEnabled(pool), false);
});

test('missing auto-lock settings table safely defaults to disabled', async () => {
  const pool = { query: async () => { throw Object.assign(new Error('table missing'), { code: 'ER_NO_SUCH_TABLE' }); } };

  assert.equal(await getAutoLockDeadlineEnabled(pool), false);
});

test('missing auto-lock setting column safely defaults to disabled', async () => {
  const pool = { query: async () => { throw Object.assign(new Error('column missing'), { code: 'ER_BAD_FIELD_ERROR' }); } };

  assert.equal(await getAutoLockDeadlineEnabled(pool), false);
});

test('saved department deadline takes precedence over stale dispatch deadline', () => {
  const result = resolveDepartmentEvaluationDeadline(
    { deadline_at: '2026-10-20 23:59:00', auto_lock: 1, updated_at: '2026-10-09 12:00:00' },
    { deadline: '2026-08-17 23:59:00' }
  );

  assert.equal(result.deadlineAt, '2026-10-20 23:59:00');
  assert.equal(result.autoLock, true);
});

test('dispatch deadline remains the fallback when no department setting exists', () => {
  const result = resolveDepartmentEvaluationDeadline(null, { deadline: '2026-10-15 23:59:00' });

  assert.equal(result.deadlineAt, '2026-10-15 23:59:00');
  assert.equal(result.autoLock, true);
});

test('empty deadline values are treated as no active deadline', () => {
  const result = resolveDepartmentEvaluationDeadline(
    { deadline_at: '   ', auto_lock: 1 },
    { deadline: '' }
  );

  assert.equal(result.deadlineAt, null);
});

test('System Admin auto-lock preference disables deadline enforcement globally', () => {
  const result = resolveDepartmentEvaluationDeadline(
    { deadline_at: '2026-10-20 23:59:00', auto_lock: 1 },
    null,
    false
  );

  assert.equal(result.deadlineAt, '2026-10-20 23:59:00');
  assert.equal(result.autoLock, false);
});

test('deadline expiration comparison respects the exact configured timestamp', () => {
  const deadline = new Date('2026-10-09T12:00:00Z');

  assert.equal(isEvaluationDeadlineExpired(deadline, deadline.getTime() - 1), false);
  assert.equal(isEvaluationDeadlineExpired(deadline, deadline.getTime()), true);
});