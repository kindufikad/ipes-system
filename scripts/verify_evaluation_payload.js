const http = require('http');
const mysql = require('mysql2/promise');

const login = async () => {
  const payload = JSON.stringify({ username: 'admin.k', password: '12345678' });
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          const token = body?.data?.token;
          if (!token) {
            reject(new Error('No token returned from login: ' + data));
            return;
          }
          resolve(token);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

const getJson = (path, token) => new Promise((resolve, reject) => {
  const req = http.request({
    hostname: 'localhost',
    port: 5000,
    path,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        resolve({ status: res.statusCode, body: JSON.parse(data) });
      } catch (error) {
        reject(new Error(`Invalid JSON from ${path}: ${data}`));
      }
    });
  });

  req.on('error', reject);
  req.end();
});

(async () => {
  const token = await login();
  const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'ipes_db',
    waitForConnections: true,
    connectionLimit: 5,
  });

  const [studentRows] = await pool.query(
    'SELECT id, dispatch_id, score, feedback, responses, status FROM student_evaluation_submissions ORDER BY id DESC LIMIT 5'
  );
  const [peerRows] = await pool.query(
    'SELECT id, peer_evaluation_id, score, strengths, suggestions, responses, status FROM peer_evaluation_submissions ORDER BY id DESC LIMIT 5'
  );
  const pending = await getJson('/api/student/evaluations/pending', token);

  console.log(JSON.stringify({
    tokenPresent: !!token,
    studentRows,
    peerRows,
    pendingResponseStatus: pending.status,
    pendingResponsePreview: Array.isArray(pending.body) ? pending.body.slice(0, 3) : pending.body,
  }, null, 2));

  await pool.end();
})();
