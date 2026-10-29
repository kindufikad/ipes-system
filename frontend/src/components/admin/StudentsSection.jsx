import React, { useContext, useMemo, useState } from 'react';
import { FaUserGraduate, FaChevronLeft, FaChevronRight, FaSearch } from 'react-icons/fa';
import { LanguageContext } from '../../context/LanguageContext';
import { YEAR_LEVEL_FILTER_OPTIONS } from '../../data/adminOptions';

const pageSize = 10;

const programTypeOptions = ['Regular', 'Extension'];
const sectionOptions = [
  'Section A', 'Section B', 'Section C', 'Section D', 'Section E', 'Section F',
  'Section G', 'Section H', 'Section I', 'Section J', 'Section K', 'Section L',
];

const normalizeProgramType = (value) => {
  if (!value && value !== 0) return '';
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, '');
  if (normalized.includes('ext')) return 'extension';
  if (normalized.includes('reg')) return 'regular';
  return String(value).trim().toLowerCase();
};

const normalizeSectionValue = (value) => {
  if (!value && value !== 0) return '';
  return String(value).trim().toLowerCase().replace(/^section\s*/i, '').trim();
};

const getYearNumber = (value) => {
  if (!value && value !== 0) return null;
  const s = String(value).trim().toLowerCase();
  // Extract the first continuous digit sequence anywhere in the string
  const numMatch = s.match(/(\d+)/);
  if (numMatch) return Number(numMatch[1]);
  // fallback to word-based ordinals
  if (s.includes('first')) return 1;
  if (s.includes('second')) return 2;
  if (s.includes('third')) return 3;
  if (s.includes('fourth')) return 4;
  if (s.includes('fifth')) return 5;
  if (s.includes('sixth')) return 6;
  if (s.includes('seventh')) return 7;
  return null;
};

import { studentApi } from '../../services/api';

const StudentsSection = ({ departmentId, initialStudents = null }) => {
  const { strings } = useContext(LanguageContext);
  const [studentUsers, setStudentUsers] = useState([]);
  const [selectedYearLevel, setSelectedYearLevel] = useState('All');
  const [selectedProgramType, setSelectedProgramType] = useState('All');
  const [selectedSection, setSelectedSection] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredStudents = useMemo(() => {
    const getDepartment = (s) => s?.department_id ?? s?.departmentId ?? s?.department_code ?? s?.department ?? s?.dept_id ?? null;
    const getYearRaw = (s) => s?.year_level ?? s?.year ?? s?.academic_year ?? s?.yearLevel ?? s?.yearlevel ?? s?.academicYear ?? null;
    const getProgramRaw = (s) => s?.program_type ?? s?.program ?? s?.study_program ?? s?.programType ?? s?.program_type_name ?? null;
    const getSectionRaw = (s) => s?.section ?? s?.section_name ?? s?.sectionName ?? s?.section_code ?? s?.sectionLabel ?? null;

    const selYearNum = selectedYearLevel === 'All' ? null : getYearNumber(selectedYearLevel);
    const selProgramNorm = selectedProgramType === 'All' ? null : normalizeProgramType(selectedProgramType);
    const selectedSectionNormalized = selectedSection === 'All' ? '' : normalizeSectionValue(selectedSection);
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return studentUsers.filter((student) => {
      const studentDept = getDepartment(student);
      const studentYearRaw = getYearRaw(student);
      const studentYearNum = getYearNumber(studentYearRaw);
      const studentProgramNorm = normalizeProgramType(getProgramRaw(student));
      const studentSectionNormalized = normalizeSectionValue(getSectionRaw(student));
      const studentName = `${student.first_name || student.firstName || ''} ${student.last_name || student.lastName || ''} ${student.full_name || student.fullName || ''}`.toLowerCase();
      const studentId = String(student.student_id || student.studentId || '').toLowerCase();
      const matchesSearch = !normalizedSearch || studentId.includes(normalizedSearch) || studentName.includes(normalizedSearch);

      const matchesDepartment = !departmentId || String(studentDept ?? '') === String(departmentId);
      const matchesYearLevel = selYearNum == null || (studentYearNum != null && studentYearNum === selYearNum);
      const matchesProgramType = selProgramNorm == null || (studentProgramNorm && String(studentProgramNorm).toLowerCase() === String(selProgramNorm).toLowerCase());
      const matchesSection = selectedSection === 'All' || selectedSectionNormalized === '' || studentSectionNormalized === selectedSectionNormalized;

      return matchesDepartment && matchesYearLevel && matchesProgramType && matchesSection && matchesSearch;
    });
  }, [studentUsers, departmentId, selectedYearLevel, selectedProgramType, selectedSection, searchTerm]);

  // Fetch students from backend when department or filters change
  React.useEffect(() => {
    let cancelled = false;
    if (Array.isArray(initialStudents)) {
      setStudentUsers(initialStudents);
      return () => { cancelled = true; };
    }

    const fetchStudents = async () => {
      if (!departmentId) return;
      try {
        const normalizedSection = selectedSection === 'All' ? 'All' : normalizeSectionValue(selectedSection);
        const params = {
          department_id: departmentId,
          program_type: selectedProgramType === 'All' ? '' : selectedProgramType,
          year_level: selectedYearLevel === 'All' ? '' : selectedYearLevel,
          section: normalizedSection === 'All' ? '' : normalizedSection,
        };
        const data = await studentApi.getFiltered(params);
        if (!cancelled) setStudentUsers(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setStudentUsers([]);
      }
    };
    fetchStudents();
    return () => { cancelled = true; };
  }, [departmentId, initialStudents, selectedYearLevel, selectedProgramType, selectedSection]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedStudents = useMemo(
    () => filteredStudents.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize),
    [filteredStudents, safeCurrentPage]
  );

  return (
    <section className="card">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
          <FaUserGraduate className="text-xl" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{strings.adminSections.studentRecords}</h2>
          <p className="text-sm text-gray-500">{strings.adminSections.studentRecordsDesc}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-3">
        <label className="text-sm text-gray-600">
          <span className="mb-1 block font-medium">Year Level</span>
          <select
            value={selectedYearLevel}
            onChange={(event) => {
              setSelectedYearLevel(event.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option key="all" value="All">All</option>
            {YEAR_LEVEL_FILTER_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-600">
          <span className="mb-1 block font-medium">Program Type</span>
          <select
            value={selectedProgramType}
            onChange={(event) => {
              setSelectedProgramType(event.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option key="all" value="All">All</option>
            {programTypeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-600">
          <span className="mb-1 block font-medium">Section</span>
          <select
            value={selectedSection}
            onChange={(event) => {
              setSelectedSection(event.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option key="all" value="All">All</option>
            {sectionOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="mb-4 block max-w-md text-sm text-gray-600">
        <span className="mb-1 block font-medium">Search by Student ID or Name</span>
        <div className="relative">
          <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setCurrentPage(1); }} placeholder="Student ID or name" className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm" />
        </div>
      </label>

      <div className="mb-4 text-sm text-gray-500">
        {filteredStudents.length} student{filteredStudents.length === 1 ? '' : 's'} found for the selected filters.
      </div>

      <div className="overflow-x-auto rounded-3xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
              <th className="py-3 px-4 font-medium">Student ID</th>
              <th className="py-3 px-4 font-medium">Full Name</th>
              <th className="py-3 px-4 font-medium">Program Type</th>
              <th className="py-3 px-4 font-medium">Year / Section</th>
            </tr>
          </thead>
          <tbody>
            {paginatedStudents.length > 0 ? (
              paginatedStudents.map((student) => {
                  return (
                  <tr key={student.id || student.student_id || student.username} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 px-4 text-gray-700">{student.student_id}</td>
                      <td className="py-3 px-4 text-gray-700">{student.name}</td>
                      <td className="py-3 px-4 text-gray-700">{student.program_type}</td>
                      <td className="py-3 px-4 text-gray-700">{`${student.year_level} / ${student.section}`}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="py-10 px-4 text-center text-gray-500">
                  {selectedProgramType !== 'All' && selectedYearLevel !== 'All' && selectedSection !== 'All' ? (
                    `No students found matching ${selectedProgramType} - ${selectedYearLevel} - ${selectedSection} in your department.`
                  ) : (
                    'No students registered for the selected filters.'
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          Page {safeCurrentPage} of {totalPages}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={safeCurrentPage === 1}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FaChevronLeft className="text-xs" /> Previous
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={safeCurrentPage === totalPages}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next <FaChevronRight className="text-xs" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default StudentsSection;
