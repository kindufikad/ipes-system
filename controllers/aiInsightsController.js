const pool = require('../config/db');
const { summarizeInstructorFeedback } = require('../services/aiInsightsService');

const ROLE_ALIASES = {
  student: 'student',
  lab_assistant: 'lab_assistant',
  labassistant: 'lab_assistant',
  instructor: 'instructor',
  dept_head: 'dept_head',
  department_head: 'dept_head',
  depthead: 'dept_head',
  dean: 'dean',
  college_dean: 'dean',
  academic_director: 'academic_director',
  academic_directorate: 'academic_director',
  directorate: 'academic_director',
  admin: 'admin',
  system_admin: 'admin',
  systemadmin: 'admin',
};
const SUPPORTED_ROLES = new Set(Object.values(ROLE_ALIASES));
const ENGLISH_STOP_WORDS = new Set('a an and are as at be by for from has have in is it of on or that the their this to was were with you your'.split(' '));
const AMHARIC_STOP_WORDS = new Set('እና ወይም ነው ናቸው እንደ ላይ ውስጥ ከ ለ በ ይህ ይህን እኔ እናንተ'.split(' '));
const KEYBOARD_SEQUENCES = ['asdf', 'fdsa', 'qwer', 'rewq', 'zxcv', 'poiuy', 'lkjh'];
const OFFENSIVE_WORDS = new Set(['ass', 'bastard', 'bitch', 'damn', 'idiot', 'lazy', 'moron', 'shit', 'stupid', 'worst', 'ደደብ', 'ሞኝ', 'ሰነፍ', 'አህያ', 'ቆሻሻ']);
const POSITIVE_FEEDBACK_TERMS = /\b(clear|helpful|excellent|good|great|effective|punctual|patient|organized|supportive|practical|በጣም|ጥሩ|ግልጽ|ውጤታማ)\b/iu;
const NEGATIVE_FEEDBACK_TERMS = /\b(confusing|late|unclear|改善|lack|lacks|insufficient|difficult|poor|weak|needs|improve|ችግር|ድክመት|እጥረት)\b/iu;

const normalizeRole = (role) => ROLE_ALIASES[String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_')];
const number = (value) => Number(value || 0);
const percentage = (value, total) => total ? Number((number(value) / number(total) * 100).toFixed(1)) : 0;
const response = (summary = [], recommendations = [], sentiment = { positive: 0, neutral: 0, negative: 0 }, alert, metrics = {}) => {
  const { averageScore = 0, topFeedbackKeywords = [], feedbackCount = 0, ...dynamicMetrics } = metrics;
  return {
    summary: summary.filter(Boolean).slice(0, 8),
    sentiment,
    recommendations: recommendations.slice(0, 6),
    ...(alert ? { alert } : {}),
    ...dynamicMetrics,
    metrics: dynamicMetrics,
    averageScore: number(averageScore),
    topFeedbackKeywords: Array.isArray(topFeedbackKeywords) ? topFeedbackKeywords.slice(0, 3) : [],
    feedbackCount: number(feedbackCount),
  };
};
const recommendation = (title, description, actionLabel, actionType) => ({ title, description, actionLabel, actionType });

const getFeedbackSignals = (rows = [], fallbackScore = 0) => {
  const feedbackRows = rows.filter((row) => [row.feedback, row.strengths, row.improvements, row.suggestions].some(Boolean));
  let positive = 0;
  let negative = 0;
  feedbackRows.forEach((row) => {
    const text = [row.feedback, row.strengths, row.improvements, row.suggestions].filter(Boolean).join(' ');
    if (POSITIVE_FEEDBACK_TERMS.test(text)) positive += 1;
    else if (NEGATIVE_FEEDBACK_TERMS.test(text)) negative += 1;
  });
  const neutral = Math.max(0, feedbackRows.length - positive - negative);
  const total = positive + neutral + negative;
  const sentiment = total
    ? { positive: percentage(positive, total), neutral: percentage(neutral, total), negative: percentage(negative, total) }
    : { positive: 0, neutral: 0, negative: 0 };
  const scores = rows.map((row) => Number(row.score)).filter(Number.isFinite);
  const averageScore = scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)) : Number(number(fallbackScore).toFixed(1));
  const topFeedbackKeywords = extractFeedbackPhrases(feedbackRows);
  return { sentiment, averageScore, topFeedbackKeywords, feedbackCount: feedbackRows.length };
};

const isNoiseToken = (token) => {
  const normalized = token.toLowerCase();
  if (ENGLISH_STOP_WORDS.has(normalized) || AMHARIC_STOP_WORDS.has(normalized)) return true;
  if (/(.)\1{3,}/u.test(normalized)) return true;
  if (KEYBOARD_SEQUENCES.some((sequence) => normalized.includes(sequence))) return true;
  return normalized.length > 7 && !/[aeiouy\u1200-\u135A]/iu.test(normalized);
};

const normalizeKeywordToken = (token) => {
  const normalized = token.toLowerCase();
  if (!/^[a-z\u1200-\u137F]{3,}$/iu.test(normalized) || isNoiseToken(normalized) || OFFENSIVE_WORDS.has(normalized)) return '';
  if (normalized.endsWith('ies')) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith('ing') && normalized.length > 6) return normalized.slice(0, -3);
  if (normalized.endsWith('s') && normalized.length > 4) return normalized.slice(0, -1);
  return normalized;
};

const extractFeedbackPhrases = (rows) => {
  const phraseCounts = new Map();
  rows.forEach((row) => {
    const text = [row.feedback, row.strengths, row.improvements].filter(Boolean).join('. ');
    text.split(/[.!?;\n]+/).forEach((sentence) => {
      const tokens = sentence.match(/[A-Za-z\u1200-\u137F]+/gu) || [];
      const meaningful = tokens.map(normalizeKeywordToken).filter(Boolean);
      for (let index = 0; index <= meaningful.length - 2; index += 1) {
        for (let length = 2; length <= 4 && index + length <= meaningful.length; length += 1) {
          const phrase = meaningful.slice(index, index + length).join(' ');
          phraseCounts.set(phrase, number(phraseCounts.get(phrase)) + 1);
        }
      }
    });
  });

  const ranked = [...phraseCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || right[0].split(' ').length - left[0].split(' ').length);
  const selected = [];
  ranked.forEach(([phrase]) => {
    if (selected.length >= 3 || selected.some((existing) => existing.includes(phrase) || phrase.includes(existing))) return;
    selected.push(phrase);
  });
  return selected;
};

const getDepartmentId = async (value) => {
  if (!value) return null;
  const candidate = String(value).trim();
  const [[row]] = await pool.query(
    'SELECT id FROM departments WHERE id = ? OR LOWER(name) = LOWER(?) OR LOWER(code) = LOWER(?) LIMIT 1',
    [Number(candidate) || 0, candidate, candidate]
  );
  return row?.id || null;
};

const getScopedContext = async (req, role) => {
  const authenticatedUserId = number(req.user?.id || req.user?.user_id);
  const requestedUserId = number(req.query.userId);
  const userId = role === 'admin' && requestedUserId ? requestedUserId : authenticatedUserId;
  const requestedDepartment = role === 'admin' || role === 'academic_director'
    ? (req.query.departmentId || req.query.department || req.user?.department_id || req.user?.department)
    : (req.user?.department_id || req.user?.department);
  const departmentId = await getDepartmentId(requestedDepartment);
  let collegeId = 0;
  if (role === 'dean') {
    collegeId = number(req.user?.college_id);
    if (!collegeId) {
      const [[college]] = await pool.query(`
        SELECT d.college_id
        FROM instructors i
        INNER JOIN departments d ON d.id = i.department_id
        WHERE i.user_id = ?
        LIMIT 1
      `, [authenticatedUserId]);
      collegeId = number(college?.college_id);
    }
  }
  return { userId, departmentId, collegeId };
};

const getStudentInsights = async ({ userId }) => {
  const [[stats]] = await pool.query(`
    SELECT
      COUNT(DISTINCT ed.id) AS total_assigned,
      COUNT(DISTINCT CASE WHEN ses.id IS NOT NULL THEN ed.id END) AS completed_count,
      COUNT(DISTINCT CASE WHEN ed.id IS NOT NULL AND ses.id IS NULL THEN ed.id END) AS pending_count,
      COUNT(DISTINCT CASE WHEN ses.id IS NULL AND STR_TO_DATE(ed.deadline, '%Y-%m-%d %H:%i:%s') <= DATE_ADD(NOW(), INTERVAL 7 DAY) THEN ed.id END) AS pending_deadlines,
      MIN(CASE WHEN ses.id IS NULL THEN STR_TO_DATE(ed.deadline, '%Y-%m-%d %H:%i:%s') END) AS next_deadline,
      AVG(ses.score) AS average_rating_given
    FROM students s
    LEFT JOIN evaluation_dispatches ed ON ed.student_id = s.id
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
      AND LOWER(COALESCE(ed.status, 'pending')) <> 'closed'
    LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
    WHERE s.user_id = ?
  `, [userId]);
  const [feedbackRows] = await pool.query(`
    SELECT ses.score, ses.feedback, ses.strengths, ses.improvements
    FROM students s
    INNER JOIN evaluation_dispatches ed ON ed.student_id = s.id
    INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
    WHERE s.user_id = ?
    ORDER BY ses.created_at DESC
    LIMIT 100
  `, [userId]);
  const totalAssigned = number(stats?.total_assigned);
  const completedCount = number(stats?.completed_count);
  const completionRate = percentage(completedCount, totalAssigned);
  const signals = getFeedbackSignals(feedbackRows, stats?.average_rating_given);
  const pending = number(stats?.pending_count);
  const summary = pending
    ? [`${pending} evaluation${pending === 1 ? '' : 's'} pending.`, stats.next_deadline ? `Next evaluation deadline: ${stats.next_deadline}.` : 'Review pending evaluations before their deadlines.']
    : ['No pending course evaluations were found.'];
  return response(summary, [
    recommendation('Review pending evaluations', 'Complete the next available course evaluation before its deadline.', 'View Evaluations', 'VIEW_PENDING_EVALUATIONS'),
    recommendation('Improve feedback detail', 'Mention a lecture example, assignment, or classroom activity in written feedback.', 'Review Feedback Tip', 'REVIEW_FEEDBACK_TIP'),
  ], signals.sentiment, undefined, {
    averageScore: stats?.average_rating_given,
    averageRatingGiven: number(stats?.average_rating_given),
    completionRate,
    totalRequired: totalAssigned,
    totalSubmitted: completedCount,
    pendingCount: pending,
    pendingDeadlines: number(stats?.pending_deadlines),
    nextDeadline: stats?.next_deadline || null,
    topFeedbackKeywords: signals.topFeedbackKeywords,
    feedbackCount: signals.feedbackCount,
  });
};

const getLabAssistantInsights = async ({ userId }) => {
  const [[stats]] = await pool.query(`
    SELECT AVG(ses.score) AS average_rating,
      AVG(CASE WHEN LOWER(COALESCE(ed.course_name, '')) REGEXP 'safety|equipment|laboratory|lab' THEN ses.score END) AS lab_rating,
      COUNT(ses.id) AS completed_reviews
    FROM lab_assistants la
    LEFT JOIN evaluation_dispatches ed ON ed.target_user_id = la.id AND LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant'
    LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'published')
    WHERE la.user_id = ?
  `, [userId]);
  const [feedbackRows] = await pool.query(`
    SELECT ses.score, ses.feedback, ses.strengths, ses.improvements
    FROM lab_assistants la
    LEFT JOIN evaluation_dispatches ed ON ed.target_user_id = la.id AND LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant'
    LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
    WHERE la.user_id = ? ORDER BY ses.created_at DESC LIMIT 200
  `, [userId]);
  const average = number(stats?.average_rating);
  const labRating = number(stats?.lab_rating) || average;
  const signals = getFeedbackSignals(feedbackRows, labRating);
  return response([
    `Average lab evaluation rating: ${labRating.toFixed(1)}%.`,
    stats?.completed_reviews ? `${number(stats.completed_reviews)} completed lab feedback submission${number(stats.completed_reviews) === 1 ? '' : 's'} analyzed.` : 'No completed lab feedback is available yet.',
    'Attendance averages are unavailable because IPES has no attendance table in the current schema.',
  ], [
    recommendation('Review safety feedback', 'Inspect safety and equipment comments for recurring issues.', 'Inspect Feedback', 'REVIEW_LAB_FEEDBACK'),
    recommendation('Check lab attendance', 'Connect attendance records when the lab attendance module is enabled.', 'View Attendance', 'VIEW_LAB_ATTENDANCE'),
  ], signals.sentiment, undefined, signals);
};

const getInstructorInsights = async ({ userId }) => {
  const [[instructor]] = await pool.query(`
    SELECT i.id, i.user_id, u.email
    FROM instructors i
    INNER JOIN users u ON u.id = i.user_id
    WHERE i.user_id = ?
    LIMIT 1
  `, [userId]);
  if (!instructor) throw new Error('Instructor profile was not found.');

  const [emailColumns] = await pool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'course_assignments'
      AND COLUMN_NAME = 'instructor_email'
    LIMIT 1
  `);
  const assignmentPredicates = [
    'ca.instructor_id = ?',
    "(ca.lab_assistant_id IS NULL AND LOWER(COALESCE(ca.assigned_role, 'instructor')) <> 'lab_assistant' AND ca.staff_id IN (?, ?))",
  ];
  const assignmentParams = [instructor.id, instructor.id, instructor.user_id];
  if (emailColumns.length && instructor.email) {
    assignmentPredicates.push('LOWER(TRIM(ca.instructor_email)) = LOWER(TRIM(?))');
    assignmentParams.push(instructor.email);
  }
  const assignmentFilter = `(${assignmentPredicates.join(' OR ')})`;
  const activeAssignmentFilter = `
    ${assignmentFilter}
    AND ca.lab_assistant_id IS NULL
    AND LOWER(COALESCE(ca.assigned_role, 'instructor')) <> 'lab_assistant'
    AND LOWER(COALESCE(ca.status, 'assigned')) NOT IN ('cancelled', 'inactive', 'unassigned')
  `;

  const [expectedRows] = await pool.query(`
    SELECT COUNT(DISTINCT CONCAT(ca.id, ':', s.id)) AS expected_students
    FROM course_assignments ca
    INNER JOIN students s ON ca.student_id = s.id OR (
      ca.student_id IS NULL
      AND s.department_id = ca.department_id
      AND LOWER(COALESCE(s.year_level, '')) = LOWER(COALESCE(ca.year_level, ''))
      AND LOWER(COALESCE(s.section, '')) = LOWER(COALESCE(ca.section, ''))
      AND (ca.program_type IS NULL OR LOWER(COALESCE(s.program_type, '')) = LOWER(ca.program_type))
    )
    WHERE ${activeAssignmentFilter}
  `, assignmentParams);
  const [dispatchCountRows] = await pool.query(`
    SELECT COUNT(DISTINCT ed.id) AS expected_dispatches
    FROM course_assignments ca
    INNER JOIN evaluation_dispatches ed ON ed.assignment_id = ca.id
    WHERE ${activeAssignmentFilter}
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
      AND LOWER(COALESCE(ed.status, 'pending')) <> 'closed'
  `, assignmentParams);
  const [studentRows] = await pool.query(`
    SELECT ca.id AS assignment_id, ed.id AS dispatch_id,
      COALESCE(ed.student_id, ses.student_id, ca.student_id) AS student_id,
      ses.score, ses.feedback, ses.strengths, ses.improvements
    FROM course_assignments ca
    INNER JOIN evaluation_dispatches ed ON ed.assignment_id = ca.id
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
    INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
    WHERE ${activeAssignmentFilter}
    ORDER BY ses.created_at DESC
  `, assignmentParams);
  const [deptHeadRows] = await pool.query(`
    SELECT dhe.total_score AS score, dhe.feedback, dhe.strengths, dhe.weaknesses
    FROM dept_head_evaluations dhe
    WHERE (dhe.instructor_id = ? OR dhe.evaluatee_id = ?)
      AND LOWER(COALESCE(dhe.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
      AND LOWER(COALESCE(dhe.target_role, 'instructor')) IN ('instructor', 'dept_head', 'department_head', 'depthead')
    ORDER BY dhe.updated_at DESC
  `, [instructor.id, instructor.id]);
  const [peerRows] = await pool.query(`
    SELECT pes.score, pes.strengths, pes.suggestions
    FROM peer_evaluation_submissions pes
    INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
    WHERE (pe.evaluatee_id = ? OR pes.evaluatee_id = ?)
      AND LOWER(COALESCE(pes.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
    ORDER BY pes.created_at DESC
  `, [instructor.id, instructor.id]);

  const average = (rows) => rows.length
    ? rows.reduce((sum, row) => sum + number(row.score), 0) / rows.length
    : 0;
  const studentScore = Number(average(studentRows).toFixed(2));
  const deptHeadScoreValue = average(deptHeadRows);
  const deptHeadScore = Number((deptHeadScoreValue > 0 && deptHeadScoreValue <= 30
    ? deptHeadScoreValue / 30 * 100
    : deptHeadScoreValue).toFixed(2));
  const peerScore = Number(average(peerRows).toFixed(2));
  const overallWeightedScore = Number((studentScore * 0.5 + deptHeadScore * 0.3 + peerScore * 0.2).toFixed(2));
  const completedPairs = new Set(studentRows.map((row) => `${row.assignment_id}:${row.student_id || row.dispatch_id}`));
  const completedCount = completedPairs.size;
  const rosterExpected = number(expectedRows[0]?.expected_students);
  const totalRequired = rosterExpected || number(dispatchCountRows[0]?.expected_dispatches);
  const completionRate = percentage(completedCount, totalRequired);

  const studentFeedbackRows = studentRows.filter((row) => [row.feedback, row.strengths, row.improvements].some(Boolean));
  const positiveRows = studentFeedbackRows.filter((row) => POSITIVE_FEEDBACK_TERMS.test([row.feedback, row.strengths, row.improvements].join(' ')));
  const constructiveRows = studentFeedbackRows.filter((row) => NEGATIVE_FEEDBACK_TERMS.test([row.feedback, row.strengths, row.improvements].join(' ')));
  const positiveKeywords = extractFeedbackPhrases(positiveRows);
  const constructiveKeywords = extractFeedbackPhrases(constructiveRows);
  const topKeywords = [...new Set([...positiveKeywords, ...constructiveKeywords, ...extractFeedbackPhrases(studentFeedbackRows)])].slice(0, 3);
  const allFeedbackRows = [
    ...studentRows,
    ...deptHeadRows.map((row) => ({ ...row, improvements: row.weaknesses })),
    ...peerRows.map((row) => ({ ...row, feedback: row.suggestions })),
  ];
  const signals = getFeedbackSignals(allFeedbackRows);
  const feedbackComments = allFeedbackRows.flatMap((row) => [row.feedback, row.strengths, row.improvements, row.suggestions])
    .map((comment) => String(comment || '').trim())
    .filter(Boolean);
  const feedbackSummary = await summarizeInstructorFeedback({ studentRows, peerRows, deptHeadRows });
  const aiObservations = [
    `Average student evaluation score is ${studentScore.toFixed(2)}%.`,
    `Overall weighted evaluation score is ${overallWeightedScore.toFixed(2)}%.`,
    `Student evaluation completion is at ${completionRate.toFixed(1)}% (${completedCount} of ${totalRequired} required).`,
    ...(feedbackSummary.summary ? [`Qualitative feedback summary: ${feedbackSummary.summary}`] : []),
    topKeywords.length
      ? `Top feedback keywords highlight ${topKeywords.join(', ')}.`
      : 'No recurring written student feedback keywords were found yet.',
  ];
  const recommendedActions = [
    {
      title: 'Review Student Feedback',
      description: 'Explore written comments and recurring feedback themes.',
      actionLabel: 'View Feedback',
      actionType: 'VIEW_FEEDBACK',
      link: '#qualitative-feedback',
    },
    {
      title: 'Set a Teaching Goal',
      description: 'Choose one measurable improvement to revisit in the next evaluation cycle.',
      actionLabel: 'Set a Goal',
      actionType: 'SET_GOAL',
      link: '/instructor/goals',
    },
  ];
  if (completionRate < 100) {
    recommendedActions.push({
      title: 'Remind Remaining Students',
      description: 'Remind remaining students to complete evaluation before deadline.',
      actionLabel: 'View Pending Evaluations',
      actionType: 'VIEW_PENDING_EVALUATIONS',
      link: '#pending-evaluations',
    });
  }
  if (studentScore < 75) {
    recommendedActions.push({
      title: 'Improve Course Delivery',
      description: 'Focus on course delivery engagement and clarify continuous assessment guidelines.',
      actionLabel: 'Set a Teaching Goal',
      actionType: 'SET_GOAL',
      link: '/instructor/goals',
    });
  }
  if (peerScore > 90) {
    recommendedActions.push({
      title: 'Share Peer Practices',
      description: 'Maintain peer collaboration and share best pedagogical practices with department colleagues.',
      actionLabel: 'Review Peer Feedback',
      actionType: 'VIEW_FEEDBACK',
      link: '#qualitative-feedback',
    });
  }

  return {
    averageScore: studentScore,
    studentScore,
    deptHeadScore,
    peerScore,
    overallWeightedScore,
    completionRate,
    completedCount,
    totalSubmitted: completedCount,
    totalRequired,
    topKeywords,
    topFeedbackKeywords: topKeywords,
    positiveKeywords,
    constructiveKeywords,
    feedbackCount: feedbackComments.length,
    feedbackComments,
    qualitativeFeedback: feedbackComments.join('\n'),
    qualitativeSummary: feedbackSummary.summary,
    qualitativeSummarySource: feedbackSummary.source,
    sentiment: signals.sentiment,
    aiObservations,
    summary: aiObservations,
    recommendedActions,
    recommendations: recommendedActions,
  };
};

const getInstructorAiInsights = async (req, res) => {
  const userId = number(req.user?.id || req.user?.user_id);
  if (!userId) return res.status(401).json({ success: false, message: 'Authentication is required.' });
  try {
    return res.json(await getInstructorInsights({ userId }));
  } catch (error) {
    console.error('Instructor AI insights error:', error);
    return res.status(500).json({ success: false, message: 'Unable to generate instructor AI insights.' });
  }
};

const getDeptHeadInsights = async ({ departmentId }) => {
  const [[studentStats]] = await pool.query(`
    SELECT COUNT(DISTINCT ed.id) AS required_count,
      COUNT(DISTINCT CASE WHEN ses.id IS NOT NULL THEN ed.id END) AS completed_count,
      AVG(ses.score) AS average_score
    FROM evaluation_dispatches ed
    LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
    WHERE ed.department_id = ?
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
      AND LOWER(COALESCE(ed.status, 'pending')) <> 'closed'
  `, [departmentId]);
  const [[peerStats]] = await pool.query(`
    SELECT COUNT(DISTINCT pe.id) AS required_count,
      COUNT(DISTINCT CASE WHEN pes.id IS NOT NULL OR LOWER(COALESCE(pe.status, 'pending')) IN ('submitted', 'completed', 'approved') THEN pe.id END) AS completed_count,
      AVG(pes.score) AS average_score
    FROM peer_evaluations pe
    INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
    LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
      AND LOWER(COALESCE(pes.status, 'pending')) IN ('submitted', 'completed', 'approved')
    WHERE evaluator.department_id = ?
  `, [departmentId]);
  const [[departmentScope]] = await pool.query(
    'SELECT college_id FROM departments WHERE id = ? LIMIT 1',
    [departmentId]
  );
  const [[collegeStats]] = await pool.query(`
    SELECT AVG(ses.score) AS college_average
    FROM student_evaluation_submissions ses
    INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
    INNER JOIN departments d ON d.id = ed.department_id
    WHERE d.college_id = ?
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
  `, [number(departmentScope?.college_id)]);
  const [feedbackRows] = await pool.query(`
    SELECT ses.score, ses.feedback, ses.strengths, ses.improvements
    FROM evaluation_dispatches ed
    INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
    WHERE ed.department_id = ?
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
    ORDER BY ses.created_at DESC
    LIMIT 500
  `, [departmentId]);
  const [anomalyRows] = await pool.query(`
    SELECT ed.assignment_id, MAX(ed.course_name) AS course_name,
      TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS instructor_name,
      COUNT(DISTINCT ses.id) AS response_count,
      AVG(ses.score) AS average_score,
      VARIANCE(ses.score) AS score_variance
    FROM evaluation_dispatches ed
    INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
    LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
    LEFT JOIN instructors i ON i.id = ca.instructor_id
    WHERE ed.department_id = ?
      AND ed.assignment_id IS NOT NULL
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
    GROUP BY ed.assignment_id, i.first_name, i.last_name
    HAVING COUNT(DISTINCT ses.id) > 1 AND VARIANCE(ses.score) = 0
    ORDER BY response_count DESC
    LIMIT 100
  `, [departmentId]);

  const studentRequired = number(studentStats?.required_count);
  const studentCompleted = number(studentStats?.completed_count);
  const peerRequired = number(peerStats?.required_count);
  const peerCompleted = number(peerStats?.completed_count);
  const totalRequired = studentRequired + peerRequired;
  const totalSubmitted = studentCompleted + peerCompleted;
  const completionRate = percentage(totalSubmitted, totalRequired);
  const averageScore = number(studentStats?.average_score || peerStats?.average_score);
  const collegeAverage = number(collegeStats?.college_average);
  const benchmarkDifference = Number((averageScore - collegeAverage).toFixed(1));
  const benchmark = {
    departmentAverage: averageScore,
    collegeAverage,
    difference: benchmarkDifference,
    comparisonLabel: benchmarkDifference >= 0 ? 'Above college benchmark' : 'Below college benchmark',
  };
  const anomalies = anomalyRows.map((row) => ({
    assignmentId: row.assignment_id,
    courseName: row.course_name || 'Assigned course',
    instructorName: row.instructor_name || 'Instructor',
    responseCount: number(row.response_count),
    score: number(row.average_score),
    scoreVariance: number(row.score_variance),
    reason: `All ${number(row.response_count)} submitted scores are ${number(row.average_score).toFixed(1)}%.`,
  }));
  const signals = getFeedbackSignals(feedbackRows, averageScore);
  const summary = [
    `Department evaluation completion rate: ${completionRate}%.`,
    `Average department evaluation score: ${averageScore.toFixed(1)}%.`,
    anomalies.length ? `${anomalies.length} uniform score cluster${anomalies.length === 1 ? '' : 's'} need review.` : 'No uniform score clusters were detected.',
  ];
  if (!feedbackRows.length) summary.push('Awaiting written evaluation feedback.');

  return response(summary, [
    recommendation('Review completion gaps', 'Identify students with pending evaluations and send targeted reminders.', 'View Pending', 'VIEW_PENDING'),
    recommendation('Inspect score clustering', 'Filter submitted evaluations to uniform score clusters.', 'Inspect Anomalies', 'INSPECT_ANOMALIES'),
    recommendation('Send automated reminders', 'Send email and Telegram reminders to pending evaluators in your department.', 'Send Reminders', 'SEND_REMINDERS'),
    recommendation('Export summary report', 'Download the current metrics and feedback summary as a CSV report.', 'Export Summary', 'EXPORT_SUMMARY'),
  ], signals.sentiment, anomalies.length ? `${anomalies.length} Uniform Score Pattern${anomalies.length === 1 ? '' : 's'} Flagged` : undefined, {
    ...signals,
    averageScore,
    completionRate,
    totalRequired,
    totalSubmitted,
    pendingCount: Math.max(totalRequired - totalSubmitted, 0),
    studentRequired,
    studentCompleted,
    peerRequired,
    peerCompleted,
    benchmark,
    anomaliesCount: anomalies.length,
    anomalies,
  });
};

const getDeptHeadAiInsights = async (req, res) => {
  const departmentId = Number(req.user?.department_id || req.user?.departmentId || req.query.departmentId || 0);
  const academicYear = String(req.query.academicYear || req.query.academic_year || '').trim();
  const semester = String(req.query.semester || '').trim();
  if (!departmentId) return res.status(403).json({ success: false, message: 'Your department is not defined.' });

  try {
    const [[counts]] = await pool.query(`
      SELECT COUNT(DISTINCT ed.id) AS total_required,
             COUNT(DISTINCT CASE WHEN ses.id IS NOT NULL THEN ed.id END) AS total_submitted
      FROM evaluation_dispatches ed
      LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
      LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
        AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
      WHERE ed.department_id = ?
        AND LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
        AND (? = '' OR LOWER(COALESCE(ed.academic_year, ca.academic_year, '')) = LOWER(?) OR LOWER(COALESCE(ed.academic_year, ca.academic_year, '')) LIKE CONCAT('%', LOWER(?), '%'))
        AND (? = '' OR LOWER(REPLACE(COALESCE(ed.semester, ca.semester, ''), 'semester', '')) = LOWER(REPLACE(?, 'semester', '')))
    `, [departmentId, academicYear, academicYear, academicYear, semester, semester]);

    const [rows] = await pool.query(`
      SELECT ses.id, ses.score, ses.feedback, ses.strengths, ses.improvements, ses.responses,
        s.student_id, TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS student_name,
        ed.id AS dispatch_id, ed.course_name, ed.assignment_id,
        TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS instructor_name
      FROM evaluation_dispatches ed
      LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
      INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
        AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
      LEFT JOIN students s ON s.id = ed.student_id
      LEFT JOIN instructors i ON i.id = ca.instructor_id
      WHERE ed.department_id = ?
        AND LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
        AND (? = '' OR LOWER(COALESCE(ed.academic_year, ca.academic_year, '')) = LOWER(?) OR LOWER(COALESCE(ed.academic_year, ca.academic_year, '')) LIKE CONCAT('%', LOWER(?), '%'))
        AND (? = '' OR LOWER(REPLACE(COALESCE(ed.semester, ca.semester, ''), 'semester', '')) = LOWER(REPLACE(?, 'semester', '')))
      ORDER BY ses.created_at DESC
      LIMIT 1000
    `, [departmentId, academicYear, academicYear, academicYear, semester, semester]);

    const [collegeRows] = await pool.query(`
      SELECT AVG(CAST(ses.score AS DECIMAL(10,2))) AS college_average
      FROM student_evaluation_submissions ses
      INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
      WHERE LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
    `);

    const signals = getFeedbackSignals(rows);
    const anomalyRows = rows.filter((row) => {
      let parsed = row.responses;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { parsed = null; }
      }
      const values = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' ? Object.values(parsed).flatMap((value) => (Array.isArray(value) ? value : [value])) : [];
      const numericValues = values.map(Number).filter(Number.isFinite);
      return numericValues.length > 1 && numericValues.every((value) => value === numericValues[0]);
    }).map((row) => ({
      id: row.id,
      dispatchId: row.dispatch_id,
      studentId: row.student_id,
      studentName: row.student_name || 'Student',
      instructorName: row.instructor_name || 'Instructor',
      courseName: row.course_name || 'Assigned course',
      score: Number(row.score || 0),
      reason: 'All rubric scores are identical (variance = 0).',
    }));

    const totalRequired = number(counts?.total_required);
    const totalSubmitted = number(counts?.total_submitted);
    const averageScore = rows.length ? Number((rows.reduce((sum, row) => sum + number(row.score), 0) / rows.length).toFixed(1)) : 0;
    const completionRate = percentage(totalSubmitted, totalRequired);
    const collegeAverage = number(collegeRows?.[0]?.college_average || 0);
    const benchmarkDifference = Number((averageScore - collegeAverage).toFixed(1));
    const benchmark = {
      departmentAverage: averageScore,
      collegeAverage,
      difference: benchmarkDifference,
      comparisonLabel: benchmarkDifference >= 0 ? 'Above college benchmark' : 'Below college benchmark',
    };

    let observations = [];
    if (completionRate < 50) {
      observations = ['Evaluation participation is low. Reminders recommended.'];
    } else if (completionRate >= 80) {
      observations = ['High evaluation engagement detected across courses.'];
    } else {
      observations = ['Department engagement is moderate and should be reinforced with targeted reminders.'];
    }

    if (averageScore > 0) {
      observations.push(`Average submitted student evaluation score: ${averageScore.toFixed(1)}%.`);
    }

    if (anomalyRows.length) {
      observations.push(`${anomalyRows.length} score-clustering anomaly${anomalyRows.length === 1 ? '' : 's'} detected and should be reviewed.`);
    } else {
      observations.push('No score-clustering anomalies were detected.');
    }

    if (!rows.length) {
      observations = ['Awaiting evaluation submissions for the current semester.'];
    }

    const recommendations = [
      recommendation('Review completion gaps', 'Identify students with pending evaluations and send targeted reminders.', 'View Pending', 'VIEW_PENDING'),
      recommendation('Inspect score clustering', 'Review submissions where every rubric score is identical.', 'Inspect Anomalies', 'INSPECT_ANOMALIES'),
      recommendation('Send automated reminders', 'Broadcast a reminder to all pending students and peer evaluators in one click.', 'Send Reminders', 'SEND_REMINDERS'),
      recommendation('Export summary report', 'Download the department AI insights summary for review or leadership sharing.', 'Export Summary', 'EXPORT_SUMMARY'),
    ];

    return res.json({ success: true, data: {
      averageScore,
      completionRate,
      totalRequired,
      totalSubmitted,
      topFeedbackKeywords: signals.topFeedbackKeywords,
      keywords: signals.topFeedbackKeywords,
      sentiment: signals.sentiment,
      anomaliesCount: anomalyRows.length,
      anomalies: anomalyRows,
      observations,
      summary: observations,
      benchmark,
      recommendations,
    }});
  } catch (error) {
    console.error('Department-head AI insights error:', error);
    return res.status(500).json({ success: false, message: 'Unable to generate department-head AI insights.' });
  }
};

const getInstitutionalEvaluationMetrics = async ({ departmentId = null, collegeId = null } = {}) => {
  const [[studentStats]] = await pool.query(`
    SELECT COUNT(DISTINCT ed.id) AS required_count,
      COUNT(DISTINCT CASE WHEN ses.id IS NOT NULL THEN ed.id END) AS completed_count,
      AVG(ses.score) AS average_score
    FROM evaluation_dispatches ed
    INNER JOIN departments d ON d.id = ed.department_id
    LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
    WHERE (? IS NULL OR ed.department_id = ?)
      AND (? IS NULL OR d.college_id = ?)
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
      AND LOWER(COALESCE(ed.status, 'pending')) <> 'closed'
  `, [departmentId, departmentId, collegeId, collegeId]);
  const [[peerStats]] = await pool.query(`
    SELECT COUNT(DISTINCT pe.id) AS required_count,
      COUNT(DISTINCT CASE WHEN pes.id IS NOT NULL OR LOWER(COALESCE(pe.status, 'pending')) IN ('submitted', 'completed', 'approved') THEN pe.id END) AS completed_count
    FROM peer_evaluations pe
    INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
    INNER JOIN departments d ON d.id = evaluator.department_id
    LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
      AND LOWER(COALESCE(pes.status, 'pending')) IN ('submitted', 'completed', 'approved')
    WHERE (? IS NULL OR evaluator.department_id = ?)
      AND (? IS NULL OR d.college_id = ?)
  `, [departmentId, departmentId, collegeId, collegeId]);

  const totalRequired = number(studentStats?.required_count) + number(peerStats?.required_count);
  const totalSubmitted = number(studentStats?.completed_count) + number(peerStats?.completed_count);
  return {
    totalRequired,
    totalSubmitted,
    pendingCount: Math.max(totalRequired - totalSubmitted, 0),
    completionRate: percentage(totalSubmitted, totalRequired),
    participationRate: percentage(totalSubmitted, totalRequired),
    averageScore: number(studentStats?.average_score),
  };
};

const getUniformScoreClusters = async ({ departmentId = null, collegeId = null } = {}) => {
  const [rows] = await pool.query(`
    SELECT ed.assignment_id, MAX(ed.course_name) AS course_name,
      TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS instructor_name,
      COUNT(DISTINCT ses.id) AS response_count,
      AVG(ses.score) AS average_score,
      VARIANCE(ses.score) AS score_variance
    FROM evaluation_dispatches ed
    INNER JOIN departments d ON d.id = ed.department_id
    INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
    LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
    LEFT JOIN instructors i ON i.id = ca.instructor_id
    WHERE ed.assignment_id IS NOT NULL
      AND (? IS NULL OR ed.department_id = ?)
      AND (? IS NULL OR d.college_id = ?)
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
    GROUP BY ed.assignment_id, i.first_name, i.last_name
    HAVING COUNT(DISTINCT ses.id) > 1 AND VARIANCE(ses.score) = 0
    ORDER BY response_count DESC
    LIMIT 100
  `, [departmentId, departmentId, collegeId, collegeId]);

  return rows.map((row) => ({
    assignmentId: row.assignment_id,
    courseName: row.course_name || 'Assigned course',
    instructorName: row.instructor_name || 'Instructor',
    responseCount: number(row.response_count),
    score: number(row.average_score),
    scoreVariance: number(row.score_variance),
    reason: `All ${number(row.response_count)} submitted scores are ${number(row.average_score).toFixed(1)}%.`,
  }));
};

const getDeanInsights = async ({ collegeId }) => {
  const [departmentRows] = await pool.query(`
    SELECT d.id, d.name AS department,
      COUNT(DISTINCT ed.id) AS total_required,
      COUNT(DISTINCT CASE WHEN ses.id IS NOT NULL THEN ed.id END) AS total_submitted,
      AVG(ses.score) AS average_score
    FROM departments d
    LEFT JOIN evaluation_dispatches ed ON ed.department_id = d.id
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
      AND LOWER(COALESCE(ed.status, 'pending')) <> 'closed'
    LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
    WHERE d.college_id = ?
    GROUP BY d.id, d.name
    ORDER BY average_score DESC, d.name ASC
  `, [collegeId]);
  const [feedbackRows] = await pool.query(`
    SELECT ses.score, ses.feedback, ses.strengths, ses.improvements
    FROM evaluation_dispatches ed
    INNER JOIN departments d ON d.id = ed.department_id
    INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
    WHERE d.college_id = ?
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
    ORDER BY ses.created_at DESC
    LIMIT 500
  `, [collegeId]);
  const [universityRows] = await pool.query(`
    SELECT AVG(ses.score) AS university_average
    FROM evaluation_dispatches ed
    INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
    WHERE LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
  `);
  const institutionalMetrics = await getInstitutionalEvaluationMetrics({ collegeId });
  const anomalies = await getUniformScoreClusters({ collegeId });
  const signals = getFeedbackSignals(feedbackRows, institutionalMetrics.averageScore);
  const benchmarkAverage = number(universityRows?.[0]?.university_average);
  const difference = Number((institutionalMetrics.averageScore - benchmarkAverage).toFixed(1));
  const benchmark = {
    primaryLabel: 'College average',
    primaryAverage: institutionalMetrics.averageScore,
    comparisonLabel: 'University average',
    comparisonAverage: benchmarkAverage,
    difference,
    comparisonResult: difference >= 0 ? 'Above university benchmark' : 'Below university benchmark',
  };
  const rankedDepartments = departmentRows.filter((row) => number(row.total_required) > 0).slice(0, 5);
  const summary = [
    `College evaluation completion rate: ${institutionalMetrics.completionRate}%.`,
    `Average college evaluation score: ${institutionalMetrics.averageScore.toFixed(1)}%.`,
    ...rankedDepartments.map((row) => `${row.department}: ${number(row.average_score).toFixed(1)}% average, ${percentage(row.total_submitted, row.total_required)}% completion.`),
    anomalies.length ? `${anomalies.length} uniform score cluster${anomalies.length === 1 ? '' : 's'} need review.` : 'No uniform score clusters were detected.',
  ];
  if (!feedbackRows.length) summary.push('Awaiting written evaluation feedback.');

  return response(summary, [
    recommendation('Review college completion', 'Open evaluation tracking to identify departments with pending submissions.', 'View Pending', 'VIEW_PENDING'),
    recommendation('Inspect score clustering', 'Review departments with uniform evaluation score clusters.', 'Inspect Anomalies', 'INSPECT_ANOMALIES'),
    recommendation('Export college summary', 'Download current college metrics and feedback themes.', 'Export Summary', 'EXPORT_SUMMARY'),
  ], signals.sentiment, undefined, {
    ...signals,
    ...institutionalMetrics,
    topFeedbackKeywords: signals.topFeedbackKeywords,
    departments: departmentRows,
    benchmark,
    anomalies,
    anomaliesCount: anomalies.length,
  });
};

const getAcademicDirectorInsights = async () => {
  const [[stats]] = await pool.query(`
    SELECT COUNT(*) AS total_reviews, SUM(CASE WHEN LOWER(COALESCE(status, 'pending')) IN ('completed', 'submitted', 'published') THEN 1 ELSE 0 END) AS compliant_reviews
    FROM directorate_evaluations
  `);
  const [feedbackRows] = await pool.query(`
    SELECT ses.score, ses.feedback, ses.strengths, ses.improvements
    FROM student_evaluation_submissions ses ORDER BY ses.created_at DESC LIMIT 500
  `);
  const institutionalMetrics = await getInstitutionalEvaluationMetrics();
  const anomalies = await getUniformScoreClusters();
  const signals = getFeedbackSignals(feedbackRows);
  return response([
    `College-level QA compliance rate: ${percentage(stats?.compliant_reviews, stats?.total_reviews)}%.`,
    stats?.total_reviews ? `${number(stats.total_reviews)} college quality assurance review${number(stats.total_reviews) === 1 ? '' : 's'} tracked.` : 'No college QA reviews are available yet.',
    `University evaluation participation: ${institutionalMetrics.participationRate}%.`,
    anomalies.length ? `${anomalies.length} uniform score cluster${anomalies.length === 1 ? '' : 's'} need review.` : 'No uniform score clusters were detected.',
  ], [
    recommendation('Review evaluation tracking', 'Open institutional tracking for pending submissions and QA follow-up.', 'View Pending', 'VIEW_PENDING'),
    recommendation('Inspect score clustering', 'Review uniform score patterns across institutional evaluations.', 'Inspect Anomalies', 'INSPECT_ANOMALIES'),
    recommendation('Export institutional summary', 'Download university participation and score metrics.', 'Export Summary', 'EXPORT_SUMMARY'),
  ], signals.sentiment, undefined, {
    ...signals,
    ...institutionalMetrics,
    topFeedbackKeywords: signals.topFeedbackKeywords,
    anomalies,
    anomaliesCount: anomalies.length,
  });
};

const getAdminInsights = async () => {
  const [activityRows] = await pool.query(`
    SELECT HOUR(created_at) AS activity_hour, COUNT(*) AS event_count
    FROM audit_logs
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY HOUR(created_at)
    ORDER BY event_count DESC
    LIMIT 5
  `);
  const institutionalMetrics = await getInstitutionalEvaluationMetrics();
  const anomalies = await getUniformScoreClusters();
  const highActivityBlocks = activityRows.map((row) => ({
    block: `${String(row.activity_hour).padStart(2, '0')}:00-${String((Number(row.activity_hour) + 1) % 24).padStart(2, '0')}:00`,
    events: number(row.event_count),
  }));
  return response([
    `University participation rate: ${institutionalMetrics.participationRate}%.`,
    `${institutionalMetrics.totalSubmitted} evaluations submitted across student and peer evaluations.`,
    highActivityBlocks.length ? `Highest activity block: ${highActivityBlocks[0].block} (${highActivityBlocks[0].events} audit events in the last 30 days).` : 'No recent system activity blocks are available.',
    anomalies.length ? `${anomalies.length} uniform score cluster${anomalies.length === 1 ? '' : 's'} need review.` : 'No uniform score clusters were detected.',
  ], [
    recommendation('Review system activity', 'Inspect recent audit events and operational failures.', 'View Audit Logs', 'VIEW_AUDIT_LOGS'),
    recommendation('Inspect score clustering', 'Review uniform score patterns across the university.', 'Inspect Anomalies', 'INSPECT_ANOMALIES'),
    recommendation('Export university summary', 'Download participation, activity, and score metrics.', 'Export Summary', 'EXPORT_SUMMARY'),
  ], { positive: 70, neutral: 25, negative: institutionalMetrics.pendingCount ? 5 : 0 }, undefined, {
    ...institutionalMetrics,
    topFeedbackKeywords: [],
    feedbackCount: 0,
    highActivityBlocks,
    anomalies,
    anomaliesCount: anomalies.length,
  });
};

const getRoleBasedInsights = async (req, res) => {
  const role = normalizeRole(req.query.role || req.user?.role);
  if (!role || !SUPPORTED_ROLES.has(role)) return res.status(400).json({ success: false, message: 'A supported role is required.' });
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication is required.' });
  if (role !== 'admin' && normalizeRole(req.user.role) !== role) return res.status(403).json({ success: false, message: 'You cannot request insights for another role.' });

  try {
    const context = await getScopedContext(req, role);
    if (role === 'dept_head' && !context.departmentId) {
      return res.status(403).json({ success: false, message: 'Your department is not defined.' });
    }
    if (role === 'dean' && !context.collegeId) {
      return res.status(403).json({ success: false, message: 'Your college is not defined.' });
    }
    let data;
    if (role === 'student') data = await getStudentInsights(context);
    else if (role === 'lab_assistant') data = await getLabAssistantInsights(context);
    else if (role === 'instructor') data = await getInstructorInsights(context);
    else if (role === 'dept_head') data = await getDeptHeadInsights(context);
    else if (role === 'dean') data = await getDeanInsights(context);
    else if (role === 'academic_director') data = await getAcademicDirectorInsights(context);
    else data = await getAdminInsights(context);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Role-based AI insights error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load role-based AI insights.' });
  }
};

const getAiInsightsSummary = (req, res) => getRoleBasedInsights(req, res);

module.exports = { getRoleBasedInsights, getAiInsightsSummary, getInstructorAiInsights, getDeptHeadAiInsights, getInstitutionalEvaluationMetrics };
