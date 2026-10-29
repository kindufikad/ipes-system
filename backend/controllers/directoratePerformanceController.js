const pool = require('../config/db');
const { calculateDirectorateScore } = require('../utils/directorateScoreCalculator');

const EMPTY_PERFORMANCE = {
  totalScore: null,
  isComplete: false,
  status: 'Pending Complete Evaluation',
  weights: { peer: 20, vicePresident: 30, student: 50 },
  scoreScale: { availableWeight: 100, finalWeight: 100, isRescaled: false },
  components: {
    peer: { rawScore: null, weightedScore: 0, weight: 20, maxWeight: 20, count: 0 },
    vicePresident: { rawScore: null, weightedScore: 0, weight: 30, maxWeight: 30, count: 0 },
    student: { rawScore: null, weightedScore: 0, weight: 50, maxWeight: 50, count: 0, isNA: true },
  },
  vicePresidentEvaluation: { rawScore: null, weightedScore: 0, weight: 30, maxWeight: 30, count: 0 },
  details: { peer: [], vicePresident: [], student: [] },
};

const averageScore = (rows) => rows.length
  ? Number((rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length).toFixed(2))
  : null;

const parseJson = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const getDirectoratePerformance = async (req, res) => {
  const requesterRole = String(req.user?.role || '').trim().toLowerCase();
  const isVicePresident = requesterRole === 'academic_vice_president';
  const targetUserId = isVicePresident
    ? Number(req.query.academic_directorate_id || 0)
    : Number(req.user?.id || 0);

  if (!targetUserId) {
    return res.status(400).json({ message: 'An Academic Directorate candidate is required.' });
  }

  try {
    const [[activePeriod]] = await pool.query(
      `SELECT academic_year, semester
       FROM evaluation_periods
       WHERE LOWER(status) = 'active'
       ORDER BY id DESC
       LIMIT 1`
    );

    const [[profile]] = await pool.query(
      `SELECT u.id AS user_id, u.email, i.id AS instructor_id, i.employee_id,
        i.department_id, COALESCE(d.department_name, d.name) AS department_name,
        c.name AS college_name,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', i.first_name, i.last_name)), ''),
          NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email) AS name
       FROM users u
       LEFT JOIN instructors i ON i.user_id = u.id
       LEFT JOIN departments d ON d.id = i.department_id
       LEFT JOIN colleges c ON c.id = d.college_id
       WHERE u.id = ?
         AND LOWER(u.role) IN ('academic_directorate', 'academic_director', 'directorate')
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
       LIMIT 1`,
      [targetUserId]
    );
    if (!profile) return res.status(404).json({ message: 'Active Academic Directorate candidate not found.' });

    const instructorId = Number(profile.instructor_id || 0) || null;
    const [peerRows] = instructorId ? await pool.query(
      `SELECT pes.score, pes.strengths, pes.suggestions, pes.responses, pes.created_at
       FROM peer_evaluation_submissions pes
       INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
       WHERE pe.evaluatee_id = ?
         AND LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved')
       ORDER BY pes.created_at DESC`,
      [instructorId]
    ) : [[]];

    const [vicePresidentRows] = await pool.query(
      `SELECT evaluation.id AS evaluation_id, evaluation.score, evaluation.strengths, evaluation.weaknesses,
        evaluation.updated_at AS created_at, evaluator.email AS evaluator_email,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', evaluator.first_name, evaluator.last_name)), ''), evaluator.email) AS evaluator_name
       FROM vice_president_evaluations evaluation
       INNER JOIN users evaluator ON evaluator.id = evaluation.evaluator_id
       WHERE evaluation.academic_directorate_id = ?
         AND LOWER(COALESCE(evaluation.status, 'completed')) IN ('submitted', 'completed', 'approved')
         AND LOWER(evaluator.role) = 'academic_vice_president'
       ORDER BY evaluation.updated_at DESC`,
      [targetUserId]
    );

    const studentTermFilter = activePeriod
      ? ` AND (ca.academic_year = ? OR ca.academic_year IS NULL)
         AND (ca.semester = ? OR ca.semester IS NULL)
         AND (ed.academic_year = ? OR ed.academic_year IS NULL)
         AND (ed.semester = ? OR ed.semester IS NULL)`
      : '';
    const studentTermParams = activePeriod
      ? [activePeriod.academic_year, activePeriod.semester, activePeriod.academic_year, activePeriod.semester]
      : [];
    const [studentRows] = instructorId ? await pool.query(
      `SELECT ses.score, ses.feedback, ses.strengths, ses.improvements, ses.created_at
       FROM student_evaluation_submissions ses
       INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
       INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
       WHERE ca.instructor_id = ?
         AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved')
         ${studentTermFilter}
       ORDER BY ses.created_at DESC`,
      [instructorId, ...studentTermParams]
    ) : [[]];

    const assignmentTermFilter = activePeriod
      ? ' AND (academic_year = ? OR academic_year IS NULL) AND (semester = ? OR semester IS NULL)'
      : '';
    const assignmentTermParams = activePeriod ? [activePeriod.academic_year, activePeriod.semester] : [];
    const [[assignmentStats]] = instructorId ? await pool.query(
      `SELECT COUNT(*) AS assignment_count FROM course_assignments
       WHERE instructor_id = ? AND LOWER(COALESCE(status, 'assigned')) <> 'cancelled'
         ${assignmentTermFilter}`,
      [instructorId, ...assignmentTermParams]
    ) : [[{ assignment_count: 0 }]];

    const peerRaw = averageScore(peerRows);
    const vicePresidentRaw = averageScore(vicePresidentRows);
    const studentRaw = averageScore(studentRows);
    const studentApplicable = Number(assignmentStats?.assignment_count || 0) > 0;
    const isComplete = peerRows.length > 0 && vicePresidentRows.length > 0
      && (!studentApplicable || studentRows.length > 0);
    const calculatedScore = calculateDirectorateScore({
      peerRaw,
      vicePresidentRaw,
      studentRaw,
      studentApplicable,
    });
    const {
      peerWeighted,
      vicePresidentWeighted,
      studentWeighted,
      totalWeight,
      weightedSubtotal,
      totalScore: calculatedTotalScore,
    } = calculatedScore;
    const totalScore = isComplete ? calculatedTotalScore : null;

    const components = {
      peer: { rawScore: peerRaw, weightedScore: peerWeighted, weight: 20, maxWeight: 20, count: peerRows.length },
      vicePresident: { rawScore: vicePresidentRaw, weightedScore: vicePresidentWeighted, weight: 30, maxWeight: 30, count: vicePresidentRows.length },
      student: { rawScore: studentRaw, weightedScore: studentWeighted, weight: 50, maxWeight: 50, count: studentRows.length, isNA: !studentApplicable },
    };

    return res.json({
      director: {
        id: targetUserId,
        userId: targetUserId,
        instructorId,
        employeeId: profile.employee_id || null,
        department: profile.department_name || null,
        college: profile.college_name || null,
        name: profile.name || profile.email || 'Academic Directorate',
      },
      academicPeriod: {
        academicYear: activePeriod?.academic_year || null,
        semester: activePeriod?.semester || null,
      },
      evaluationId: vicePresidentRows[0]?.evaluation_id || null,
      totalScore,
      weightedSubtotal: Number(weightedSubtotal.toFixed(2)),
      scoreScale: {
        availableWeight: totalWeight,
        finalWeight: 100,
        isRescaled: !studentApplicable,
      },
      isComplete,
      status: isComplete ? 'Completed' : 'Pending Complete Evaluation',
      weights: { peer: 20, vicePresident: 30, student: 50 },
      components,
      vicePresidentEvaluation: components.vicePresident,
      details: {
        peer: peerRows.map((row) => ({ score: Number(row.score || 0), strengths: row.strengths || '', suggestions: row.suggestions || '', responses: parseJson(row.responses), createdAt: row.created_at })),
        vicePresident: vicePresidentRows.map((row) => ({ id: row.evaluation_id, score: Number(row.score || 0), evaluator: row.evaluator_name || row.evaluator_email || 'Vice President', strengths: row.strengths || '', weaknesses: row.weaknesses || '', createdAt: row.created_at })),
        student: studentRows.map((row) => ({ score: Number(row.score || 0), feedback: row.feedback || '', strengths: row.strengths || '', improvements: row.improvements || '', createdAt: row.created_at })),
      },
    });
  } catch (error) {
    console.error('Academic Directorate performance fetch failed:', error);
    return res.status(500).json({ ...EMPTY_PERFORMANCE, message: 'Unable to load Academic Directorate performance.' });
  }
};

module.exports = { getDirectoratePerformance };