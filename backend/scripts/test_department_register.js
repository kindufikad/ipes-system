const pool = require('./config/db');

const request = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error('Request failed');
    err.response = response;
    err.data = data;
    throw err;
  }
  return data;
};

(async () => {
  try {
    const loginResp = await request('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin.k', password: '12345678' }),
    });

    console.log('LOGIN', loginResp.status, loginResp.data);
    const token = loginResp.data?.data?.token || loginResp.data?.token || loginResp.data?.accessToken || loginResp.data?.data?.accessToken;
    console.log('TOKEN', token ? 'OK' : 'MISSING');
    if (!token) return;

    const uniqueSuffix = Date.now();
    const instructorUsername = `test.instr.med.${uniqueSuffix}`;
    const studentUsername = `test.stud.it.${uniqueSuffix}`;

    const instructorResp = await request('http://localhost:5000/api/auth/register-instructor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        first_name: 'TestInstr',
        last_name: 'Med',
        username: instructorUsername,
        employee_id: `EMP${uniqueSuffix}`,
        department: 'MED',
        program_type: 'Regular',
        registration_date: '2026-08-07',
        password: 'Password123',
      }),
    });
    console.log('INSTRUCTOR', JSON.stringify(instructorResp, null, 2));

    const studentResp = await request('http://localhost:5000/api/auth/register-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        first_name: 'TestStud',
        last_name: 'IT',
        username: studentUsername,
        student_id: `STU${uniqueSuffix}`,
        department_name: 'Department of Information Technology',
        semester: 'i',
        year_level: '1st Year (Freshman)',
        section: 'A',
        program_type: 'Regular',
        registration_date: '2026-08-07',
        password: 'Password123',
      }),
    });
    console.log('STUDENT', JSON.stringify(studentResp, null, 2));

    const [instrRows] = await pool.query(
      'SELECT u.id AS user_id, u.username, i.first_name, i.last_name, i.department_id, d.name AS department_name, d.code AS department_code FROM users u JOIN instructors i ON u.id=i.user_id LEFT JOIN departments d ON i.department_id=d.id WHERE u.username = ?',
      [instructorUsername]
    );
    console.log('CHECK INSTRUCTOR', JSON.stringify(instrRows, null, 2));

    const [studRows] = await pool.query(
      'SELECT u.id AS user_id, u.username, s.first_name, s.last_name, s.department_id, d.name AS department_name, d.code AS department_code FROM users u JOIN students s ON u.id=s.user_id LEFT JOIN departments d ON s.department_id=d.id WHERE u.username = ?',
      [studentUsername]
    );
    console.log('CHECK STUDENT', JSON.stringify(studRows, null, 2));
  } catch (error) {
    console.error('ERROR', error);
    console.error('STACK', error.stack);
    process.exit(1);
  } finally {
    pool.end().catch(() => {});
  }
})();
