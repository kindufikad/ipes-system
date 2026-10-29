import test from 'node:test';
import assert from 'node:assert/strict';
import { getDashboardThemeScope, getThemeStorageKey } from './themePreference.js';

test('theme scope follows the active dashboard route', () => {
  assert.equal(getDashboardThemeScope('/lab-assistant/dashboard', 'lab_assistant'), 'lab_assistant');
  assert.equal(getDashboardThemeScope('/student-dashboard', 'lab_assistant'), 'student');
  assert.equal(getDashboardThemeScope('/dept-head/dashboard', 'dept_head'), 'depthead');
});

test('theme preference keys are isolated by account and dashboard', () => {
  const user = { id: 42 };
  const labAssistantKey = getThemeStorageKey({ pathname: '/lab-assistant/dashboard', user });
  const studentKey = getThemeStorageKey({ pathname: '/student-dashboard', user });
  const otherUserKey = getThemeStorageKey({ pathname: '/lab-assistant/dashboard', user: { id: 99 } });

  assert.notEqual(labAssistantKey, studentKey);
  assert.notEqual(labAssistantKey, otherUserKey);
});
