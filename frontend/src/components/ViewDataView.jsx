import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Database, KeyRound, Pencil, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/api';

const PAGE_SIZE = 10;
const STAFF_ROLE_VALUES = new Set([
  'instructor',
  'lab_assistant',
  'dept_head',
  'department_head',
  'head',
  'dean',
  'college_dean',
  'academic_director',
  'academic_directorate',
  'directorate',
  'director',
]);

const programLabel = (value) => (String(value || '').trim().toLowerCase() === 'extension' ? 'Extension' : value ? 'Regular' : '-');

const getRoleLabel = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  const roleMap = {
    director: 'Academic Director',
    academic_director: 'Academic Director',
    academic_directorate: 'Academic Director',
    head: 'Department Head',
    department_head: 'Department Head',
    dept_head: 'Department Head',
    dean: 'College Dean',
    college_dean: 'College Dean',
    instructor: 'Instructor',
    lab_assistant: 'Lab Assistant',
    student: 'Student',
    admin: 'System Admin',
    systemadmin: 'System Admin',
    system_admin: 'System Admin',
  };

  return roleMap[normalized] || normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'User';
};

const getRoleBadgeStyles = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (['director', 'academic_director', 'academic_directorate'].includes(normalized)) {
    return 'bg-violet-100 text-violet-700 ring-violet-200';
  }

  if (['head', 'department_head', 'dept_head'].includes(normalized)) {
    return 'bg-blue-100 text-blue-700 ring-blue-200';
  }

  if (['dean', 'college_dean'].includes(normalized)) {
    return 'bg-indigo-100 text-indigo-700 ring-indigo-200';
  }

  if (normalized === 'instructor') {
    return 'bg-amber-100 text-amber-700 ring-amber-200';
  }

  if (normalized === 'lab_assistant') {
    return 'bg-cyan-100 text-cyan-700 ring-cyan-200';
  }

  if (normalized === 'student') {
    return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
  }

  if (['admin', 'systemadmin', 'system_admin'].includes(normalized)) {
    return 'bg-slate-100 text-slate-700 ring-slate-200';
  }

  return 'bg-slate-100 text-slate-700 ring-slate-200';
};

const RoleBadge = ({ value }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${getRoleBadgeStyles(value || 'instructor')}`}>
    {getRoleLabel(value || 'instructor')}
  </span>
);

const normalizeStatus = (value) => String(value ?? 'active').trim().toLowerCase() || 'active';

const formatStatusLabel = (value) => {
  const normalized = normalizeStatus(value);
  return normalized === 'archived' ? 'Archived' : 'Active';
};

const statusBadgeClass = (value) => {
  const normalized = normalizeStatus(value);
  return normalized === 'archived'
    ? 'bg-slate-200 text-slate-700 ring-slate-300'
    : 'bg-emerald-100 text-emerald-700 ring-emerald-200';
};

const toDisplayName = (row) => {
  if (row?.fullName || row?.full_name) return row.fullName || row.full_name;
  const candidate = [row?.first_name, row?.last_name, row?.firstName, row?.lastName].filter(Boolean).join(' ');
  if (candidate) return candidate;
  if (row?.username) return row.username;
  if (row?.email) return row.email;
  return '-';
};

const splitFullName = (value) => {
  const safeValue = String(value ?? '').trim();
  if (!safeValue) return { firstName: '', lastName: '' };
  const parts = safeValue.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
};

const ViewDataView = ({ instructors = [], students = [], departments = [], onResetPassword, allUsers = [] }) => {
  const [activeTab, setActiveTab] = useState('colleges');
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [expandedCollegeIds, setExpandedCollegeIds] = useState(new Set());
  const [editingDepartmentKey, setEditingDepartmentKey] = useState(null);
  const [draftDepartment, setDraftDepartment] = useState({ name: '', code: '' });
  const [localDepartments, setLocalDepartments] = useState(() => departments);
  const [localInstructors, setLocalInstructors] = useState(() => instructors);
  const [localStudents, setLocalStudents] = useState(() => students);
  const [localAllUsers, setLocalAllUsers] = useState(() => allUsers);
  const [archivingUserId, setArchivingUserId] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    departmentId: '',
    employeeId: '',
    studentId: '',
    year: '',
    section: '',
    programType: 'regular',
    status: 'active',
  });

  useEffect(() => {
    setLocalDepartments(Array.isArray(departments) ? departments.map((department) => ({
      ...department,
      id: department.id ?? department.dept_id,
      college_id: department.college_id ?? department.collegeId,
      college_name: department.college_name ?? department.collegeName ?? 'Unassigned College',
      name: department.name ?? department.department_name ?? department.dept_name ?? 'Department',
      code: department.code ?? department.department_code ?? department.dept_code ?? '',
      status: String(department.status ?? department.dept_status ?? 'active').trim() || 'active',
    })) : []);
  }, [departments]);

  useEffect(() => {
    setLocalInstructors(Array.isArray(instructors) ? instructors : []);
  }, [instructors]);

  useEffect(() => {
    setLocalStudents(Array.isArray(students) ? students : []);
  }, [students]);

  useEffect(() => {
    setLocalAllUsers(Array.isArray(allUsers) ? allUsers : []);
  }, [allUsers]);

  const collegeHierarchy = useMemo(() => {
    const grouped = new Map();
    localDepartments.forEach((department) => {
      const collegeId = String(department.college_id ?? department.collegeId ?? 'unassigned');
      const collegeName = String(department.college_name ?? department.collegeName ?? 'Unassigned College').trim() || 'Unassigned College';
      const normalizedDepartment = {
        ...department,
        id: department.id ?? department.dept_id,
        name: department.name ?? department.department_name ?? department.dept_name ?? 'Department',
        code: department.code ?? department.department_code ?? department.dept_code ?? '',
        status: String(department.status ?? department.dept_status ?? 'active').trim() || 'active',
      };

      if (!grouped.has(collegeId)) {
        grouped.set(collegeId, {
          id: collegeId,
          name: collegeName,
          code: department.college_code ?? department.collegeCode ?? '',
          status: String(department.college_status ?? department.collegeStatus ?? 'active').trim() || 'active',
          departments: [],
        });
      }

      grouped.get(collegeId).departments.push(normalizedDepartment);
    });

    return Array.from(grouped.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [localDepartments]);

  const openEditModal = (row) => {
    const rawRole = String(row?.role ?? '').trim().toLowerCase();
    const departmentValue = row?.departmentId ?? row?.department_id ?? row?.department ?? '';
    const suggestedProgram = String(row?.programType ?? row?.program_type ?? 'regular').trim() || 'regular';

    setEditingUser(row);
    setEditForm({
      fullName: toDisplayName(row),
      email: row?.email || '',
      departmentId: departmentValue,
      employeeId: row?.employeeId || row?.employee_id || '',
      studentId: row?.studentId || row?.student_id || '',
      year: row?.year || row?.year_level || '',
      section: row?.section || '',
      programType: suggestedProgram,
      status: row?.status || 'active',
    });
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setIsSavingUser(false);
    setEditForm({
      fullName: '',
      email: '',
      departmentId: '',
      employeeId: '',
      studentId: '',
      year: '',
      section: '',
      programType: 'regular',
      status: 'active',
    });
  };

  const updateLocalUserList = (userId, nextRow, targetType) => {
    const updateRows = (currentRows) => currentRows.map((entry) => (Number(entry.id) === Number(userId) ? { ...entry, ...nextRow } : entry));

    if (targetType === 'instructor') {
      setLocalInstructors(updateRows);
      return;
    }

    if (targetType === 'student') {
      setLocalStudents(updateRows);
    }
  };

  const handleArchiveUser = async (row) => {
    if (!row?.id) return;

    const nextStatus = normalizeStatus(row.status) === 'archived' ? 'active' : 'archived';
    setArchivingUserId(row.id);
    try {
      const response = await adminApi.toggleArchiveUser(row.id, nextStatus);
      const savedStatus = response?.status || response?.data?.status || nextStatus;
      const updateStatus = (current) => current.map((entry) => (Number(entry.id) === Number(row.id) ? { ...entry, status: savedStatus } : entry));

      setLocalAllUsers(updateStatus);

      if (String(row.role).toLowerCase() === 'student') {
        setLocalStudents(updateStatus);
      } else {
        setLocalInstructors(updateStatus);
      }

      toast.success(savedStatus === 'archived' ? 'User archived successfully.' : 'User restored successfully.');
    } catch (error) {
      toast.error(error?.message || 'Unable to update archive status.');
    } finally {
      setArchivingUserId(null);
    }
  };

  const handleDeleteUser = async (row) => {
    if (!row?.id) return;
    const confirmed = window.confirm('Are you sure you want to permanently delete this user?');
    if (!confirmed) return;

    try {
      await adminApi.deleteUser(row.id);
      setLocalAllUsers((current) => current.filter((entry) => Number(entry.id) !== Number(row.id)));

      if (String(row.role).toLowerCase() === 'student') {
        setLocalStudents((current) => current.filter((entry) => Number(entry.id) !== Number(row.id)));
      } else {
        setLocalInstructors((current) => current.filter((entry) => Number(entry.id) !== Number(row.id)));
      }

      toast.success('User deleted successfully.');
    } catch (error) {
      toast.error(error?.message || 'Unable to delete this user.');
    }
  };

  const handleEditUserSubmit = async (event) => {
    event.preventDefault();
    if (!editingUser?.id) return;

    setIsSavingUser(true);

    try {
      const payload = {
        full_name: editForm.fullName || `${splitFullName(editForm.fullName).firstName} ${splitFullName(editForm.fullName).lastName}`.trim(),
        email: editForm.email || null,
        department_id: editForm.departmentId || null,
        status: editForm.status || 'active',
        ...(String(editingUser.role ?? '').toLowerCase() === 'student'
          ? {
              student_id: editForm.studentId || null,
              year: editForm.year || null,
              section: editForm.section || null,
              program_type: editForm.programType || null,
            }
          : {
              employee_id: editForm.employeeId || null,
            }),
      };

      const response = await adminApi.updateUser(editingUser.id, payload);
      const updatedUser = response?.data || response || editingUser;
      const normalizedRole = String(editingUser.role ?? '').trim().toLowerCase();
      const updatedRow = {
        ...editingUser,
        fullName: editForm.fullName || toDisplayName(editingUser),
        email: editForm.email || editingUser.email || '',
        departmentId: editForm.departmentId || editingUser.departmentId || editingUser.department_id || '',
        department_id: editForm.departmentId || editingUser.departmentId || editingUser.department_id || '',
        department: editForm.departmentId || editingUser.departmentId || editingUser.department_id || '',
        employeeId: editForm.employeeId || editingUser.employeeId || editingUser.employee_id || '',
        employee_id: editForm.employeeId || editingUser.employeeId || editingUser.employee_id || '',
        studentId: editForm.studentId || editingUser.studentId || editingUser.student_id || '',
        student_id: editForm.studentId || editingUser.studentId || editingUser.student_id || '',
        year: editForm.year || editingUser.year || editingUser.year_level || '',
        year_level: editForm.year || editingUser.year || editingUser.year_level || '',
        section: editForm.section || editingUser.section || '',
        programType: editForm.programType || editingUser.programType || editingUser.program_type || '',
        program_type: editForm.programType || editingUser.programType || editingUser.program_type || '',
        status: editForm.status || editingUser.status || 'active',
      };
      setLocalAllUsers((current) => current.map((entry) => (Number(entry.id) === Number(editingUser.id) ? updatedRow : entry)));

      if (normalizedRole === 'student') {
        setLocalStudents((current) => current.map((entry) => (Number(entry.id) === Number(editingUser.id) ? updatedRow : entry)));
      } else {
        setLocalInstructors((current) => current.map((entry) => (Number(entry.id) === Number(editingUser.id) ? updatedRow : entry)));
      }

      toast.success(updatedUser?.message || 'User updated successfully.');
      closeEditModal();
    } catch (error) {
      toast.error(error?.message || 'Unable to save user changes.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const renderActionButtons = (row) => {
    const rawRole = String(row?.role ?? '').trim().toLowerCase();
    const isArchived = normalizeStatus(row?.status) === 'archived';

    return (
      <div className="flex items-center justify-start gap-2">
        <button
          type="button"
          onClick={() => openEditModal(row)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-sky-900 transition hover:bg-slate-100"
        >
          <Pencil size={12} className="text-sky-900" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => handleArchiveUser(row)}
          disabled={Number(archivingUserId) === Number(row.id)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-sky-900 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-50"
        >
          {Number(archivingUserId) === Number(row.id) ? 'Saving...' : isArchived ? 'Restore' : 'Archive'}
        </button>
        <button
          type="button"
          onClick={() => onResetPassword?.(row)}
          disabled={!row?.id || typeof onResetPassword !== 'function'}
          title={`Reset password for ${toDisplayName(row)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <KeyRound size={12} aria-hidden="true" />
          Reset Password
        </button>
        <button
          type="button"
          onClick={() => handleDeleteUser(row)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-[#FEF2F2] px-2.5 py-1.5 text-[11px] font-semibold text-[#991B1B] transition hover:bg-red-100"
        >
          <Trash2 size={12} className="text-[#991B1B]" />
          Delete
        </button>
      </div>
    );
  };

  const entityConfig = useMemo(() => ({
    colleges: {
      label: 'Colleges',
      rows: collegeHierarchy,
      searchValues: (row) => [row.name, row.code, ...(row.departments || []).map((department) => department.name || department.department_name || department.code || department.department_code)],
      columns: [
        ['College', (row) => row.name],
        ['Code', (row) => row.code || '-'],
        ['Departments', (row) => `${(row.departments || []).length}`],
        ['Status', (row) => row.status || 'Active'],
      ],
    },
    instructors: {
      label: 'Instructors',
      rows: (localAllUsers.length ? localAllUsers : localInstructors).filter((row) => {
        const role = String(row?.role ?? '').trim().toLowerCase();
        return STAFF_ROLE_VALUES.has(role);
      }),
      searchValues: (row) => [row.username, row.email, row.employeeId, row.employee_id, row.role, row.fullName, row.full_name],
      columns: [
        ['ID', (row) => row.id],
        ['Name', (row) => toDisplayName(row)],
        ['Role', (row) => <RoleBadge value={row.role} />],
        ['Username / Email', (row) => row.username || row.email || '-'],
        ['Employee ID', (row) => row.employeeId || row.employee_id || '-'],
        ['Department', (row) => row.departmentName || row.department || '-'],
        ['Status', (row) => (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusBadgeClass(row.status)}`}>
            {formatStatusLabel(row.status)}
          </span>
        )],
        ['Actions', (row) => renderActionButtons(row)],
      ],
    },
    students: {
      label: 'Students',
      rows: localStudents,
      searchValues: (row) => [row.studentId, row.student_id, row.fullName, row.full_name, row.email, row.username],
      columns: [
        ['ID', (row) => row.id],
        ['Student ID', (row) => row.studentId || row.student_id || '-'],
        ['Name', (row) => toDisplayName(row)],
        ['Department', (row) => row.departmentName || row.department || '-'],
        ['Program Type', (row) => programLabel(row.programType || row.program_type)],
        ['Year / Section', (row) => `${row.year || row.year_level || '-'} / ${row.section || '-'}`],
        ['Status', (row) => (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusBadgeClass(row.status)}`}>
            {formatStatusLabel(row.status)}
          </span>
        )],
        ['Actions', (row) => renderActionButtons(row)],
      ],
    },
  }), [collegeHierarchy, localAllUsers, localInstructors, localStudents, renderActionButtons]);

  const activeEntity = entityConfig[activeTab];
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const yearNumber = (value) => normalize(value).match(/\d+/)?.[0] || '';
    const sectionValue = (value) => normalize(value).replace(/^section\s*/, '');
    return activeEntity.rows.filter((row) => {
      const rowDepartment = String(row.department_id || row.departmentId || '').trim();
      const rowProgram = normalize(row.program_type || row.programType || row.program);
      const rowYear = yearNumber(row.year_level || row.year || row.yearLevel);
      const rowSection = sectionValue(row.section);
      const matchesDepartment = !['students', 'instructors'].includes(activeTab)
        || departmentFilter === 'all'
        || rowDepartment === departmentFilter;
      const matchesProgram = activeTab !== 'students'
        || programFilter === 'all'
        || rowProgram === programFilter;
      const matchesYear = activeTab !== 'students'
        || yearFilter === 'all'
        || rowYear === yearFilter;
      const matchesSection = activeTab !== 'students'
        || sectionFilter === 'all'
        || rowSection === sectionFilter;
      const matchesQuery = !normalizedQuery
        || activeEntity.searchValues(row).some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
      return matchesDepartment && matchesProgram && matchesYear && matchesSection && matchesQuery;
    });
  }, [activeEntity, activeTab, departmentFilter, programFilter, query, sectionFilter, yearFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstEntry = filteredRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastEntry = Math.min(currentPage * PAGE_SIZE, filteredRows.length);

  useEffect(() => {
    setPage(1);
  }, [activeTab, departmentFilter, programFilter, query, sectionFilter, yearFilter]);

  const toggleCollege = (collegeId) => {
    setExpandedCollegeIds((current) => {
      const next = new Set(current);
      if (next.has(collegeId)) next.delete(collegeId); else next.add(collegeId);
      return next;
    });
  };

  const beginEditDepartment = (collegeId, department) => {
    const key = `${collegeId}-${department.id ?? department.dept_id ?? department.name}`;
    setEditingDepartmentKey(key);
    setDraftDepartment({
      name: department.name ?? department.department_name ?? '',
      code: department.code ?? department.department_code ?? '',
    });
  };

  const saveDepartmentEdit = (collegeId, department) => {
    const departmentId = department.id ?? department.dept_id;
    if (!departmentId) return;

    const key = `${collegeId}-${departmentId}`;
    setLocalDepartments((current) => current.map((entry) => {
      const entryId = entry.id ?? entry.dept_id;
      const entryCollegeId = String(entry.college_id ?? entry.collegeId ?? '');
      if (entryId === departmentId && String(entryCollegeId) === String(collegeId)) {
        return {
          ...entry,
          name: draftDepartment.name || entry.name || 'Department',
          code: draftDepartment.code || entry.code || '',
          department_name: draftDepartment.name || entry.department_name || entry.name || 'Department',
          department_code: draftDepartment.code || entry.department_code || entry.code || '',
        };
      }
      return entry;
    }));
    setEditingDepartmentKey(null);
    setDraftDepartment({ name: '', code: '' });
  };

  const toggleDepartmentStatus = (collegeId, department) => {
    const departmentId = department.id ?? department.dept_id;
    setLocalDepartments((current) => current.map((entry) => {
      const entryId = entry.id ?? entry.dept_id;
      const entryCollegeId = String(entry.college_id ?? entry.collegeId ?? '');
      if (entryId === departmentId && String(entryCollegeId) === String(collegeId)) {
        const nextStatus = String(entry.status ?? entry.dept_status ?? 'active').toLowerCase() === 'active' ? 'archived' : 'active';
        return {
          ...entry,
          status: nextStatus,
          dept_status: nextStatus,
        };
      }
      return entry;
    }));
  };

  const deleteDepartment = (collegeId, department) => {
    const departmentId = department.id ?? department.dept_id;
    setLocalDepartments((current) => current.filter((entry) => {
      const entryId = entry.id ?? entry.dept_id;
      const entryCollegeId = String(entry.college_id ?? entry.collegeId ?? '');
      return !(String(entryCollegeId) === String(collegeId) && String(entryId) === String(departmentId));
    }));
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_55px_-34px_rgba(37,99,235,0.24)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Database size={22} className="text-blue-600" aria-hidden="true" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">View Data</h2>
            <p className="mt-1 text-slate-600">Browse registered colleges, instructors, and students.</p>
          </div>
        </div>
        <label className="relative block w-full lg:w-80">
          <span className="sr-only">Search {activeEntity.label}</span>
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeTab === 'instructors' ? 'username, email, or employee ID' : activeTab === 'students' ? 'student ID or name' : 'college or department'}...`} className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        {Object.entries(entityConfig).map(([id, entity]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setActiveTab(id);
              setQuery('');
              setDepartmentFilter('all');
              setProgramFilter('all');
              setYearFilter('all');
              setSectionFilter('all');
            }}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${activeTab === id ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 hover:bg-slate-100 hover:text-blue-600'}`}
          >
            {entity.label}
          </button>
        ))}
      </div>

      {['students', 'instructors'].includes(activeTab) && (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">Department<select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="all">All Departments</option>{localDepartments.map((department) => <option key={department.id ?? `${department.college_id}-${department.name}`} value={String(department.id ?? department.dept_id ?? '')}>{department.name || department.department_name}</option>)}</select></label>
          {activeTab === 'students' && <>
            <label className="text-sm font-medium text-slate-700">Program Type<select value={programFilter} onChange={(event) => setProgramFilter(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="all">All Programs</option><option value="regular">Regular</option><option value="extension">Extension</option></select></label>
            <label className="text-sm font-medium text-slate-700">Year Level<select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="all">All Years</option>{Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{index + 1}{index === 0 ? 'st' : index === 1 ? 'nd' : index === 2 ? 'rd' : 'th'} Year</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Section<select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="all">All Sections</option>{'A B C D E F G H I J K L'.split(' ').map((section) => <option key={section} value={section.toLowerCase()}>Section {section}</option>)}</select></label>
          </>}
        </div>
      )}

      {activeTab === 'colleges' ? (
        <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_-34px_rgba(37,99,235,0.24)]">
          {filteredRows.length ? filteredRows.map((college) => {
            const isExpanded = expandedCollegeIds.has(String(college.id));

            return (
              <div key={college.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <button type="button" onClick={() => toggleCollege(college.id)} className="flex w-full items-center justify-between gap-4 bg-transparent px-4 py-4 text-left transition hover:bg-slate-100">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">College</p>
                    <h3 className="mt-1 text-xl font-bold text-slate-900">{college.name}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span className="rounded-full bg-white px-2.5 py-1 font-medium">{college.code || 'No code'}</span>
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-700">{college.departments?.length || 0} departments</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${String(college.status || 'active').toLowerCase() === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                      {String(college.status || 'active').charAt(0).toUpperCase() + String(college.status || 'active').slice(1)}
                    </span>
                    {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-200 bg-white px-4 py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Assigned departments</h4>
                      <span className="text-sm text-slate-500">{college.departments?.length || 0} total</span>
                    </div>

                    <div className="space-y-3">
                      {(college.departments || []).length ? college.departments.map((department) => {
                        const departmentKey = `${college.id}-${department.id ?? department.dept_id ?? department.name}`;
                        const isEditing = editingDepartmentKey === departmentKey;
                        const normalizedStatus = String(department.status ?? department.dept_status ?? 'active').trim().toLowerCase();

                        return (
                          <div key={departmentKey} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div className="min-w-0 flex-1">
                                {isEditing ? (
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <input value={draftDepartment.name} onChange={(event) => setDraftDepartment((current) => ({ ...current, name: event.target.value }))} placeholder="Department name" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                                    <input value={draftDepartment.code} onChange={(event) => setDraftDepartment((current) => ({ ...current, code: event.target.value }))} placeholder="Department code" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-800">{department.name || department.department_name || 'Department'}</p>
                                      <p className="mt-1 text-xs text-slate-500">{department.code || department.department_code || 'No code'}</p>
                                    </div>
                                    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${normalizedStatus === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                                      {normalizedStatus === 'active' ? 'Active' : 'Archived'}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {isEditing ? (
                                  <>
                                    <button type="button" onClick={() => saveDepartmentEdit(college.id, department)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Save</button>
                                    <button type="button" onClick={() => { setEditingDepartmentKey(null); setDraftDepartment({ name: '', code: '' }); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => beginEditDepartment(college.id, department)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"><Pencil size={12} /> Edit</button>
                                    <button type="button" onClick={() => toggleDepartmentStatus(college.id, department)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">{normalizedStatus === 'active' ? 'Archive' : 'Restore'}</button>
                                    <button type="button" onClick={() => deleteDepartment(college.id, department)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"><Trash2 size={12} /> Delete</button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No departments assigned to this college yet.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-500">No colleges found.</div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_55px_-34px_rgba(37,99,235,0.24)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h3 className="font-semibold text-slate-900">{activeEntity.label}</h3>
            <span className="text-sm text-slate-500">{filteredRows.length} record{filteredRows.length === 1 ? '' : 's'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50"><tr>{activeEntity.columns.map(([label]) => <th key={label} className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.length ? pageRows.map((row, index) => <tr key={row.id ?? index} className="hover:bg-blue-50/40">{activeEntity.columns.map(([label, getValue]) => <td key={label} className="whitespace-nowrap px-5 py-4 text-slate-700">{getValue(row)}</td>)}</tr>) : <tr><td colSpan={activeEntity.columns.length} className="px-5 py-12 text-center text-slate-500">No matching {activeEntity.label.toLowerCase()} found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Showing {firstEntry} to {lastEntry} of {filteredRows.length} entries</p>
            <div className="flex items-center justify-center gap-1">
              <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} className={`min-w-9 rounded-lg px-3 py-2 text-sm font-semibold ${currentPage === pageNumber ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'}`}>{pageNumber}</button>)}
              <button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Edit User</p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">{toDisplayName(editingUser)}</h3>
              </div>
              <button type="button" onClick={closeEditModal} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditUserSubmit} className="space-y-5 px-5 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Full Name
                  <input value={editForm.fullName} onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Email
                  <input type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Department
                  <select value={editForm.departmentId} onChange={(event) => setEditForm((current) => ({ ...current, departmentId: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    <option value="">Select department</option>
                    {localDepartments.map((department) => (
                      <option key={department.id ?? `${department.college_id}-${department.name}`} value={String(department.id ?? department.dept_id ?? '')}>{department.name || department.department_name}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  {String(editingUser.role ?? '').toLowerCase() === 'student' ? 'Student ID' : 'Employee ID'}
                  <input value={String(editingUser.role ?? '').toLowerCase() === 'student' ? editForm.studentId : editForm.employeeId} onChange={(event) => setEditForm((current) => ({ ...current, ...(String(editingUser.role ?? '').toLowerCase() === 'student' ? { studentId: event.target.value } : { employeeId: event.target.value }) }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Year
                  <input value={editForm.year} onChange={(event) => setEditForm((current) => ({ ...current, year: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Section
                  <input value={editForm.section} onChange={(event) => setEditForm((current) => ({ ...current, section: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </label>

                {String(editingUser.role ?? '').toLowerCase() === 'student' && (
                  <label className="text-sm font-medium text-slate-700">
                    Program Type
                    <select value={editForm.programType} onChange={(event) => setEditForm((current) => ({ ...current, programType: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                      <option value="regular">Regular</option>
                      <option value="extension">Extension</option>
                    </select>
                  </label>
                )}

                <label className="text-sm font-medium text-slate-700">
                  Status
                  <select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button type="button" onClick={closeEditModal} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={isSavingUser} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {isSavingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default ViewDataView;
