import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaUsers,
  FaChalkboardTeacher,
  FaBook,
  FaShieldAlt,
  FaClipboardCheck,
  FaChartBar,
  FaGraduationCap,
  FaBell,
  FaDatabase,
} from 'react-icons/fa';
import { BarChart3, CheckCircle2, Clock3, Eye, Filter, RefreshCw, RotateCcw, Search, Send, Trash2, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminData, getYearLevelLabel, getYearLevelNumber, YEAR_LEVEL_ASSIGNMENT_OPTIONS, YEAR_LEVEL_FILTER_OPTIONS, YEAR_LEVEL_OPTIONS } from '../data/adminOptions';
import InstructorsSection from '../components/admin/InstructorsSection';
import EvaluationWorkflow from '../components/EvaluationWorkflow';
import { useTranslation } from '../context/useTranslation';
import { useAuth } from '../context/useAuth';
import { departmentApi, registrationApi, evaluationApi, courseAssignmentApi, notificationApi } from '../services/api';
import DispatchEvaluationModal from '../components/DispatchEvaluationModal';
import EvaluationTemplateBuilder from '../components/EvaluationTemplateBuilder';
import InstructorEvaluationCriteriaModal from '../components/InstructorEvaluationCriteriaModal';
import EvaluationBreakdownModal from '../components/EvaluationBreakdownModal';
import CourseAssignmentModal from '../components/CourseAssignmentModal';
import DeptHeadPerformanceDashboard from '../components/DeptHeadPerformanceDashboard';
import PublishEvaluation from './PublishEvaluation';
import OfficialDepartmentReport from '../components/OfficialDepartmentReport';
import { getReportCompletion } from '../utils/reportCompletion';
import { printDocument } from '../utils/printDocument';
import DepartmentResultCertificates from '../components/DepartmentResultCertificates';
import { dispatchForm, SUBMISSIONS_UPDATED_EVENT } from '../services/formSubmissions';
import EvaluationTracking from '../components/EvaluationTracking';
import IPESAISmartInsights from '../components/ai/IPESAISmartInsights';
import { AnomaliesModal, PendingStudentsModal } from '../components/ai/AIActionModals';
import { normalizeSemester } from '../utils/semester';

const STUDENT_EVAL_TEMPLATE_KEY = 'ipesStudentEvalTemplate';

const DeptHeadDashboard = ({ isMobileMenuOpen = false, setIsMobileMenuOpen = () => {} }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUser = user || null;
  const normalizedRole = String(currentUser?.role || '').trim().toLowerCase();
  const isDepartmentSummaryRole = ['depthead', 'dept_head', 'department_head', 'college_dean', 'dean'].includes(normalizedRole);
  const departmentId = currentUser?.department_id || currentUser?.departmentId || currentUser?.department || null;
  const today = new Date().toISOString().split('T')[0];

  const [activeTab, setActiveTab] = useState('overview');
  const [viewDataTab, setViewDataTab] = useState('instructors');
  const [viewDataRows, setViewDataRows] = useState([]);
  const [viewDataCurrentPage, setViewDataCurrentPage] = useState(1);
  const [viewDataItemsPerPage, setViewDataItemsPerPage] = useState(5);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [savingCourseEdit, setSavingCourseEdit] = useState(false);
  const [deletingCourseId, setDeletingCourseId] = useState(null);
  const [studentFilter, setStudentFilter] = useState({ year: 'ALL', semester: 'ALL', section: 'ALL', program: 'ALL', search: '' });
  const [courseFilter, setCourseFilter] = useState({ year: 'ALL', semester: 'ALL' });
  const [selectedViewDataStudent, setSelectedViewDataStudent] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [selectedForDelete, setSelectedForDelete] = useState(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);
  const [assignmentFilters, setAssignmentFilters] = useState({ staffType: 'ALL', year: 'ALL', semester: 'ALL', section: 'ALL', search: '' });
  const [assignmentCurrentPage, setAssignmentCurrentPage] = useState(1);
  const [assignmentItemsPerPage, setAssignmentItemsPerPage] = useState(5);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [assignmentEditStaff, setAssignmentEditStaff] = useState([]);
  const [assignmentEditForm, setAssignmentEditForm] = useState(null);
  const [assignmentEditSaving, setAssignmentEditSaving] = useState(false);
  const [selectedAssignmentIdForEvaluation, setSelectedAssignmentIdForEvaluation] = useState('');

  useEffect(() => {
    if (!selectedForDelete) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !deletingAssignment) setSelectedForDelete(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deletingAssignment, selectedForDelete]);
  const [users, setUsers] = useState([]);
  const [assignmentInstructors, setAssignmentInstructors] = useState([]);
  const [studentFilters, setStudentFilters] = useState({ yearLevel: 'all', section: 'all' });
  const [courses, setCourses] = useState([]);
  const [overviewStats, setOverviewStats] = useState({ totalInstructors: 0, totalStudents: 0, totalCourses: 0, totalLabAssistants: 0, activeAssignments: 0 });
  const [departmentCoursesLoading, setDepartmentCoursesLoading] = useState(false);
  const [evaluations, setEvaluations] = useState([]);
  const [departmentReports, setDepartmentReports] = useState([]);
  const [formNotification, setFormNotification] = useState('');
  const [trackingView, setTrackingView] = useState('student');
  const [trackingFilters, setTrackingFilters] = useState({ year_level: 'All Years', section: 'All Sections', program_type: 'All Programs', evaluatee_id: '', target_role: 'instructor' });
  const [trackingSearch, setTrackingSearch] = useState('');
  const [trackingDetails, setTrackingDetails] = useState(null);
  const [trackingResultRows, setTrackingResultRows] = useState([]);
  const [peerTrackingInstructor, setPeerTrackingInstructor] = useState('');
  const [peerTrackingRole, setPeerTrackingRole] = useState('instructor');
  const [peerTrackingRows, setPeerTrackingRows] = useState([]);
  const [deptTrackingInstructor, setDeptTrackingInstructor] = useState('');
  const [deptTrackingRole, setDeptTrackingRole] = useState('instructor');
  const [deptTrackingRows, setDeptTrackingRows] = useState([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingMessage, setTrackingMessage] = useState('');
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderTarget, setReminderTarget] = useState('');
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showInstructorModal, setShowInstructorModal] = useState(false);
  const [studentEvalForm, setStudentEvalForm] = useState({
    academicYear: adminData.academicYears[4]?.name || '2024/2025',
    semester: adminData.semesters[0]?.name || 'Semester I',
    yearLevel: adminData.yearLevels[2]?.name || 'Year III',
    collegeId: '',
    departmentId: '',
    courseId: '',
    studentGroup: '',
    studentId: '',
  });
  const [studentEvalTemplate, setStudentEvalTemplate] = useState('');
  const [studentEvalTemplateId, setStudentEvalTemplateId] = useState(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [instructorEvalForm, setInstructorEvalForm] = useState({ evaluatorId: '', targetInstructorId: '', criteria: '', semester: 'Semester I' });
  const [submissions, setSubmissions] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [deptInstructorsList, setDeptInstructorsList] = useState([]);
  const [staffCurrentPage, setStaffCurrentPage] = useState(1);
  const [staffItemsPerPage, setStaffItemsPerPage] = useState(5);
  const [deptEvalLoading, setDeptEvalLoading] = useState(false);
  const [selectedDeptInstructor, setSelectedDeptInstructor] = useState(null);
  const [showDeptEvalModal, setShowDeptEvalModal] = useState(false);
  const [deptEvalCriteriaScores, setDeptEvalCriteriaScores] = useState({});
  const [deptEvalSubmitting, setDeptEvalSubmitting] = useState(false);
  const [deptEvalError, setDeptEvalError] = useState('');
  const [showEvaluationBreakdown, setShowEvaluationBreakdown] = useState(false);
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [courseForm, setCourseForm] = useState({ name: '', code: '', yearLevel: '', semester: '', creditHours: '' });
  const [reportAcademicYear, setReportAcademicYear] = useState('');
  const [reportSemester, setReportSemester] = useState('');
  const [officialReportRow, setOfficialReportRow] = useState(null);
  const [courseCsvFile, setCourseCsvFile] = useState(null);
  const [courseCsvUploading, setCourseCsvUploading] = useState(false);
  const [aiInsights, setAiInsights] = useState({});
  const [pendingStudents, setPendingStudents] = useState([]);
  const [pendingStudentsLoading, setPendingStudentsLoading] = useState(false);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [anomaliesModalOpen, setAnomaliesModalOpen] = useState(false);

  const handleAiAction = async (actionType) => {
    if (actionType === 'VIEW_PENDING' || actionType === 'VIEW_DEPARTMENT_PENDING') {
      setPendingModalOpen(true);
      setPendingStudentsLoading(true);
      try {
        const rows = await evaluationApi.getDeptHeadPendingStudents();
        setPendingStudents(Array.isArray(rows) ? rows : []);
      } catch {
        setPendingStudents([]);
      } finally {
        setPendingStudentsLoading(false);
      }
    }
    if (actionType === 'INSPECT_ANOMALIES' || actionType === 'INSPECT_SCORE_ANOMALIES') {
      setAnomalyOnly(true);
      setAnomaliesModalOpen(true);
      return true;
    }
    if (actionType === 'SEND_REMINDERS') {
      await sendEvaluationReminder();
    }
    if (actionType === 'EXPORT_SUMMARY' || actionType === 'EXPORT_REPORT') {
      const rows = aiInsights?.summary || [];
      const csv = [
        ['Metric', 'Value'],
        ['Completion rate', `${Number(aiInsights?.completionRate ?? 0).toFixed(1)}%`],
        ['Average evaluation score', `${Number(aiInsights?.averageScore ?? 0).toFixed(1)}%`],
        ['Top feedback keywords', Array.isArray(aiInsights?.topFeedbackKeywords) ? aiInsights.topFeedbackKeywords.join(' | ') : ''],
        ...rows.map((entry) => ['Observation', entry]),
      ].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dept-head-ai-insights-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('AI insight summary exported successfully.');
    }
  };

  const filteredViewDataRows = useMemo(() => {
    if (viewDataTab === 'students') {
      const normalize = (value) => String(value || '').trim().toLowerCase();
      const yearToken = (value) => {
        const normalized = normalize(value);
        const roman = { i: '1', ii: '2', iii: '3', iv: '4', v: '5' };
        return roman[normalized.replace(/^year\s+/, '')] || normalized.match(/\d+/)?.[0] || normalized;
      };
      const section = (value) => normalize(value).replace(/^section\s*/, '');
      return viewDataRows.filter((student) => {
        const search = normalize(studentFilter.search);
        const name = student.name || student.full_name || `${student.first_name || ''} ${student.last_name || ''}`;
        const studentId = student.student_id || student.studentId || '';
        const studentSemester = normalizeSemester(student.semester);
        const selectedSemester = normalizeSemester(studentFilter.semester);
        return (studentFilter.year === 'ALL' || yearToken(student.year_level || student.year) === yearToken(studentFilter.year))
          && (studentFilter.semester === 'ALL' || studentSemester === selectedSemester)
          && (studentFilter.section === 'ALL' || section(student.section) === section(studentFilter.section))
          && (studentFilter.program === 'ALL' || normalize(student.program_type || student.program) === normalize(studentFilter.program))
          && (!search || normalize(name).includes(search) || normalize(studentId).includes(search));
      });
    }
    if (viewDataTab === 'courses') {
      const normalize = (value) => String(value || '').trim().toLowerCase();
      const yearToken = (value) => normalize(value).match(/\d+/)?.[0] || ({ i: '1', ii: '2', iii: '3', iv: '4', v: '5' }[normalize(value).replace(/^year\s+/, '')] || normalize(value));
      return viewDataRows.filter((course) => (
        (courseFilter.year === 'ALL' || yearToken(course.year_level || course.year) === yearToken(courseFilter.year))
        && (courseFilter.semester === 'ALL' || normalize(course.semester) === normalize(courseFilter.semester))
      ));
    }
    return viewDataRows;
  }, [courseFilter, studentFilter, viewDataRows, viewDataTab]);

  const viewDataTotalItems = filteredViewDataRows.length;
  const viewDataTotalPages = Math.max(1, Math.ceil(viewDataTotalItems / viewDataItemsPerPage));
  const paginatedViewData = useMemo(() => {
    const startIndex = (viewDataCurrentPage - 1) * viewDataItemsPerPage;
    return filteredViewDataRows.slice(startIndex, startIndex + viewDataItemsPerPage);
  }, [filteredViewDataRows, viewDataCurrentPage, viewDataItemsPerPage]);
  const viewDataStartRecord = viewDataTotalItems === 0 ? 0 : (viewDataCurrentPage - 1) * viewDataItemsPerPage + 1;
  const viewDataEndRecord = Math.min(viewDataCurrentPage * viewDataItemsPerPage, viewDataTotalItems);
  const selectedStudentCourses = useMemo(() => {
    if (!selectedViewDataStudent) return [];
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const studentYear = normalize(selectedViewDataStudent.year_level || selectedViewDataStudent.year);
    const studentSection = normalize(selectedViewDataStudent.section).replace(/^section\s*/, '');
    const studentSemester = normalize(selectedViewDataStudent.semester);
    return assignments
      .filter((assignment) => normalize(assignment.year_level || assignment.year) === studentYear
        && normalize(assignment.section).replace(/^section\s*/, '') === studentSection
        && (!studentSemester || normalize(assignment.semester) === studentSemester))
      .map((assignment) => courses.find((course) => String(course.id) === String(assignment.course_id)) || assignment)
      .filter((course, index, rows) => rows.findIndex((item) => String(item.id || item.course_id) === String(course.id || course.course_id)) === index);
  }, [assignments, courses, selectedViewDataStudent]);

  useEffect(() => {
    setViewDataCurrentPage(1);
  }, [studentFilter, courseFilter, viewDataTab]);

  useEffect(() => {
    if (viewDataCurrentPage > viewDataTotalPages) setViewDataCurrentPage(viewDataTotalPages);
  }, [viewDataCurrentPage, viewDataTotalPages]);

  const staffTotalItems = deptInstructorsList.length;
  const staffTotalPages = Math.max(1, Math.ceil(staffTotalItems / staffItemsPerPage));
  const paginatedStaff = useMemo(() => {
    const startIndex = (staffCurrentPage - 1) * staffItemsPerPage;
    return deptInstructorsList.slice(startIndex, startIndex + staffItemsPerPage);
  }, [deptInstructorsList, staffCurrentPage, staffItemsPerPage]);
  const staffStartRecord = staffTotalItems === 0 ? 0 : (staffCurrentPage - 1) * staffItemsPerPage + 1;
  const staffEndRecord = Math.min(staffCurrentPage * staffItemsPerPage, staffTotalItems);

  const filteredAssignments = useMemo(() => {
    const search = assignmentFilters.search.trim().toLowerCase();
    return assignments.filter((assignment) => {
      const year = String(assignment.year_level || assignment.yearLevel || '').trim();
      const semester = String(assignment.semester || '').trim();
      const section = String(assignment.section || '').trim();
      const normalizeYear = (value) => value.toLowerCase().replace(/\b(year|freshman)\b/g, '').replace(/[^0-9]/g, '');
      const normalizeSemester = (value) => value.toLowerCase().replace(/^semester\s*/, '').trim();
      const normalizeSection = (value) => value.toLowerCase().replace(/^section\s*/i, '').trim();
      const courseName = String(assignment.course_name || assignment.course_title || assignment.courseName || '').toLowerCase();
      const courseCode = String(assignment.course_code || assignment.courseCode || '').toLowerCase();
      const instructorName = String(assignment.staff_name || assignment.instructor_name || assignment.instructorName || '').toLowerCase();
      const staffRole = String(assignment.staff_role || assignment.assigned_role || 'instructor').toLowerCase();
      return (String(assignment.department_id || assignment.departmentId || departmentId) === String(departmentId))
        && (assignmentFilters.staffType === 'ALL' || staffRole === assignmentFilters.staffType.toLowerCase())
        && (assignmentFilters.year === 'ALL' || normalizeYear(year) === normalizeYear(assignmentFilters.year))
        && (assignmentFilters.semester === 'ALL' || normalizeSemester(semester) === normalizeSemester(assignmentFilters.semester))
        && (assignmentFilters.section === 'ALL' || normalizeSection(section) === normalizeSection(assignmentFilters.section))
        && (!search || `${courseName} ${courseCode} ${instructorName}`.includes(search));
    });
  }, [assignmentFilters, assignments, departmentId]);
  const existingAssignmentYears = [...new Set(assignments.map((assignment) => String(assignment.year_level || '').trim()).filter(Boolean))];
  const existingAssignmentYearNumbers = new Set(existingAssignmentYears.map(getYearLevelNumber).filter(Boolean));
  const assignmentYearOptions = [...existingAssignmentYears, ...YEAR_LEVEL_FILTER_OPTIONS
    .filter(({ value }) => !existingAssignmentYearNumbers.has(getYearLevelNumber(value)))
    .map(({ value }) => value)].sort();
  const assignmentSectionOptions = [...new Set(assignments.map((assignment) => String(assignment.section || '').trim()).filter(Boolean))].sort();
  const assignmentTotalItems = filteredAssignments.length;
  const assignmentTotalPages = Math.max(1, Math.ceil(assignmentTotalItems / assignmentItemsPerPage));
  const paginatedAssignments = useMemo(() => {
    const startIndex = (assignmentCurrentPage - 1) * assignmentItemsPerPage;
    return filteredAssignments.slice(startIndex, startIndex + assignmentItemsPerPage);
  }, [filteredAssignments, assignmentCurrentPage, assignmentItemsPerPage]);
  const assignmentStartRecord = assignmentTotalItems === 0 ? 0 : (assignmentCurrentPage - 1) * assignmentItemsPerPage + 1;
  const assignmentEndRecord = Math.min(assignmentCurrentPage * assignmentItemsPerPage, assignmentTotalItems);

  useEffect(() => {
    setStaffCurrentPage(1);
  }, [deptInstructorsList]);

  useEffect(() => {
    if (staffCurrentPage > staffTotalPages) setStaffCurrentPage(staffTotalPages);
  }, [staffCurrentPage, staffTotalPages]);

  useEffect(() => {
    setAssignmentCurrentPage(1);
  }, [assignments]);

  useEffect(() => {
    setAssignmentCurrentPage(1);
  }, [assignmentFilters]);

  useEffect(() => {
    if (assignmentCurrentPage > assignmentTotalPages) setAssignmentCurrentPage(assignmentTotalPages);
  }, [assignmentCurrentPage, assignmentTotalPages]);

  useEffect(() => {
    const refreshSubmissions = async () => {
      try {
        const rows = await evaluationApi.getSubmissions();
        setSubmissions(Array.isArray(rows) ? rows : []);
      } catch {
        setSubmissions([]);
      }
    };
    void refreshSubmissions();
    if (typeof window !== 'undefined') {
      window.addEventListener(SUBMISSIONS_UPDATED_EVENT, refreshSubmissions);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(SUBMISSIONS_UPDATED_EVENT, refreshSubmissions);
      }
    };
  }, []);

  const normalizeUserRecord = useCallback((userRecord) => ({
    id: userRecord.id,
    fullName: userRecord.full_name || userRecord.fullName || `${userRecord.firstName || ''} ${userRecord.lastName || ''}`.trim(),
    email: userRecord.email || '',
    username: userRecord.username,
    password: userRecord.password || '',
    studentId: userRecord.studentId || userRecord.student_id || userRecord.studentid || '',
    employeeId: userRecord.employeeId || userRecord.employee_id || userRecord.employeeid || '',
    departmentId: userRecord.department_id || userRecord.departmentId || userRecord.departmentid || '',
    courseId: userRecord.course_id || userRecord.courseId || userRecord.courseid || '',
    departmentName: userRecord.departmentName || userRecord.department_name || '',
    courseName: userRecord.courseName || userRecord.course_name || '',
    specialization: userRecord.specialization || '',
    learningLevel: userRecord.learningLevel || userRecord.learning_level || '',
    registrationDate: userRecord.registrationDate || userRecord.registration_date || today,
    role: String(userRecord.role).toLowerCase() === 'student' ? 'Student' : String(userRecord.role).toLowerCase() === 'instructor' ? 'Instructor' : userRecord.role,
  }), [today]);

  const loadDashboardData = useCallback(async () => {
    setLoadingData(true);
    try {
      if (!departmentId) {
        setLoadingData(false);
        return;
      }

      const [usersResult, coursesResult, evaluationsResult, reportsResult, assignmentsResult] = await Promise.allSettled([
        registrationApi.getUsers(),
        departmentApi.getDepartmentCourses(departmentId),
        registrationApi.getEvaluations(),
        evaluationApi.getDepartmentReports({
          academic_year: reportAcademicYear,
          semester: reportSemester,
        }),
        courseAssignmentApi.getDeptHeadAssignments({ department_id: departmentId }),
      ]);

      if (usersResult.status === 'fulfilled' && Array.isArray(usersResult.value)) {
        setUsers(usersResult.value.map(normalizeUserRecord));
      } else if (usersResult.status === 'rejected' && usersResult.reason?.status !== 403) {
        console.warn('Unable to load department users:', usersResult.reason);
      }
      if (coursesResult.status === 'fulfilled' && Array.isArray(coursesResult.value)) {
        setCourses(coursesResult.value);
      } else if (coursesResult.status === 'fulfilled' && Array.isArray(coursesResult.value?.courses)) {
        setCourses(coursesResult.value.courses.map((course) => ({
          ...course,
          id: course.id,
          code: course.code || course.course_code || '',
          name: course.name || course.course_name || '',
          creditHours: course.credits ?? course.credit_hours ?? course.creditHours ?? '0',
          departmentId: course.department_id || departmentId,
        })));
      } else if (coursesResult.status === 'rejected' && coursesResult.reason?.status !== 403) {
        console.warn('Unable to load department courses:', coursesResult.reason);
      }
      if (evaluationsResult.status === 'fulfilled' && Array.isArray(evaluationsResult.value)) {
        setEvaluations(evaluationsResult.value);
      }
      if (reportsResult.status === 'fulfilled' && Array.isArray(reportsResult.value)) {
        setDepartmentReports(reportsResult.value);
      }
      if (assignmentsResult.status === 'fulfilled' && Array.isArray(assignmentsResult.value)) {
        setAssignments(assignmentsResult.value);
      }
    } catch (error) {
      console.error('Unable to sync dashboard data', error);
    } finally {
      setLoadingData(false);
    }
  }, [departmentId, normalizeUserRecord, reportAcademicYear, reportSemester]);

  const loadStudentTemplate = useCallback(async () => {
    try {
      const response = await evaluationApi.getLatestTemplate();
      let templateContent = '';
      if (response.template_data) {
        const templateData = typeof response.template_data === 'string' ? JSON.parse(response.template_data) : response.template_data;
        templateContent = templateData?.content ? String(templateData.content) : JSON.stringify(templateData, null, 2);
      }
      setStudentEvalTemplate(templateContent || 'Enter evaluation template details here.');
      setStudentEvalTemplateId(response.id);
    } catch (error) {
      console.warn('Unable to load evaluation template from backend:', error.message || error);
      setStudentEvalTemplate('Enter evaluation template details here.');
    }
  }, []);

  const loadDepartmentCourses = useCallback(async () => {
    setDepartmentCoursesLoading(true);
    try {
      const result = await departmentApi.getDepartmentCourses(departmentId);
      const loadedCourses = (Array.isArray(result?.courses) ? result.courses : []).map((course) => ({
        ...course,
        code: course.code || course.course_code || '',
        name: course.name || course.course_name || '',
        creditHours: course.credits ?? course.credit_hours ?? course.creditHours ?? '0',
        departmentId: course.department_id || departmentId,
      }));
      setCourses(loadedCourses);
      setViewDataRows(loadedCourses);
    } catch (error) {
      console.error('Unable to load department courses:', error);
      setCourses([]);
    } finally {
      setDepartmentCoursesLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    if (!departmentId) return;
    let cancelled = false;
    const loadOverviewStats = async () => {
      try {
        const stats = await departmentApi.getOverview(departmentId);
        if (!cancelled) {
          setOverviewStats({
            totalInstructors: Number(stats?.totalInstructors || 0),
            totalStudents: Number(stats?.totalStudents || 0),
            totalCourses: Number(stats?.totalCourses || 0),
            totalLabAssistants: Number(stats?.totalLabAssistants || 0),
            activeAssignments: Number(stats?.activeAssignments || 0),
          });
        }
      } catch (error) {
        if (!cancelled && error?.status !== 403) console.warn('Unable to load overview stats:', error);
      }
    };
    void loadOverviewStats();
    return () => { cancelled = true; };
  }, [departmentId]);

  useEffect(() => {
    void loadDashboardData();
    void loadStudentTemplate();
  }, [loadDashboardData, loadStudentTemplate]);

  useEffect(() => {
    if (activeTab !== 'viewData' || !departmentId) return;
    let cancelled = false;
    const loadViewData = async () => {
      try {
        const result = viewDataTab === 'students'
          ? await departmentApi.getDepartmentStudents(departmentId, {
              semester: studentFilter.semester,
              year_level: studentFilter.year === 'ALL' ? undefined : studentFilter.year,
              section: studentFilter.section === 'ALL' ? undefined : studentFilter.section,
              program_type: studentFilter.program === 'ALL' ? undefined : studentFilter.program,
            })
          : viewDataTab === 'lab_assistants'
            ? await departmentApi.getLabAssistants(departmentId)
            : await departmentApi.getDepartmentData(viewDataTab, departmentId);
        if (cancelled) return;
        setViewDataRows(Array.isArray(result) ? result : []);
        if (viewDataTab === 'instructors') setAssignmentInstructors(Array.isArray(result) ? result : []);
        if (viewDataTab === 'courses') setCourses(Array.isArray(result) ? result : []);
      } catch (error) {
        if (!cancelled && error?.status !== 403) console.warn(`Unable to load ${viewDataTab}:`, error);
        if (!cancelled) setViewDataRows([]);
      }
    };
    void loadViewData();
    return () => { cancelled = true; };
  }, [activeTab, viewDataTab, departmentId, studentFilter]);

  const handleStudentFilterChange = (field) => (value) => {
    setStudentFilters((current) => ({ ...current, [field]: value }));
  };

  const handleStudentFilterReset = () => {
    setStudentFilters({ yearLevel: 'all', section: 'all' });
  };

  const sidebarItems = [
    { key: 'overview', labelKey: 'overview', icon: FaShieldAlt },
    { key: 'courses', labelKey: 'courses', icon: FaBook },
    { key: 'viewData', labelKey: 'viewData', icon: FaDatabase },
    { key: 'assignments', labelKey: 'assignments', icon: FaClipboardCheck },
    { key: 'publishEvaluation', labelKey: 'publishEvaluation', icon: FaBell },
    { key: 'evaluateInstructor', labelKey: 'evaluateStaff', icon: FaGraduationCap },
    { key: 'tracking', labelKey: 'tracking', icon: FaChartBar },
    { key: 'performanceDashboard', labelKey: 'performance', icon: FaChartBar },
    { key: 'reports', labelKey: 'reports', icon: FaChartBar },
  ];

  const tabTitleMap = {
    overview: t('deptHeadDashboard.overview'),
    courses: t('deptHeadDashboard.courses'),
    viewData: t('deptHeadDashboard.viewData'),
    assignments: t('deptHeadDashboard.assignments'),
    evaluateInstructor: t('deptHeadDashboard.evaluateStaff'),
    tracking: t('deptHeadDashboard.tracking'),
    performanceDashboard: t('deptHeadDashboard.performance'),
    reports: t('deptHeadDashboard.reports'),
  };

  const normalizeCourseRecord = (course) => ({
    id: course.id,
    code: course.code || course.course_code || '',
    name: course.name || course.course_name || '',
    collegeId: course.collegeId || course.college_id || course.college || '',
    departmentId: course.departmentId || course.department_id || course.department || '',
    creditHours: course.creditHours || course.credit_hours || '3',
    semester: course.semester || '',
    registrationDate: course.registrationDate || course.registration_date || '',
    ...course,
  });

  const instructors = useMemo(() => (users || []).filter((user) => String(user.role).toLowerCase() === 'instructor'), [users]);
  const departmentStaff = useMemo(() => (users || []).filter((user) => (
    ['instructor', 'dept_head', 'college_dean', 'academic_director', 'academic_directorate', 'director'].includes(String(user.role).toLowerCase())
      && String(user.departmentId || departmentId) === String(departmentId)
  )), [users, departmentId]);
  const students = useMemo(() => (users || []).filter((user) => String(user.role).toLowerCase() === 'student'), [users]);

  const getDisplayRoleTitle = (role = '') => {
    const normalized = String(role).trim().toLowerCase();
    if (normalized === 'academic_director' || normalized === 'director' || normalized === 'academic_directorate') return 'ACADEMIC DIRECTOR';
    if (normalized === 'dept_head' || normalized === 'department_head') return 'DEPT HEAD';
    if (normalized === 'college_dean' || normalized === 'dean') return 'COLLEGE DEAN';
    if (normalized === 'lab_assistant') return 'LAB ASSISTANT';
    return 'INSTRUCTOR';
  };

  const trackingTargets = useMemo(() => {
    const roleFilters = ['instructor', 'lab_assistant', 'dept_head', 'department_head', 'dean', 'college_dean', 'academic_director', 'director'];
    const rows = (users || [])
      .filter((user) => {
        const role = String(user.role || '').trim().toLowerCase();
        return roleFilters.includes(role) && String(user.departmentId || departmentId) === String(departmentId);
      })
      .map((user) => ({
        id: user.id,
        user_id: user.user_id || user.id,
        full_name: user.fullName || user.full_name || user.username || 'Unknown Staff',
        role: String(user.role || '').trim().toLowerCase().replace(/^department_head$/, 'dept_head').replace(/^college_dean$/, 'dean'),
      }));

    return rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [departmentId, users]);

  const handleTrackingFilterChange = (field) => (value) => {
    setTrackingFilters((current) => ({ ...current, [field]: value }));
  };

  const handleTrackingTargetChange = (value) => {
    const selectedTarget = trackingTargets.find((target) => String(target.id) === String(value));
    setTrackingFilters((current) => ({
      ...current,
      evaluatee_id: value || '',
      target_role: selectedTarget?.role || 'instructor',
    }));
  };

  const fetchStudentTracking = async () => {
    if (!trackingFilters.evaluatee_id) {
      setTrackingMessage('Please select a target instructor or lab assistant first.');
      return;
    }
    setTrackingLoading(true);
    setTrackingMessage('');
    try {
      const rows = await evaluationApi.getEvaluationTrackingResults({
        department_id: departmentId,
        instructor_id: trackingFilters.evaluatee_id || undefined,
        year_level: trackingFilters.year_level,
        section: trackingFilters.section,
        program_type: trackingFilters.program_type,
        evaluatee_id: trackingFilters.evaluatee_id || undefined,
        target_role: trackingFilters.target_role || 'instructor',
      });
      setTrackingResultRows(Array.isArray(rows) ? rows : []);
      if (!rows || rows.length === 0) {
        setTrackingMessage('No student evaluation rows matched the selected filters.');
      }
    } catch (error) {
      console.error('Student tracking fetch failed:', error);
      setTrackingMessage(error.message || 'Unable to load student tracking data.');
      setTrackingResultRows([]);
    } finally {
      setTrackingLoading(false);
    }
  };

  const fetchPeerTracking = async () => {
    if (!peerTrackingInstructor) {
      setTrackingMessage('Please select a target instructor or lab assistant first.');
      return;
    }
    setTrackingLoading(true);
    setTrackingMessage('');
    try {
      const rows = await evaluationApi.getDeptHeadPeerTracking({
        evaluatee_id: peerTrackingInstructor,
        target_role: peerTrackingRole,
      });
      setPeerTrackingRows(Array.isArray(rows) ? rows : []);
      if (!rows || rows.length === 0) {
        setTrackingMessage('No peer evaluation rows found for this target.');
      }
    } catch (error) {
      console.error('Peer tracking fetch failed:', error);
      setTrackingMessage(error.message || 'Unable to load peer tracking data.');
      setPeerTrackingRows([]);
    } finally {
      setTrackingLoading(false);
    }
  };

  const fetchDeptHeadTracking = async () => {
    if (!deptTrackingInstructor) {
      setTrackingMessage('Please select a target instructor or lab assistant first.');
      return;
    }
    setTrackingLoading(true);
    setTrackingMessage('');
    try {
      const rows = await evaluationApi.getDeptHeadDeptHeadTracking({
        evaluatee_id: deptTrackingInstructor,
        target_role: deptTrackingRole,
      });
      setDeptTrackingRows(Array.isArray(rows) ? rows : []);
      if (!rows || rows.length === 0) {
        setTrackingMessage('No department head evaluation rows found for this target.');
      }
    } catch (error) {
      console.error('Dept head tracking fetch failed:', error);
      setTrackingMessage(error.message || 'Unable to load department head tracking data.');
      setDeptTrackingRows([]);
    } finally {
      setTrackingLoading(false);
    }
  };

  const sendEvaluationReminder = async (evaluatorId = null, evaluationType = null, name = null) => {
    setReminderSending(true);
    setReminderTarget(evaluatorId ? String(evaluatorId) : 'all');
    try {
      const result = evaluatorId
        ? evaluationType === 'peer'
          ? await notificationApi.sendReminder({
            send_to_all_pending: true,
            recipient_user_id: evaluatorId,
            audience: 'peer',
            department_id: departmentId,
          })
          : await evaluationApi.sendReminder({ target_id: evaluatorId, evaluation_type: evaluationType, department_id: departmentId })
        : await notificationApi.sendBulkReminders({ send_to_all_pending: true, department_id: departmentId });
      if (!evaluatorId) {
        const sentCount = Number(result?.sentCount ?? 0);
        const unlinkedCount = Number(result?.unlinkedCount ?? 0);
        if (unlinkedCount > 0) {
          toast(`ማስታወቂያው ለ ${sentCount} ተጠቃሚዎች ደርሷል:: ${unlinkedCount} ተጠቃሚዎች የቴሌግራም ቦት ስላላያያዙ አልደረሳቸውም::`, { icon: 'ℹ️' });
        } else if (sentCount > 0) {
          toast.success('የማስታወቂያ መልእክት ለሁሉም ተላክዋል!');
        } else {
          toast('ለማሳሰብ የሚጠበቁ ተጠቃሚዎች የሉም::', { icon: 'ℹ️' });
        }
        return;
      }
      const reminderCount = Number(result?.sent ?? result?.data?.sent ?? 0);
      const telegramCount = Number(result?.telegramSent ?? result?.data?.telegramSent ?? 0);
      toast.success(evaluatorId
        ? `Reminder sent to ${name || 'the pending evaluator'}; ${telegramCount} urgent Telegram messages sent.`
        : `Reminders sent to ${reminderCount} pending evaluators; ${telegramCount} urgent Telegram messages sent.`);
    } catch (error) {
      if (error?.response?.data?.notLinked === true) {
        toast.error('መልእክቱ አልተላከም: ተጠቃሚው የቴሌግራም ቦት አላያያዘም::');
      } else {
        toast.error(error?.message || 'Unable to send evaluation reminder.');
      }
    } finally {
      setReminderSending(false);
      setReminderTarget('');
    }
  };

  const resetTrackingFilters = () => {
    setTrackingView('student');
    setAnomalyOnly(false);
    setTrackingSearch('');
    setTrackingFilters({ year_level: 'All Years', section: 'All Sections', program_type: 'All Programs', evaluatee_id: '', target_role: 'instructor' });
    setPeerTrackingInstructor('');
    setDeptTrackingInstructor('');
    setTrackingResultRows([]);
    setPeerTrackingRows([]);
    setDeptTrackingRows([]);
    setTrackingMessage('Filters reset. Select a target and fetch tracking data.');
  };

  const matchesTrackingSearch = (row) => {
    const query = trackingSearch.trim().toLowerCase();
    return !query || JSON.stringify(row).toLowerCase().includes(query);
  };
  const isAnomaly = (row) => Number(row.score_variance ?? row.variance ?? row.scoreVariance) === 0
    && Number(row.total_evaluations ?? row.evaluation_count ?? row.totalEvaluations) > 1;
  const visibleTrackingResultRows = trackingResultRows.filter((row) => (!anomalyOnly || isAnomaly(row)) && matchesTrackingSearch(row));
  const visiblePeerTrackingRows = peerTrackingRows.filter(matchesTrackingSearch);
  const visibleDeptTrackingRows = deptTrackingRows.filter(matchesTrackingSearch);
  const trackingMetrics = useMemo(() => {
    const student = trackingResultRows.reduce((summary, row) => ({
      required: summary.required + Number(row.total_evaluations || 0),
      completed: summary.completed + Number(row.completed_evaluations || 0),
    }), { required: 0, completed: 0 });
    const peer = peerTrackingRows.reduce((summary, row) => ({
      required: summary.required + 1,
      completed: summary.completed + (String(row.status || '').toLowerCase() === 'submitted' ? 1 : 0),
    }), { required: 0, completed: 0 });
    const deptHead = deptTrackingRows.reduce((summary, row) => ({
      required: summary.required + 1,
      completed: summary.completed + (['submitted', 'completed', 'approved'].includes(String(row.status || '').toLowerCase()) ? 1 : 0),
    }), { required: 0, completed: 0 });
    const active = trackingView === 'student' ? student : trackingView === 'peer' ? peer : trackingView === 'dept_head' ? deptHead : {
      required: student.required + peer.required + deptHead.required,
      completed: student.completed + peer.completed + deptHead.completed,
    };
    return { ...active, pending: Math.max(0, active.required - active.completed), rate: active.required ? (active.completed / active.required) * 100 : 0 };
  }, [deptTrackingRows, peerTrackingRows, trackingResultRows, trackingView]);

  const loadDeptHeadInstructors = useCallback(async () => {
    if (!departmentId) return;
    setDeptEvalLoading(true);
    try {
      const data = await evaluationApi.getDeptHeadInstructors({ department_id: departmentId });
      const rows = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : data || []);
      const currentUserId = currentUser?.id || currentUser?.user_id;
      const currentInstructorId = currentUser?.instructor_id || currentUser?.instructorId;
      setDeptInstructorsList(rows.filter((row) => (
        (!currentUserId || String(row.user_id) !== String(currentUserId))
        && (!currentInstructorId || String(row.instructor_id || row.evaluatee_id) !== String(currentInstructorId))
      )));
    } catch (error) {
      if (error?.status !== 403) console.error('Unable to load dept head instructors:', error);
      setDeptInstructorsList([]);
      if (error?.status !== 403) toast.error(error?.message || 'Unable to load instructors.');
    } finally {
      setDeptEvalLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    if (activeTab === 'evaluateInstructor') {
      void loadDeptHeadInstructors();
    }
  }, [activeTab, loadDeptHeadInstructors]);

  const publishFinalResults = async () => {
    setTrackingLoading(true);
    setTrackingMessage('');
    try {
      const publishConfig = {
        department_id: departmentId,
        academic_year: reportAcademicYear || String(new Date().getFullYear()),
        semester: reportSemester || 'Semester I',
      };
      const result = await evaluationApi.calculatePublishFinalResults(publishConfig);
      const publishData = result?.data || result || {};
      const publishedAt = publishData?.published_at || publishData?.publishedAt || new Date().toISOString();
      setTrackingMessage('Final results have been calculated and published successfully.');
      console.log('Publish result', { ...publishData, published_at: publishedAt });
    } catch (error) {
      console.error('Calculate publish failed:', error);
      setTrackingMessage(error?.message || 'Unable to calculate and publish final results.');
    } finally {
      setTrackingLoading(false);
    }
  };

  const statusBadge = (status) => {
    const normalized = String(status || '').toLowerCase();
    const isSubmitted = normalized === 'submitted' || normalized === 'completed';
    return (
      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${isSubmitted ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
        {isSubmitted ? 'Submitted' : status || 'Pending'}
      </span>
    );
  };

  const handleOpenEvaluationModal = (inst) => {
    setSelectedDeptInstructor(inst);
    setDeptEvalError('');
    // Initialize criteria scores from existing data if available
    const existingScores = inst?.criteria_scores || {};
    setDeptEvalCriteriaScores(existingScores);
    setShowDeptEvalModal(true);
  };

  const handleSubmitDeptEval = async (criteriaScores, totalScore) => {
    if (!selectedDeptInstructor) return;
    
    setDeptEvalSubmitting(true);
    setDeptEvalError('');
    try {
      const targetRole = String(selectedDeptInstructor.target_role || selectedDeptInstructor.role || 'instructor').toLowerCase();
      const payload = {
        evaluator_id: user?.id || user?.user_id,
        evaluatee_id: selectedDeptInstructor.evaluatee_id || selectedDeptInstructor.instructor_id || selectedDeptInstructor.id,
        instructor_id: selectedDeptInstructor.instructor_id || selectedDeptInstructor.evaluatee_id || selectedDeptInstructor.id,
        target_role: targetRole,
        department_id: departmentId,
        criteria_scores: criteriaScores,
        total_score: totalScore,
      };
      const result = selectedDeptInstructor.evaluation_id
        ? await evaluationApi.updateDeptHeadEvaluation(selectedDeptInstructor.evaluation_id, payload)
        : await evaluationApi.submitDeptHeadEvaluation(payload);
      toast.success('Evaluation submitted successfully.');
      // update local list
      setDeptInstructorsList((current) => current.map((item) => (String(item.instructor_id) === String(selectedDeptInstructor.instructor_id) ? { ...item, evaluation_status: 'Submitted', total_score: totalScore, criteria_scores: criteriaScores } : item)));
      setShowDeptEvalModal(false);
      setDeptEvalCriteriaScores({});
    } catch (error) {
      console.error('Submit dept eval failed:', error);
      setDeptEvalError(error?.message || 'Unable to submit evaluation.');
    } finally {
      setDeptEvalSubmitting(false);
    }
  };

  const handleViewEvaluation = (instructor) => {
    // Parse criteria_scores if it's a JSON string
    let criteriaScores = instructor.criteria_scores;
    if (typeof criteriaScores === 'string') {
      try {
        criteriaScores = JSON.parse(criteriaScores);
      } catch (e) {
        criteriaScores = {};
      }
    }
    
    setSelectedEvaluation({
      ...instructor,
      criteria_scores: criteriaScores || {}
    });
    setShowEvaluationBreakdown(true);
  };

  const handleEditEvaluation = () => {
    // Switch to edit mode in the criteria modal
    setShowEvaluationBreakdown(false);
    setSelectedDeptInstructor(selectedEvaluation);
    setDeptEvalCriteriaScores(selectedEvaluation.criteria_scores || {});
    setShowDeptEvalModal(true);
  };

  const evaluationSummary = useMemo(() => {
    const total = evaluations.length;
    const completed = evaluations.reduce((sum, item) => sum + item.completed, 0);
    const pending = evaluations.reduce((sum, item) => sum + item.pending, 0);
    const avgScore = total ? evaluations.reduce((sum, item) => sum + item.averageScore, 0) / total : 0;
    const needsAction = evaluations.filter((item) => item.status === 'Needs follow-up');
    return {
      total,
      completed,
      pending,
      avgScore: avgScore.toFixed(1),
      needsActionCount: needsAction.length,
      topInstructor: evaluations.sort((a, b) => b.averageScore - a.averageScore)[0]?.instructorName ?? '—',
    };
  }, [evaluations]);

  const departmentInstructors = useMemo(
    () => (instructors || []).filter((instructor) => String(instructor.departmentId || instructor.department_id) === String(departmentId)),
    [instructors, departmentId]
  );

  const departmentCourses = useMemo(
    () => (courses || []).filter((course) => String(course.departmentId || course.department_id) === String(departmentId)),
    [courses, departmentId]
  );

  const departmentAssignments = useMemo(
    () => (assignments || []).filter((assignment) => String(assignment.department_id || assignment.departmentId || departmentId) === String(departmentId)),
    [assignments, departmentId]
  );

  const activeAssignmentsCount = useMemo(
    () => (departmentAssignments || []).filter((assignment) =>
      ['1', 1, true].includes(assignment.is_published) || String(assignment.status).toLowerCase() === 'assigned'
    ).length,
    [departmentAssignments]
  );

  const departmentReportRows = useMemo(() => {
    const sourceRows = Array.isArray(departmentReports) && departmentReports.length ? departmentReports : departmentInstructors;
    const allowedReportRoles = ['instructor', 'lab assistant', 'lab_assistant'];
    const filteredSourceRows = sourceRows.filter((sourceRow) => allowedReportRoles.includes(
      String(sourceRow.role || sourceRow.user_role || sourceRow.userRole || '').trim().toLowerCase()
    ));
    const currentUserId = currentUser?.id || currentUser?.user_id;
    const currentInstructorId = currentUser?.instructor_id || currentUser?.instructorId;
    const merged = new Map();

    filteredSourceRows.forEach((sourceRow) => {
      const instructor = departmentInstructors.find((candidate) => String(candidate.id || candidate.instructor_id || candidate.instructorId) === String(sourceRow.instructor_id || sourceRow.instructorId || sourceRow.id)) || {};
      const instructorId = sourceRow.instructor_id || sourceRow.instructorId || sourceRow.id || instructor.id || instructor.instructor_id || instructor.instructorId;
      if (!instructorId) return;

      const key = String(instructorId);
      const existing = merged.get(key) || {
        id: instructorId,
        user_id: instructor.user_id || instructor.userId || sourceRow.user_id || sourceRow.userId,
        role: instructor.role || sourceRow.role || 'Instructor',
        full_name: sourceRow.name || sourceRow.full_name || instructor.fullName || instructor.full_name || instructor.username || 'Unknown Instructor',
        department_name: sourceRow.department_name || sourceRow.department || instructor.departmentName || instructor.department_name || currentUser?.department_name || currentUser?.department || '',
        instructorName: sourceRow.name || sourceRow.full_name || instructor.fullName || instructor.username || 'Unknown Instructor',
        employeeId: sourceRow.employee_id || instructor.employeeId || instructor.employee_id || 'N/A',
        studentScore: 0,
        peerScore: 0,
        deptHeadScore: 0,
        finalScore: 0,
        totalEvaluators: 0,
        requiredStudentEvaluators: 0,
        totalPeerEvaluators: 0,
        requiredPeerEvaluators: 0,
        totalDeptHeadEvaluators: 0,
        hasStudentEval: false,
        hasDeptHeadEval: false,
        hasPeerEval: false,
        deptHeadSubmitted: false,
        canPrint: false,
        missingRoles: [],
        assignedClasses: '',
        status: 'Pending',
      };

      const matchingEvaluations = departmentReports.filter((evaluation) => String(evaluation.instructor_id || evaluation.instructorId || evaluation.target_instructor_id || evaluation.id || '') === String(instructorId));
      const evaluation = matchingEvaluations[0] || sourceRow || {};
      const studentScore = Number(evaluation.raw_student_score ?? evaluation.student_raw_score ?? evaluation.student_score ?? evaluation.studentScore ?? evaluation.student_average ?? sourceRow.raw_student_score ?? sourceRow.student_raw_score ?? sourceRow.student_score ?? sourceRow.studentScore ?? sourceRow.student_average ?? 0);
      const peerScore = Number(evaluation.peer_score ?? evaluation.peerScore ?? evaluation.peer_average ?? sourceRow.peer_score ?? sourceRow.peerScore ?? sourceRow.peer_average ?? 0);
      const deptHeadScore = Number(evaluation.dept_head_score ?? evaluation.deptHeadScore ?? evaluation.dept_head_average ?? evaluation.deptHeadRaw ?? evaluation.department_score ?? evaluation.score ?? sourceRow.dept_head_score ?? sourceRow.deptHeadScore ?? sourceRow.dept_head_average ?? sourceRow.deptHeadRaw ?? sourceRow.department_score ?? 0);
      const normalizedDeptHeadScore = deptHeadScore > 0 && deptHeadScore <= 30 ? (deptHeadScore / 30) * 100 : deptHeadScore;
      const role = String(evaluation.role ?? sourceRow.role ?? instructor.role ?? '').toLowerCase();
      const isLabAssistant = role.includes('lab assistant') || role.includes('lab_assistant');
      const breakdown = evaluation.breakdown || sourceRow.breakdown || {};
      const courseAssignmentValue = evaluation.has_assigned_course
        ?? evaluation.hasCourseAssigned
        ?? evaluation.has_assigned_courses
        ?? sourceRow.has_assigned_course
        ?? sourceRow.hasCourseAssigned
        ?? sourceRow.has_assigned_courses;
      const hasCourseAssigned = courseAssignmentValue === undefined
        ? true
        : !['false', '0'].includes(String(courseAssignmentValue).toLowerCase());
      const weights = evaluation.weights || sourceRow.weights || (hasCourseAssigned
        ? { student: 50, deptHead: 30, peer: 20 }
        : { student: 0, deptHead: 60, peer: 40 });
      const studentWeighted = Number(breakdown.student?.weightedContribution ?? evaluation.student_weighted ?? evaluation.studentWeighted ?? sourceRow.student_weighted ?? sourceRow.studentWeighted ?? (studentScore * Number(weights.student || 0) / 100));
      const deptHeadWeighted = Number(breakdown.deptHead?.weightedContribution ?? evaluation.dept_head_weighted ?? evaluation.deptHeadWeighted ?? sourceRow.dept_head_weighted ?? sourceRow.deptHeadWeighted ?? (normalizedDeptHeadScore * Number(weights.deptHead || 0) / 100));
      const peerWeighted = Number(breakdown.peer?.weightedContribution ?? evaluation.peer_weighted ?? evaluation.peerWeighted ?? sourceRow.peer_weighted ?? sourceRow.peerWeighted ?? (peerScore * Number(weights.peer || 0) / 100));
      const backendFinalScore = evaluation.final_score ?? evaluation.total_score ?? evaluation.totalWeightedScore ?? sourceRow.final_score ?? sourceRow.total_score ?? sourceRow.totalWeightedScore;
      const calculatedFinalScore = backendFinalScore !== undefined && backendFinalScore !== null
        ? Number(backendFinalScore)
        : Number((studentWeighted + deptHeadWeighted + peerWeighted).toFixed(2));
      const backendCompletionValue = evaluation.isComplete ?? evaluation.is_complete ?? evaluation.can_print ?? evaluation.canPrint;
      const hasBackendCompletion = backendCompletionValue !== undefined && backendCompletionValue !== null;
      const backendComplete = backendCompletionValue === true
        || backendCompletionValue === 1
        || String(backendCompletionValue).toLowerCase() === 'true'
        || String(backendCompletionValue) === '1';
      const totalEvaluators = Number(evaluation.student_completed ?? evaluation.submission_count ?? evaluation.total_students_evaluated_count ?? evaluation.total_student_evaluators ?? evaluation.totalEvaluatorsCount ?? evaluation.student?.count ?? sourceRow.student_completed ?? sourceRow.submission_count ?? sourceRow.total_students_evaluated_count ?? sourceRow.total_student_evaluators ?? sourceRow.totalEvaluatorsCount ?? 0);
      const requiredStudentEvaluators = Number(evaluation.student_required ?? evaluation.required_student_evaluators ?? sourceRow.student_required ?? sourceRow.required_student_evaluators ?? 0);
      const totalPeerEvaluators = Number(evaluation.peer_completed ?? evaluation.peer_submission_count ?? evaluation.total_peers_evaluated_count ?? evaluation.peer?.count ?? sourceRow.peer_completed ?? sourceRow.peer_submission_count ?? sourceRow.total_peers_evaluated_count ?? 0);
      const requiredPeerEvaluators = Number(evaluation.peer_required ?? evaluation.required_peer_evaluators ?? evaluation.peer?.requiredCount ?? sourceRow.peer_required ?? sourceRow.required_peer_evaluators ?? 0);
      const totalDeptHeadEvaluators = Number(evaluation.total_dept_head_evaluators ?? evaluation.deptHead?.count ?? sourceRow.total_dept_head_evaluators ?? 0);
      const deptHeadSubmittedValue = evaluation.dept_head_submitted ?? sourceRow.dept_head_submitted ?? evaluation.deptHeadSubmitted ?? sourceRow.deptHeadSubmitted;
      const requiredDeptHeadEvaluators = Number(evaluation.dept_head_required ?? evaluation.required_dept_head_evaluators ?? sourceRow.dept_head_required ?? sourceRow.required_dept_head_evaluators ?? 1);
      const deptHeadSubmitted = deptHeadSubmittedValue === true
        || deptHeadSubmittedValue === 1
        || deptHeadSubmittedValue === '1'
        || String(deptHeadSubmittedValue || '').toLowerCase() === 'true'
        || totalDeptHeadEvaluators > 0;
      const hasStudentEval = !hasCourseAssigned
        || (requiredStudentEvaluators > 0
          ? totalEvaluators >= Math.ceil(requiredStudentEvaluators / 2)
          : evaluation.completion?.isStudentComplete ?? evaluation.hasStudentEval ?? totalEvaluators > 0);
      const hasDeptHeadEval = typeof evaluation.completion?.isDeptHeadComplete === 'boolean'
        ? evaluation.completion.isDeptHeadComplete
        : requiredDeptHeadEvaluators > 0
          ? totalDeptHeadEvaluators >= requiredDeptHeadEvaluators
          : evaluation.hasDeptHeadEval === true || deptHeadSubmitted;
      const hasPeerEval = totalPeerEvaluators >= 1
        || evaluation.completion?.isPeerComplete === true
        || evaluation.hasPeerEval === true;
      const requiredCategoriesComplete = backendComplete
        || ((!hasCourseAssigned || hasStudentEval) && hasPeerEval && hasDeptHeadEval);
      const finalScore = requiredCategoriesComplete ? calculatedFinalScore : 0;
      const assignedClasses = String(evaluation.assigned_classes || evaluation.assignedClasses || sourceRow.assigned_classes || sourceRow.assignedClasses || '').trim();

      existing.studentScore = existing.studentScore || studentScore || 0;
      existing.peerScore = existing.peerScore || peerScore || 0;
      existing.deptHeadScore = existing.deptHeadScore || deptHeadScore || 0;
      existing.finalScore = isLabAssistant ? finalScore : Math.max(existing.finalScore || 0, finalScore || 0);
      if (isLabAssistant) {
        existing.role = 'Lab Assistant';
      }
      existing.hasCourseAssigned = hasCourseAssigned;
      existing.weights = weights;
      existing.breakdown = breakdown;
      if (hasBackendCompletion) existing.backendComplete = existing.backendComplete || backendComplete;
      existing.totalEvaluators = Math.max(existing.totalEvaluators || 0, totalEvaluators || 0);
      existing.requiredStudentEvaluators = Math.max(existing.requiredStudentEvaluators || 0, requiredStudentEvaluators || 0);
      existing.totalPeerEvaluators = Math.max(existing.totalPeerEvaluators || 0, totalPeerEvaluators || 0);
      existing.requiredPeerEvaluators = Math.max(existing.requiredPeerEvaluators || 0, requiredPeerEvaluators || 0);
      existing.totalDeptHeadEvaluators = Math.max(existing.totalDeptHeadEvaluators || 0, totalDeptHeadEvaluators || 0);
      existing.hasStudentEval = existing.hasStudentEval || hasStudentEval;
      existing.hasDeptHeadEval = existing.hasDeptHeadEval || hasDeptHeadEval;
      existing.hasPeerEval = existing.hasPeerEval || hasPeerEval;
      existing.deptHeadSubmitted = existing.deptHeadSubmitted || deptHeadSubmitted;
      existing.canPrint = Boolean(existing.backendComplete || (existing.hasStudentEval && existing.hasDeptHeadEval && existing.hasPeerEval));
      existing.isComplete = existing.canPrint;
      existing.missingRoles = evaluation.missing_roles || existing.missingRoles;
      if (assignedClasses) existing.assignedClasses = existing.assignedClasses ? `${existing.assignedClasses}, ${assignedClasses}` : assignedClasses;
      if (existing.full_name === 'Unknown Instructor' && (sourceRow.name || sourceRow.full_name || instructor.fullName || instructor.full_name)) {
        existing.full_name = sourceRow.name || sourceRow.full_name || instructor.fullName || instructor.full_name || instructor.username || 'Unknown Instructor';
      }
      existing.instructorName = existing.full_name;
      existing.employeeId = existing.employeeId || sourceRow.employee_id || instructor.employeeId || instructor.employee_id || 'N/A';
      existing.status = existing.canPrint ? 'Completed' : 'Pending Submissions';
      merged.set(key, existing);
    });

    return Array.from(merged.values()).filter((sourceRow) => {
      const userId = currentUser?.id || currentUser?.user_id;
      const instructorId = currentUser?.instructor_id || currentUser?.instructorId;
      return (
        (!userId || String(sourceRow.user_id || '') !== String(userId)) &&
        (!instructorId || String(sourceRow.id || '') !== String(instructorId))
      );
    }).map((row) => {
      const normalizedRow = {
        ...row,
        student_average: row.studentScore,
        peer_average: row.peerScore,
        dept_head_score: row.deptHeadScore,
        dept_head_submitted: row.deptHeadSubmitted ? 1 : 0,
        final_score: row.finalScore,
        weights: row.weights,
        breakdown: row.breakdown,
        hasCourseAssigned: row.hasCourseAssigned,
        has_assigned_courses: row.hasCourseAssigned,
        studentRaw: Number(row.studentScore || 0),
        studentWeighted: Number(row.breakdown?.student?.weightedContribution ?? (Number(row.studentScore || 0) * Number(row.weights?.student ?? 50) / 100).toFixed(2)),
        deptHeadRaw: Number(row.deptHeadScore > 0 && row.deptHeadScore <= 30 ? ((row.deptHeadScore / 30) * 100).toFixed(2) : Number(row.deptHeadScore || 0).toFixed(2)),
        deptHeadWeighted: Number(row.breakdown?.deptHead?.weightedContribution ?? ((Number(row.deptHeadScore > 0 && row.deptHeadScore <= 30 ? (row.deptHeadScore / 30) * 100 : row.deptHeadScore || 0) * Number(row.weights?.deptHead ?? 30) / 100).toFixed(2))),
        peerRaw: Number(row.peerScore || 0),
        peerWeighted: Number(row.breakdown?.peer?.weightedContribution ?? (Number(row.peerScore || 0) * Number(row.weights?.peer ?? 20) / 100).toFixed(2)),
        total_student_evaluators: row.totalEvaluators,
        student_completed: row.totalEvaluators,
        required_student_evaluators: row.requiredStudentEvaluators,
        total_peer_evaluators: row.totalPeerEvaluators,
        peer_completed: row.totalPeerEvaluators,
        total_peers_evaluated_count: row.totalPeerEvaluators,
        required_peer_evaluators: row.requiredPeerEvaluators,
        total_dept_head_evaluators: row.totalDeptHeadEvaluators,
        dept_head_completed: row.totalDeptHeadEvaluators,
        completion: {
          isStudentComplete: row.hasStudentEval,
          isDeptHeadComplete: row.hasDeptHeadEval,
          isPeerComplete: row.hasPeerEval,
        },
        backendComplete: row.backendComplete,
        isComplete: row.canPrint,
        totalEvaluatorsCount: row.totalEvaluators,
        finalScore: row.finalScore,
        assignedClasses: row.assignedClasses || 'N/A',
        assigned_classes: row.assignedClasses || 'N/A',
      };
      const completion = getReportCompletion(normalizedRow);
      return {
        ...normalizedRow,
        hasStudentEval: completion.hasStudentEval,
        hasDeptHeadEval: completion.hasDeptHeadEval,
        hasPeerEval: completion.hasPeerEval,
        isReadyToPrint: completion.canPrint,
        canPrint: completion.canPrint,
        can_print: completion.canPrint,
        isComplete: completion.canPrint,
        missingRoles: completion.missing,
        missing_roles: completion.missing,
        status: completion.canPrint ? 'Completed' : 'Pending Submissions',
      };
    });
  }, [currentUser?.department, currentUser?.department_name, currentUser?.id, currentUser?.user_id, currentUser?.instructor_id, currentUser?.instructorId, departmentInstructors, departmentReports]);

  const reportSummary = useMemo(() => {
    const total = departmentReportRows.length;
    const completed = departmentReportRows.filter((row) => row.status === 'Completed').length;
    const scores = departmentReportRows.map((row) => row.finalScore).filter((score) => score > 0);
    const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    const highest = departmentReportRows.filter((row) => row.finalScore > 0).reduce((best, row) => !best || row.finalScore > best.finalScore ? row : best, null);
    const lowest = departmentReportRows.filter((row) => row.finalScore > 0).reduce((worst, row) => !worst || row.finalScore < worst.finalScore ? row : worst, null);
    return { total, completed, pending: total - completed, average, highest, lowest };
  }, [departmentReportRows]);

  const isPrintableReportRole = (row = {}) => ['instructor', 'lab assistant', 'lab_assistant']
    .includes(String(row.role || '').trim().toLowerCase());

  const printOfficialReport = async (row = departmentReportRows[0]) => {
    if (!isPrintableReportRole(row)) {
      window.alert('Reports can only be generated for Instructors and Lab Assistants.');
      return;
    }
    const completion = getReportCompletion(row);
    if (!completion.canPrint) {
      window.alert(completion.message);
      return;
    }
    let printableRow = row || null;
    const instructorId = row?.instructor_id || row?.instructorId || row?.id;
    if (instructorId) {
      try {
        const freshReport = await evaluationApi.getPrintEfficiencyReport(instructorId, {
          academic_year: reportAcademicYear,
          semester: reportSemester,
        });
        printableRow = {
          ...row,
          ...freshReport,
          name: freshReport.instructor_name || row.name || row.instructorName,
          full_name: freshReport.instructor_name || row.full_name || row.instructorName,
          studentRaw: freshReport.student_average,
          studentWeighted: freshReport.student_weighted,
          deptHeadRaw: freshReport.dept_head_score,
          deptHeadWeighted: freshReport.dept_head_weighted,
          peerRaw: freshReport.peer_average,
          peerWeighted: freshReport.peer_weighted,
          total_students_evaluated_count: freshReport.total_students_evaluated_count,
          total_peers_evaluated_count: freshReport.total_peers_evaluated_count,
          final_score: freshReport.total_score,
          total_score: freshReport.total_score,
        };
        const refreshedCompletion = getReportCompletion(printableRow);
        if (!refreshedCompletion.canPrint) {
          window.alert(refreshedCompletion.message);
          return;
        }
      } catch (error) {
        console.error('Unable to refresh printable evaluation report:', error);
        window.alert('Unable to refresh the complete evaluation result for printing.');
        return;
      }
    }
    setOfficialReportRow(printableRow);
    window.requestAnimationFrame(() => {
      printDocument('printing-official-report').catch((error) => {
        console.error('Unable to open print preview:', error);
      });
    });
  };

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [assignmentStep, setAssignmentStep] = useState(1);
  const programTypeOptions = ['Regular', 'Extension'];
  const yearLevelOptions = YEAR_LEVEL_ASSIGNMENT_OPTIONS;
  const [assignmentDraft, setAssignmentDraft] = useState({ courseId: '', instructorId: '', section: '', semester: '', programType: '', yearLevel: '' });
  const [publishTarget, setPublishTarget] = useState('both');
  const MAX_CREDIT_LOAD = 12;

  useEffect(() => {
    const shouldLoad = showAssignModal || (activeTab === 'viewData' && viewDataTab === 'instructors');
    if (!shouldLoad || !departmentId) return;
    let cancelled = false;
    const loadAssignmentInstructors = async () => {
      try {
        const result = await courseAssignmentApi.getDepartmentInstructors(departmentId);
        if (!cancelled) setAssignmentInstructors(Array.isArray(result) ? result : []);
      } catch (error) {
        if (!cancelled && error?.status !== 403) console.warn('Unable to load assignment instructors:', error);
        if (!cancelled) setAssignmentInstructors([]);
      }
    };
    void loadAssignmentInstructors();
    return () => { cancelled = true; };
  }, [showAssignModal, activeTab, viewDataTab, departmentId]);

  const displayEvaluations = useMemo(() => {
    const grouped = new Map();
    submissions
      .filter((submission) => submission.submitterRole === 'student')
      .forEach((submission) => {
        const instructorName = submission.formResponse?.instructor || 'Unassigned Instructor';
        const courseCode = submission.formResponse?.course || 'N/A';
        const score = Number(submission.formResponse?.score);

        if (!grouped.has(instructorName)) {
          grouped.set(instructorName, {
            id: instructorName,
            instructorName,
            courseCode,
            courseName: courseCode,
            completed: 0,
            pending: 0,
            averageScore: 0,
            status: 'New submission',
          });
        }

        const entry = grouped.get(instructorName);
        entry.completed += 1;
        entry.courseCode = courseCode;
        entry.courseName = courseCode;
        if (Number.isFinite(score)) {
          entry.averageScore += score;
        }
      });

    if (grouped.size === 0) {
      return evaluations;
    }

    return Array.from(grouped.values())
      .map((entry) => ({
        ...entry,
        averageScore: entry.completed ? Number((entry.averageScore / entry.completed).toFixed(1)) : 0,
        pending: 0,
        status: entry.completed ? 'New submission' : 'Awaiting',
      }))
      .sort((a, b) => b.completed - a.completed);
  }, [evaluations, submissions]);


  const handleSendStudentEvaluation = async () => {
    const selectedCourseData = courses.find((course) => String(course.id) === String(studentEvalForm.courseId));
    const studentIdentifierText = studentEvalForm.studentId || studentEvalForm.studentGroup || '';

    if (!studentEvalForm.academicYear || !studentEvalForm.semester || !studentEvalForm.yearLevel || !studentEvalForm.courseId) {
      toast.error('Please fill all required student evaluation dispatch fields.');
      return;
    }

    const payload = {
      template_id: studentEvalTemplateId,
      student_id: null,
      student_identifier: studentEvalForm.studentId || null,
      student_group: studentEvalForm.studentGroup || null,
      course_code: selectedCourseData?.code || '',
      course_name: selectedCourseData?.name || '',
      academic_year: studentEvalForm.academicYear,
      semester: studentEvalForm.semester,
      year_level: studentEvalForm.yearLevel,
      student_identifier_text: studentIdentifierText,
      payload: studentEvalForm,
    };

    try {
      const dispatchResponse = await evaluationApi.dispatchStudentEvaluation(payload);
      setFormNotification(`Student evaluation dispatched (${dispatchResponse.id})`);
      setShowStudentModal(false);
      setTimeout(() => setFormNotification(''), 5000);
    } catch (error) {
      console.error('Unable to dispatch student evaluation:', error);
      toast.error(error.message || 'Unable to send student evaluation.');
    }
  };

  const handleSendInstructorEvaluation = async () => {
    try {
      const payload = {
        template_id: null,
        student_id: null,
        student_identifier: null,
        course_id: null,
        course_name: '',
        academic_year: instructorEvalForm.academicYear || '',
        semester: instructorEvalForm.semester || '',
        year_level: '',
        student_group: 'instructor',
        created_by: currentUser?.id || null,
        payload: instructorEvalForm,
      };
      const dispatchResponse = await evaluationApi.dispatchStudentEvaluation(payload);
      setFormNotification(`Peer review dispatched (${dispatchResponse.id})`);
      setShowInstructorModal(false);
      setTimeout(() => setFormNotification(''), 5000);
    } catch (error) {
      console.error('Unable to dispatch peer review:', error);
      toast.error(error.message || 'Unable to dispatch peer review.');
    }
  };

  // Assignment helper functions
  const getInstructorAssignedCredits = (instructorId) => {
    return assignments.reduce((sum, a) => (String(a.instructor_id) === String(instructorId) ? sum + Number(a.creditHours || 0) : sum), 0);
  };

  const checkQualification = (instructorId, courseId) => {
    const ins = users.find((u) => String(u.id) === String(instructorId));
    const c = courses.find((x) => String(x.id) === String(courseId));
    if (!ins || !c) return false;
    const spec = (ins.specialization || '').toLowerCase();
    const courseName = (c.name || '').toLowerCase();
    const deptMatch = String(ins.departmentId || '') === String(c.departmentId || '');
    const specMatch = spec && courseName ? spec.includes(courseName.split(' ')[0]) : false;
    return deptMatch || specMatch;
  };

  const canSubmitAssignment = () => {
    const { courseId, instructorId, section, semester, programType, yearLevel } = assignmentDraft;
    return Boolean(courseId && instructorId && programType && yearLevel && semester && section);
  };

  const handleConfirmAssignment = () => {
    if (!canSubmitAssignment()) {
      toast.error('Please complete all assignment fields before confirming.');
      return;
    }

    setShowPublishModal(true);
  };

  const handleFinalPublishSubmit = async () => {
    const { courseId, instructorId, section, semester, programType, yearLevel } = assignmentDraft;
    if (!courseId || !instructorId || !semester || !section) {
      toast.error('Please select course, instructor, semester, and section.');
      return;
    }

    const course = courses.find((c) => String(c.id) === String(courseId));
    const creditHours = Number(course?.creditHours || 0);
    const currentLoad = getInstructorAssignedCredits(instructorId);
    const willExceed = currentLoad + creditHours > MAX_CREDIT_LOAD;

    if (willExceed) {
      toast.error('Assignment failed validation. Fix the warning before publishing.');
      return;
    }

    try {
      const created = await courseAssignmentApi.createDeptHeadAssignment({
        department_id: Number(departmentId) || undefined,
        course_id: Number(courseId),
        instructor_id: Number(instructorId),
        program_type: programType,
        year_level: yearLevel,
        semester,
        section,
        publish_target: publishTarget,
        is_published: true,
        academic_year: '2026',
      });

      const newAssignment = {
        id: created.id,
        course_id: courseId,
        course_name: course?.name || '',
        instructor_id: instructorId,
        instructor_name: users.find((u) => String(u.id) === String(instructorId))?.fullName || '',
        section,
        semester,
        creditHours,
        program_type: programType,
        year_level: yearLevel,
        publish_target: publishTarget,
        status: 'Assigned',
      };

      setAssignments((s) => [newAssignment, ...s]);
      setShowAssignModal(false);
      setShowPublishModal(false);
      setAssignmentDraft({ courseId: '', instructorId: '', section: '', semester: '', programType: '', yearLevel: '' });
      setPublishTarget('both');
      toast.success('Course assignment published successfully.');
    } catch (error) {
      console.error('Unable to submit assignment:', error);
      toast.error(error.message || 'Unable to persist course assignment.');
    }
  };

  const handleDeleteAssignment = (assignment) => {
    setSelectedForDelete(assignment);
  };

  const handleConfirmDelete = async () => {
    if (!selectedForDelete || deletingAssignment) return;
    const assignmentId = selectedForDelete.assignment_id || selectedForDelete.id;
    setDeletingAssignment(true);
    try {
      await courseAssignmentApi.deleteAssignment(assignmentId);
      setAssignments((current) => current.filter((assignment) => String(assignment.assignment_id || assignment.id) !== String(assignmentId)));
      toast.success('Course assignment deleted successfully.');
      setSelectedForDelete(null);
    } catch (error) {
      toast.error(error?.message || 'Unable to delete course assignment.');
    } finally {
      setDeletingAssignment(false);
    }
  };

  const handleEditAssignment = async (assignment) => {
    try {
      const staffRows = await courseAssignmentApi.getDepartmentInstructors(departmentId);
      const staffType = String(assignment.staff_role || assignment.assigned_role || 'instructor').toLowerCase();
      setAssignmentEditStaff(Array.isArray(staffRows) ? staffRows : []);
      setEditingAssignment(assignment);
      setAssignmentEditForm({
        staff_type: staffType,
        staff_id: String(assignment.staff_id || assignment.lab_assistant_id || assignment.instructor_id || ''),
        academic_year: assignment.academic_year || '',
        year_level: assignment.year_level || '',
        semester: assignment.semester || '',
        section: assignment.section || '',
        program_type: assignment.program_type || '',
      });
    } catch (error) {
      toast.error(error?.message || 'Unable to load department staff.');
    }
  };

  const handleSaveAssignment = async (event) => {
    event.preventDefault();
    if (!editingAssignment || !assignmentEditForm) return;
    setAssignmentEditSaving(true);
    try {
      await courseAssignmentApi.updateDeptHeadAssignment(editingAssignment.assignment_id || editingAssignment.id, assignmentEditForm);
      const updatedRows = await courseAssignmentApi.getDeptHeadAssignments({ department_id: departmentId });
      setAssignments(Array.isArray(updatedRows) ? updatedRows : []);
      setEditingAssignment(null);
      setAssignmentEditForm(null);
      toast.success('Course assignment updated successfully.');
    } catch (error) {
      toast.error(error?.message || 'Unable to update course assignment.');
    } finally {
      setAssignmentEditSaving(false);
    }
  };



  const handleEditUser = (user) => {
    if (user.role === 'Instructor') {
      toast('Instructor editing is not available in this dashboard.');
      setActiveTab('viewData');
      setViewDataTab('instructors');
    } else {
      toast('Student editing is not available in this dashboard.');
      setActiveTab('viewData');
      setViewDataTab('students');
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await registrationApi.deleteUser(userId);
      setUsers((currentUsers) => currentUsers.filter((user) => user.id !== userId));
      toast.success('User deleted successfully.');
    } catch (error) {
      console.error('Delete failed', error);
      toast.error('Unable to delete the user.');
    }
  };

  const startCourseEdit = (course) => {
    const normalized = normalizeCourseRecord(course);
    setEditingCourseId(course.id);
    setEditingCourse({
      code: normalized.code,
      name: normalized.name,
      year_level: course.year_level || course.year || '',
      semester: course.semester || '',
    });
  };

  const cancelCourseEdit = () => {
    setEditingCourseId(null);
    setEditingCourse(null);
  };

  const handleSaveCourseEdit = async (course) => {
    const courseCode = String(editingCourse?.code || '').trim();
    const courseName = String(editingCourse?.name || '').trim();
    if (!courseCode || !courseName) {
      toast.error('Course code and course name are required.');
      return;
    }
    const duplicateCode = courses.some((candidate) => (
      String(candidate.id) !== String(course.id)
      && String(candidate.code || candidate.course_code || '').trim().toLowerCase() === courseCode.toLowerCase()
    ));
    if (duplicateCode) {
      toast.error('This course code is already registered.');
      return;
    }

    setSavingCourseEdit(true);
    try {
      await registrationApi.updateCourse(course.id, {
        course_code: courseCode,
        course_name: courseName,
        department_id: course.department_id || course.departmentId || departmentId,
        year_level: String(editingCourse.year_level || '').trim(),
        semester: String(editingCourse.semester || '').trim(),
      });
      cancelCourseEdit();
      await loadDepartmentCourses();
      toast.success('Course updated successfully.');
    } catch (error) {
      toast.error(error?.message || 'Unable to update course.');
    } finally {
      setSavingCourseEdit(false);
    }
  };

  const handleDeleteCourse = async (course) => {
    const normalized = normalizeCourseRecord(course);
    if (!window.confirm(`Delete ${normalized.code} - ${normalized.name}? This will also remove its course assignments.`)) return;
    setDeletingCourseId(course.id);
    try {
      await registrationApi.deleteCourse(course.id);
      if (String(editingCourseId) === String(course.id)) cancelCourseEdit();
      await loadDepartmentCourses();
      toast.success('Course deleted successfully.');
    } catch (error) {
      toast.error(error?.message || 'Unable to delete course.');
    } finally {
      setDeletingCourseId(null);
    }
  };

  const handleCourseSubmit = async (event) => {
    event.preventDefault();
    const name = courseForm.name.trim();
    const code = courseForm.code.trim();
    if (!name || !code) {
      toast.error('Please enter the course name and course code.');
      return;
    }
    const duplicate = courses.some((course) => String(course.code || course.course_code || '').toLowerCase() === code.toLowerCase());
    if (duplicate) {
      toast.error('This course code is already registered.');
      return;
    }
    const payload = {
      course_code: code,
      course_name: name,
      department_id: departmentId,
      year_level: courseForm.yearLevel,
      semester: courseForm.semester,
      credit_hours: Number(courseForm.creditHours),
    };
    try {
      const result = await registrationApi.createCourse(payload);
      setCourses((current) => [normalizeCourseRecord({ ...payload, ...result, id: result.id }), ...current]);
      setCourseForm({ name: '', code: '', yearLevel: '', semester: '', creditHours: '' });
      toast.success('Course registered successfully.');
    } catch (error) {
      console.error('Unable to save course:', error);
      toast.error(error?.message || 'Unable to register course.');
    }
  };

  const handleCourseCsvUpload = async () => {
    if (!courseCsvFile) {
      toast.error('Please choose a CSV file before uploading.');
      return;
    }

    const formData = new FormData();
    formData.append('file', courseCsvFile);
    formData.append('department_id', departmentId);
    setCourseCsvUploading(true);
    try {
      const result = await registrationApi.bulkUploadCourses(formData);
      const createdCourses = Array.isArray(result?.courses) ? result.courses : [];
      setCourses((current) => [...createdCourses.map(normalizeCourseRecord), ...current]);
      setCourseCsvFile(null);
      toast.success(`Course upload complete. Created ${result?.created || createdCourses.length} course(s).`);
    } catch (error) {
      toast.error(error?.message || 'Unable to upload courses.');
    } finally {
      setCourseCsvUploading(false);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'performanceDashboard':
        return <DeptHeadPerformanceDashboard />;
      case 'courses':
        return (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4 md:flex-row">
              <div>
                <h4 className="text-sm font-semibold text-gray-800">Bulk Upload Courses (CSV)</h4>
                <p className="text-xs text-gray-500">Upload CSV with headers: course_name, course_code, credit_hours, year_level, semester</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="file" accept=".csv" onChange={(event) => setCourseCsvFile(event.target.files?.[0] || null)} className="text-xs text-gray-500 file:mr-2 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-blue-700" />
                <button type="button" onClick={handleCourseCsvUpload} disabled={courseCsvUploading || !courseCsvFile} className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60">
                  {courseCsvUploading ? 'Uploading...' : 'Upload CSV'}
                </button>
              </div>
            </div>
            <form onSubmit={handleCourseSubmit} className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900">Course Registration</h3>
                <p className="mt-1 text-sm text-slate-500">Register and maintain courses for {currentUser?.department_name || currentUser?.department || 'your department'}.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Course Name <span className="text-red-600">*</span></span>
                  <input value={courseForm.name} onChange={(event) => setCourseForm({ ...courseForm, name: event.target.value })} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter course name" required />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Course Code <span className="text-red-600">*</span></span>
                  <input value={courseForm.code} onChange={(event) => setCourseForm({ ...courseForm, code: event.target.value })} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter course code" required />
                </label>
                <label className="block"><span className="text-sm font-medium text-slate-700">Credit Hours / ECTS <span className="text-red-600">*</span></span><input type="number" min="1" step="1" value={courseForm.creditHours} onChange={(event) => setCourseForm({ ...courseForm, creditHours: event.target.value })} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="3" required /></label>
              </div>
              <div className="mt-0 grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="block"><span className="text-sm font-medium text-slate-700">Year Level <span className="text-red-600">*</span></span><select value={courseForm.yearLevel} onChange={(event) => setCourseForm({ ...courseForm, yearLevel: event.target.value })} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" required><option value="">Select year level</option>{YEAR_LEVEL_OPTIONS.map(({ value, label }) => <option key={value} value={`Year ${value}`}>{label}</option>)}</select></label>
                <label className="block"><span className="text-sm font-medium text-slate-700">Semester <span className="text-red-600">*</span></span><select value={courseForm.semester} onChange={(event) => setCourseForm({ ...courseForm, semester: event.target.value })} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" required><option value="">Select semester</option><option value="Semester I">Semester I</option><option value="Semester II">Semester II</option></select></label>
              </div>
              <div className="mt-6 flex gap-3">
                <button type="submit" className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700">Register Course</button>
              </div>
            </form>
          </div>
        );
      case 'overview':
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">{t('deptHeadDashboard.totalInstructors')}</p>
                  <FaUsers className="text-blue-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-gray-800">{overviewStats.totalInstructors}</p>
              </div>
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">{t('deptHeadDashboard.totalStudents')}</p>
                  <FaGraduationCap className="text-green-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-gray-800">{overviewStats.totalStudents}</p>
              </div>
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">{t('deptHeadDashboard.totalCourses')}</p>
                  <FaBook className="text-indigo-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-gray-800">{overviewStats.totalCourses}</p>
              </div>
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">{t('deptHeadDashboard.totalLabAssistants')}</p>
                  <FaUsers className="text-orange-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-gray-800">{overviewStats.totalLabAssistants}</p>
              </div>
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">{t('deptHeadDashboard.activeAssignments')}</p>
                  <FaClipboardCheck className="text-purple-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-gray-800">{overviewStats.activeAssignments}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">{t('deptHeadDashboard.openEvaluations')}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{displayEvaluations.length}</p>
              </div>
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">{t('deptHeadDashboard.averageScore')}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{displayEvaluations.length ? (displayEvaluations.reduce((sum, item) => sum + item.averageScore, 0) / displayEvaluations.length).toFixed(1) : '0.0'}</p>
              </div>
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">{t('deptHeadDashboard.pendingReviewItems')}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{displayEvaluations.reduce((sum, item) => sum + item.pending, 0)}</p>
              </div>
            </div>
          </div>
        );
      case 'viewData':
        return (
          <div className="space-y-6">
            {/* Tab Navigation */}
            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setViewDataTab('instructors')}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  viewDataTab === 'instructors'
                    ? 'border border-ieps-blue-200 bg-white text-ieps-blue-600 shadow-md'
                    : 'border border-gray-200 bg-gray-50 text-gray-700 hover:bg-white'
                }`}
              >
                <FaChalkboardTeacher />
                Instructors
              </button>
              <button
                type="button"
                onClick={() => setViewDataTab('lab_assistants')}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  viewDataTab === 'lab_assistants'
                    ? 'border border-ieps-blue-200 bg-white text-ieps-blue-600 shadow-md'
                    : 'border border-gray-200 bg-gray-50 text-gray-700 hover:bg-white'
                }`}
              >
                <FaUsers />
                Lab Assistants
              </button>
              <button
                type="button"
                onClick={() => setViewDataTab('students')}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  viewDataTab === 'students'
                    ? 'border border-ieps-blue-200 bg-white text-ieps-blue-600 shadow-md'
                    : 'border border-gray-200 bg-gray-50 text-gray-700 hover:bg-white'
                }`}
              >
                <FaUsers />
                Students
              </button>
              <button
                type="button"
                onClick={() => setViewDataTab('courses')}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  viewDataTab === 'courses'
                    ? 'border border-ieps-blue-200 bg-white text-ieps-blue-600 shadow-md'
                    : 'border border-gray-200 bg-gray-50 text-gray-700 hover:bg-white'
                }`}
              >
                <FaBook />
                Courses
              </button>
            </div>

            {/* Tab Content */}
            {viewDataTab === 'instructors' && (
              <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-slate-900">Department Instructors</h3>
                  <p className="text-sm text-gray-500">Instructors loaded from the department database.</p>
                </div>
                {viewDataRows.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-600">No instructors registered for your department yet.</div>
                ) : (
                  <div className="touch-pan-x overscroll-x-contain overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                      <thead className="bg-gray-50 text-gray-600"><tr><th className="px-4 py-3 font-semibold">ID</th><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Email</th><th className="px-4 py-3 font-semibold">Employee ID</th><th className="px-4 py-3 font-semibold">Status</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {paginatedViewData.map((instructor, rowIndex) => (
                          <tr key={`instructor-${instructor.id || instructor.instructor_id || instructor.user_id || instructor.email || rowIndex}`} className="hover:bg-gray-50"><td className="px-4 py-3">{instructor.id || instructor.instructor_id}</td><td className="px-4 py-3 font-medium text-gray-800">{instructor.instructor_name || instructor.name || instructor.fullName || instructor.username || instructor.email}</td><td className="px-4 py-3">{instructor.email || instructor.username || '-'}</td><td className="px-4 py-3">{instructor.employee_id || instructor.employeeId || '-'}</td><td className="px-4 py-3">Active</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {viewDataTab === 'lab_assistants' && (
              <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-slate-900">Department Lab Assistants</h3>
                  <p className="text-sm text-gray-500">Lab assistants registered in this department.</p>
                </div>
                {viewDataRows.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-600">No lab assistants registered for your department yet.</div>
                ) : (
                  <div className="touch-pan-x overscroll-x-contain overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-4 py-3 font-semibold">First Name</th>
                          <th className="px-4 py-3 font-semibold">Last Name</th>
                          <th className="px-4 py-3 font-semibold">Email</th>
                          <th className="px-4 py-3 font-semibold">Employee ID</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {paginatedViewData.map((assistant, rowIndex) => (
                          <tr key={`lab-assistant-${assistant.id || assistant.user_id || assistant.employee_id || assistant.email || rowIndex}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-800">{assistant.first_name || '-'}</td>
                            <td className="px-4 py-3">{assistant.last_name || '-'}</td>
                            <td className="px-4 py-3">{assistant.email || '-'}</td>
                            <td className="px-4 py-3">{assistant.employee_id || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${String(assistant.status || 'active').toLowerCase() === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {assistant.status || 'Active'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {viewDataTab === 'students' && (
              <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-6"><h3 className="text-lg font-semibold text-slate-900 dark:text-white">Department Students</h3><p className="text-sm text-gray-500 dark:text-slate-400">Students loaded from the department database.</p></div>
                <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {[['Year Level', 'year', ['ALL', ...YEAR_LEVEL_FILTER_OPTIONS.map(({ value }) => value)], true], ['Semester', 'semester', ['ALL', 'Semester I', 'Semester II']], ['Section', 'section', ['ALL', 'Section A', 'Section B', 'Section C', 'Section D']], ['Program Type', 'program', ['ALL', 'Regular', 'Extension', 'Summer']]].map(([label, field, options, isYearLevel]) => <label key={field} className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}<select value={studentFilter[field]} onChange={(event) => setStudentFilter((current) => ({ ...current, [field]: event.target.value }))} className="mt-2 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-700">{options.map((option) => <option key={option} value={option}>{option === 'ALL' ? `All ${label === 'Program Type' ? 'Programs' : label.replace(' Level', 's')}` : isYearLevel ? getYearLevelLabel(option) : option}</option>)}</select></label>)}
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">Search student<input value={studentFilter.search} onChange={(event) => setStudentFilter((current) => ({ ...current, search: event.target.value }))} placeholder="Name or Student ID" className="mt-2 h-10 w-full rounded-xl border border-gray-300 px-3 text-sm font-normal normal-case tracking-normal text-slate-700" /></label>
                  <button type="button" onClick={() => setStudentFilter({ year: 'ALL', semester: 'ALL', section: 'ALL', program: 'ALL', search: '' })} className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-xl border border-gray-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw size={15} /> Reset Filters</button>
                </div>
                <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-left text-sm"><thead className="bg-gray-50 text-gray-600 dark:bg-slate-700/50 dark:text-slate-300"><tr><th className="px-4 py-3 font-semibold">Student ID</th><th className="px-4 py-3 font-semibold">Full Name</th><th className="px-4 py-3 font-semibold">Program Type</th><th className="px-4 py-3 font-semibold">Year / Section</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Courses</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-slate-700">{paginatedViewData.length ? paginatedViewData.map((student, index) => <tr key={student.id || student.student_id || student.user_id || `student-${index}`} className="text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-700/30"><td className="px-4 py-3">{student.student_id || student.studentId || '-'}</td><td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{student.name || student.full_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || '-'}</td><td className="px-4 py-3">{student.program_type || student.program || '-'}</td><td className="px-4 py-3">{student.year_level || student.year || '-'} / {student.section || '-'}</td><td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{student.status || 'Active'}</span></td><td className="px-4 py-3"><button type="button" onClick={() => setSelectedViewDataStudent(student)} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900"><Eye size={15} /> View Courses</button></td></tr>) : <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">No students match the selected filters.</td></tr>}</tbody></table></div>
              </div>
            )}

            {selectedViewDataStudent && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="student-courses-title">
                <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4"><div><h2 id="student-courses-title" className="text-xl font-bold text-slate-900">Enrolled Courses</h2><p className="mt-1 text-sm text-slate-500">{selectedViewDataStudent.name || selectedViewDataStudent.full_name || selectedViewDataStudent.student_id} · {selectedViewDataStudent.semester || 'Current semester'}</p></div><button type="button" onClick={() => setSelectedViewDataStudent(null)} aria-label="Close enrolled courses" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X /></button></div>
                  {selectedStudentCourses.length ? <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">{selectedStudentCourses.map((course, index) => <div key={course.id || course.course_id || `${course.course_code}-${index}`} className="flex items-center justify-between gap-4 px-4 py-3"><div><p className="font-semibold text-slate-900">{course.code || course.course_code || '-'}</p><p className="text-sm text-slate-600">{course.name || course.course_name || '-'}</p></div><span className="text-xs text-slate-500">{course.semester || selectedViewDataStudent.semester || '-'}</span></div>)}</div> : <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">No enrolled courses found for this student&apos;s current cohort.</p>}
                </div>
              </div>
            )}

            {viewDataTab === 'courses' && (
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Department Courses</h3>
                    <p className="text-sm text-gray-500">All courses assigned to your department.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadDepartmentCourses()}
                    className="inline-flex items-center rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Refresh courses
                  </button>
                </div>
                <div className="mb-5 flex flex-wrap gap-3">
                  {['year', 'semester'].map((field) => <label key={field} className="text-xs font-semibold uppercase tracking-wide text-slate-500">{field === 'year' ? 'Year Level' : 'Semester'}<select value={courseFilter[field]} onChange={(event) => setCourseFilter((current) => ({ ...current, [field]: event.target.value }))} className="ml-2 h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-700"><option value="ALL">All {field === 'year' ? 'Years' : 'Semesters'}</option>{(field === 'year' ? YEAR_LEVEL_FILTER_OPTIONS : [{ value: 'Semester I', label: 'Semester I' }, { value: 'Semester II', label: 'Semester II' }]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
                  <button type="button" onClick={() => setCourseFilter({ year: 'ALL', semester: 'ALL' })} className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw size={15} /> Reset</button>
                </div>

                {departmentCoursesLoading ? (
                  <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-600">
                    Loading department courses…
                  </div>
                ) : departmentCourses.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-600">
                    No courses registered for your department yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-4 py-3 font-semibold">#</th>
                          <th className="px-4 py-3 font-semibold">Course Code</th>
                          <th className="px-4 py-3 font-semibold">Course Name</th>
                          <th className="px-4 py-3 font-semibold">Year Level</th>
                          <th className="px-4 py-3 font-semibold">Semester</th>
                          <th className="px-4 py-3 font-semibold">Department Name</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {paginatedViewData.map((course, index) => {
                          const normalized = normalizeCourseRecord(course);
                          const isEditing = String(editingCourseId) === String(course.id);
                          return (
                            <tr key={course.id || `${course.course_code}-${index}`} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-700">{index + 1}</td>
                              <td className="px-4 py-3 text-gray-700">{isEditing ? <input aria-label="Course Code" value={editingCourse.code} onChange={(event) => setEditingCourse((current) => ({ ...current, code: event.target.value }))} className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" /> : normalized.code}</td>
                              <td className="px-4 py-3 text-gray-700">{isEditing ? <input aria-label="Course Name" value={editingCourse.name} onChange={(event) => setEditingCourse((current) => ({ ...current, name: event.target.value }))} className="min-w-48 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" /> : normalized.name}</td>
                              <td className="px-4 py-3 text-gray-700">{isEditing ? <input aria-label="Year Level" value={editingCourse.year_level} onChange={(event) => setEditingCourse((current) => ({ ...current, year_level: event.target.value }))} className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" /> : course.year_level || course.year || '-'}</td>
                              <td className="px-4 py-3 text-gray-700">{isEditing ? <input aria-label="Semester" value={editingCourse.semester} onChange={(event) => setEditingCourse((current) => ({ ...current, semester: event.target.value }))} className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" /> : course.semester || '-'}</td>
                              <td className="px-4 py-3 text-gray-700">{normalized.departmentName || course.department_name || course.department || 'Unknown'}</td>
                              <td className="px-4 py-3 text-gray-700">{course.status || 'Active'}</td>
                              <td className="px-4 py-3"><div className="flex items-center gap-2 whitespace-nowrap">{isEditing ? <><button type="button" onClick={() => handleSaveCourseEdit(course)} disabled={savingCourseEdit} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{savingCourseEdit ? 'Saving…' : 'Save'}</button><button type="button" onClick={cancelCourseEdit} disabled={savingCourseEdit} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button></> : <><button type="button" onClick={() => startCourseEdit(course)} className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">Edit</button><button type="button" onClick={() => handleDeleteCourse(course)} disabled={String(deletingCourseId) === String(course.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{String(deletingCourseId) === String(course.id) ? 'Deleting…' : 'Delete'}</button></>}</div></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-4 border-t border-gray-200 pt-4 text-sm text-gray-600 dark:border-slate-700 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-4">
                <span>Showing <strong className="text-gray-900 dark:text-white">{viewDataStartRecord}</strong> to <strong className="text-gray-900 dark:text-white">{viewDataEndRecord}</strong> of <strong className="text-gray-900 dark:text-white">{viewDataTotalItems}</strong> records</span>
                <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400" htmlFor="view-data-page-size">Rows:
                  <select id="view-data-page-size" value={viewDataItemsPerPage} onChange={(event) => { setViewDataItemsPerPage(Number(event.target.value)); setViewDataCurrentPage(1); }} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-1" aria-label="View Data pagination">
                <button type="button" onClick={() => setViewDataCurrentPage((page) => Math.max(1, page - 1))} disabled={viewDataCurrentPage === 1} className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700">Previous</button>
                {Array.from({ length: viewDataTotalPages }, (_, index) => index + 1).map((page) => <button type="button" key={page} onClick={() => setViewDataCurrentPage(page)} aria-current={viewDataCurrentPage === page ? 'page' : undefined} className={`rounded-lg border px-3 py-1.5 font-medium transition ${viewDataCurrentPage === page ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'}`}>{page}</button>)}
                <button type="button" onClick={() => setViewDataCurrentPage((page) => Math.min(viewDataTotalPages, page + 1))} disabled={viewDataCurrentPage === viewDataTotalPages} className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700">Next</button>
              </div>
            </div>
          </div>
        );
      case 'assignments':
        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-800">Course assignment center</h2>
                <p className="text-sm text-gray-500">Assign instructors to courses and track conflicts from one place.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(true)}
                className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Assign a course
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Assigned courses</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{assignments.length}</p>
              </div>
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Available instructors</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{instructors.length}</p>
              </div>
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Available courses</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{courses.length}</p>
              </div>
            </div>
            {departmentAssignments.length ? (
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-gray-800">Assigned course log</h3>
                <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Filter className="h-4 w-4 text-blue-600" /> Filter assignments</div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <select aria-label="Filter by staff type" value={assignmentFilters.staffType} onChange={(event) => setAssignmentFilters((current) => ({ ...current, staffType: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"><option value="ALL">All Staff</option><option value="instructor">Instructor</option><option value="lab_assistant">Lab Assistant</option></select>
                    <select aria-label="Filter by academic year level" value={assignmentFilters.year} onChange={(event) => setAssignmentFilters((current) => ({ ...current, year: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"><option value="ALL">All Year Levels</option>{assignmentYearOptions.map((year) => <option key={year} value={year}>{getYearLevelLabel(year)}</option>)}</select>
                    <select aria-label="Filter by semester" value={assignmentFilters.semester} onChange={(event) => setAssignmentFilters((current) => ({ ...current, semester: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"><option value="ALL">All Semesters</option><option value="I">Semester I</option><option value="II">Semester II</option></select>
                    <select aria-label="Filter by section" value={assignmentFilters.section} onChange={(event) => setAssignmentFilters((current) => ({ ...current, section: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"><option value="ALL">All Sections</option>{assignmentSectionOptions.map((section) => <option key={section} value={section}>{/^section\s/i.test(section) ? section : `Section ${section}`}</option>)}</select>
                    <label className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search assignments" value={assignmentFilters.search} onChange={(event) => setAssignmentFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Course or staff" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" /></label>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">{assignmentTotalItems} matching assignment{assignmentTotalItems === 1 ? '' : 's'}</p><button type="button" onClick={() => setAssignmentFilters({ staffType: 'ALL', year: 'ALL', semester: 'ALL', section: 'ALL', search: '' })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"><RotateCcw className="h-3.5 w-3.5" /> Clear filters</button></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-500">
                        <th className="py-3 pr-5">Course Name &amp; Code</th>
                        <th className="py-3 pr-5">Instructor / Lab Assistant</th>
                        <th className="py-3 pr-5">Year Level</th>
                        <th className="py-3 pr-5">Semester</th>
                        <th className="py-3 pr-5">Academic Year</th>
                        <th className="py-3 pr-5">Section</th>
                        <th className="py-3 pr-5">Program Type</th>
                        <th className="py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedAssignments.length ? paginatedAssignments.map((assignment, rowIndex) => {
                        const staffRole = String(assignment.staff_role || assignment.assigned_role || 'instructor').toLowerCase();
                        const staffName = assignment.staff_name || assignment.instructor_name || 'Not Assigned';
                        const semesterLabel = String(assignment.semester || '').replace(/^semester\s*/i, '');
                        const sectionLabel = String(assignment.section || '').replace(/^section\s*/i, '');
                        return <tr key={`assignment-${assignment.assignment_id || assignment.id || `${assignment.course_id}-${assignment.staff_id}-${rowIndex}`}`} className="border-b border-gray-50 align-top">
                          <td className="py-3 pr-5"><div className="font-medium text-gray-900">{assignment.course_name || 'Unknown course'}</div><div className="mt-1 text-xs text-gray-500">{assignment.course_code || '-'}</div></td>
                          <td className="py-3 pr-5"><div className="font-medium text-gray-900">{staffName}</div><div className="mt-1 text-xs capitalize text-gray-500">{staffRole.replace('_', ' ')}</div></td>
                          <td className="py-3 pr-5">{assignment.year_level || '-'}</td>
                          <td className="py-3 pr-5">{semesterLabel ? `Semester ${semesterLabel}` : '-'}</td>
                          <td className="py-3 pr-5">{assignment.academic_year || '-'}</td>
                          <td className="py-3 pr-5">{sectionLabel ? `Section ${sectionLabel}` : '-'}</td>
                          <td className="py-3 pr-5">{assignment.program_type || '-'}</td>
                          <td className="py-3"><div className="flex gap-2"><button type="button" onClick={() => handleEditAssignment(assignment)} className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">Edit Assignment</button><button type="button" onClick={() => handleDeleteAssignment(assignment)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Remove Assignment</button></div></td>
                        </tr>;
                      }) : <tr><td colSpan="7" className="py-10 text-center text-sm text-gray-500">No assignments match these filters.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex flex-col gap-4 border-t border-gray-100 pt-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-4">
                    <span>Showing <strong className="text-gray-900">{assignmentStartRecord}</strong> to <strong className="text-gray-900">{assignmentEndRecord}</strong> of <strong className="text-gray-900">{assignmentTotalItems}</strong> assignments</span>
                    <label className="flex items-center gap-2 text-xs text-gray-500" htmlFor="assignment-page-size">
                      Rows:
                      <select id="assignment-page-size" value={assignmentItemsPerPage} onChange={(event) => { setAssignmentItemsPerPage(Number(event.target.value)); setAssignmentCurrentPage(1); }} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500">
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex items-center gap-1" aria-label="Assigned course log pagination">
                    <button type="button" onClick={() => setAssignmentCurrentPage((page) => Math.max(1, page - 1))} disabled={assignmentCurrentPage === 1} className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                    {Array.from({ length: assignmentTotalPages }, (_, index) => index + 1).map((page) => (
                      <button type="button" key={page} onClick={() => setAssignmentCurrentPage(page)} aria-current={assignmentCurrentPage === page ? 'page' : undefined} className={`rounded-lg border px-3 py-1.5 font-medium transition ${assignmentCurrentPage === page ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{page}</button>
                    ))}
                    <button type="button" onClick={() => setAssignmentCurrentPage((page) => Math.min(assignmentTotalPages, page + 1))} disabled={assignmentCurrentPage === assignmentTotalPages} className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">No course assignments have been created for this department yet.</div>
            )}
            {editingAssignment && assignmentEditForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
                <form onSubmit={handleSaveAssignment} className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div><h3 className="text-lg font-semibold text-gray-900">Edit course assignment</h3><p className="mt-1 text-sm text-gray-500">{editingAssignment.course_code} · {editingAssignment.course_name}</p></div>
                    <button type="button" onClick={() => { setEditingAssignment(null); setAssignmentEditForm(null); }} className="text-gray-500 hover:text-gray-800" aria-label="Close edit assignment">✕</button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Staff Type</span><select value={assignmentEditForm.staff_type} onChange={(event) => setAssignmentEditForm((form) => ({ ...form, staff_type: event.target.value, staff_id: '' }))} className="w-full rounded-lg border border-gray-200 px-3 py-2"><option value="instructor">Instructor</option><option value="lab_assistant">Lab Assistant</option></select></label>
                    <label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Staff Member</span><select required value={assignmentEditForm.staff_id} onChange={(event) => setAssignmentEditForm((form) => ({ ...form, staff_id: event.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2"><option value="">Select staff member</option>{assignmentEditStaff.filter((staff) => String(staff.role || '').toLowerCase() === assignmentEditForm.staff_type).map((staff) => <option key={`${staff.role}-${staff.staff_id}`} value={staff.staff_id}>{staff.full_name || staff.name || staff.email}</option>)}</select></label>
                    <label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Academic Year</span><input required value={assignmentEditForm.academic_year} onChange={(event) => setAssignmentEditForm((form) => ({ ...form, academic_year: event.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
                    <label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Year Level</span><input required value={assignmentEditForm.year_level} onChange={(event) => setAssignmentEditForm((form) => ({ ...form, year_level: event.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
                    <label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Semester</span><input required value={assignmentEditForm.semester} onChange={(event) => setAssignmentEditForm((form) => ({ ...form, semester: event.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
                    <label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Section</span><input required value={assignmentEditForm.section} onChange={(event) => setAssignmentEditForm((form) => ({ ...form, section: event.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
                    <label className="text-sm text-gray-600 sm:col-span-2"><span className="mb-1 block font-medium">Program Type</span><input required value={assignmentEditForm.program_type} onChange={(event) => setAssignmentEditForm((form) => ({ ...form, program_type: event.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
                  </div>
                  <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => { setEditingAssignment(null); setAssignmentEditForm(null); }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button><button type="submit" disabled={assignmentEditSaving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{assignmentEditSaving ? 'Saving...' : 'Save changes'}</button></div>
                </form>
              </div>
            )}
          </div>
        );
      case 'publishEvaluation':
        return <PublishEvaluation departmentId={departmentId} />;
      case 'evaluateInstructor':
        return (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Evaluate Staff (Instructors & Lab Assistants)</h2>
                  <p className="mt-1 text-sm text-slate-500">Department Head evaluation contributes 30% of the overall score.</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 dark:bg-slate-700/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">STAFF</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">ROLE</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">DEADLINE</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">STATUS</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                    {deptEvalLoading ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">Loading staff…</td>
                      </tr>
                    ) : deptInstructorsList.length ? (
                      paginatedStaff.map((inst, rowIndex) => {
                        const targetRole = String(inst.target_role || inst.role || 'instructor').toLowerCase();
                        const isSubmitted = String((inst.evaluation_status || '').toLowerCase()) === 'submitted';
                        return (
                          <tr key={`${targetRole}-${inst.evaluatee_id || inst.instructor_id || inst.id || inst.user_id || inst.instructor_name || rowIndex}`}>
                            <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900 dark:text-white">{inst.instructor_name || inst.full_name || inst.fullName || inst.username}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${targetRole === 'lab_assistant' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                {targetRole === 'lab_assistant' ? 'Lab Assistant' : 'Instructor'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-slate-300">{inst.deadline || '—'}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isSubmitted ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {isSubmitted ? 'Completed' : 'Pending'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {isSubmitted ? (
                                <div className="flex items-center gap-3">
                                  <span className="text-green-600 font-medium">✓ {Number(inst.total_score || 0).toFixed(2)}/30</span>
                                  <button type="button" onClick={() => handleViewEvaluation(inst)} className="text-ieps-blue-600 hover:text-ieps-blue-900 font-semibold text-sm underline">View Details</button>
                                  <button type="button" onClick={() => handleOpenEvaluationModal(inst)} className="text-ieps-blue-600 hover:text-ieps-blue-900 font-semibold text-sm underline">Edit</button>
                                </div>
                              ) : (
                                <button type="button" onClick={() => handleOpenEvaluationModal(inst)} className="flex items-center gap-1.5 text-indigo-700 hover:text-indigo-900 font-semibold">★ Evaluate</button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500 dark:text-slate-400">No staff found for your department.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-4 border-t border-slate-200 px-6 py-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  <span>Showing <strong className="text-slate-900 dark:text-white">{staffStartRecord}</strong> to <strong className="text-slate-900 dark:text-white">{staffEndRecord}</strong> of <strong className="text-slate-900 dark:text-white">{staffTotalItems}</strong> staff members</span>
                  <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400" htmlFor="staff-page-size">Rows:
                    <select id="staff-page-size" value={staffItemsPerPage} onChange={(event) => { setStaffItemsPerPage(Number(event.target.value)); setStaffCurrentPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-1" aria-label="Staff evaluation pagination">
                  <button type="button" onClick={() => setStaffCurrentPage((page) => Math.max(1, page - 1))} disabled={staffCurrentPage === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700">Previous</button>
                  {Array.from({ length: staffTotalPages }, (_, index) => index + 1).map((page) => (
                    <button type="button" key={page} onClick={() => setStaffCurrentPage(page)} aria-current={staffCurrentPage === page ? 'page' : undefined} className={`rounded-lg border px-3 py-1.5 font-medium transition ${staffCurrentPage === page ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'}`}>
                      {page}
                    </button>
                  ))}
                  <button type="button" onClick={() => setStaffCurrentPage((page) => Math.min(staffTotalPages, page + 1))} disabled={staffCurrentPage === staffTotalPages} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700">Next</button>
                </div>
              </div>
            </div>

            {showDeptEvalModal && selectedDeptInstructor ? (
              <InstructorEvaluationCriteriaModal
                open={showDeptEvalModal}
                onClose={() => {
                  setShowDeptEvalModal(false);
                  setDeptEvalCriteriaScores({});
                }}
                instructorName={selectedDeptInstructor.instructor_name || selectedDeptInstructor.full_name}
                targetRole={String(selectedDeptInstructor.target_role || selectedDeptInstructor.role || 'instructor').toLowerCase()}
                criteriaScores={deptEvalCriteriaScores}
                setCriteriaScores={setDeptEvalCriteriaScores}
                onSubmit={handleSubmitDeptEval}
                isSubmitting={deptEvalSubmitting}
                mode="edit"
              />
            ) : null}

            {showEvaluationBreakdown && selectedEvaluation ? (
              <EvaluationBreakdownModal
                open={showEvaluationBreakdown}
                onClose={() => {
                  setShowEvaluationBreakdown(false);
                  setSelectedEvaluation(null);
                }}
                instructorName={selectedEvaluation.instructor_name}
                criteriaScores={selectedEvaluation.criteria_scores || {}}
                totalScore={selectedEvaluation.total_score || 0}
                onEdit={handleEditEvaluation}
                submittedDate={selectedEvaluation.created_at || selectedEvaluation.updated_at}
              />
            ) : null}
          </div>
        );
      case 'tracking':
        return <EvaluationTracking
          targets={trackingTargets}
          departmentId={departmentId}
          filters={{ ...trackingFilters, search: trackingSearch }}
          onFiltersChange={(field, value) => {
            if (field === 'search') setTrackingSearch(value);
            else handleTrackingFilterChange(field)(value);
          }}
          onResetFilters={resetTrackingFilters}
          onEvaluateNow={handleOpenEvaluationModal}
        />;
        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Evaluation Tracking</h2>
                <p className="mt-1 text-sm text-gray-500">Monitor pending and completed evaluation forms.</p>
              </div>
              <button type="button" onClick={() => sendEvaluationReminder()} disabled={reminderSending} className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                <Send className="mr-2 h-4 w-4" />
                {reminderSending && reminderTarget === 'all' ? 'Sending…' : 'Send Reminder to All Pending'}
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Total Evaluations Required', value: trackingMetrics.required, icon: Users, tone: 'blue' },
                { label: 'Completed Submissions', value: trackingMetrics.completed, icon: CheckCircle2, tone: 'emerald' },
                { label: 'Pending Submissions', value: trackingMetrics.pending, icon: Clock3, tone: 'amber' },
              ].map(({ label, value, icon: Icon, tone }) => (
                <article key={label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                      <p className={`mt-3 text-3xl font-bold ${tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p>
                    </div>
                    <span className={`rounded-2xl p-3 ${tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}><Icon className="h-5 w-5" /></span>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${trackingMetrics.required ? Math.min((value / trackingMetrics.required) * 100, 100) : 0}%` }} /></div>
                </article>
              ))}
              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Overall Completion Rate</p><p className="mt-3 text-3xl font-bold text-indigo-600">{trackingMetrics.rate.toFixed(1)}%</p></div>
                  <svg className="h-16 w-16 -rotate-90" viewBox="0 0 40 40" role="img" aria-label={`${trackingMetrics.rate.toFixed(1)} percent complete`}>
                    <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-100" />
                    <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-indigo-500" strokeDasharray={`${Math.min(trackingMetrics.rate, 100)} 100`} pathLength="100" />
                  </svg>
                </div>
              </article>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap gap-3">
                {['student', 'peer', 'dept_head', 'all'].map((view) => {
                  const label = view === 'student' ? 'Student' : view === 'peer' ? 'Peer' : view === 'dept_head' ? 'Dept Head' : 'All Categories';
                  const isSelected = trackingView === view;
                  return (
                    <button
                      key={view}
                      type="button"
                      onClick={() => { setTrackingView(view); setTrackingMessage(''); }}
                      className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${isSelected ? 'bg-ieps-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-3">
                {trackingView === 'student' && (
                  <>
                    <label className="space-y-2 text-sm text-gray-700">
                      <span className="font-semibold">Year Level</span>
                      <select value={trackingFilters.year_level} onChange={(e) => handleTrackingFilterChange('year_level')(e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-ieps-blue-500 focus:ring-2 focus:ring-ieps-blue-100">
                        <option value="All Years">All Years</option>{YEAR_LEVEL_ASSIGNMENT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-gray-700">
                      <span className="font-semibold">Section</span>
                      <select value={trackingFilters.section} onChange={(e) => handleTrackingFilterChange('section')(e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-ieps-blue-500 focus:ring-2 focus:ring-ieps-blue-100">
                        {['All Sections', 'Section A', 'Section B', 'Section C', 'Section D', 'Section E', 'Section F', 'Section G', 'Section H', 'Section I', 'Section J', 'Section K', 'Section L'].map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-gray-700">
                      <span className="font-semibold">Program Type</span>
                      <select value={trackingFilters.program_type} onChange={(e) => handleTrackingFilterChange('program_type')(e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-ieps-blue-500 focus:ring-2 focus:ring-ieps-blue-100">
                        {['All Programs', 'Regular', 'Extension', 'Summer'].map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-gray-700 md:col-span-2">
                      <span className="font-semibold">Target</span>
                      <select value={trackingFilters.evaluatee_id} onChange={(e) => handleTrackingTargetChange(e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-ieps-blue-500 focus:ring-2 focus:ring-ieps-blue-100">
                        <option value="">Select Instructor or Lab Assistant</option>
                        {trackingTargets.map((target) => (
                          <option key={`${target.role}-${target.id}`} value={target.id}>{`${target.full_name} (${getDisplayRoleTitle(target.role)})`}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}

                {trackingView === 'peer' && (
                  <>
                    <label className="space-y-2 text-sm text-gray-700">
                      <span className="font-semibold">Target Role</span>
                      <select value={peerTrackingRole} onChange={(e) => setPeerTrackingRole(e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-ieps-blue-500 focus:ring-2 focus:ring-ieps-blue-100">
                        <option value="instructor">Instructor</option>
                        <option value="lab_assistant">Lab Assistant</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-gray-700 md:col-span-1">
                      <span className="font-semibold">Target</span>
                      <select value={peerTrackingInstructor} onChange={(e) => setPeerTrackingInstructor(e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-ieps-blue-500 focus:ring-2 focus:ring-ieps-blue-100">
                        <option value="">Select Target</option>
                        {trackingTargets.filter((target) => target.role === peerTrackingRole).map((target) => <option key={`${target.role}-${target.id}`} value={target.id}>{target.full_name}</option>)}
                      </select>
                    </label>
                  </>
                )}

                {trackingView === 'dept_head' && (
                  <>
                    <label className="space-y-2 text-sm text-gray-700">
                      <span className="font-semibold">Role</span>
                      <select value={deptTrackingRole} onChange={(e) => setDeptTrackingRole(e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-ieps-blue-500 focus:ring-2 focus:ring-ieps-blue-100">
                        <option value="instructor">Instructor</option>
                        <option value="lab_assistant">Lab Assistant</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-gray-700 md:col-span-1">
                      <span className="font-semibold">Target</span>
                      <select value={deptTrackingInstructor} onChange={(e) => setDeptTrackingInstructor(e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-ieps-blue-500 focus:ring-2 focus:ring-ieps-blue-100">
                        <option value="">Select Target</option>
                        {trackingTargets.filter((target) => target.role === deptTrackingRole).map((target) => <option key={`${target.role}-${target.id}`} value={target.id}>{target.full_name}</option>)}
                      </select>
                    </label>
                  </>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center md:w-auto md:flex-1">
                  <label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={trackingSearch} onChange={(event) => setTrackingSearch(event.target.value)} placeholder="Search by instructor name or course code" className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-ieps-blue-500 focus:ring-2 focus:ring-ieps-blue-100" /></label>
                  <p className="text-sm text-slate-500">{trackingMessage || 'Use filters and fetch data to display tracking rows.'}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={resetTrackingFilters} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Reset</button>
                  <button type="button" onClick={() => { if (trackingView === 'student' || trackingView === 'all') fetchStudentTracking(); if (trackingView === 'peer') fetchPeerTracking(); if (trackingView === 'dept_head') fetchDeptHeadTracking(); }} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ieps-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-ieps-blue-700"><BarChart3 className="h-4 w-4" />{trackingLoading ? 'Fetching…' : 'Fetch Data'}</button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm overflow-x-auto">
              {(trackingView === 'student' || trackingView === 'all') && (
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">#</th>
                      <th className="px-4 py-3 font-semibold">Instructor</th>
                      <th className="px-4 py-3 font-semibold">Completion</th>
                      <th className="px-4 py-3 font-semibold">Student Avg.</th>
                      <th className="px-4 py-3 font-semibold">Peer Avg.</th>
                      <th className="px-4 py-3 font-semibold">Dept. Head Avg.</th>
                      <th className="px-4 py-3 font-semibold">Final Score</th>
                      <th className="px-4 py-3 font-semibold">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleTrackingResultRows.length ? visibleTrackingResultRows.map((row, index) => (
                      <tr key={`${row.instructor_id}-${index}`} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-gray-700">{index + 1}</td>
                        <td className="px-4 py-4 font-medium text-gray-800">{row.instructor_name}</td>
                        <td className="px-4 py-4 font-medium">
                          <span className={row.status === 'Completed' ? 'badge-success' : 'badge-danger'}>
                            {row.status} ({row.completed_evaluations}/{row.total_evaluations})
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{row.has_assigned_course === false || row.has_assigned_courses === false ? 'N/A' : `${Number(row.student_average || 0).toFixed(2)}%`}</td>
                        <td className="px-4 py-4 text-slate-700">{row.peer_average.toFixed(2)}%</td>
                        <td className="px-4 py-4 text-slate-700">{row.dept_head_average.toFixed(2)}%</td>
                        <td className="px-4 py-4 font-bold text-ieps-blue-700">{row.final_score == null ? 'Pending' : `${Number(row.final_score).toFixed(2)}%`}</td>
                        <td className="px-4 py-4"><div className="h-2 w-28 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-ieps-blue-600" style={{ width: `${Math.min(Number(row.completion_rate || 0), 100)}%` }} /></div><span className="mt-1 block text-xs text-slate-500">{Number(row.completion_rate || 0).toFixed(0)}%</span><button type="button" onClick={() => setTrackingDetails(row)} title="View evaluation details" aria-label={`View details for ${row.instructor_name || 'instructor'}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ieps-blue-700 hover:text-ieps-blue-900"><Eye className="h-3.5 w-3.5" /> Details</button></td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-gray-500">No evaluation tracking results available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {trackingView === 'peer' && (
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">#</th>
                      <th className="px-4 py-3 font-semibold">Peer Instructor</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visiblePeerTrackingRows.length ? visiblePeerTrackingRows.map((row, index) => (
                      <tr key={`${row.evaluator_name}-${index}`} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-gray-700">{index + 1}</td>
                        <td className="px-4 py-4 text-gray-700">{row.peer_instructor}</td>
                        <td className="px-4 py-4 font-medium">
                          <span className={row.status === 'Submitted' ? 'text-green-600' : 'text-red-600'}>
                            {row.status === 'Submitted' ? '🟢 Submitted' : '🔴 Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-4">{row.status === 'Submitted' ? <span className="text-xs font-semibold text-gray-400">Done</span> : <button type="button" onClick={() => sendEvaluationReminder(row.evaluator_user_id, 'peer', row.peer_instructor)} disabled={reminderSending || !row.evaluator_user_id} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{reminderSending && reminderTarget === String(row.evaluator_user_id) ? 'Sending…' : '🔔 Remind'}</button>}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-gray-500">No peer evaluation tracking results available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {trackingView === 'dept_head' && (
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Instructor Name</th>
                      <th className="px-4 py-3 font-semibold">Department Head Score</th>
                      <th className="px-4 py-3 font-semibold">Evaluation Status</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleDeptTrackingRows.length ? visibleDeptTrackingRows.map((row, index) => (
                      <tr key={`${row.instructor_id}-${index}`} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-gray-700">{row.instructor_name}</td>
                        <td className="px-4 py-4 text-gray-700">{row.score ?? 0} / 100</td>
                        <td className="px-4 py-4">{statusBadge(row.status)}</td>
                        <td className="px-4 py-4">{String(row.status).toLowerCase() === 'submitted' ? <span className="text-xs font-semibold text-gray-400">Done</span> : <button type="button" onClick={() => sendEvaluationReminder(currentUser.id, 'dept_head', row.instructor_name)} disabled={reminderSending} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{reminderSending ? 'Sending…' : '🔔 Remind'}</button>}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-gray-500">No department head evaluation tracking results available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="sticky bottom-0 left-0 right-0 z-20 rounded-t-3xl border-t border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur-md">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-slate-500">Calculate weights and publish final final results for all department instructors.</p>
                <button type="button" onClick={publishFinalResults} className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
                  {trackingLoading ? 'Publishing…' : 'Calculate & Publish Final Results'}
                </button>
              </div>
            </div>

            {trackingDetails ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="tracking-details-title">
                <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="text-xs font-semibold uppercase tracking-wider text-ieps-blue-600">Evaluation details</p><h3 id="tracking-details-title" className="mt-1 text-xl font-bold text-slate-900">{trackingDetails.instructor_name || trackingDetails.name || 'Instructor'}</h3></div>
                    <button type="button" onClick={() => setTrackingDetails(null)} aria-label="Close details" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {[['Student submissions', `${trackingDetails.completed_evaluations ?? 0}/${trackingDetails.total_evaluations ?? 0}`], ['Completion rate', `${Number(trackingDetails.completion_rate || 0).toFixed(1)}%`], ['Student average', `${Number(trackingDetails.student_average || 0).toFixed(2)}%`], ['Peer average', `${Number(trackingDetails.peer_average || 0).toFixed(2)}%`], ['Dept. Head average', `${Number(trackingDetails.dept_head_average || 0).toFixed(2)}%`], ['Final weighted score', `${Number(trackingDetails.final_score || 0).toFixed(2)}%`]].map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-lg font-bold text-slate-900">{value}</p></div>)}
                  </div>
                  <p className="mt-5 text-sm text-slate-500">Course and section-level records are included in the aggregate totals above for the selected filters.</p>
                </div>
              </div>
            ) : null}
          </div>
        );
      case 'reports':
        return <DepartmentResultCertificates
          rows={departmentReportRows}
          currentUser={currentUser}
          academicYear={reportAcademicYear}
          semester={reportSemester}
          onAcademicYearChange={setReportAcademicYear}
          onSemesterChange={setReportSemester}
          onRefresh={() => void loadDashboardData()}
        />;
        return (
          <div id="department-reports" className="space-y-6 print:space-y-4">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start print:hidden">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Department Reports</h2>
                <p className="mt-1 text-sm text-gray-500">Overview of instructor evaluation results and performance in your department.</p>
              </div>
              {isDepartmentSummaryRole && <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => printOfficialReport(departmentReportRows[0])} disabled={!isPrintableReportRole(departmentReportRows[0]) || !getReportCompletion(departmentReportRows[0]).canPrint} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">🖨️ Print Official Report</button>
                <button type="button" onClick={() => printOfficialReport(departmentReportRows[0])} disabled={!isPrintableReportRole(departmentReportRows[0]) || !getReportCompletion(departmentReportRows[0]).canPrint} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">📥 Export to PDF</button>
              </div>}
            </div>

            {isDepartmentSummaryRole && <>
            <div className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm md:flex-row md:items-end">
              <label className="flex-1 text-sm font-medium text-gray-700">Department
                <input value={currentUser?.department_name || currentUser?.department || departmentId || ''} readOnly className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none" />
              </label>
              <label className="flex-1 text-sm font-medium text-gray-700">Academic Year
                <select value={reportAcademicYear} onChange={(event) => setReportAcademicYear(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"><option value="">All academic years</option><option>{String(new Date().getFullYear())}</option><option>2025/2026</option><option>2024/2025</option><option>2026/2027</option></select>
              </label>
              <label className="flex-1 text-sm font-medium text-gray-700">Semester
                <select value={reportSemester} onChange={(event) => setReportSemester(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"><option value="">All semesters</option><option>Semester I</option><option>Semester II</option></select>
              </label>
              <button type="button" onClick={() => void loadDashboardData()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">👁️ View Report</button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ['Total Instructors', reportSummary.total, 'In this Department', 'text-blue-600'],
                ['Evaluations Completed', reportSummary.completed, `${reportSummary.total ? Math.round((reportSummary.completed / reportSummary.total) * 100) : 0}% Completed`, 'text-emerald-600'],
                ['Pending Evaluations', reportSummary.pending, `${reportSummary.total ? Math.round((reportSummary.pending / reportSummary.total) * 100) : 0}% Pending`, 'text-orange-600'],
                ['Department Average Score', reportSummary.average.toFixed(2), 'Out of 100', 'text-blue-600'],
                ['Highest Score', reportSummary.highest?.finalScore?.toFixed(2) || '0.00', reportSummary.highest?.instructorName || 'No completed evaluations', 'text-emerald-600'],
                ['Lowest Score', reportSummary.lowest?.finalScore?.toFixed(2) || '0.00', reportSummary.lowest?.instructorName || 'No completed evaluations', 'text-orange-600'],
              ].map(([label, value, subtext, color]) => (
                <div key={label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-gray-500">{label}</p>
                  <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
                  <p className="mt-1 text-xs text-gray-500">{subtext}</p>
                </div>
              ))}
            </div>

            <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-3 border-b border-gray-100 p-5 md:flex-row md:items-center">
                <div><h3 className="text-lg font-semibold text-gray-900">📘 Instructor Evaluation Summary</h3><p className="mt-1 text-sm text-gray-500">Final calculated results for all instructors in this department.</p></div>
                <button type="button" onClick={() => void loadDashboardData()} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">🔄 Refresh</button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[1200px] w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Instructor Name</th><th className="px-4 py-3">Assigned Classes / Years</th><th className="px-4 py-3">Total Evaluators</th><th className="px-4 py-3">Student (50%)</th><th className="px-4 py-3">Peer (20%)</th><th className="px-4 py-3">Dept Head (30%)</th><th className="px-4 py-3">Final Score (100%)</th><th className="px-4 py-3">Performance Level</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {departmentReportRows.length ? departmentReportRows.map((row, index) => {
                      const level = row.finalScore >= 90 ? ['Excellent', 'bg-emerald-100 text-emerald-700'] : row.finalScore >= 80 ? ['Very Good', 'bg-blue-100 text-blue-700'] : row.finalScore >= 75 ? ['Good', 'bg-yellow-100 text-yellow-700'] : ['Average', 'bg-orange-100 text-orange-700'];
                      const completion = getReportCompletion(row);
                      const printableRole = isPrintableReportRole(row);
                      return <tr key={`report-${row.id || row.instructor_id || row.user_id || row.instructorName || index}`} className="hover:bg-gray-50"><td className="px-4 py-4">{index + 1}</td><td className="px-4 py-4 font-medium text-gray-900">{row.instructorName}</td><td className="px-4 py-4 text-gray-700">{row.assignedClasses || 'N/A'}</td><td className="px-4 py-4 text-gray-700">{row.totalEvaluators || row.total_student_evaluators || 0}</td><td className="px-4 py-4">{Number(row.studentScore || row.student_average || 0).toFixed(2)}</td><td className="px-4 py-4">{Number(row.peerScore || row.peer_average || 0).toFixed(2)}</td><td className="px-4 py-4">{Number(row.deptHeadScore || row.dept_head_score || 0).toFixed(2)}</td><td className="px-4 py-4 font-bold text-blue-700">{Number(row.finalScore || row.final_score || 0).toFixed(2)}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${level[1]}`}>{level[0]}</span></td><td className="px-4 py-4"><span className={`text-xs font-semibold ${row.status === 'Completed' ? 'text-emerald-600' : 'text-orange-600'}`}>{row.status === 'Completed' ? '✓ Completed' : '◷ Pending Submissions'}</span></td><td className="px-4 py-4">{printableRole ? <button type="button" title={completion.canPrint ? `Print report for ${row.instructorName}` : completion.message} onClick={() => printOfficialReport(row)} disabled={!completion.canPrint} className="rounded-lg px-2 py-1 text-lg text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">🖨️</button> : <span className="text-xs text-gray-400">N/A</span>}</td></tr>;
                    }) : <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-500">No instructor evaluation results available.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-gray-100 p-4 text-xs text-gray-500 md:flex-row md:items-center md:justify-between"><span>Showing {departmentReportRows.length ? 1 : 0} to {departmentReportRows.length} of {departmentReportRows.length} instructors</span><span>Department Average: {reportSummary.average.toFixed(2)} | Completed: {reportSummary.completed} ({reportSummary.total ? Math.round((reportSummary.completed / reportSummary.total) * 100) : 0}%) | Pending: {reportSummary.pending} ({reportSummary.total ? Math.round((reportSummary.pending / reportSummary.total) * 100) : 0}%)</span><span>‹ 1 ›</span></div>
            </section>
            </>}
          </div>
        );
      default:
        return <InstructorsSection users={instructors} handleEditUser={handleEditUser} handleDeleteUser={handleDeleteUser} />;
    }
  };

  if (!currentUser || !currentUser.username) {
    return <div className="p-8 text-center text-gray-500">Loading department head profile...</div>;
  }

  return (
    <div className="container-custom min-w-0 py-4 sm:py-6 lg:py-8">
      {officialReportRow && <div className="official-report-shell">
        <div className="printable-certificate-container">
          <OfficialDepartmentReport
            departmentName={currentUser?.department_name || currentUser?.department || departmentId}
            academicYear={reportAcademicYear}
            semester={reportSemester}
            reportRow={officialReportRow}
            departmentHeadName={currentUser?.full_name || currentUser?.name || currentUser?.username}
            reportDate={new Date().toLocaleDateString()}
          />
        </div>
      </div>}
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-ieps-blue-600">{t('deptHeadDashboard.title')}</h1>
          <p className="mt-1 text-gray-500">{t('deptHeadDashboard.subtitle')}</p>
          <p className="mt-2 text-sm font-medium text-blue-700">Deadline extensions from Settings apply only to {currentUser?.department_name || currentUser?.department || 'your department'}.</p>
        </div>
      </div>

      <div className="mb-6 print:hidden">
        <IPESAISmartInsights role="DEPT_HEAD" departmentId={departmentId} userId={currentUser?.id} onActionClick={handleAiAction} onDataChange={setAiInsights} />
      </div>
      <PendingStudentsModal open={pendingModalOpen} students={pendingStudents} isLoading={pendingStudentsLoading} onClose={() => setPendingModalOpen(false)} onSendReminder={() => sendEvaluationReminder()} isSending={reminderSending} />
      <AnomaliesModal open={anomaliesModalOpen} anomalies={aiInsights.anomalies || []} onClose={() => setAnomaliesModalOpen(false)} />
      {selectedForDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="presentation">
          <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="remove-assignment-title" aria-describedby="remove-assignment-description">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="remove-assignment-title" className="text-lg font-semibold text-gray-900">Remove course assignment?</h2>
                <p id="remove-assignment-description" className="mt-2 text-sm leading-6 text-gray-600">
                  This action cannot be undone. Confirm that you want to remove this assignment.
                </p>
              </div>
              <button type="button" onClick={() => setSelectedForDelete(null)} disabled={deletingAssignment} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50" aria-label="Close confirmation">
                <X size={18} />
              </button>
            </div>
            <dl className="mb-6 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
              <div className="flex flex-wrap gap-1"><dt className="font-medium text-gray-700">Course:</dt><dd className="text-gray-900">{selectedForDelete.course_name || 'Unknown course'}{selectedForDelete.course_code ? ` (${selectedForDelete.course_code})` : ''}</dd></div>
              <div className="flex flex-wrap gap-1"><dt className="font-medium text-gray-700">Assigned to:</dt><dd className="text-gray-900">{selectedForDelete.staff_name || selectedForDelete.instructor_name || 'Unknown staff member'}</dd></div>
            </dl>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setSelectedForDelete(null)} disabled={deletingAssignment} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleConfirmDelete} disabled={deletingAssignment} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                <Trash2 size={15} />{deletingAssignment ? 'Removing...' : 'Yes, remove'}
              </button>
            </div>
          </section>
        </div>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className={`fixed inset-x-0 bottom-0 top-16 z-50 print:hidden lg:hidden ${isMobileMenuOpen ? '' : 'pointer-events-none invisible'}`}>
          <button type="button" className={`absolute inset-0 bg-slate-950/45 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsMobileMenuOpen(false)} aria-label="Close dashboard navigation" tabIndex={isMobileMenuOpen ? 0 : -1} />
          <nav id="dashboard-mobile-drawer" className={`absolute inset-y-0 left-0 w-[min(18rem,85vw)] overflow-y-auto border-r border-gray-200 bg-white p-4 shadow-2xl transition-transform duration-200 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Department head dashboard navigation" aria-hidden={!isMobileMenuOpen}>
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-ieps-blue-50 px-3 py-2">
              <FaShieldAlt className="text-ieps-blue-600" />
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ieps-blue-700">{t('deptHeadDashboard.role')}</h3>
            </div>
            <div className="space-y-2">
              {sidebarItems.map(({ key, labelKey, icon: Icon }) => {
                const isActive = key === activeTab;
                return <button key={key} type="button" onClick={() => { setActiveTab(key); setIsMobileMenuOpen(false); }} aria-current={isActive ? 'page' : undefined} className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold ${isActive ? 'border-ieps-blue-200 bg-ieps-blue-50 text-ieps-blue-600 shadow-sm' : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50'}`}><Icon /><span>{t(`deptHeadDashboard.${labelKey}`)}</span></button>;
              })}
            </div>
          </nav>
        </div>
        <aside className="hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm print:hidden lg:block">
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-ieps-blue-50 px-3 py-2">
            <FaShieldAlt className="text-ieps-blue-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ieps-blue-700">{t('deptHeadDashboard.role')}</h3>
          </div>
          <div className="space-y-2">
            {sidebarItems.map(({ key, labelKey, icon: Icon }) => {
              const isActive = key === activeTab;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${isActive ? 'border-ieps-blue-200 bg-ieps-blue-50 text-ieps-blue-600 shadow-sm' : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50'}`}
                >
                  <Icon />
                  <span>{t(`deptHeadDashboard.${labelKey}`)}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          {activeTab === 'overview' && (
            <div className="mb-6 rounded-2xl border border-sky-100 bg-sky-50 p-6 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/40">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                MEKDELA AMBA UNIVERSITY
              </p>
              <h1 className="mb-3 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                {t('deptHeadDashboard.welcome')}, {currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name || ''}`.trim() : currentUser?.name || currentUser?.username || t('deptHeadDashboard.role')}
              </h1>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {t('deptHeadDashboard.department')}: <span className="ml-1 font-semibold">{currentUser?.department_name || currentUser?.department || t('instructorDashboard.notAvailable')}</span>
              </div>
            </div>
          )}

          <section className="min-w-0 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-ieps-blue-600">{tabTitleMap[activeTab] || 'Overview'}</p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-900">{tabTitleMap[activeTab] || t('deptHeadDashboard.operationsCenter')}</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">{t('deptHeadDashboard.intro')}</p>
              </div>
            </div>

            {formNotification ? <div className="mt-4 rounded-3xl border border-green-100 bg-green-50 p-4 text-sm text-green-700">{formNotification}</div> : null}

            <DispatchEvaluationModal
              open={showStudentModal}
              onClose={() => setShowStudentModal(false)}
              form={studentEvalForm}
              setForm={setStudentEvalForm}
              colleges={adminData.colleges}
              departments={adminData.departments}
              courses={courses}
              onSaveTemplate={() => { setShowTemplateEditor(true); }}
              onEditTemplate={() => { setShowTemplateEditor(true); }}
              onSend={handleSendStudentEvaluation}
            />

            {showTemplateEditor && (
              <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
                <div className="absolute inset-0 bg-black opacity-40" onClick={() => setShowTemplateEditor(false)} />
                <div className="relative w-full max-w-3xl">
                  <EvaluationTemplateBuilder
                    templateId={studentEvalTemplateId}
                    initial={(() => {
                      try {
                        return studentEvalTemplate && studentEvalTemplate.trim() && studentEvalTemplate.trim().startsWith('{') ? JSON.parse(studentEvalTemplate) : null;
                      } catch {
                        return null;
                      }
                    })()}
                    onClose={() => setShowTemplateEditor(false)}
                    onSaved={(newState) => {
                      try {
                        const text = typeof newState === 'string' ? newState : JSON.stringify(newState, null, 2);
                        setStudentEvalTemplate(text);
                      } catch {
                        console.warn('Unable to save template state');
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {showInstructorModal && (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
                <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Dispatch Peer-to-Peer Evaluation</h3>
                    <button type="button" onClick={() => setShowInstructorModal(false)} className="text-gray-500">✕</button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Evaluating Instructor</span>
                      <select value={instructorEvalForm.evaluatorId} onChange={(e) => setInstructorEvalForm({ ...instructorEvalForm, evaluatorId: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                        <option value="">Select evaluator</option>
                        {instructors.map((ins) => <option key={ins.id} value={ins.id}>{ins.fullName}</option>)}
                      </select>
                    </label>
                    <label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Target Instructor</span>
                      <select value={instructorEvalForm.targetInstructorId} onChange={(e) => setInstructorEvalForm({ ...instructorEvalForm, targetInstructorId: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                        <option value="">Select target</option>
                        {instructors.map((ins) => <option key={ins.id} value={ins.id}>{ins.fullName}</option>)}
                      </select>
                    </label>
                    <label className="text-sm text-gray-600 md:col-span-2"><span className="mb-1 block font-medium">Evaluation criteria / notes</span>
                      <input value={instructorEvalForm.criteria} onChange={(e) => setInstructorEvalForm({ ...instructorEvalForm, criteria: e.target.value })} placeholder="e.g., teaching quality, feedback, etc." className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="text-sm text-gray-600"><span className="mb-1 block font-medium">Semester</span>
                      <select value={instructorEvalForm.semester} onChange={(e) => setInstructorEvalForm({ ...instructorEvalForm, semester: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                        <option>Semester I</option>
                        <option>Semester II</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-5 flex justify-end gap-3">
                    <button type="button" onClick={() => setShowInstructorModal(false)} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
                    <button type="button" onClick={handleSendInstructorEvaluation} className="rounded-xl bg-ieps-blue-600 px-4 py-2 text-sm font-semibold text-white">Send Evaluation</button>
                  </div>
                </div>
              </div>
            )}

            {showAssignModal && (
              <CourseAssignmentModal
                courses={courses}
                instructors={assignmentInstructors}
                departmentId={departmentId}
                onClose={() => setShowAssignModal(false)}
                onAssigned={() => {
                  setShowAssignModal(false);
                  void loadDashboardData();
                }}
              />
            )}

            {false && showAssignModal && (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
                <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">Course Assignment</h3>
                      <p className="text-sm text-gray-500">Step {assignmentStep} of 2</p>
                    </div>
                    <button type="button" onClick={() => { setShowAssignModal(false); setAssignmentStep(1); }} className="text-gray-500">✕</button>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {assignmentStep === 1 ? (
                      <>
                        <label className="text-sm text-gray-600">
                          <span className="mb-1 block font-medium">Course</span>
                          <select value={assignmentDraft.courseId} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, courseId: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                            <option value="">Select course</option>
                            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} · {c.creditHours}cr</option>)}
                          </select>
                        </label>
                        <label className="text-sm text-gray-600">
                          <span className="mb-1 block font-medium">Instructor</span>
                          <select value={assignmentDraft.instructorId} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, instructorId: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                            <option value="">Select instructor</option>
                            {assignmentInstructors.map((ins) => <option key={ins.id || ins.instructor_id} value={ins.id || ins.instructor_id}>{ins.instructor_name || ins.fullName || ins.name || ins.username || ins.email}</option>)}
                          </select>
                        </label>
                      </>
                    ) : (
                      <>
                        <label className="text-sm text-gray-600">
                          <span className="mb-1 block font-medium">Program type</span>
                          <select value={assignmentDraft.programType} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, programType: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                            <option value="">Select Program Type</option>
                            {programTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                          </select>
                        </label>
                        <label className="text-sm text-gray-600">
                          <span className="mb-1 block font-medium">Year level</span>
                          <select value={assignmentDraft.yearLevel} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, yearLevel: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                            <option value="">Select Year Level</option>
                            {yearLevelOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <label className="text-sm text-gray-600">
                          <span className="mb-1 block font-medium">Semester</span>
                          <select value={assignmentDraft.semester} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, semester: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                            <option value="">Select semester</option>
                            <option value="I">I</option>
                            <option value="II">II</option>
                          </select>
                        </label>
                        <label className="text-sm text-gray-600">
                          <span className="mb-1 block font-medium">Section</span>
                          <select value={assignmentDraft.section} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, section: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                            <option value="">Select Section</option>
                            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map((sec) => (
                              <option key={sec} value={sec}>{sec}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>

                  <div className="mt-5 flex justify-between gap-3">
                    {assignmentStep === 2 ? (
                      <button type="button" onClick={() => setAssignmentStep(1)} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Back</button>
                    ) : <div />}
                    {assignmentStep === 1 ? (
                      <button
                        type="button"
                        onClick={() => setAssignmentStep(2)}
                        disabled={!assignmentDraft.courseId || !assignmentDraft.instructorId}
                        className="rounded-xl bg-ieps-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Continue
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleConfirmAssignment}
                        disabled={!canSubmitAssignment()}
                        className="rounded-xl bg-ieps-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Confirm Assignment
                      </button>
                    )}
                  </div>

                  <div className="mt-5 text-sm">
                    <p className="font-semibold">Checks</p>
                    <div className="mt-2 space-y-1">
                      <div>
                        {assignmentDraft.instructorId && assignmentDraft.courseId ? (
                          (() => {
                            const course = courses.find((c) => String(c.id) === String(assignmentDraft.courseId));
                            const credit = Number(course?.creditHours || 0);
                            const load = getInstructorAssignedCredits(assignmentDraft.instructorId);
                            const ok = load + credit <= MAX_CREDIT_LOAD;
                            return (<div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{ok ? '✅ Load available' : '❌ Exceeds Max Credit Load Limit'}</div>);
                          })()
                        ) : <div className="text-gray-500">Select course & instructor to run checks</div>}
                      </div>
                      <div>
                        {assignmentDraft.instructorId && assignmentDraft.courseId ? (
                          (() => checkQualification(assignmentDraft.instructorId, assignmentDraft.courseId) ? <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm bg-amber-50 text-amber-700">⚠️ Qualification warning only</div> : <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm bg-red-50 text-red-700">❌ Qualification / Field mismatch</div>)()
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end gap-3">
                    <button type="button" onClick={() => setShowAssignModal(false)} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {showPublishModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
                  <h3 className="border-b border-gray-200 pb-2 text-lg font-bold text-gray-900">Confirm & Publish</h3>
                  <p className="mt-3 text-xs text-gray-500">Select who should receive notification and visibility for this course assignment.</p>
                  <div className="mt-5 space-y-3">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-3 transition hover:bg-sky-50/50">
                      <input type="radio" name="publishTarget" value="both" checked={publishTarget === 'both'} onChange={(e) => setPublishTarget(e.target.value)} className="text-sky-600 focus:ring-sky-500" />
                      <span className="text-sm font-semibold text-gray-800">Publish to Both (Student & Instructor)</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-3 transition hover:bg-sky-50/50">
                      <input type="radio" name="publishTarget" value="student" checked={publishTarget === 'student'} onChange={(e) => setPublishTarget(e.target.value)} className="text-sky-600 focus:ring-sky-500" />
                      <span className="text-sm font-semibold text-gray-800">Publish to Student Only</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-3 transition hover:bg-sky-50/50">
                      <input type="radio" name="publishTarget" value="instructor" checked={publishTarget === 'instructor'} onChange={(e) => setPublishTarget(e.target.value)} className="text-sky-600 focus:ring-sky-500" />
                      <span className="text-sm font-semibold text-gray-800">Publish to Instructor Only</span>
                    </label>
                  </div>
                  <div className="mt-6 flex items-center justify-between gap-3 pt-2">
                    <button type="button" onClick={() => setShowPublishModal(false)} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Back</button>
                    <button type="button" onClick={handleFinalPublishSubmit} className="rounded-xl bg-sky-900 px-5 py-2 text-sm font-bold text-white transition hover:bg-sky-950">Confirm</button>
                  </div>
                </div>
              </div>
            )}

          </section>

          {loadingData ? <div className="rounded-3xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Syncing dashboard data from the API…</div> : renderContent()}
        </main>
      </div>
    </div>
  );
};

export default DeptHeadDashboard;
