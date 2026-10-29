export const YEAR_LEVEL_OPTIONS = [
  { value: 1, label: 'Year 1' },
  { value: 2, label: 'Year 2' },
  { value: 3, label: 'Year 3' },
  { value: 4, label: 'Year 4' },
  { value: 5, label: 'Year 5' },
  { value: 6, label: 'Year 6' },
  { value: 7, label: 'Year 7' },
];

const ordinalSuffix = (year) => (year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th');

export const YEAR_LEVEL_FILTER_OPTIONS = YEAR_LEVEL_OPTIONS.map(({ value, label }) => ({
  value: `${value}${ordinalSuffix(value)} Year`,
  label,
}));

export const YEAR_LEVEL_ASSIGNMENT_OPTIONS = YEAR_LEVEL_FILTER_OPTIONS.map((option) => ({
  ...option,
  value: option.value === '1st Year' ? '1st Year (Freshman)' : option.value,
}));

export const getYearLevelNumber = (value) => Number(String(value ?? '').match(/\d+/)?.[0]) || null;

export const getYearLevelLabel = (value) => {
  const year = getYearLevelNumber(value);
  return YEAR_LEVEL_OPTIONS.find((option) => option.value === year)?.label || String(value ?? '');
};

export const adminData = {
  colleges: [
    { id: 'college-1', name: 'College of Engineering', code: 'ENG' },
    { id: 'college-2', name: 'College of Natural and Computational Sciences', code: 'NCS' },
    { id: 'college-3', name: 'College of Agriculture', code: 'AGR' },
    { id: 'college-4', name: 'College of Business and Economics', code: 'BEC' },
    { id: 'college-5', name: 'College of Health Sciences', code: 'HS' },
    { id: 'college-6', name: 'College of Education', code: 'EDU' },
    { id: 'college-7', name: 'College of Social Sciences and Humanities', code: 'SSH' },
    { id: 'college-8', name: 'College of Law', code: 'LAW' },
    { id: 'college-9', name: 'College of Technology', code: 'TEC' },
    { id: 'college-10', name: 'College of Informatics', code: 'INF' },
  ],
  departments: [
    { id: 'dept-1', name: 'Department of Computer Science', collegeId: 'college-1' },
    { id: 'dept-2', name: 'Department of Electrical Engineering', collegeId: 'college-1' },
    { id: 'dept-3', name: 'Department of Mathematics', collegeId: 'college-2' },
    { id: 'dept-4', name: 'Department of Physics', collegeId: 'college-2' },
    { id: 'dept-5', name: 'Department of Agronomy', collegeId: 'college-3' },
    { id: 'dept-6', name: 'Department of Accounting and Finance', collegeId: 'college-4' },
    { id: 'dept-7', name: 'Department of Public Health', collegeId: 'college-5' },
    { id: 'dept-8', name: 'Department of Curriculum and Instruction', collegeId: 'college-6' },
    { id: 'dept-9', name: 'Department of Sociology', collegeId: 'college-7' },
    { id: 'dept-10', name: 'Department of Software Engineering', collegeId: 'college-10' },
  ],
  programs: [
    { id: 'program-1', name: 'B.Sc. in Software Engineering', departmentId: 'dept-10' },
    { id: 'program-2', name: 'B.Sc. in Computer Science', departmentId: 'dept-1' },
    { id: 'program-3', name: 'B.Sc. in Electrical Engineering', departmentId: 'dept-2' },
    { id: 'program-4', name: 'B.Sc. in Mathematics', departmentId: 'dept-3' },
    { id: 'program-5', name: 'B.Sc. in Physics', departmentId: 'dept-4' },
    { id: 'program-6', name: 'B.Sc. in Agronomy', departmentId: 'dept-5' },
    { id: 'program-7', name: 'B.A. in Accounting and Finance', departmentId: 'dept-6' },
    { id: 'program-8', name: 'B.Sc. in Public Health', departmentId: 'dept-7' },
    { id: 'program-9', name: 'B.Ed. in Curriculum and Instruction', departmentId: 'dept-8' },
    { id: 'program-10', name: 'B.A. in Sociology', departmentId: 'dept-9' },
  ],
  academicYears: [
    { id: 'year-1', name: '2020/2021' },
    { id: 'year-2', name: '2021/2022' },
    { id: 'year-3', name: '2022/2023' },
    { id: 'year-4', name: '2023/2024' },
    { id: 'year-5', name: '2024/2025' },
    { id: 'year-6', name: '2025/2026' },
    { id: 'year-7', name: '2026/2027' },
    { id: 'year-8', name: '2027/2028' },
    { id: 'year-9', name: '2028/2029' },
    { id: 'year-10', name: '2029/2030' },
  ],
  semesters: [
    { id: 'semester-1', name: 'Semester I' },
    { id: 'semester-2', name: 'Semester II' },
    { id: 'semester-3', name: 'Semester III' },
    { id: 'semester-4', name: 'Semester IV' },
    { id: 'semester-5', name: 'Semester V' },
    { id: 'semester-6', name: 'Semester VI' },
    { id: 'semester-7', name: 'Semester VII' },
    { id: 'semester-8', name: 'Semester VIII' },
    { id: 'semester-9', name: 'Summer Semester' },
    { id: 'semester-10', name: 'Extension Semester' },
  ],
  yearLevels: [
    { id: 'level-1', name: 'Year I' },
    { id: 'level-2', name: 'Year II' },
    { id: 'level-3', name: 'Year III' },
    { id: 'level-4', name: 'Year IV' },
    { id: 'level-5', name: 'Year V' },
    { id: 'level-6', name: 'Year VI' },
    { id: 'level-7', name: 'Year VII' },
    { id: 'level-8', name: 'Year VIII' },
    { id: 'level-9', name: 'Graduate I' },
    { id: 'level-10', name: 'Graduate II' },
  ],
  sections: [
    { id: 'section-1', name: 'Section A' },
    { id: 'section-2', name: 'Section B' },
    { id: 'section-3', name: 'Section C' },
    { id: 'section-4', name: 'Section D' },
    { id: 'section-5', name: 'Section E' },
    { id: 'section-6', name: 'Section F' },
    { id: 'section-7', name: 'Section G' },
    { id: 'section-8', name: 'Section H' },
    { id: 'section-9', name: 'Section I' },
    { id: 'section-10', name: 'Section J' },
  ],
  learningLevels: [
    { id: 'qualification-1', name: 'Diploma' },
    { id: 'qualification-2', name: 'Bachelor Degree' },
    { id: 'qualification-3', name: 'Master Degree' },
    { id: 'qualification-4', name: 'PhD' },
  ],
  courses: [
    { id: 'course-1', name: 'Introduction to Programming', departmentId: 'dept-1' },
    { id: 'course-2', name: 'Data Structures and Algorithms', departmentId: 'dept-1' },
    { id: 'course-3', name: 'Computer Networks', departmentId: 'dept-1' },
    { id: 'course-4', name: 'Digital Electronics', departmentId: 'dept-2' },
    { id: 'course-5', name: 'Signals and Systems', departmentId: 'dept-2' },
    { id: 'course-6', name: 'Calculus I', departmentId: 'dept-3' },
    { id: 'course-7', name: 'Linear Algebra', departmentId: 'dept-3' },
    { id: 'course-8', name: 'Principles of Agronomy', departmentId: 'dept-5' },
    { id: 'course-9', name: 'Fundamentals of Accounting', departmentId: 'dept-6' },
    { id: 'course-10', name: 'Public Health Foundations', departmentId: 'dept-7' },
  ],
};
