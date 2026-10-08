-- Keep the oldest assignment when legacy data contains duplicate cohort rows.
DELETE duplicate
FROM course_assignments duplicate
INNER JOIN course_assignments original
  ON duplicate.department_id = original.department_id
 AND duplicate.course_id = original.course_id
 AND duplicate.academic_year = original.academic_year
 AND duplicate.semester = original.semester
 AND duplicate.year_level = original.year_level
 AND duplicate.section = original.section
 AND duplicate.program_type = original.program_type
 AND duplicate.id > original.id;

ALTER TABLE course_assignments
  ADD CONSTRAINT uq_course_section_assignment
  UNIQUE (department_id, course_id, academic_year, semester, year_level, section, program_type);