const http = require('http');

const baseUrl = new URL(process.env.API_BASE_URL || 'http://localhost:5000');
const defaultUserPassword = process.env.USER_DEFAULT_PASSWORD || process.env.DEFAULT_PASSWORD || '12345678';
const defaultAdminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin@123';

const accounts = [
  { role: 'admin', identifier: process.env.TEST_ADMIN_IDENTIFIER || 'admin.k@system.local', password: process.env.TEST_ADMIN_PASSWORD || defaultAdminPassword },
  { role: 'dept_head', identifier: process.env.TEST_DEPT_HEAD_IDENTIFIER || 'depthead@ipes.edu.et', password: process.env.TEST_DEPT_HEAD_PASSWORD || defaultUserPassword },
  { role: 'college_dean', identifier: process.env.TEST_DEAN_IDENTIFIER || 'melese', password: process.env.TEST_DEAN_PASSWORD || defaultUserPassword },
  { role: 'instructor', identifier: process.env.TEST_INSTRUCTOR_IDENTIFIER || 'instructor@ipes.edu.et', password: process.env.TEST_INSTRUCTOR_PASSWORD || defaultUserPassword },
  { role: 'student', identifier: process.env.TEST_STUDENT_IDENTIFIER || 'test.student1', password: process.env.TEST_STUDENT_PASSWORD || defaultUserPassword },
];

const request = (path, method, body, token) => new Promise((resolve, reject) => {
  const payload = body ? JSON.stringify(body) : '';
  const request = http.request({
    hostname: baseUrl.hostname,
    port: baseUrl.port || 80,
    path,
    method,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }, (response) => {
    let responseBody = '';
    response.on('data', (chunk) => { responseBody += chunk; });
    response.on('end', () => {
      let data;
      try { data = JSON.parse(responseBody); } catch { data = responseBody; }
      resolve({ statusCode: response.statusCode, data });
    });
  });
  request.on('error', reject);
  if (payload) request.write(payload);
  request.end();
});

const normalizeRole = (role) => role === 'department_head' ? 'dept_head' : role;

(async () => {
  let failures = 0;

  for (const account of accounts) {
    const login = await request('/api/auth/login', 'POST', {
      identifier: account.identifier,
      password: account.password,
    });
    const token = login.data?.data?.token;
    const actualRole = normalizeRole(login.data?.data?.user?.role);
    const loginPassed = login.statusCode === 200 && login.data?.success === true && Boolean(token) && actualRole === account.role;

    if (!loginPassed) {
      failures += 1;
      console.error(`[FAIL] ${account.role}: login ${login.statusCode}`, login.data?.message || login.data);
      continue;
    }

    const profile = await request('/api/auth/me', 'GET', null, token);
    const profileRole = normalizeRole(profile.data?.data?.role);
    const profilePassed = profile.statusCode === 200 && profile.data?.success === true && profileRole === account.role;
    console.log(`[${profilePassed ? 'PASS' : 'FAIL'}] ${account.role}: login ${login.statusCode}, /api/auth/me ${profile.statusCode}`);

    if (!profilePassed) {
      failures += 1;
      console.error(`       ${JSON.stringify(profile.data)}`);
    }
  }

  if (failures) {
    console.error(`\n${failures} role check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('\nAll five role login/profile checks passed.');
  }
})().catch((error) => {
  console.error('Verification could not complete:', error.message);
  process.exitCode = 1;
});
