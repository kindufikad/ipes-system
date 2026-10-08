-- Restore dispatch metadata that can be recovered from its course assignment.
UPDATE evaluation_dispatches ed
INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
INNER JOIN courses c ON c.id = ca.course_id
SET ed.course_id = COALESCE(ed.course_id, ca.course_id),
    ed.course_name = COALESCE(ed.course_name, c.name),
    ed.course_code = COALESCE(ed.course_code, c.code),
    ed.academic_year = COALESCE(ed.academic_year, ca.academic_year),
    ed.semester = COALESCE(ed.semester, ca.semester),
    ed.year_level = COALESCE(ed.year_level, ca.year_level)
WHERE ed.assignment_id IS NOT NULL
  AND (ed.course_id IS NULL OR ed.course_name IS NULL OR ed.course_code IS NULL
    OR ed.academic_year IS NULL OR ed.semester IS NULL OR ed.year_level IS NULL);

-- Course-less peer dispatches still retain their publication scope explicitly.
UPDATE evaluation_dispatches
SET year_level = COALESCE(year_level, 'ALL'),
    student_group = COALESCE(student_group, 'ALL')
WHERE evaluation_type IN ('peer', 'lab_assistant_peer')
  AND assignment_id IS NULL;
