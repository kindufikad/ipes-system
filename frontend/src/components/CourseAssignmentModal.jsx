import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { courseAssignmentApi, departmentApi } from '../services/api';
import { YEAR_LEVEL_ASSIGNMENT_OPTIONS } from '../data/adminOptions';

const getStaffId = (staff) => staff?.staff_id ?? staff?.instructor_id ?? staff?.id ?? staff?.user_id;

const getStaffName = (staff) => staff?.full_name || staff?.instructor_name || staff?.name || staff?.email || 'Unnamed staff member';

const getRoleLabel = (role) => {
  const normalized = String(role || 'instructor').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['academic_director', 'academic_directorate', 'director', 'directorate'].includes(normalized)) return 'ACADEMIC DIRECTOR';
  if (['department_head', 'dept_head', 'depthead'].includes(normalized)) return 'DEPT HEAD';
  if (['college_dean', 'dean'].includes(normalized)) return 'COLLEGE DEAN';
  if (['lab_assistant', 'labassistant'].includes(normalized)) return 'LAB ASSISTANT';
  return 'INSTRUCTOR';
};

const InstructorSearchSelect = ({ courseId, instructors, selectedId, onSelect, onClear }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedStaff = instructors.find((staff) => String(getStaffId(staff)) === String(selectedId));
  const optionIdPrefix = `course-staff-${String(courseId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  const filteredInstructors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return instructors;
    return instructors.filter((staff) => {
      const searchable = [
        getStaffName(staff),
        getRoleLabel(staff.role),
        staff.role,
        staff.staff_id,
        staff.instructor_id,
        staff.id,
        staff.user_id,
        staff.email,
      ].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [instructors, query]);

  const selectStaff = (staff) => {
    const staffId = getStaffId(staff);
    if (staffId === undefined || staffId === null) return;
    onSelect(staff, String(staffId));
    setQuery('');
    setIsOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      if (filteredInstructors.length) setActiveIndex((current) => Math.min(current + 1, filteredInstructors.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      if (filteredInstructors.length) setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && isOpen && filteredInstructors.length) {
      event.preventDefault();
      selectStaff(filteredInstructors[activeIndex] || filteredInstructors[0]);
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      setQuery('');
      setActiveIndex(0);
    }
  };

  return (
    <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false); }}>
      <div className="flex items-center rounded-xl border border-gray-300 bg-white shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30">
        <input
          type="text"
          role="combobox"
          aria-label="Select instructor or lab assistant"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={`${optionIdPrefix}-options`}
          aria-activedescendant={isOpen && filteredInstructors[activeIndex] ? `${optionIdPrefix}-option-${activeIndex}` : undefined}
          autoComplete="off"
          value={isOpen ? query : selectedStaff ? `${getStaffName(selectedStaff)} — ${getRoleLabel(selectedStaff.role)}` : ''}
          onFocus={() => { setQuery(''); setActiveIndex(0); setIsOpen(true); }}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Search instructor, lab assistant, or ID"
          className="min-w-0 flex-1 rounded-xl border-0 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
        />
        {selectedStaff && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClear}
            aria-label="Clear selection"
            title="Clear selection"
            className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {isOpen && (
        <div id={`${optionIdPrefix}-options`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {filteredInstructors.length ? filteredInstructors.map((staff, index) => {
            const staffId = String(getStaffId(staff));
            const selected = staffId === String(selectedId);
            return (
              <button
                key={`${staffId}-${staff.email || index}`}
                id={`${optionIdPrefix}-option-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectStaff(staff)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm focus:outline-none ${activeIndex === index ? 'bg-blue-50 text-blue-950' : 'text-slate-800 hover:bg-slate-50'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{getStaffName(staff)}</span>
                  <span className="block text-xs text-slate-500">ID: {staff.staff_id ?? staff.instructor_id ?? staff.id ?? staff.user_id}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold tracking-wide ${getRoleLabel(staff.role) === 'LAB ASSISTANT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                  {getRoleLabel(staff.role)}
                </span>
              </button>
            );
          }) : <p className="px-3 py-3 text-sm text-slate-500">No matching staff found.</p>}
        </div>
      )}
    </div>
  );
};

const CourseAssignmentModal = ({ courses: initialCourses = [], instructors: initialInstructors = [], departmentId, onClose, onAssigned }) => {
  const [filters, setFilters] = useState({ programType: '', yearLevel: '', semester: '', section: '' });
  const [courses, setCourses] = useState(initialCourses);
  const defaultInstructors = initialInstructors;
  const [departments, setDepartments] = useState([]);
  const [allInstructors, setAllInstructors] = useState(initialInstructors);
  const [assignments, setAssignments] = useState({});
  const [instructorsMap, setInstructorsMap] = useState({});
  const rowInstructors = new Proxy(instructorsMap, {
    get: (current, courseId) => {
      const selectedDepartment = String(assignments[courseId]?.deptId || departmentId || '');
      const source = current[courseId] || allInstructors;
      return source.filter((instructor) => String(instructor.department_id || '') === selectedDepartment);
    },
  });
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [saving, setSaving] = useState(false);
  const sections = 'A B C D E F G H I J K L'.split(' ');
  const selectClass = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm';

  const updateFilter = (field) => (event) => setFilters((current) => ({ ...current, [field]: event.target.value }));

  useEffect(() => {
    departmentApi.getAll().then(async (rows) => {
      const availableDepartments = Array.isArray(rows) ? rows : [];
      setDepartments(availableDepartments);
      const instructorLists = await Promise.all(availableDepartments.map((department) => (
        courseAssignmentApi.getDepartmentInstructors(department.id).catch(() => [])
      )));
      const uniqueInstructors = new Map();
      instructorLists.flat().forEach((instructor) => {
        const instructorId = instructor.instructor_id || instructor.id || instructor.user_id;
        if (instructorId) uniqueInstructors.set(String(instructorId), instructor);
      });
      setAllInstructors([...uniqueInstructors.values()]);
    }).catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    if (!filters.yearLevel || !filters.semester) {
      setCourses([]);
      setAssignments({});
      return undefined;
    }
    let cancelled = false;
    setLoadingCourses(true);
    courseAssignmentApi.getFilteredCourses({ deptId: departmentId, year: filters.yearLevel, semester: filters.semester })
      .then((rows) => { if (!cancelled) { setCourses(Array.isArray(rows) ? rows : []); setAssignments({}); } })
      .catch(() => { if (!cancelled) { setCourses([]); setAssignments({}); } })
      .finally(() => { if (!cancelled) setLoadingCourses(false); });
    return () => { cancelled = true; };
  }, [departmentId, filters.yearLevel, filters.semester]);

  const loadInstructorsForCourse = async (courseId, deptId) => {
    if (!deptId) return;
    try {
      const rows = await courseAssignmentApi.getDepartmentInstructors(deptId);
      const normalizedRows = (Array.isArray(rows) ? rows : []).map((instructor) => ({
        ...instructor,
        instructor_id: instructor.instructor_id || instructor.id || instructor.user_id,
        full_name: instructor.full_name || `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim() || instructor.email || 'Unnamed instructor',
      }));
      setInstructorsMap((current) => ({ ...current, [courseId]: normalizedRows }));
    } catch {
      setInstructorsMap((current) => ({ ...current, [courseId]: [] }));
    }
  };
  useEffect(() => {
    if (!departmentId || !courses.length) return undefined;
    const loadInitialRowInstructors = async () => {
      await Promise.all(courses.map((course) => loadInstructorsForCourse(course.id, departmentId)));
    };
    void loadInitialRowInstructors();
    return undefined;
  }, [courses, departmentId]);

  const handleDeptChange = (courseId, value) => {
    setAssignments((current) => ({ ...current, [courseId]: { ...(current[courseId] || {}), deptId: value, instructorId: '', staffId: '', staffRole: '', role: '' } }));
    loadInstructorsForCourse(courseId, value || departmentId);
  };

  const updateRow = (courseId, field, value) => {
    if (field === 'instructorId') {
      setAssignments((current) => ({
        ...current,
        [courseId]: {
          ...(current[courseId] || {}),
          instructorId: value,
          staffId: value,
          role: current[courseId]?.staffRole || current[courseId]?.role || 'instructor',
        },
      }));
      return;
    }
    setAssignments((current) => ({ ...current, [courseId]: { ...(current[courseId] || {}), [field]: value } }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const assignedRows = courses
      .map((course) => {
        const row = assignments[course.id] || {};
        const staffId = row.staffId || row.instructorId;
        const role = String(row.staffRole || row.role || 'instructor').trim().toLowerCase();
        if (!staffId) return null;
        return { courseId: course.id, staffId, instructorId: staffId, instructor_id: staffId, role };
      })
      .filter(Boolean);
    if (!filters.programType || !filters.yearLevel || !filters.semester || !filters.section || !assignedRows.length) {
      toast.error('Select all filters, a section, and at least one staff member.');
      return;
    }
    setSaving(true);
    try {
      await courseAssignmentApi.batchAssignMatrix({ programType: filters.programType, yearLevel: filters.yearLevel, semester: filters.semester, section: filters.section, assignments: assignedRows });
      toast.success(`${assignedRows.length} course assignment${assignedRows.length === 1 ? '' : 's'} saved.`);
      onAssigned?.();
      onClose();
    } catch (error) {
      toast.error(error.message || 'Unable to save course assignments.');
    } finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"><form onSubmit={submit} className="w-full max-w-6xl rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-gray-900">Assign Courses</h3><p className="text-sm text-gray-500">Select an instructor or lab assistant independently for each course.</p></div><button type="button" onClick={onClose} className="text-gray-500" aria-label="Close">✕</button></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-4"><label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Program Type</span><select value={filters.programType} onChange={updateFilter('programType')} className={selectClass}><option value="">Select</option><option>Regular</option><option>Extension</option><option>Summer</option></select></label><label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Year Level</span><select value={filters.yearLevel} onChange={updateFilter('yearLevel')} className={selectClass}><option value="">Select</option>{YEAR_LEVEL_ASSIGNMENT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Semester</span><select value={filters.semester} onChange={updateFilter('semester')} className={selectClass}><option value="">Select</option><option>I</option><option>II</option></select></label><label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Section</span><select value={filters.section} onChange={updateFilter('section')} className={selectClass}><option value="">Select</option>{sections.map((section) => <option key={section}>{section}</option>)}</select></label></div>
    <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr><th className="px-4 py-3">Course</th><th className="px-4 py-3">Instructor Department</th><th className="px-4 py-3">Instructor / Lab Assistant</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loadingCourses ? <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-500">Loading courses...</td></tr> : courses.length ? courses.map((course) => {
            const row = assignments[course.id] || {};
            const department = row.deptId || String(departmentId || '');
            const instructors = rowInstructors[course.id] || (department === String(departmentId) ? defaultInstructors : []);
            return (
              <tr key={course.id}>
                <td className="px-4 py-4 font-medium text-slate-900">{course.code || course.course_code} · {course.name || course.course_title}</td>
                <td className="px-4 py-4">
                  <select value={department} onChange={(event) => handleDeptChange(course.id, event.target.value)} className={selectClass}>
                    <option value={String(departmentId || '')}>Current Department</option>
                    {departments.filter((item) => String(item.id) !== String(departmentId)).map((item) => <option key={item.id} value={item.id}>{item.name || item.department_name}</option>)}
                  </select>
                </td>
                <td className="px-4 py-4">
                  <InstructorSearchSelect
                    courseId={course.id}
                    instructors={instructors}
                    selectedId={row.instructorId || ''}
                    onSelect={(selectedStaff, staffId) => {
                      const role = String(selectedStaff.role || 'instructor').toLowerCase();
                      updateRow(course.id, 'instructorId', staffId);
                      updateRow(course.id, 'staffRole', role);
                      updateRow(course.id, 'role', role);
                    }}
                    onClear={() => setAssignments((current) => ({
                      ...current,
                      [course.id]: { ...(current[course.id] || {}), instructorId: '', staffId: '', staffRole: '', role: '' },
                    }))}
                  />
                </td>
              </tr>
            );
          }) : <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-500">Select Year Level and Semester to load courses.</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-ieps-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Assign Courses'}</button></div>
  </form></div>;
};

export default CourseAssignmentModal;
