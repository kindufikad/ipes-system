const pool = require('../config/db');

const getConsolidatedStudentScore = async (req, res) => {
  try {
    const instructorId = Number(req.params.instructorId);
    const [[activePeriod]] = await pool.query(
      `SELECT academic_year, semester FROM evaluation_periods
       WHERE LOWER(status) = 'active' ORDER BY id DESC LIMIT 1`
    );
    const academicYear = String(req.query.academicYear || activePeriod?.academic_year || '').trim();
    const semester = String(req.query.semester || activePeriod?.semester || '').trim();

    if (!Number.isInteger(instructorId) || instructorId <= 0) {
      return res.status(400).json({ success: false, message: 'A valid instructor id is required.' });
    }

    // Student submissions are linked to an instructor through their dispatch assignment.
    // This aggregates every course, section, year level, and department in the term.
    const [rows] = await pool.query(
      `SELECT
         ca.instructor_id,
         MAX(COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), ''))) AS academic_year,
         MAX(COALESCE(NULLIF(TRIM(ed.semester), ''), NULLIF(TRIM(ca.semester), ''))) AS semester,
         COUNT(DISTINCT ses.id) AS submission_count,
         COUNT(DISTINCT ses.id) AS total_students_evaluated,
         COUNT(DISTINCT ca.course_id) AS total_courses_taught,
         AVG(ses.score) AS overall_raw_score
       FROM student_evaluation_submissions ses
       INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
       INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
       WHERE ca.instructor_id = ?
         AND LOWER(COALESCE(ed.target_type, 'instructor')) = 'instructor'
         AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved', 'published')
         AND (? = '' OR LOWER(COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), ''), '')) = LOWER(?)
           OR LOWER(COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), ''), '')) = LOWER(SUBSTRING_INDEX(?, '/', 1)))
         AND (? = '' OR LOWER(REPLACE(COALESCE(NULLIF(TRIM(ed.semester), ''), NULLIF(TRIM(ca.semester), ''), ''), 'semester', ''))
           = LOWER(REPLACE(?, 'semester', '')))
       `,
      [instructorId, academicYear, academicYear, academicYear, semester, semester]
    );

    const summary = rows[0] || {};
    const rawScore = Number(Number(summary.overall_raw_score || 0).toFixed(2));
    const weightedContribution = Number((rawScore * 0.5).toFixed(2));

    return res.status(200).json({
      success: true,
      data: {
        instructorId,
        academicYear,
        semester,
        raw_student_score: rawScore,
        submission_count: Number(summary.submission_count || 0),
        totalCoursesTaught: Number(summary.total_courses_taught || 0),
        totalEvaluationsSubmitted: Number(summary.submission_count || 0),
        studentRawPercentage: rawScore.toFixed(2),
        studentWeightedScore: weightedContribution.toFixed(2),
      },
    });
  } catch (error) {
    console.error('Error aggregating student evaluations:', error);
    return res.status(500).json({ success: false, message: 'Server error during score aggregation' });
  }
};

module.exports = { getConsolidatedStudentScore };