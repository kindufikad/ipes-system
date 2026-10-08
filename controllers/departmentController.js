const pool = require('../config/db');

const createDepartment = async (req, res) => {
  const collegeId = Number(req.body.collegeId ?? req.body.college_id);
  const departmentName = String(req.body.departmentName ?? req.body.department_name ?? req.body.name ?? '').trim();
  const departmentCode = String(req.body.departmentCode ?? req.body.department_code ?? req.body.code ?? '').trim().toUpperCase();

  if (!Number.isInteger(collegeId) || collegeId <= 0 || !departmentName || !departmentCode) {
    return res.status(400).json({ message: 'collegeId, departmentName, and departmentCode are required.' });
  }

  try {
    const [[college]] = await pool.query('SELECT id FROM colleges WHERE id = ? LIMIT 1', [collegeId]);
    if (!college) return res.status(400).json({ message: 'The selected college does not exist.' });

    const [result] = await pool.query(
      `INSERT INTO departments (college_id, department_name, department_code, name, code)
       VALUES (?, ?, ?, ?, ?)`,
      [collegeId, departmentName, departmentCode, departmentName, departmentCode]
    );
    return res.status(201).json({ id: result.insertId, collegeId, departmentName, departmentCode });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Department code already exists. Please use a unique department code.' });
    }
    console.error('Create department failed:', error);
    return res.status(500).json({ message: 'Unable to create department.' });
  }
};

const state = {
  registeredUsers: [
    { id: 1, fullName: 'Alemu Bekele', email: 'alemu@mu.edu.et', role: 'Student', collegeId: 'college-1', departmentId: 'dept-1', programId: 'program-2' },
    { id: 2, fullName: 'Dr. Selamawit Tadesse', email: 'selam@mu.edu.et', role: 'Instructor', collegeId: 'college-1', departmentId: 'dept-1', programId: 'program-2' },
  ],
  registeredCourses: [
    { id: 1, name: 'Software Engineering', code: 'SE401', collegeId: 'college-1', departmentId: 'dept-1', creditHours: '3' },
    { id: 2, name: 'Database Systems', code: 'CS402', collegeId: 'college-1', departmentId: 'dept-1', creditHours: '3' },
  ],
  evaluationSummaries: [
    { id: 1, instructorId: 2, instructorName: 'Dr. Selamawit Tadesse', courseCode: 'CS401', courseName: 'Software Engineering', averageScore: 4.6, completed: 18, pending: 2, status: 'On track' },
    { id: 2, instructorId: 3, instructorName: 'Prof. Bekele Dadi', courseCode: 'CS402', courseName: 'Database Systems', averageScore: 4.4, completed: 15, pending: 5, status: 'Needs follow-up' },
  ],
  departmentAssignments: [
    { id: 1, title: 'Finalize semester review pack', courseCode: 'SE401', courseName: 'Software Engineering', dueDate: '2026-08-18', priority: 'High', status: 'In progress', owner: 'Dept. Head', notes: 'Collect instructor evidence and finalize summary.', createdAt: '2026-08-04T08:00:00.000Z' },
    { id: 2, title: 'Confirm assessment schedule', courseCode: 'CS402', courseName: 'Database Systems', dueDate: '2026-08-12', priority: 'Medium', status: 'Planned', owner: 'Academic Office', notes: 'Coordinate with program coordinator.', createdAt: '2026-08-04T07:30:00.000Z' },
  ],
  departmentNotifications: [
    { id: 1, title: 'Course mapping updated', detail: 'Instructor assignment has been synchronized with the department roster.', createdAt: '2026-08-04T08:00:00.000Z' },
    { id: 2, title: 'Evaluation follow-up', detail: 'Two pending reviews need leadership attention before Friday.', createdAt: '2026-08-04T07:30:00.000Z' },
  ],
};

const getHealth = (req, res) => {
  res.json({ status: 'OK', message: 'IEPS Backend is running', timestamp: new Date().toISOString() });
};

const getUsers = (req, res) => res.json(state.registeredUsers);

const createUser = (req, res) => {
  const newUser = { id: Date.now(), ...req.body };
  state.registeredUsers = [newUser, ...state.registeredUsers];
  res.status(201).json(newUser);
};

const updateUser = (req, res) => {
  const userId = Number(req.params.id);
  state.registeredUsers = state.registeredUsers.map((user) => (user.id === userId ? { ...user, ...req.body } : user));
  const updatedUser = state.registeredUsers.find((user) => user.id === userId);
  res.json(updatedUser);
};

const deleteUser = (req, res) => {
  const userId = Number(req.params.id);
  state.registeredUsers = state.registeredUsers.filter((user) => user.id !== userId);
  res.json({ success: true });
};

const getCourses = (req, res) => res.json(state.registeredCourses);

const createCourse = (req, res) => {
  const newCourse = { id: Date.now(), ...req.body };
  state.registeredCourses = [newCourse, ...state.registeredCourses];
  res.status(201).json(newCourse);
};

const updateCourse = (req, res) => {
  const courseId = Number(req.params.id);
  state.registeredCourses = state.registeredCourses.map((course) => (course.id === courseId ? { ...course, ...req.body } : course));
  const updatedCourse = state.registeredCourses.find((course) => course.id === courseId);
  res.json(updatedCourse);
};

const deleteCourse = (req, res) => {
  const courseId = Number(req.params.id);
  state.registeredCourses = state.registeredCourses.filter((course) => course.id !== courseId);
  res.json({ success: true });
};

const getEvaluations = (req, res) => res.json(state.evaluationSummaries);

const getOverview = async (req, res) => {
  try {
    const departmentValue = req.user?.department_id ?? req.user?.departmentId ?? req.user?.department ?? req.query.department_id ?? req.query.department ?? req.body?.department_id ?? req.body?.department;
    if (!departmentValue) return res.status(400).json({ message: 'Department is required.' });

    const numericDepartmentId = Number(departmentValue);
    const [departments] = await pool.query(
      `SELECT id FROM departments
       WHERE id = ? OR LOWER(code) = LOWER(?) OR LOWER(name) = LOWER(?)
       LIMIT 1`,
      [Number.isInteger(numericDepartmentId) ? numericDepartmentId : 0, String(departmentValue), String(departmentValue)]
    );
    const departmentId = departments[0]?.id;
    if (!departmentId) return res.status(404).json({ message: 'Department was not found.' });

    const [[instructorCount], [studentCount], [courseCount], [assignmentCount], [labAssistantCount]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM instructors i JOIN users u ON u.id = i.user_id WHERE i.department_id = ? AND u.role IN ('instructor', 'dept_head') AND u.status = 'active'`, [departmentId]),
      pool.query(`SELECT COUNT(*) AS total FROM students s JOIN users u ON u.id = s.user_id WHERE s.department_id = ? AND u.role = 'student' AND u.status = 'active'`, [departmentId]),
      pool.query('SELECT COUNT(*) AS total FROM courses WHERE department_id = ?', [departmentId]),
      pool.query(`SELECT COUNT(*) AS total FROM course_assignments WHERE department_id = ? AND (is_published = 1 OR is_student_published = 1 OR is_peer_published = 1)`, [departmentId]),
      pool.query(`SELECT COUNT(*) AS total FROM lab_assistants WHERE department_id = ? AND status = 'active'`, [departmentId]),
    ]);

    return res.json({
      departmentId,
      totalInstructors: Number(instructorCount[0]?.total || 0),
      totalStudents: Number(studentCount[0]?.total || 0),
      totalCourses: Number(courseCount[0]?.total || 0),
      totalLabAssistants: Number(labAssistantCount[0]?.total || 0),
      activeAssignments: Number(assignmentCount[0]?.total || 0),
      pendingEvaluations: 0,
      avgScore: '0.0',
    });
  } catch (error) {
    console.error('Department overview stats failed:', error);
    return res.status(500).json({ message: 'Unable to load department overview stats.' });
  }
};

const getAssignments = (req, res) => {
  res.json({ assignments: state.departmentAssignments, notifications: state.departmentNotifications });
};

const createAssignment = (req, res) => {
  const assignment = { id: Date.now(), ...req.body };
  state.departmentAssignments = [assignment, ...state.departmentAssignments];
  state.departmentNotifications = [{ id: Date.now(), title: 'Assignment created', detail: `${assignment.title} was added to the assignment hub.`, createdAt: assignment.createdAt || new Date().toISOString() }, ...state.departmentNotifications].slice(0, 8);
  res.status(201).json(assignment);
};

const updateAssignment = (req, res) => {
  const assignmentId = Number(req.params.id);
  state.departmentAssignments = state.departmentAssignments.map((assignment) => (assignment.id === assignmentId ? { ...assignment, ...req.body } : assignment));
  const updatedAssignment = state.departmentAssignments.find((assignment) => assignment.id === assignmentId);
  res.json(updatedAssignment);
};

const deleteAssignment = (req, res) => {
  const assignmentId = Number(req.params.id);
  state.departmentAssignments = state.departmentAssignments.filter((assignment) => assignment.id !== assignmentId);
  res.json({ success: true });
};

module.exports = {
  createDepartment,
  getHealth,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getEvaluations,
  getOverview,
  getAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
};
