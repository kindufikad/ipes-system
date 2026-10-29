const ROLE_ALIASES = {
  admin: 'systemadmin',
  system_admin: 'systemadmin',
  dept_head: 'depthead',
  department_head: 'depthead',
  head: 'depthead',
  dean: 'college_dean',
  academic_director: 'academic_directorate',
  directorate: 'academic_directorate',
  vice_president: 'academic_vice_president',
  teacher: 'instructor',
};

export const normalizeThemeRole = (value) => {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return ROLE_ALIASES[normalized] || normalized || 'student';
};

export const getDashboardThemeScope = (pathname, role) => {
  const path = String(pathname || '').toLowerCase();
  if (path.startsWith('/lab-assistant/')) return 'lab_assistant';
  if (path.startsWith('/student-dashboard')) return 'student';
  if (path.startsWith('/instructor-dashboard')) return 'instructor';
  if (path.startsWith('/dept-head/') || path.startsWith('/dept-head-dashboard') || path.startsWith('/depthead-dashboard')) return 'depthead';
  if (path.startsWith('/dean/')) return 'college_dean';
  if (path.startsWith('/directorate/')) return 'academic_directorate';
  if (path.startsWith('/vice-president-dashboard')) return 'academic_vice_president';
  if (path.startsWith('/admin/') || path.startsWith('/admin-dashboard') || path.startsWith('/system-admin-dashboard')) return 'systemadmin';
  return normalizeThemeRole(role);
};

export const getThemeStorageKey = ({ pathname, user, role }) => {
  const owner = user?.id ?? user?.user_id ?? user?.email ?? user?.username ?? 'anonymous';
  const scope = getDashboardThemeScope(pathname, role);
  return `ipes-theme-preference:${encodeURIComponent(String(owner))}:${scope}`;
};
