require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const ALLOWED_ROLES = new Set([
  'student',
  'lab_assistant',
  'instructor',
  'dept_head',
  'college_dean',
  'academic_director',
  'academic_vice_president',
  'system_admin',
]);

const ROLE_LABELS = {
  student: 'Student',
  lab_assistant: 'Lab Assistant',
  instructor: 'Instructor',
  dept_head: 'Department Head',
  college_dean: 'College Dean',
  academic_director: 'Academic Director',
  academic_vice_president: 'Vice President',
  system_admin: 'System Admin',
};

const TOPIC_ROUTES = {
  support: 1,
  student: 2,
  instructor: 3,
  leadership: 4,
  admin: 5,
};

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || 'ipes_mekdela_bot').trim().replace(/^@/, '');
const BOT_URL = `https://t.me/${BOT_USERNAME}`;
const configuredWebUrl = process.env.IPES_WEB_URL || process.env.CLIENT_URL?.split(',')[0];
const IPES_WEB_URL = String(configuredWebUrl || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'))
  .trim()
  .replace(/\/+$/, '');
const TELEGRAM_PORT = Number(process.env.TELEGRAM_PORT || 4010);
const DASHBOARD_PATHS = {
  student: '/student-dashboard',
  instructor: '/instructor-dashboard',
  lab_assistant: '/lab-assistant/dashboard',
  dept_head: '/dept-head/dashboard#reports',
  department_head: '/dept-head/dashboard#reports',
  college_dean: '/dean/dashboard#reports',
  dean: '/dean/dashboard#reports',
  academic_director: '/directorate/dashboard#reports',
  academic_directorate: '/directorate/dashboard#reports',
  directorate: '/directorate/dashboard#reports',
  system_admin: '/admin/dashboard',
  systemadmin: '/admin/dashboard',
};

const getDashboardUrl = (role) => {
  const path = DASHBOARD_PATHS[String(role || '').trim().toLowerCase()];
  return path && IPES_WEB_URL ? `${IPES_WEB_URL}${path}` : null;
};

module.exports = {
  ALLOWED_ROLES,
  ROLE_LABELS,
  TOPIC_ROUTES,
  BOT_TOKEN,
  BOT_USERNAME,
  BOT_URL,
  IPES_WEB_URL,
  getDashboardUrl,
  TELEGRAM_PORT,
};
