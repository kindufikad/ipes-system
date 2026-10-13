const ROMAN_SEMESTER_VALUES = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
};

const normalizeSemester = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;

  const withoutLabel = text.replace(/^semester\s*/, '').trim();
  const romanValue = ROMAN_SEMESTER_VALUES[withoutLabel];
  if (romanValue !== undefined) return romanValue;

  const numericValue = Number.parseInt(withoutLabel, 10);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const isAllSemester = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  return !text || text === 'all';
};

const getSemesterComparisonValues = (value) => {
  if (isAllSemester(value)) return [];

  const semester = normalizeSemester(value);
  if (semester === null) return [];

  const roman = Object.keys(ROMAN_SEMESTER_VALUES).find((key) => ROMAN_SEMESTER_VALUES[key] === semester);
  return [String(semester), roman || '', `Semester ${roman || semester}`, `Semester ${semester}`];
};

const buildStudentSemesterFilter = (value) => {
  if (isAllSemester(value)) return null;

  const comparisonValues = getSemesterComparisonValues(value);
  if (!comparisonValues.length) {
    return { sql: '1 = 0', params: [] };
  }

  return {
    sql: `LOWER(TRIM(s.semester)) IN (${comparisonValues.map(() => '?').join(', ')})`,
    params: comparisonValues,
  };
};

module.exports = {
  normalizeSemester,
  isAllSemester,
  getSemesterComparisonValues,
  buildStudentSemesterFilter,
};
