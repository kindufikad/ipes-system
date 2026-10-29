import { useState, useContext, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  LayoutDashboard,
  ShieldCheck,
  ClipboardList,
  RefreshCw,
  Activity,
  Megaphone,
  Database,
  Search,
  History,
  Users,
  Building2,
  BarChart3,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Plus,
  Pencil,
  Trash2,
  Menu,
  X,
} from 'lucide-react';
import { LanguageContext } from '../context/LanguageContext';
import { useTranslation } from '../context/useTranslation';
import { useNavigate } from 'react-router-dom';
import { adminApi, aiApi, authApi, criteriaApi, departmentApi, notificationApi, registrationApi } from '../services/api';
import { useAuth } from '../context/useAuth';
import toast from 'react-hot-toast';
import EvaluationCalendar from '../components/EvaluationCalendar';
import ViewDataView from '../components/ViewDataView';
import ManageRoles from '../components/ManageRoles';
import DepartmentRegistration from '../components/DepartmentRegistration';
import DepartmentCombobox from '../components/DepartmentCombobox';
import AuditLogManagement from '../components/AuditLogManagement';
import AuditTimelineModal from '../components/AuditTimelineModal';
import LandingPageManagement from '../components/admin/LandingPageManagement';
import IPESAISmartInsights from '../components/ai/IPESAISmartInsights';
import SecurityLogs from '../components/SecurityLogs';
import SystemHealth from '../components/SystemHealth';

const getTodayDate = () => new Date().toISOString().slice(0, 10);
const NAME_REGEX = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const STUDENT_ID_REGEX = /^mau\d{7}$/i;
const EMPLOYEE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{2,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const buildRegistrationValidationErrors = ({ mode, firstName = '', lastName = '', email = '', studentId = '', employeeId = '', gender = '', department = '', programType = '', year = '', semester = '', section = '' }) => {
  const errors = {};
  const normalizedFirstName = String(firstName).trim();
  const normalizedLastName = String(lastName).trim();
  const normalizedEmail = String(email).trim();

  if (!normalizedFirstName || !NAME_REGEX.test(normalizedFirstName)) {
    errors.firstName = 'First name is required and may contain only letters, spaces, hyphens, and apostrophes.';
  }

  if (!normalizedLastName || !NAME_REGEX.test(normalizedLastName)) {
    errors.lastName = 'Last name is required and may contain only letters, spaces, hyphens, and apostrophes.';
  }

  if (!['male', 'female'].includes(String(gender).trim().toLowerCase())) {
    errors.gender = 'Please select a gender.';
  }
  if (!String(department).trim()) {
    errors.department = 'Please select a department.';
  }

  if (mode === 'student') {
    const normalizedStudentId = String(studentId).trim();
    if (!STUDENT_ID_REGEX.test(normalizedStudentId)) {
      errors.studentId = "Student ID must start with 'mau' followed by exactly 7 digits (e.g. mau1600756).";
    }
    if (!String(programType).trim()) errors.programType = 'Please select a program type.';
    if (!String(year).trim()) errors.year = 'Please select a year.';
    if (!String(semester).trim()) errors.semester = 'Please select a semester.';
    if (!String(section).trim()) errors.section = 'Please select a section.';
  }

  if (mode === 'instructor' || mode === 'lab_assistant') {
    const normalizedEmployeeId = String(employeeId).trim();
    if (!normalizedEmployeeId || !EMPLOYEE_ID_REGEX.test(normalizedEmployeeId)) {
      errors.employeeId = 'Employee ID is required and must contain at least 3 valid characters.';
    }

    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      errors.email = 'Please provide a valid email address.';
    }
  }

  return errors;
};

const formatBulkUploadError = (entry) => {
  const messages = Array.isArray(entry?.errors)
    ? entry.errors.join(', ')
    : String(entry?.message || 'Row could not be processed.');
  return `${entry?.row ? `Row ${entry.row}: ` : ''}${messages}`;
};

const SystemAdminDashboard = () => {
  const { language, strings } = useContext(LanguageContext);
  const { t: translate } = useTranslation();
  const { role, isAuthenticated, registerUser } = useAuth();
  const isSystemAdmin = ['admin', 'systemadmin', 'system_admin'].includes(String(role || '').trim().toLowerCase());
  const navigate = useNavigate();
  const sys = strings.systemAdminDashboard;
  const common = strings.common;

  const t = (key, fallbackEn, fallbackAm) => {
    const value = strings.systemAdminDashboard?.[key];
    if (value) return value;
    return language === 'en' ? fallbackEn : fallbackAm;
  };

  const [activeTab, setActiveTab] = useState('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [broadcastAudience, setBroadcastAudience] = useState('all');
  const [broadcastTitle, setBroadcastTitle] = useState('System announcement');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [isComposing, setIsComposing] = useState(true);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isMobileMenuOpen]);
  const [dbHealthMetrics, setDbHealthMetrics] = useState({
    status: '--',
    replicationLag: '--',
    connections: '--',
    cacheHitRate: '--',
    diskUsage: '--',
    lastBackup: '--',
    securityScore: '--',
    runningQueries: '--',
    uptimeSeconds: '--',
    totalQueries: '--',
    slowQueries: '--',
    maxConnections: '--',
    connectionUsage: '--',
    checkedAt: null,
  });
  const [systemHealth, setSystemHealth] = useState({
    status: 'unknown',
    uptime: { formatted: '--' },
    memory: { percentUsed: 0, usedMb: 0, totalMb: 0 },
    disk: { percentUsed: 0, usedGb: 0, totalGb: 0 },
    database: { status: 'unknown', latencyMs: 0, lastBackup: null },
    apiPerformance: { averageResponseTimeMs: 0, requestsPerMinute: 0, errorRate: 0 },
    alerts: [],
  });
  const [systemHealthLoading, setSystemHealthLoading] = useState(false);
  const [systemHealthError, setSystemHealthError] = useState('');
  const [healthAlertAudioEnabled, setHealthAlertAudioEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const savedEnabled = window.localStorage.getItem('ip_sound_enabled');
      if (savedEnabled !== null) return savedEnabled === 'true';
      return window.localStorage.getItem('ip_sound_muted') === 'false';
    } catch {
      return false;
    }
  });
  const isMuted = !healthAlertAudioEnabled;
  const [healthAlertAudioReady, setHealthAlertAudioReady] = useState(false);
  const [healthDiagnostics, setHealthDiagnostics] = useState(null);
  const [healthDiagnosticsLoading, setHealthDiagnosticsLoading] = useState(false);
  const [healthDiagnosticsError, setHealthDiagnosticsError] = useState('');
  const [backuping, setBackuping] = useState(false);
  const [backupRetentionDays, setBackupRetentionDays] = useState(7);
  const [backupRetentionSaving, setBackupRetentionSaving] = useState(false);
  const [deptHeads, setDeptHeads] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [students, setStudents] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [bulkUploadErrors, setBulkUploadErrors] = useState([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [systemLockUpdating, setSystemLockUpdating] = useState(false);
  const fileInputRef = useRef(null);
  const alertAudioContextRef = useRef(null);
  const lastCriticalAlertSignatureRef = useRef('');
  const [logs, setLogs] = useState([]);
  const [expandedLogIds, setExpandedLogIds] = useState(() => new Set());
  const [showAuditTimelineModal, setShowAuditTimelineModal] = useState(false);
  const [selectedHead, setSelectedHead] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showForceResetModal, setShowForceResetModal] = useState(false);
  const [registrationMode, setRegistrationMode] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [registrationErrors, setRegistrationErrors] = useState({});
  const [deptHeadTransferMode, setDeptHeadTransferMode] = useState(false);
  const [headEditTransferMode, setHeadEditTransferMode] = useState(false);
  const [departmentCourseTab, setDepartmentCourseTab] = useState('college');
  const [collegeNameInput, setCollegeNameInput] = useState('');
  const [collegeCodeInput, setCollegeCodeInput] = useState('');
  const [registeredDepartments, setRegisteredDepartments] = useState([]);
  const [isDepartmentsLoading, setIsDepartmentsLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [dashboardStatsLoading, setDashboardStatsLoading] = useState(true);
  const [dashboardStatsError, setDashboardStatsError] = useState('');
  const [securityLogsLoading, setSecurityLogsLoading] = useState(true);
  const [criteriaType, setCriteriaType] = useState('student');
  const [criteriaTargetRole, setCriteriaTargetRole] = useState('instructor');
  const [criteriaRows, setCriteriaRows] = useState([]);
  const [criteriaPage, setCriteriaPage] = useState(1);
  const [criteriaLimit, setCriteriaLimit] = useState(5);
  const [criteriaSearch, setCriteriaSearch] = useState('');
  const [criteriaPagination, setCriteriaPagination] = useState({ totalItems: 0, totalPages: 1 });
  const criteriaRequestSequence = useRef(0);
  const [criteriaForm, setCriteriaForm] = useState({ criterion_text: '', criterion_text_am: '', category: 'General', weight: 5, target_role: 'instructor' });
  const [editingCriterionId, setEditingCriterionId] = useState(null);
  const [showCriterionForm, setShowCriterionForm] = useState(false);

  const healthAlerts = Array.isArray(systemHealth?.alerts) ? systemHealth.alerts : [];
  const activeHealthAlertSignature = JSON.stringify(healthAlerts
    .filter((alert) => ['warning', 'critical'].includes(alert.level))
    .map(({ level, title, detail }) => ({ level, title, detail })));
  const criticalHealthAlertSignature = JSON.stringify(healthAlerts
    .filter((alert) => alert.level === 'critical')
    .map(({ title }) => title)
    .sort());

  const playCriticalAlertChime = useCallback(() => {
    const audioContext = alertAudioContextRef.current;
    if (!audioContext || audioContext.state !== 'running') return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startAt = audioContext.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, startAt);
    oscillator.frequency.setValueAtTime(660, startAt + 0.16);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(0.08, startAt + 0.025);
    gain.gain.setValueAtTime(0.08, startAt + 0.17);
    gain.gain.linearRampToValueAtTime(0, startAt + 0.36);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.37);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }, []);

  const triggerTestAlert = () => {
    const testAlert = {
      id: 'TEST_ERR_1',
      level: 'critical',
      title: 'Database connection delay exceeded 1500ms',
      detail: 'A simulated service interruption is affecting evaluation processing latency.',
    };
    setSystemHealth((current) => ({
      ...current,
      status: 'degraded',
      generatedAt: new Date().toISOString(),
      alerts: [testAlert],
      database: {
        ...current.database,
        status: 'degraded',
        latencyMs: 1500,
      },
      apiPerformance: {
        ...current.apiPerformance,
        averageResponseTimeMs: 1500,
        errorRate: 0.08,
      },
    }));
    lastCriticalAlertSignatureRef.current = '';
    toast('System health simulation triggered.', { icon: '🧪', duration: 2500 });
  };

  const clearTestAlert = () => {
    setSystemHealth((current) => ({
      ...current,
      status: current.alerts?.some((alert) => alert.id?.startsWith('TEST_')) ? 'healthy' : current.status,
      alerts: Array.isArray(current.alerts) ? current.alerts.filter((alert) => !alert.id?.startsWith('TEST_')) : [],
      generatedAt: new Date().toISOString(),
    }));
    lastCriticalAlertSignatureRef.current = '';
    toast('Test alert cleared.', { icon: '✅', duration: 2500 });
  };

  const toggleSoundMute = async () => {
    if (healthAlertAudioEnabled && healthAlertAudioReady) {
      setHealthAlertAudioEnabled(false);
      try {
        window.localStorage.setItem('ip_sound_enabled', 'false');
        window.localStorage.removeItem('ip_sound_muted');
        toast.success('Critical alert sound muted.', { icon: '🔇', duration: 2500 });
      } catch {
        toast.error('Sound muted for this session, but the preference could not be saved.');
      }
      return;
    }
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      toast.error('Audio alerts are not supported by this browser.');
      return;
    }
    try {
      const audioContext = alertAudioContextRef.current || new AudioContextConstructor();
      alertAudioContextRef.current = audioContext;
      await audioContext.resume();
      if (audioContext.state !== 'running') {
        toast.error('Allow audio playback in your browser to enable alert chimes.');
        return;
      }
      setHealthAlertAudioReady(true);
      if (isMuted) setHealthAlertAudioEnabled(true);
      try {
        window.localStorage.setItem('ip_sound_enabled', 'true');
        window.localStorage.removeItem('ip_sound_muted');
        toast.success('Critical alert sound enabled.', { icon: '🔊', duration: 2500 });
      } catch {
        toast.error('Sound enabled for this session, but the preference could not be saved.');
      }
    } catch {
      toast.error('Unable to enable alert audio in this browser.');
    }
  };

  useEffect(() => {
    if (!activeHealthAlertSignature || activeHealthAlertSignature === '[]') {
      setHealthDiagnostics(null);
      setHealthDiagnosticsError('');
      setHealthDiagnosticsLoading(false);
      return undefined;
    }

    let isCurrent = true;
    setHealthDiagnosticsLoading(true);
    setHealthDiagnosticsError('');
    aiApi.getInsight('audit_security', {
      alerts: JSON.parse(activeHealthAlertSignature),
      database: {
        status: systemHealth?.database?.status,
        latencyMs: systemHealth?.database?.latencyMs,
      },
      apiPerformance: {
        averageResponseTimeMs: systemHealth?.apiPerformance?.averageResponseTimeMs,
        requestsPerMinute: systemHealth?.apiPerformance?.requestsPerMinute,
        errorRate: systemHealth?.apiPerformance?.errorRate,
      },
      disk: { percentUsed: systemHealth?.disk?.percentUsed },
      memory: { percentUsed: systemHealth?.memory?.percentUsed },
    }).then((result) => {
      if (isCurrent) setHealthDiagnostics(result?.data || result || null);
    }).catch((error) => {
      if (isCurrent) setHealthDiagnosticsError(error?.message || 'AI diagnostics are temporarily unavailable.');
    }).finally(() => {
      if (isCurrent) setHealthDiagnosticsLoading(false);
    });

    return () => { isCurrent = false; };
  }, [activeHealthAlertSignature]);

  useEffect(() => {
    if (!criticalHealthAlertSignature || criticalHealthAlertSignature === '[]') {
      lastCriticalAlertSignatureRef.current = '';
      return;
    }
    if (!healthAlertAudioEnabled || !healthAlertAudioReady || lastCriticalAlertSignatureRef.current === criticalHealthAlertSignature) return;
    lastCriticalAlertSignatureRef.current = criticalHealthAlertSignature;
    playCriticalAlertChime();
  }, [criticalHealthAlertSignature, healthAlertAudioEnabled, healthAlertAudioReady, playCriticalAlertChime]);

  useEffect(() => () => {
    if (alertAudioContextRef.current && alertAudioContextRef.current.state !== 'closed') {
      void alertAudioContextRef.current.close();
    }
  }, []);

  const handleAiAction = (actionType) => {
    if (actionType === 'VIEW_AUDIT_LOGS') setActiveTab('security');
    if (actionType === 'VIEW_UNSUBMITTED_EVALUATIONS') setActiveTab('view-data');
  };

  const normalizeBackendUser = (user) => ({
    id: user.id,
    role: String(user.role || '').toLowerCase(),
    fullName: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
    username: user.username,
    employeeId: user.employee_id || user.employeeId || '',
    studentId: user.student_id || user.studentId || '',
    department: user.department || user.department_id || '',
    departmentId: user.department_id || user.departmentId || '',
    department_id: user.department_id || user.departmentId || '',
    departmentName: user.department_name || user.departmentName || '',
    programType: user.program_type || user.programType || '',
    semester: user.semester || '',
    year: user.year || user.year_level || '',
    section: user.section || '',
    academicDate: user.registration_date || user.academicDate || '',
    status: user.status || 'Active',
  });

  const departmentSelectionOptions = useMemo(() => {
    return registeredDepartments.filter((department) => department.id);
  }, [registeredDepartments]);

  const getDepartmentName = (departmentId) => departmentSelectionOptions.find((dept) => dept.id === departmentId)?.name
    || departmentId;

  const [instructorForm, setInstructorForm] = useState(() => ({
    firstName: '',
    lastName: '',
    gender: '',
    email: '',
    role: 'instructor',
    employeeId: '',
    department: '',
  }));

  const [labAssistantForm, setLabAssistantForm] = useState(() => ({
    firstName: '',
    lastName: '',
    gender: '',
    email: '',
    employeeId: '',
    department: '',
  }));

  const [studentForm, setStudentForm] = useState(() => ({
    firstName: '',
    lastName: '',
    gender: '',
    studentId: '',
    department: '',
    programType: 'regular',
    academicYear: '2024',
    semester: 'i',
    year: '1st Year (Freshman)',
    section: 'A',
  }));

  const handleCollegeRegistrationSubmit = async (event) => {
    event.preventDefault();
    const name = collegeNameInput.trim();
    const code = collegeCodeInput.trim();
    if (!name || !code) {
      toast.error('Please enter the college name and college code.');
      return;
    }

    try {
      await adminApi.createCollege({ name, code });
      setCollegeNameInput('');
      setCollegeCodeInput('');
      toast.success('College registered successfully.');
    } catch (error) {
      toast.error(error?.message || 'Unable to register college.');
    }
  };

  const semesterOptions = [
    { value: 'i', en: 'I', am: 'I' },
    { value: 'ii', en: 'II', am: 'II' },
  ];
  const programOptions = [
    { value: 'regular', en: 'Regular', am: 'ብዙ ነገር' },
    { value: 'extension', en: 'Extension', am: 'እርስ በርስ' },
  ];
  const studentYearOptions = ['1st Year (Freshman)', '2nd Year', '3rd Year', '4th Year', '5th Year', '6th Year', '7th Year'];
  const sectionOptions = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const getDepartmentsForCollege = (collegeId) => registeredDepartments.filter((department) => String(department.college_id || department.collegeId) === String(collegeId));

  useEffect(() => {
    if (!isAuthenticated || !isSystemAdmin) {
      navigate('/login');
    }
  }, [isAuthenticated, isSystemAdmin, navigate]);

  useEffect(() => {
    let isMounted = true;

    const loadDashboardStats = async () => {
      setDashboardStatsLoading(true);
      setDashboardStatsError('');
      try {
        const stats = await adminApi.getDashboardStats();
        if (isMounted) {
          setDashboardStats(stats);
          setDashboardStatsLoading(false);
        }
      } catch (error) {
        console.warn('Unable to load admin dashboard statistics:', error);
        if (isMounted) {
          setDashboardStats(null);
          setDashboardStatsError('Unable to load user statistics.');
          setDashboardStatsLoading(false);
        }
      }
    };

    if (isAuthenticated && (role === 'admin' || role === 'systemadmin')) {
      void loadDashboardStats();
    } else if (isMounted) {
      setDashboardStats(null);
      setDashboardStatsLoading(false);
      setDashboardStatsError('');
    }

    const intervalId = activeTab === 'overview' && isAuthenticated && (role === 'admin' || role === 'systemadmin')
      ? window.setInterval(() => void loadDashboardStats(), 30000)
      : null;

    return () => {
      isMounted = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [activeTab, isAuthenticated, role]);

  const refreshSystemHealth = async () => {
    if (!isAuthenticated || (role !== 'admin' && role !== 'systemadmin')) return;
    setSystemHealthLoading(true);
    try {
      const payload = await adminApi.getSystemHealth();
      const snapshot = payload?.data || payload || {};
      setSystemHealthError('');
      setSystemHealth(snapshot);
      setDbHealthMetrics((current) => ({
        ...current,
        status: snapshot?.database?.status || current.status || '--',
        connections: snapshot?.database?.connections ?? current.connections ?? '--',
        diskUsage: snapshot?.disk?.available === false ? 'Unavailable' : Number.isFinite(Number(snapshot?.disk?.percentUsed)) ? `${Number(snapshot.disk.percentUsed).toFixed(1)}%` : current.diskUsage,
        lastBackup: snapshot?.database?.lastBackup ? new Date(snapshot.database.lastBackup).toLocaleString() : current.lastBackup,
        runningQueries: snapshot?.apiPerformance?.requestsPerMinute ?? current.runningQueries ?? '--',
        uptimeSeconds: snapshot?.uptime?.seconds ?? current.uptimeSeconds ?? '--',
        checkedAt: snapshot?.generatedAt || new Date().toISOString(),
      }));
    } catch (error) {
      setSystemHealthError(error?.message || 'System health could not be refreshed.');
      console.warn('Unable to load system health:', error);
    } finally {
      setSystemHealthLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || (role !== 'admin' && role !== 'systemadmin')) return undefined;
    let isMounted = true;

    const loadDatabaseHealth = async () => {
      try {
        const health = await adminApi.getDatabaseHealth();
        if (isMounted && health) setDbHealthMetrics((current) => ({ ...current, ...health }));
      } catch (error) {
        if (isMounted) setDbHealthMetrics((current) => ({ ...current, status: 'Offline', checkedAt: new Date().toISOString() }));
        console.warn('Unable to load database health:', error);
      }
    };

    void loadDatabaseHealth();
    void refreshSystemHealth();
    const intervalId = window.setInterval(() => {
      void loadDatabaseHealth();
      void refreshSystemHealth();
    }, activeTab === 'health' ? 5000 : 15000);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [activeTab, isAuthenticated, role]);

  useEffect(() => {
    let isMounted = true;

    const loadSecurityLogs = async () => {
      setSecurityLogsLoading(true);
      try {
        const result = await adminApi.getSecurityLogs();
        if (!isMounted) return;

        const database = result?.database || {};
        setLogs(Array.isArray(result?.logs) ? result.logs : []);
        setDbHealthMetrics((current) => ({
          ...current,
          ...database,
        }));
        if (Number.isFinite(Number(database.backupRetentionDays)) && Number(database.backupRetentionDays) >= 7) {
          setBackupRetentionDays(Number(database.backupRetentionDays));
        }
        if (database.apiToken) setApiToken(database.apiToken);
        setMfaEnabled(Boolean(database.systemLockEnabled));
      } catch (error) {
        console.warn('Unable to load security logs:', error);
      } finally {
        if (isMounted) setSecurityLogsLoading(false);
      }
    };

    if (isAuthenticated && (role === 'admin' || role === 'systemadmin')) {
      void loadSecurityLogs();
    } else {
      setSecurityLogsLoading(false);
    }

    const intervalId = ['overview', 'security'].includes(activeTab) && isAuthenticated && (role === 'admin' || role === 'systemadmin')
      ? window.setInterval(() => void loadSecurityLogs(), 30000)
      : null;

    return () => {
      isMounted = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [activeTab, isAuthenticated, role]);

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const collegeData = await adminApi.getCollegesWithDepartments();
        const groupedColleges = Array.isArray(collegeData) ? collegeData : Array.isArray(collegeData?.data) ? collegeData.data : [];

        let departmentRecords = [];
        groupedColleges.forEach((college) => {
          const departments = Array.isArray(college?.departments) ? college.departments : [];
          if (!departments.length) return;

          departmentRecords = departmentRecords.concat(departments.map((department) => ({
            id: department.id ?? department.dept_id,
            name: department.name ?? department.dept_name ?? department.department_name,
            code: department.code ?? department.dept_code ?? department.department_code,
            college_id: college.college_id ?? college.id,
            college_name: college.college_name ?? college.name,
            status: department.status ?? department.dept_status ?? 'active',
            registeredAt: new Date().toLocaleString(),
          })));
        });

        setRegisteredDepartments(departmentRecords);
      } catch (error) {
        console.warn('Unable to load persisted departments.', error);
        try {
          const departments = await departmentApi.getAll();
          setRegisteredDepartments(Array.isArray(departments) ? departments.map((department) => ({
            id: department.id,
            name: department.name,
            code: department.code,
            college_id: department.college_id,
            college_name: department.college_name,
            registeredAt: new Date().toLocaleString(),
          })) : []);
        } catch {
          setRegisteredDepartments([]);
        }
      } finally {
        setIsDepartmentsLoading(false);
      }
    };

    loadDepartments();
  }, []);

  useEffect(() => {
    if (activeTab !== 'criteria') return undefined;
    const requestSequence = ++criteriaRequestSequence.current;
    let isCurrent = true;
    criteriaApi.getAll(criteriaType, criteriaTargetRole, { page: criteriaPage, limit: criteriaLimit, search: criteriaSearch }).then((result) => {
      if (!isCurrent || requestSequence !== criteriaRequestSequence.current) return;
      setCriteriaRows(Array.isArray(result) ? result : result?.data || []);
      setCriteriaPagination(result?.pagination || { totalItems: 0, totalPages: 1 });
    }).catch((error) => {
      if (isCurrent && requestSequence === criteriaRequestSequence.current) toast.error(error.message || translate('evaluationCriteria.messages.loadedError'));
    });
    return () => { isCurrent = false; };
  }, [activeTab, criteriaType, criteriaTargetRole, criteriaPage, criteriaLimit, criteriaSearch]);

  useEffect(() => {
    setCriteriaPage(1);
  }, [criteriaType, criteriaTargetRole, criteriaLimit, criteriaSearch]);

  useEffect(() => {
    if (criteriaPage > (criteriaPagination.totalPages || 1)) setCriteriaPage(criteriaPagination.totalPages || 1);
  }, [criteriaPage, criteriaPagination.totalPages]);

  const resetCriterionForm = () => {
    setEditingCriterionId(null);
    setShowCriterionForm(false);
    setCriteriaForm({ criterion_text: '', criterion_text_am: '', category: 'General', weight: 5, target_role: criteriaTargetRole });
  };

  const saveCriterion = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...criteriaForm, evaluator_type: criteriaType, target_role: criteriaTargetRole };
      if (editingCriterionId) {
        await criteriaApi.update(editingCriterionId, payload);
      } else {
        await criteriaApi.create(payload);
      }
      resetCriterionForm();
      const refreshed = await criteriaApi.getAll(criteriaType, criteriaTargetRole, { page: criteriaPage, limit: criteriaLimit, search: criteriaSearch });
      setCriteriaRows(Array.isArray(refreshed) ? refreshed : refreshed?.data || []);
      setCriteriaPagination(refreshed?.pagination || criteriaPagination);
      toast.success(translate(editingCriterionId ? 'evaluationCriteria.messages.updated' : 'evaluationCriteria.messages.added'));
    } catch (error) {
      toast.error(error.message || translate('evaluationCriteria.messages.savedError'));
    }
  };

  const toggleCriterion = async (criterion) => {
    const nextActive = !Boolean(criterion.is_active);
    try {
      if (nextActive) await criteriaApi.update(criterion.id, { is_active: true });
      else await criteriaApi.remove(criterion.id);
      setCriteriaRows((current) => current.map((row) => row.id === criterion.id ? { ...row, is_active: nextActive ? 1 : 0 } : row));
      toast.success(translate(nextActive ? 'evaluationCriteria.messages.enabled' : 'evaluationCriteria.messages.disabled'));
    } catch (error) {
      toast.error(error.message || translate('evaluationCriteria.messages.toggleError'));
    }
  };

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const allUsersResult = await registrationApi.getUsers();
        if (Array.isArray(allUsersResult) && allUsersResult.length) {
          const normalizedAllUsers = allUsersResult.map(normalizeBackendUser);
          const deptHeadRecords = [];
          const instructorRecords = [];
          const studentRecords = [];

          allUsersResult.forEach((user) => {
            const normalized = normalizeBackendUser(user);
            if (normalized.role === 'dept_head') {
              deptHeadRecords.push({ ...normalized, accessScore: normalized.accessScore || 90 });
            } else if (normalized.role === 'instructor') {
              instructorRecords.push(normalized);
            } else if (normalized.role === 'student') {
              studentRecords.push(normalized);
            }
          });

          setAllUsers(normalizedAllUsers);
          if (deptHeadRecords.length) setDeptHeads(deptHeadRecords);
          if (instructorRecords.length) setInstructors(instructorRecords);
          if (studentRecords.length) setStudents(studentRecords);
        } else {
          setAllUsers([]);
        }
      } catch (error) {
        console.warn('Unable to load admin user lists:', error);
        setAllUsers([]);
      }
    };

    void loadUsers();
  }, []);

  const handleSaveEdit = async (updatedHead) => {
    if (!updatedHead || !updatedHead.id) {
      toast.error('Invalid user selected.');
      return;
    }

    const departmentValue = updatedHead.department || departmentSelectionOptions[0]?.id || '';
    const existingDepartmentHead = deptHeads.find((head) => head.department === departmentValue && head.id !== updatedHead.id && head.status !== 'Inactive' && head.status !== 'Reassigned');

    if (updatedHead.role === 'dept_head' && existingDepartmentHead && !headEditTransferMode) {
      toast.error('Department Head already exists for this department. Please update or reassign the existing Department Head.');
      return;
    }

    const payload = {
      full_name: updatedHead.fullName,
      username: updatedHead.username,
      department: departmentValue,
      department_name: getDepartmentName(departmentValue) || updatedHead.departmentName || null,
      registration_date: updatedHead.academicDate || null,
      status: updatedHead.status || 'Active',
    };

    try {
      await registrationApi.updateUser(updatedHead.id, payload);
      const updatedRecord = { ...updatedHead, department: departmentValue, departmentName: payload.department_name };

      setDeptHeads((current) => current.map((head) => (head.id === updatedHead.id ? updatedRecord : head)));
      setInstructors((current) => current.map((instructor) => (instructor.id === updatedHead.id ? updatedRecord : instructor)));
      setStudents((current) => current.map((student) => (student.id === updatedHead.id ? updatedRecord : student)));

      if (existingDepartmentHead && headEditTransferMode) {
        setDeptHeads((current) => current.map((head) => {
          if (head.id === existingDepartmentHead.id) {
            return { ...head, department: '', status: 'Reassigned' };
          }
          return head;
        }));
      }

      setShowEditModal(false);
      setSelectedHead(null);
      setHeadEditTransferMode(false);
      toast.success('User updated successfully.');
    } catch (error) {
      console.error('Update user failed:', error);
      toast.error(error?.message || 'Unable to save user changes.');
    }
  };

  const handleResetPassword = async (user) => {
    if (!user?.id || !window.confirm(`Reset password for ${user.fullName || user.full_name || user.email || 'this user'}?`)) return;
    try {
      await adminApi.resetUserPassword(user.id);
      toast.success('Password reset. The user must change it at next login.');
    } catch (error) {
      toast.error(error.message || 'Unable to reset password.');
    }
  };

  const handleFileInputChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (file && !/\.(csv|xlsx)$/i.test(file.name)) {
      setUploadFile(null);
      setUploadFileName('');
      event.target.value = '';
      toast.error('Choose a CSV or XLSX file.');
      return;
    }
    setUploadFile(file);
    setUploadFileName(file ? file.name : '');
    setBulkUploadErrors([]);
  };

  const handleRegistrationModeChange = (mode) => {
    setRegistrationMode(mode);
    setRegistrationErrors({});
    setBulkUploadErrors([]);
    setUploadFile(null);
    setUploadFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBroadcastSend = async (event) => {
    event.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      toast.error(strings.systemAdminDashboard.validationBroadcastMessage);
      return;
    }
    try {
      const result = await notificationApi.send({
        audience: broadcastAudience,
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
      });
      const sent = Number(result?.sent || 0);
      const sentAt = new Date().toLocaleString();
      setBroadcastHistory((current) => [{ id: Date.now(), audience: broadcastAudience, title: broadcastTitle.trim(), message: broadcastMessage.trim(), sent, sentAt }, ...current]);
      setLogs((current) => [
        ...current,
        { id: Date.now(), user: 'SystemAdmin', action: 'Broadcast sent', time: sentAt, desc: `Broadcast to ${broadcastAudience} (${sent} users)`, ip: '127.0.0.1', browser: navigator.userAgent },
      ]);
      toast.success(`${strings.systemAdminDashboard.successBroadcastSent} ${sent} users notified.`);
      setBroadcastTitle('System announcement');
      setBroadcastMessage('');
      setBroadcastAudience('all');
      setIsComposing(false);
    } catch (error) {
      toast.error(error?.message || 'Unable to send broadcast.');
    }
  };

  const handleInstructorChange = (field) => (event) => {
    const value = event.target.value;
    setInstructorForm((current) => ({ ...current, [field]: value }));

    const nextErrors = buildRegistrationValidationErrors({
      mode: 'instructor',
      firstName: field === 'firstName' ? value : instructorForm.firstName,
      lastName: field === 'lastName' ? value : instructorForm.lastName,
      email: field === 'email' ? value : instructorForm.email,
      employeeId: field === 'employeeId' ? value : instructorForm.employeeId,
      gender: field === 'gender' ? value : instructorForm.gender,
      department: field === 'department' ? value : instructorForm.department,
    });

    setRegistrationErrors((current) => {
      const next = { ...current };
      if (nextErrors[field]) next[field] = nextErrors[field];
      else delete next[field];
      return next;
    });

    if (field === 'role' && value !== 'dept_head') {
      setDeptHeadTransferMode(false);
    }
  };

  const handleLabAssistantChange = (field) => (event) => {
    const value = event.target.value;
    setLabAssistantForm((current) => ({ ...current, [field]: value }));

    const nextErrors = buildRegistrationValidationErrors({
      mode: 'lab_assistant',
      firstName: field === 'firstName' ? value : labAssistantForm.firstName,
      lastName: field === 'lastName' ? value : labAssistantForm.lastName,
      email: field === 'email' ? value : labAssistantForm.email,
      employeeId: field === 'employeeId' ? value : labAssistantForm.employeeId,
      gender: field === 'gender' ? value : labAssistantForm.gender,
      department: field === 'department' ? value : labAssistantForm.department,
    });

    setRegistrationErrors((current) => {
      const next = { ...current };
      if (nextErrors[field]) next[field] = nextErrors[field];
      else delete next[field];
      return next;
    });
  };

  const handleStudentChange = (field) => (event) => {
    const value = event.target.value;
    setStudentForm((current) => {
      if (field === 'college') {
        const nextDepartment = getDepartmentsForCollege(value)[0]?.id || current.department;
        return { ...current, college: value, department: nextDepartment };
      }
      return { ...current, [field]: value };
    });

    const nextErrors = buildRegistrationValidationErrors({
      mode: 'student',
      firstName: field === 'firstName' ? value : studentForm.firstName,
      lastName: field === 'lastName' ? value : studentForm.lastName,
      studentId: field === 'studentId' ? value : studentForm.studentId,
      gender: field === 'gender' ? value : studentForm.gender,
      department: field === 'department' ? value : studentForm.department,
      programType: field === 'programType' ? value : studentForm.programType,
      year: field === 'year' ? value : studentForm.year,
      semester: field === 'semester' ? value : studentForm.semester,
      section: field === 'section' ? value : studentForm.section,
    });

    setRegistrationErrors((current) => {
      const next = { ...current };
      if (nextErrors[field]) next[field] = nextErrors[field];
      else delete next[field];
      return next;
    });
  };

  const resetInstructorForm = () => {
    setRegistrationErrors({});
    setInstructorForm({
      firstName: '',
      lastName: '',
      gender: '',
      email: '',
      role: 'instructor',
      employeeId: '',
      department: '',
    });
  };

  const resetLabAssistantForm = () => {
    setRegistrationErrors({});
    setLabAssistantForm({
      firstName: '',
      lastName: '',
      gender: '',
      email: '',
      employeeId: '',
      department: '',
    });
  };

  const resetStudentForm = () => {
    setRegistrationErrors({});
    setStudentForm({
      firstName: '',
      lastName: '',
      gender: '',
      studentId: '',
      department: '',
      programType: 'regular',
      academicYear: '2024',
      semester: 'i',
      year: '1st Year (Freshman)',
      section: 'A',
    });
  };

  const handleBulkUploadSubmit = async () => {
    if (!uploadFile) {
      toast.error('Please choose a CSV file before uploading.');
      return;
    }

    if (!registrationMode) {
      toast.error('Please select a registration type before uploading.');
      return;
    }

    setIsBulkSubmitting(true);
    setBulkUploadErrors([]);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('role', registrationMode);
      formData.append('registration_type', registrationMode);

      const result = await registrationApi.bulkRegister(formData);
      const createdCount = Number(result?.created ?? result?.createdCount ?? 0);
      const failedCount = Number(result?.failed ?? result?.failedCount ?? 0);
      const updatedCount = Number(result?.updated ?? result?.updatedCount ?? 0);
      const rowErrors = Array.isArray(result?.errors) ? result.errors : Array.isArray(result?.failures) ? result.failures : [];
      setBulkUploadErrors(rowErrors);

      if (result?.created_users?.length) {
        setStudents((current) => {
          if (registrationMode !== 'student') return current;
          const newRows = result.created_users.map((row) => ({
            id: Date.now() + Math.random(),
            fullName: row.full_name,
            username: row.username,
            studentId: row.student_id,
            department: row.department,
            programType: row.program_type,
            semester: row.semester || 'i',
            year: row.year || '1st Year (Freshman)',
            section: row.section || 'A',
            academicDate: row.registration_date || getTodayDate(),
            status: 'Active',
          }));
          return [...newRows, ...current];
        });

        setInstructors((current) => {
          if (registrationMode !== 'instructor' && registrationMode !== 'lab_assistant') return current;
          const newRows = result.created_users
            .filter((row) => registrationMode === 'lab_assistant' ? row.role === 'lab_assistant' : row.role === 'instructor')
            .map((row) => ({
            id: Date.now() + Math.random(),
            fullName: row.full_name,
            username: row.username,
            employeeId: row.employee_id,
            department: row.department,
            programType: row.program_type,
            academicDate: row.registration_date || getTodayDate(),
            status: 'Active',
            role: row.role === 'lab_assistant' ? 'Lab Assistant' : 'Instructor',
          }));
          return [...newRows, ...current];
        });

        setDeptHeads((current) => {
          if (registrationMode !== 'instructor') return current;
          const newRows = result.created_users.filter((row) => row.role === 'dept_head').map((row) => ({
            id: Date.now() + Math.random(),
            fullName: row.full_name,
            username: row.username,
            employeeId: row.employee_id,
            department: row.department,
            programType: row.program_type,
            academicDate: row.registration_date || getTodayDate(),
            status: 'Active',
            accessScore: 90,
            role: 'Department Head',
          }));
          return [...newRows, ...current];
        });
      }

      setUploadFile(null);
      setUploadFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      const summary = `Bulk upload complete. Created: ${createdCount}; Updated: ${updatedCount}; Failed: ${failedCount}.`;
      if (failedCount > 0 || rowErrors.length > 0) toast.error(summary);
      else toast.success(summary);
    } catch (error) {
      const message = error?.response?.data?.message?.en || error.message || 'Bulk upload failed.';
      const responseErrors = error?.response?.data?.errors || error?.response?.data?.failures;
      setBulkUploadErrors(Array.isArray(responseErrors) ? responseErrors : []);
      toast.error(message);
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleSingleSubmit = async (event) => {
    event.preventDefault();

    const validationErrors = registrationMode === 'instructor'
      ? buildRegistrationValidationErrors({
          mode: 'instructor',
          firstName: instructorForm.firstName,
          lastName: instructorForm.lastName,
          email: instructorForm.email,
          employeeId: instructorForm.employeeId,
          gender: instructorForm.gender,
          department: instructorForm.department,
        })
      : registrationMode === 'lab_assistant'
        ? buildRegistrationValidationErrors({
            mode: 'lab_assistant',
            firstName: labAssistantForm.firstName,
            lastName: labAssistantForm.lastName,
            email: labAssistantForm.email,
            employeeId: labAssistantForm.employeeId,
            gender: labAssistantForm.gender,
            department: labAssistantForm.department,
          })
        : buildRegistrationValidationErrors({
            mode: 'student',
            firstName: studentForm.firstName,
            lastName: studentForm.lastName,
            studentId: studentForm.studentId,
            gender: studentForm.gender,
            department: studentForm.department,
            programType: studentForm.programType,
            year: studentForm.year,
            semester: studentForm.semester,
            section: studentForm.section,
          });

    setRegistrationErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      const firstInvalidField = Object.keys(validationErrors)[0];
      const fieldMap = {
        firstName: 'firstName',
        lastName: 'lastName',
        email: 'email',
        employeeId: 'employeeId',
        studentId: 'studentId',
        gender: 'gender',
      };
      const focusTarget = fieldMap[firstInvalidField];
      if (focusTarget) {
        const element = document.querySelector(`[name="${focusTarget}"]`);
        if (element) element.focus();
      }
      toast.error('Validation error: please correct the highlighted fields before submitting.');
      return;
    }

    setIsSubmitting(true);

    const parseDepartmentId = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    try {
      if (registrationMode === 'instructor') {
        const email = instructorForm.email.trim().toLowerCase();
        const fullName = [instructorForm.firstName, instructorForm.lastName].filter(Boolean).join(' ').trim();
        const roleValue = 'instructor';

        if (!email || !fullName || !instructorForm.employeeId.trim() || !instructorForm.department) {
          toast.error('Please complete the instructor form before registering.');
          setIsSubmitting(false);
          return;
        }

        if (roleValue === 'dept_head') {
          const existingDepartmentHead = deptHeads.find((head) => head.department === instructorForm.department && head.status !== 'Inactive' && head.status !== 'Reassigned');
          if (existingDepartmentHead && !deptHeadTransferMode) {
            toast.error('Department Head already exists for this department.');
            setIsSubmitting(false);
            return;
          }
        }

        const payload = {
          first_name: instructorForm.firstName.trim(),
          last_name: instructorForm.lastName.trim(),
          gender: instructorForm.gender,
          email,
          role: roleValue,
          department_id: parseDepartmentId(instructorForm.department),
          employee_id: instructorForm.employeeId.trim(),
          password: instructorForm.password?.trim(),
        };

        await authApi.registerInstructor(payload);
        const addedLocally = registerUser({ ...payload, role: roleValue, username: email });
        if (!addedLocally) {
          console.warn(`${roleValue === 'dept_head' ? 'Department Head' : 'Instructor'} ${email} already exists in local auth state.`);
        }

        if (roleValue === 'dept_head') {
          const existingDepartmentHead = deptHeads.find((head) => head.department === instructorForm.department && head.status !== 'Inactive' && head.status !== 'Reassigned');
          setDeptHeads((current) => {
            if (existingDepartmentHead && deptHeadTransferMode) {
              return current.map((head) => {
                if (head.id === existingDepartmentHead.id) {
                  return { ...head, ...instructorForm, fullName, username: email, department: instructorForm.department, status: 'Active', role: 'Department Head' };
                }
                return head;
              });
            }

            return [{ id: Date.now(), ...instructorForm, fullName, username: email, department: instructorForm.department, status: 'Active', accessScore: 90, role: 'Department Head' }, ...current];
          });
          setInstructors((current) => [{
            id: Date.now(),
            fullName,
            username: email,
            role: 'Department Head',
            employeeId: instructorForm.employeeId.trim(),
            department: instructorForm.department,
            status: 'Active',
          }, ...current]);
          setLogs((current) => [
            ...current,
            { id: Date.now(), user: 'SystemAdmin', action: 'Department Head registered', time: new Date().toLocaleString(), desc: `Registered ${fullName}`, ip: '127.0.0.1', browser: navigator.userAgent },
          ]);
          toast.success('Department Head registered successfully.');
        } else {
          setInstructors((current) => [{
            id: Date.now(),
            fullName,
            username: email,
            role: 'Instructor',
            employeeId: instructorForm.employeeId.trim(),
            department: instructorForm.department,
            status: 'Active',
          }, ...current]);
          setLogs((current) => [
            ...current,
            { id: Date.now(), user: 'SystemAdmin', action: 'Instructor registered', time: new Date().toLocaleString(), desc: `Registered ${fullName}`, ip: '127.0.0.1', browser: navigator.userAgent },
          ]);
          toast.success('Instructor registered successfully.');
        }

        resetInstructorForm();
        setDeptHeadTransferMode(false);
        setIsSubmitting(false);
        return;
      }

      if (registrationMode === 'lab_assistant') {
        const email = labAssistantForm.email.trim().toLowerCase();
        const fullName = [labAssistantForm.firstName, labAssistantForm.lastName].filter(Boolean).join(' ').trim();

        if (!email || !fullName || !labAssistantForm.employeeId.trim() || !labAssistantForm.department) {
          toast.error('Please complete the lab assistant form before registering.');
          setIsSubmitting(false);
          return;
        }

        const payload = {
          first_name: labAssistantForm.firstName.trim(),
          last_name: labAssistantForm.lastName.trim(),
          gender: labAssistantForm.gender,
          email,
          role: 'lab_assistant',
          department_id: parseDepartmentId(labAssistantForm.department),
          employee_id: labAssistantForm.employeeId.trim(),
        };

        try {
          await authApi.registerLabAssistant(payload);
        } catch (error) {
          if (error?.status === 409) {
            toast.warning(`Lab Assistant ${email} is already registered in the system.`);
            setIsSubmitting(false);
            return;
          }
          throw error;
        }

        const addedLocally = registerUser({ ...payload, role: 'lab_assistant', username: email, email });
        if (!addedLocally) {
          console.warn(`Lab Assistant ${email} already exists in local auth state.`);
        }

        setInstructors((current) => [{
          id: Date.now(),
          fullName,
          username: email,
          role: 'Lab Assistant',
          employeeId: labAssistantForm.employeeId.trim(),
          department: labAssistantForm.department,
          status: 'Active',
        }, ...current]);

        setLogs((current) => [
          ...current,
          { id: Date.now(), user: 'SystemAdmin', action: 'Lab Assistant registered', time: new Date().toLocaleString(), desc: `Registered ${fullName}`, ip: '127.0.0.1', browser: navigator.userAgent },
        ]);

        toast.success('Lab Assistant registered successfully.');
        resetLabAssistantForm();
        setIsSubmitting(false);
        return;
      }

      const studentId = studentForm.studentId.trim();
      const fullName = [studentForm.firstName, studentForm.lastName].filter(Boolean).join(' ').trim();

      if (!studentId || !fullName || !studentForm.department || !studentForm.section || !studentForm.year) {
        toast.error('Please complete the student form before registering.');
        setIsSubmitting(false);
        return;
      }

      const payload = {
        first_name: studentForm.firstName.trim(),
        last_name: studentForm.lastName.trim(),
        gender: studentForm.gender,
        student_id: studentId,
        department_id: parseDepartmentId(studentForm.department),
        semester: studentForm.semester,
        year_level: studentForm.year,
        section: studentForm.section,
        program_type: studentForm.programType,
        password: studentForm.password?.trim(),
      };

      await authApi.registerStudent(payload);
      const addedLocally = registerUser({ ...payload, role: 'student', email: null });
      if (!addedLocally) {
        console.warn(`Student ${studentId} already exists in local auth state.`);
      }

      setStudents((current) => [{
        id: Date.now(),
        fullName,
        username: studentId,
        studentId,
        department: studentForm.department,
        programType: studentForm.programType,
        semester: studentForm.semester,
        year: studentForm.year,
        section: studentForm.section,
        status: 'Active',
      }, ...current]);
      setLogs((current) => [
        ...current,
        { id: Date.now(), user: 'SystemAdmin', action: 'Student registered', time: new Date().toLocaleString(), desc: `Registered ${fullName}`, ip: '127.0.0.1', browser: navigator.userAgent },
      ]);
      toast.success('Student registered successfully.');
      resetStudentForm();
      setIsSubmitting(false);
    } catch (error) {
      setIsSubmitting(false);
      const message = error?.response?.data?.message?.en || error.message || 'Server registration failed.';
      toast.error(message);
    }
  };

  const resetApiToken = () => {
    const nextToken = `IEPS-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    setApiToken(nextToken);
    setLogs((current) => [
      ...current,
      { id: Date.now(), user: 'SystemAdmin', action: 'API token rotated', time: new Date().toLocaleString(), desc: 'Rotated system token', ip: '127.0.0.1', browser: navigator.userAgent },
    ]);
    toast.success(strings.systemAdminDashboard.successTokenRotated);
  };

  const [apiToken, setApiToken] = useState('--');

  const handleForceReset = (id) => {
    setLogs((current) => [
      ...current,
      { id: Date.now(), user: 'SystemAdmin', action: 'Force reset issued', time: new Date().toLocaleString(), desc: `Forced password reset for head ${id}`, ip: '127.0.0.1', browser: navigator.userAgent },
    ]);
    setShowForceResetModal(false);
    setSelectedHead(null);
    toast.success(strings.systemAdminDashboard.successForceResetIssued);
  };

  const handleBackupRetentionChange = (event) => {
    setBackupRetentionDays(Number(event.target.value));
  };

  const handleSaveBackupRetention = async () => {
    setBackupRetentionSaving(true);
    try {
      const result = await adminApi.updateBackupRetention(backupRetentionDays);
      const savedDays = Number(result?.backupRetentionDays ?? backupRetentionDays);
      setBackupRetentionDays(savedDays);
      setDbHealthMetrics((current) => ({ ...current, backupRetentionDays: savedDays }));
      toast.success(result?.message || `Backup retention set to ${savedDays} days.`);
    } catch (error) {
      toast.error(error?.message || 'Unable to save backup retention.');
    } finally {
      setBackupRetentionSaving(false);
    }
  };

  const toggleAuditEntry = (id) => {
    setExpandedLogIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTriggerBackup = async () => {
    if (backuping) return;
    setBackuping(true);
    try {
      const payload = await adminApi.triggerBackup();
      const backup = payload?.data || payload || {};
      setDbHealthMetrics((current) => ({
        ...current,
        lastBackup: backup?.createdAt ? new Date(backup.createdAt).toLocaleString() : 'Just now',
      }));
      const cleanupMessage = Number(backup?.removedExpiredBackups || 0) > 0 ? ` ${backup.removedExpiredBackups} expired backup(s) removed.` : '';
      toast.success(`${backup?.message || 'Backup created successfully.'}${cleanupMessage}`);
      await refreshSystemHealth();
    } catch (error) {
      toast.error(error?.message || 'Unable to trigger backup.');
    } finally {
      setBackuping(false);
    }
  };

  const handleSystemLockToggle = async () => {
    const nextValue = !mfaEnabled;
    setSystemLockUpdating(true);
    try {
      const result = await adminApi.updateSystemLock(nextValue);
      setMfaEnabled(Boolean(result?.enabled));
      toast.success(Boolean(result?.enabled) ? 'Global system lock enabled.' : 'Global system lock disabled.');
    } catch (error) {
      toast.error(error?.message || 'Unable to update global system lock.');
    } finally {
      setSystemLockUpdating(false);
    }
  };

  const clearAuditHistory = async () => {
    if (!window.confirm('Clear all audit history? This action cannot be undone.')) return;
    try {
      const result = await adminApi.clearSecurityLogs();
      setLogs([]);
      setExpandedLogIds(new Set());
      toast.success(`${Number(result?.deleted || 0)} audit event(s) cleared.`);
    } catch (error) {
      toast.error(error?.message || 'Unable to clear audit history.');
    }
  };

  return (
    <div className="relative flex min-h-screen min-w-0 flex-col bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.20),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_34%),linear-gradient(135deg,_#e8f0fb_0%,_#dfeaf8_48%,_#edf4ff_100%)] text-slate-900 lg:flex-row">
      <div className={`fixed inset-x-0 bottom-0 top-16 z-40 transition-opacity lg:hidden ${isMobileMenuOpen ? 'visible opacity-100' : 'pointer-events-none invisible opacity-0'}`}>
        <button type="button" className="absolute inset-0 bg-slate-950/45" onClick={() => setIsMobileMenuOpen(false)} aria-label={t('closeNavigation', 'Close system admin navigation', 'የስርዓት አስተዳደር ዳሰሳን ዝጋ')} tabIndex={isMobileMenuOpen ? 0 : -1} />
      </div>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
        <h1 className="text-base font-bold text-slate-900">{t('systemAdminTitle', 'System Admin', 'የስርዓት አስተዳደር')}</h1>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen((open) => !open)}
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={isMobileMenuOpen ? t('closeNavigation', 'Close navigation menu', 'የዳሰሳ ምናሌውን ዝጋ') : t('openNavigation', 'Open navigation menu', 'የዳሰሳ ምናሌውን ክፈት')}
          aria-expanded={isMobileMenuOpen}
          aria-controls="system-admin-sidebar"
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>
      <aside id="system-admin-sidebar" className={`fixed inset-y-16 left-0 z-50 flex w-[min(20rem,85vw)] flex-col overflow-y-auto border-r border-slate-200 bg-white p-6 shadow-2xl transition-transform duration-200 lg:visible lg:static lg:inset-y-auto lg:z-auto lg:w-80 lg:shrink-0 lg:translate-x-0 lg:shadow-none ${isMobileMenuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}>
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-3xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20">
            <Activity size={18} /> {t('liveAdmin', 'Live Admin', 'ቀጥታ አስተዳደር')}
          </div>
          <h1 className="mt-6 text-2xl font-bold">{t('systemAdminTitle', 'System Admin', 'የስርዓት አስተዳደር')}</h1>
          <p className="mt-2 text-slate-400">{t('systemAdminSubtitle', 'Enterprise evaluation command center', 'የግምገባ አደረጃጀት ቁጥጥር ማዕከል')}</p>
        </div>
        <nav className="flex-1 space-y-2">
          {[
            { id: 'overview', icon: LayoutDashboard, label: t('overview', 'Overview', 'አጠቃላይ') },
            { id: 'department-course', icon: ClipboardList, label: t('collegeDepartmentRegistration', 'College and Department Registration', 'ኮሌጅ እና ዲፓርትመንት ምዝገባ') },
            { id: 'criteria', icon: ClipboardList, label: t('evaluationCriteriaMenu', 'Evaluation Criteria', 'የግምገማ መስፈርቶች') },
            { id: 'register-head', icon: UserPlus, label: t('registerHead', 'Register User', 'ምዝገባ') },
            { id: 'manage-roles', icon: ShieldCheck, label: t('manageRoles', 'Manage Roles', 'ሚናዎችን አስተዳድር') },
            { id: 'view-data', icon: Database, label: t('viewData', 'View Data', 'ውሂብ ይመልከቱ') },
            { id: 'broadcast', icon: Megaphone, label: t('broadcastManager', 'Broadcast Manager', 'የስርጭት አስተዳደር') },
            { id: 'security', icon: ShieldCheck, label: t('securityLogs', 'Security & Logs', 'ደህንነት እና መዝገቦች') },
            { id: 'health', icon: Activity, label: t('systemHealth', 'System Health', 'የስርዓት ጤና') },
            { id: 'landing-content', icon: Megaphone, label: t('landingPage', 'Landing Page', 'የላንዲንግ ገጽ') },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition ${activeTab === item.id ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/20' : 'text-slate-600 hover:bg-slate-100 hover:text-blue-600'}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-8">
          <IPESAISmartInsights role="ADMIN" onActionClick={handleAiAction} />
        </div>
        {activeTab === 'view-data' && (
          <ViewDataView
            instructors={instructors}
            students={students}
            allUsers={allUsers}
            departments={registeredDepartments}
            onResetPassword={handleResetPassword}
          />
        )}

        {activeTab === 'landing-content' && <LandingPageManagement />}

        {activeTab === 'overview' && (() => {
          const userBreakdown = dashboardStats?.usersByRole || {};
          const completionRate = Math.min(100, Math.max(0, Number(dashboardStats?.evaluationCompletionRate || 0)));
          const isHealthReady = Boolean(systemHealth?.generatedAt);
          const securityAlerts = healthAlerts.filter((alert) => ['warning', 'critical'].includes(alert.level));
          const criticalAlertCount = healthAlerts.filter((alert) => alert.level === 'critical').length;
          const healthRecommendations = Array.isArray(healthDiagnostics?.recommendations) && healthDiagnostics.recommendations.length
            ? healthDiagnostics.recommendations
            : healthDiagnostics?.risks || [];
          const recentEvents = logs.slice(0, 4);
          const countLabel = (value) => value === null || value === undefined || value === ''
            ? '—'
            : Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—';
          const dashboardTotalLabel = dashboardStatsLoading
            ? 'Loading…'
            : dashboardStatsError
              ? 'Unavailable'
              : countLabel(dashboardStats?.totalUsers);
          const quickActions = [
            { label: t('registerHead', 'Register User', 'ተጠቃሚ ይመዝግቡ'), icon: UserPlus, color: 'text-blue-700', action: () => { setRegistrationMode(null); setActiveTab('register-head'); } },
            { label: t('manageRoles', 'Manage Roles', 'ሚናዎችን አስተዳድር'), icon: ShieldCheck, color: 'text-indigo-700', action: () => setActiveTab('manage-roles') },
            { label: t('addCollegeDepartment', 'Add college / department', 'ኮሌጅ / ዲፓርትመንት ያክሉ'), icon: Building2, color: 'text-cyan-700', action: () => { setDepartmentCourseTab('college'); setActiveTab('department-course'); } },
          ];

          return (
            <section className="space-y-6">
              <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase text-blue-700">IPES · Administration</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">{t('commandCenterTitle', 'System Command Center', 'የስርዓት ትዕዛዝ ማዕከል')}</h2>
                  <p className="mt-1 text-sm text-slate-500">{t('commandCenterSubtitle', 'Live institutional metrics and evaluation operations', 'የተቋሙን የቀጥታ መረጃዎችና የግምገማ ሥራዎችን ይቆጣጠሩ')}</p>
                </div>
                <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${isHealthReady && systemHealth.status === 'healthy' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : isHealthReady ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  <span className={`h-2 w-2 rounded-full ${isHealthReady && systemHealth.status === 'healthy' ? 'bg-emerald-500' : isHealthReady ? 'bg-amber-500' : 'bg-slate-400'}`} />
                  {isHealthReady ? (systemHealth.status === 'healthy' ? 'System operational' : 'Attention required') : 'Checking system'}
                </div>
              </header>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="text-xs font-semibold uppercase text-slate-500">Total registered users</p><p className="mt-2 text-3xl font-bold text-slate-950">{dashboardTotalLabel}</p></div>
                    <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><Users size={20} /></span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>Instructors <strong className="text-slate-800">{countLabel(userBreakdown.instructors)}</strong></span>
                    <span>Dept heads <strong className="text-slate-800">{countLabel(userBreakdown.departmentHeads)}</strong></span>
                    <span>Deans <strong className="text-slate-800">{countLabel(userBreakdown.deans)}</strong></span>
                    <span>Students <strong className="text-slate-800">{countLabel(userBreakdown.students)}</strong></span>
                    <span>System admins <strong className="text-slate-800">{countLabel(userBreakdown.systemAdministrators)}</strong></span>
                    <span>Academic directorate <strong className="text-slate-800">{countLabel(userBreakdown.academicDirectorate)}</strong></span>
                    <span>Academic vice-president <strong className="text-slate-800">{countLabel(userBreakdown.academicVicePresidents)}</strong></span>
                    <span>Lab assistants <strong className="text-slate-800">{countLabel(userBreakdown.labAssistants)}</strong></span>
                  </div>
                  {dashboardStatsError && <p className="mt-3 text-xs font-medium text-red-600">{dashboardStatsError}</p>}
                </article>

                <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xs font-semibold uppercase text-slate-500">Academic structure</p><p className="mt-2 text-3xl font-bold text-slate-950">{dashboardStats ? countLabel(dashboardStats.totalColleges) : '—'} <span className="text-lg font-medium text-slate-400">/ {dashboardStats ? countLabel(dashboardStats.activeDepartments) : '—'}</span></p></div>
                    <span className="rounded-xl bg-cyan-50 p-2.5 text-cyan-800"><Building2 size={20} /></span>
                  </div>
                  <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">Colleges <span className="px-1 text-slate-300">·</span> Active departments</p>
                </article>

                <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xs font-semibold uppercase text-slate-500">Evaluation completion</p><p className="mt-2 text-3xl font-bold text-slate-950">{dashboardStats ? `${completionRate.toFixed(1)}%` : '—'}</p></div>
                    <span className="rounded-xl bg-amber-50 p-2.5 text-amber-800"><BarChart3 size={20} /></span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-700 transition-[width] duration-500" style={{ width: `${dashboardStats ? completionRate : 0}%` }} /></div>
                  <p className="mt-2 text-xs text-slate-500">Submitted student and peer evaluations</p>
                </article>

                <article className={`min-w-0 rounded-2xl border p-5 shadow-sm ${securityAlerts.length ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xs font-semibold uppercase text-slate-500">System health</p><p className={`mt-2 text-3xl font-bold ${securityAlerts.length ? 'text-amber-900' : 'text-slate-950'}`}>{isHealthReady ? securityAlerts.length : '—'} <span className="text-base font-semibold text-slate-500">alerts</span></p></div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-xl p-2.5 ${securityAlerts.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                        {securityAlerts.length ? <ShieldAlert size={20} /> : <CheckCircle2 size={20} />}
                      </span>
                      <div className="group relative">
                        <button type="button" onClick={() => void toggleSoundMute()} aria-label={isMuted ? 'Enable alert sound' : healthAlertAudioReady ? 'Mute alert sound' : 'Enable alert sound'} aria-pressed={!isMuted} title={isMuted ? 'Enable alert sound' : healthAlertAudioReady ? 'Mute alert sound' : 'Enable alert sound'} className={`rounded-lg border p-2 transition ${isMuted ? 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50' : criticalAlertCount ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} className={criticalAlertCount ? 'animate-pulse' : ''} />}
                        </button>
                        <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-50 mt-2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          {isMuted ? 'Enable alert sound' : healthAlertAudioReady ? 'Mute alert sound' : 'Enable alert sound'}
                        </span>
                      </div>
                      {typeof window !== 'undefined' && (import.meta.env.DEV || window.location.hostname === 'localhost') && (
                        <button type="button" onClick={healthAlerts.some((alert) => alert.id?.startsWith('TEST_')) ? clearTestAlert : triggerTestAlert} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                          {healthAlerts.some((alert) => alert.id?.startsWith('TEST_')) ? 'Clear test alert' : 'Simulate alert'}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-4 border-t border-slate-200/70 pt-3 text-xs text-slate-500">Active sessions <strong className="text-slate-800">{countLabel(dashboardStats?.activeSessions)}</strong>{criticalAlertCount > 0 ? <span className="ml-2 font-semibold text-red-700">{criticalAlertCount} critical</span> : null}</p>
                </article>
              </div>

              {securityAlerts.length > 0 && <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3"><span className="rounded-xl bg-amber-50 p-2 text-amber-800"><Sparkles size={18} /></span><div><p className="text-xs font-bold uppercase text-amber-800">IPES AI Smart Insights</p><h3 className="mt-1 text-sm font-semibold text-slate-900">System diagnostics and recommendations</h3></div></div>
                  <span className="text-xs text-slate-500">{healthDiagnostics?.provider ? `Provider: ${healthDiagnostics.provider}` : 'Based on current system health signals'}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {securityAlerts.slice(0, 4).map((alert, index) => <article key={`${alert.title}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className={`flex items-center gap-2 text-sm font-semibold ${alert.level === 'critical' ? 'text-red-800' : 'text-amber-900'}`}><AlertTriangle size={15} />{alert.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{alert.detail}</p>
                  </article>)}
                </div>
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                  <p className="text-xs font-bold uppercase text-blue-900">Recommended next steps</p>
                  {healthDiagnosticsLoading ? <p className="mt-2 text-sm text-slate-600">Analyzing current health signals…</p>
                    : healthDiagnosticsError ? <p className="mt-2 text-sm text-slate-600">{healthDiagnosticsError}</p>
                      : healthRecommendations.length ? <ul className="mt-2 space-y-2">{healthRecommendations.slice(0, 5).map((recommendation, index) => <li key={`${index}-${recommendation}`} className="flex gap-2 text-sm leading-5 text-slate-700"><span className="font-bold text-blue-700">{index + 1}.</span><span>{recommendation}</span></li>)}</ul>
                        : <p className="mt-2 text-sm text-slate-600">{healthDiagnostics?.summary || 'No recommendations are available for the current alerts.'}</p>}
                </div>
              </section>}

              <div className="grid gap-5 lg:grid-cols-3">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4"><h3 className="text-sm font-bold text-slate-950">Quick actions</h3><p className="mt-1 text-xs text-slate-500">Common administration tasks</p></div>
                  <div className="space-y-2">
                    {quickActions.map(({ label, icon: Icon, color, action }) => (
                      <button key={label} type="button" onClick={action} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                        <span className="flex min-w-0 items-center gap-3"><Icon size={17} className={`shrink-0 ${color}`} /><span className="truncate">{label}</span></span><ArrowRight size={15} className="shrink-0 text-slate-400" />
                      </button>
                    ))}
                  </div>
                </section>

                <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div><h3 className="text-sm font-bold text-slate-950">Recent system activity</h3><p className="mt-1 text-xs text-slate-500">Latest events recorded in the audit log</p></div>
                    <button type="button" onClick={() => setActiveTab('security')} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">View logs <ArrowRight size={14} /></button>
                  </div>
                  {recentEvents.length ? <div className="divide-y divide-slate-100">
                    {recentEvents.map((event) => {
                      const hasIssue = event.status === 'FAILED' || event.status === 'WARNING';
                      const eventDate = event.time ? new Date(event.time) : null;
                      const eventTime = eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate.toLocaleString() : '—';
                      return <article key={event.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-2 last:pb-0">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${hasIssue ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{event.action || 'System event'}</p><p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{event.desc || event.user || 'System activity'}</p></div>
                        <time className="shrink-0 text-right text-[11px] text-slate-400">{eventTime}</time>
                      </article>;
                    })}
                  </div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{securityLogsLoading ? 'Loading recent activity…' : 'No recent system events.'}</div>}
                </section>
              </div>
            </section>
          );
        })()}

        {activeTab === 'criteria' && (
          <section className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h3 className="text-2xl font-bold text-slate-900">{translate('evaluationCriteria.title')}</h3><p className="mt-1 text-slate-600">{translate('evaluationCriteria.subtitle')}</p></div>
                <button type="button" onClick={() => { setEditingCriterionId(null); setCriteriaForm({ criterion_text: '', criterion_text_am: '', category: 'General', weight: 5, target_role: criteriaTargetRole }); setShowCriterionForm(true); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Plus size={16} /> {translate('evaluationCriteria.addButton')}</button>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-2">
                {[[ 'student', 'student' ], [ 'peer', 'peer' ], [ 'dept_head', 'deptHead' ], [ 'dean', 'dean' ]].map(([value, labelKey]) => <button key={value} type="button" onClick={() => { setCriteriaType(value); setCriteriaTargetRole(value === 'peer' ? 'lab_assistant' : 'instructor'); resetCriterionForm(); }} className={`rounded-xl px-4 py-2 text-sm font-semibold ${criteriaType === value ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-200'}`}>{translate(`evaluationCriteria.tabs.${labelKey}`)}</button>)}
              </div>

              {['student', 'peer'].includes(criteriaType) && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700">
                    {translate('evaluationCriteria.targetRole')}
                    <select
                      value={criteriaTargetRole}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setCriteriaTargetRole(nextValue);
                        setCriteriaForm((current) => ({ ...current, target_role: nextValue }));
                      }}
                      className="mt-2 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    >
                      {criteriaType === 'student' ? (
                        <>
                          <option value="instructor">{translate('evaluationCriteria.roles.instructor')}</option>
                          <option value="lab_assistant">{translate('evaluationCriteria.roles.labAssistant')}</option>
                        </>
                      ) : (
                        <>
                          <option value="instructor">{translate('evaluationCriteria.roles.instructorToInstructor')}</option>
                          <option value="lab_assistant">{translate('evaluationCriteria.roles.labAssistantToLabAssistant')}</option>
                        </>
                      )}
                    </select>
                  </label>
                </div>
              )}
              {showCriterionForm || editingCriterionId ? (
                <form onSubmit={saveCriterion} className="fixed inset-0 z-50 m-auto grid h-fit w-[min(92vw,760px)] gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-6 shadow-2xl md:grid-cols-[1fr_1fr_180px_100px_auto]">
                  <input value={criteriaForm.criterion_text} onChange={(event) => setCriteriaForm({ ...criteriaForm, criterion_text: event.target.value })} placeholder={translate('evaluationCriteria.fields.criterionEnglish')} maxLength={255} required className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
                  <input value={criteriaForm.criterion_text_am} onChange={(event) => setCriteriaForm({ ...criteriaForm, criterion_text_am: event.target.value })} placeholder={translate('evaluationCriteria.fields.criterionAmharic')} maxLength={255} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
                  <input value={criteriaForm.category} onChange={(event) => setCriteriaForm({ ...criteriaForm, category: event.target.value })} placeholder={translate('evaluationCriteria.fields.category')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
                  <input type="number" min="1" value={criteriaForm.weight} onChange={(event) => setCriteriaForm({ ...criteriaForm, weight: Number(event.target.value) || 1 })} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
                  <div className="flex gap-2"><button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">{translate(editingCriterionId ? 'evaluationCriteria.buttons.save' : 'evaluationCriteria.buttons.add')}</button><button type="button" onClick={resetCriterionForm} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">{translate('evaluationCriteria.buttons.cancel')}</button></div>
                </form>
              ) : null}
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="relative block sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={criteriaSearch} onChange={(event) => setCriteriaSearch(event.target.value)} placeholder={translate('evaluationCriteria.searchPlaceholder')} className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" /></label>
                    <div className="flex items-center gap-3"><span className="text-sm text-slate-500">{criteriaPagination.totalItems || 0} {translate('evaluationCriteria.totalCriteria')}</span><label className="flex items-center gap-2 text-xs text-slate-500" htmlFor="criteria-page-size">{translate('evaluationCriteria.rows')}<select id="criteria-page-size" value={criteriaLimit} onChange={(event) => setCriteriaLimit(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></select></label></div>
                  </div>
                  <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="px-3 py-3">{translate('evaluationCriteria.table.criterion')}</th><th className="px-3 py-3">{translate('evaluationCriteria.table.amharic')}</th><th className="px-3 py-3">{translate('evaluationCriteria.table.category')}</th><th className="px-3 py-3">{translate('evaluationCriteria.table.weight')}</th><th className="px-3 py-3">{translate('evaluationCriteria.table.status')}</th><th className="px-3 py-3">{translate('evaluationCriteria.table.actions')}</th></tr></thead><tbody className="divide-y divide-slate-100">{criteriaRows.map((criterion) => <tr key={criterion.id} className={!criterion.is_active ? 'bg-slate-50 text-slate-400' : ''}><td className="px-3 py-3">{criterion.criterion_text}</td><td className="px-3 py-3">{criterion.criterion_text_am || '—'}</td><td className="px-3 py-3">{criterion.category}</td><td className="px-3 py-3">{criterion.weight}</td><td className="px-3 py-3">{criterion.is_active ? translate('evaluationCriteria.status.active') : translate('evaluationCriteria.status.disabled')}</td><td className="px-3 py-3"><div className="flex gap-3"><button type="button" title={translate('evaluationCriteria.buttons.edit')} aria-label={translate('evaluationCriteria.buttons.edit')} onClick={() => { setEditingCriterionId(criterion.id); setCriteriaForm({ criterion_text: criterion.criterion_text, criterion_text_am: criterion.criterion_text_am || '', category: criterion.category, weight: criterion.weight, target_role: criterion.target_role || criteriaTargetRole }); setShowCriterionForm(true); }} className="text-blue-600 hover:text-blue-800"><Pencil size={16} /></button><button type="button" title={translate('evaluationCriteria.buttons.toggle')} aria-label={translate('evaluationCriteria.buttons.toggle')} onClick={() => toggleCriterion(criterion)} className={criterion.is_active ? 'text-red-600 hover:text-red-800' : 'text-emerald-600 hover:text-emerald-800'}><Trash2 size={16} /></button></div></td></tr>)}{!criteriaRows.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">{translate('evaluationCriteria.empty')}</td></tr>}</tbody></table></div>
                  <div className="flex flex-col gap-4 border-t border-slate-200 pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>{translate('evaluationCriteria.pagination.showing')} <strong className="text-slate-900">{criteriaPagination.totalItems ? ((criteriaPage - 1) * criteriaLimit) + 1 : 0}</strong> {translate('evaluationCriteria.pagination.to')} <strong className="text-slate-900">{Math.min(criteriaPage * criteriaLimit, criteriaPagination.totalItems || 0)}</strong> {translate('evaluationCriteria.pagination.of')} <strong className="text-slate-900">{criteriaPagination.totalItems || 0}</strong> {translate('evaluationCriteria.pagination.results')}</span><div className="flex items-center gap-1" aria-label={translate('evaluationCriteria.pagination.ariaLabel')}><button type="button" onClick={() => setCriteriaPage((page) => Math.max(1, page - 1))} disabled={criteriaPage === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">{translate('evaluationCriteria.buttons.previous')}</button>{Array.from({ length: criteriaPagination.totalPages || 1 }, (_, index) => index + 1).map((page) => <button type="button" key={page} onClick={() => setCriteriaPage(page)} aria-current={criteriaPage === page ? 'page' : undefined} className={`rounded-lg border px-3 py-1.5 font-medium ${criteriaPage === page ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{page}</button>)}<button type="button" onClick={() => setCriteriaPage((page) => Math.min(criteriaPagination.totalPages || 1, page + 1))} disabled={criteriaPage === (criteriaPagination.totalPages || 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">{translate('evaluationCriteria.buttons.next')}</button></div></div>
            </div>
          </section>
        )}

        {activeTab === 'department-course' && (
          <section className="space-y-8">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_55px_-34px_rgba(37,99,235,0.24)]">
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-slate-900">{t('collegeDepartmentRegistration', 'College and Department Registration', 'የኮሌጅ እና የዲፓርትመንት ምዝገባ')}</h3>
                <p className="mt-1 text-slate-600">{t('collegeDepartmentRegistrationDescription', 'Create colleges and departments from one place and keep their records updated instantly.', 'ኮሌጆችንና ዲፓርትመንቶችን ከአንድ ቦታ ይፍጠሩ እና መዝገቦቻቸውን በቅጽበት ያዘምኑ።')}</p>
              </div>

              <div className="mb-8 flex flex-wrap gap-3 rounded-2xl bg-slate-100 p-2">
                {[
                  { id: 'college', label: t('collegeRegistration', 'College Registration', 'የኮሌጅ ምዝገባ') },
                  { id: 'department', label: t('departmentRegistration', 'Department Registration', 'የዲፓርትመንት ምዝገባ') },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDepartmentCourseTab(tab.id)}
                    className={`rounded-xl px-5 py-3 text-sm font-semibold transition ${departmentCourseTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white text-slate-700 hover:bg-slate-200'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {departmentCourseTab === 'college' ? (
                <form onSubmit={handleCollegeRegistrationSubmit} className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2 rounded-2xl border border-slate-200 bg-slate-50 p-6">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">{t('collegeName', 'College Name:', 'የኮሌጅ ስም:')}</span>
                      <input value={collegeNameInput} onChange={(event) => setCollegeNameInput(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 outline-none focus:border-blue-500" placeholder="Enter college name" required />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">{t('collegeCode', 'College Code:', 'የኮሌጅ ኮድ:')}</span>
                      <input value={collegeCodeInput} onChange={(event) => setCollegeCodeInput(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 outline-none focus:border-blue-500" placeholder="Enter college code" required />
                    </label>
                  </div>
                  <button type="submit" className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">{t('registerCollege', 'Register College', 'ኮሌጅ ይመዝግቡ')}</button>
                </form>
              ) : (
                <DepartmentRegistration onRegistered={(record) => {
                  setRegisteredDepartments((current) => [record, ...current]);
                }} />
              )}
            </div>
          </section>
        )}

        {activeTab === 'register-head' && (
          <section className="space-y-8">
            <div className="w-full border-b border-slate-200 bg-transparent p-0">
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-slate-900">{sys.registrationSectionTitle}</h3>
                <p className="mt-1 text-slate-600">{sys.registrationSectionDescription}</p>
              </div>

              <div className="mb-8 flex flex-wrap gap-3 rounded-2xl bg-slate-100 p-2">
                {[
                  { id: 'instructor', label: sys.instructorRegistration },
                  { id: 'student', label: sys.studentRegistration },
                  { id: 'lab_assistant', label: 'Lab Assistant Registration' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleRegistrationModeChange(tab.id)}
                    className={`rounded-xl px-5 py-3 text-sm font-semibold transition ${registrationMode === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white text-slate-700 hover:bg-slate-200'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {!registrationMode && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center">
                  <p className="text-lg font-semibold text-slate-900">{sys.registrationPromptTitle}</p>
                  <p className="mt-2 text-sm text-slate-500">{sys.registrationPromptSubtitle}</p>
                </div>
              )}

              {registrationMode && (
                <div className="space-y-6">
                  <div aria-labelledby="bulk-upload-title" className="mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 id="bulk-upload-title" className="text-lg font-semibold text-slate-900">{t('bulkUploadTitle', 'Bulk Upload registration', 'ብዛት አስገባ ምዝገባ')}</h4>
                        <p className="mt-1 text-sm text-slate-600">{t('bulkUploadDesc', 'Upload a CSV with the required fields for the selected registration type.', 'የተመረጡትን ምዝገባ ዓይነት የሚያስፈልጉ መረጃዎችን በCSV ይስቀሉ')}</p>
                      </div>
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.xlsx"
                          className="h-12 min-w-0 max-w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:font-semibold file:text-white"
                          onChange={handleFileInputChange}
                          aria-label="Choose CSV file"
                        />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleBulkUploadSubmit();
                          }}
                          disabled={isBulkSubmitting || !uploadFile}
                          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
                          aria-busy={isBulkSubmitting}
                        >
                          {isBulkSubmitting && <RefreshCw size={16} className="animate-spin" aria-hidden="true" />}
                          {isBulkSubmitting ? 'Uploading...' : 'Upload CSV'}
                        </button>
                        <span className="min-w-0 truncate text-sm text-slate-500">{uploadFileName || sys.noFileSelected}</span>
                      </div>
                    </div>
                  </div>
                  {bulkUploadErrors.length > 0 && (
                    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                      <p className="font-semibold">Some upload rows need attention:</p>
                      <ul className="mt-2 space-y-1">
                        {bulkUploadErrors.slice(0, 10).map((entry, index) => (
                          <li key={`${entry?.row || 'row'}-${index}`}>{formatBulkUploadError(entry)}</li>
                        ))}
                      </ul>
                      {bulkUploadErrors.length > 10 && <p className="mt-2">Showing 10 of {bulkUploadErrors.length} row errors.</p>}
                    </div>
                  )}

                  <form noValidate onSubmit={handleSingleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start [&_input]:h-11 [&_input]:min-h-[44px] [&_input]:min-w-0 [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_input]:leading-normal [&_select]:h-11 [&_select]:min-h-[44px] [&_select]:min-w-0 [&_select]:px-3 [&_select]:py-2 [&_select]:text-sm [&_select]:leading-normal [&_input:focus]:border-blue-500 [&_select:focus]:border-blue-500 [&_input:focus]:ring-2 [&_select:focus]:ring-2 [&_input:focus]:ring-blue-500 [&_select:focus]:ring-blue-500">
                    {registrationMode === 'instructor' && (
                    <div className="md:col-span-2 lg:col-span-3">
                      <section className="mb-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
                          <h4 className="text-lg font-semibold text-slate-900">👤 Personal Information</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">First Name <span className="text-red-600">*</span></span>
                            <input
                              name="firstName"
                              value={instructorForm.firstName}
                              onChange={handleInstructorChange('firstName')}
                              className={`mt-2 w-full rounded-lg border bg-white p-3 text-slate-900 outline-none focus:border-blue-500 ${registrationErrors.firstName ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500' : 'border-slate-300'}`}
                              placeholder={sys.firstNamePlaceholder}
                              required
                            />
                            {registrationErrors.firstName && <p className="mt-1 text-xs text-red-600">{registrationErrors.firstName}</p>}
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Last Name <span className="text-red-600">*</span></span>
                            <input
                              name="lastName"
                              value={instructorForm.lastName}
                              onChange={handleInstructorChange('lastName')}
                              className={`mt-2 w-full rounded-lg border bg-white p-3 text-slate-900 outline-none focus:border-blue-500 ${registrationErrors.lastName ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500' : 'border-slate-300'}`}
                              placeholder={sys.lastNamePlaceholder}
                              required
                            />
                            {registrationErrors.lastName && <p className="mt-1 text-xs text-red-600">{registrationErrors.lastName}</p>}
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Gender <span className="text-red-600">*</span></span>
                            <select name="gender" value={instructorForm.gender} onChange={handleInstructorChange('gender')} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-blue-500" required>
                              <option value="">Select Gender</option>
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                            </select>
                            {registrationErrors.gender && <p className="mt-1 text-xs text-red-600">{registrationErrors.gender}</p>}
                          </label>
                        </div>
                      </section>

                      <section className="mb-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
                          <h4 className="text-lg font-semibold text-slate-900">🎓 Academic &amp; Employment Information</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Department <span className="text-red-600">*</span></span>
                            <DepartmentCombobox required departments={registeredDepartments} value={instructorForm.department} onChange={handleInstructorChange('department')} disabled={isDepartmentsLoading} />
                            {registrationErrors.department && <p className="mt-1 text-xs text-red-600">{registrationErrors.department}</p>}
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Email Address <span className="text-red-600">*</span></span>
                            <input
                              name="email"
                              type="email"
                              value={instructorForm.email}
                              onChange={handleInstructorChange('email')}
                              className={`mt-2 w-full rounded-lg border bg-white p-3 text-slate-900 outline-none focus:border-blue-500 ${registrationErrors.email ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500' : 'border-slate-300'}`}
                              placeholder="instructor@mkau.edu.et"
                              required
                            />
                            {registrationErrors.email && <p className="mt-1 text-xs text-red-600">{registrationErrors.email}</p>}
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Employee ID <span className="text-red-600">*</span></span>
                            <input
                              name="employeeId"
                              value={instructorForm.employeeId}
                              onChange={handleInstructorChange('employeeId')}
                              className={`mt-2 w-full rounded-lg border bg-white p-3 text-slate-900 outline-none focus:border-blue-500 ${registrationErrors.employeeId ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500' : 'border-slate-300'}`}
                              placeholder="mau012"
                              required
                            />
                            {registrationErrors.employeeId && <p className="mt-1 text-xs text-red-600">{registrationErrors.employeeId}</p>}
                          </label>
                        </div>
                      </section>
                    </div>
                  )}

                  {registrationMode === 'lab_assistant' && (
                    <div className="md:col-span-2 lg:col-span-3">
                      <section className="mb-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
                          <h4 className="text-lg font-semibold text-slate-900">👤 Personal Information</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">First Name <span className="text-red-600">*</span></span>
                            <input
                              name="firstName"
                              value={labAssistantForm.firstName}
                              onChange={handleLabAssistantChange('firstName')}
                              className={`mt-2 w-full rounded-lg border bg-white p-3 text-slate-900 outline-none focus:border-blue-500 ${registrationErrors.firstName ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500' : 'border-slate-300'}`}
                              placeholder={sys.firstNamePlaceholder}
                              required
                            />
                            {registrationErrors.firstName && <p className="mt-1 text-xs text-red-600">{registrationErrors.firstName}</p>}
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Last Name <span className="text-red-600">*</span></span>
                            <input
                              name="lastName"
                              value={labAssistantForm.lastName}
                              onChange={handleLabAssistantChange('lastName')}
                              className={`mt-2 w-full rounded-lg border bg-white p-3 text-slate-900 outline-none focus:border-blue-500 ${registrationErrors.lastName ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500' : 'border-slate-300'}`}
                              placeholder={sys.lastNamePlaceholder}
                              required
                            />
                            {registrationErrors.lastName && <p className="mt-1 text-xs text-red-600">{registrationErrors.lastName}</p>}
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Gender <span className="text-red-600">*</span></span>
                            <select name="gender" value={labAssistantForm.gender} onChange={handleLabAssistantChange('gender')} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-blue-500" required>
                              <option value="">Select Gender</option>
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                            </select>
                            {registrationErrors.gender && <p className="mt-1 text-xs text-red-600">{registrationErrors.gender}</p>}
                          </label>
                        </div>
                      </section>

                      <section className="mb-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
                          <h4 className="text-lg font-semibold text-slate-900">🎓 Academic &amp; Employment Information</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Department <span className="text-red-600">*</span></span>
                            <DepartmentCombobox required departments={registeredDepartments} value={labAssistantForm.department} onChange={handleLabAssistantChange('department')} disabled={isDepartmentsLoading} />
                            {registrationErrors.department && <p className="mt-1 text-xs text-red-600">{registrationErrors.department}</p>}
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Email Address <span className="text-red-600">*</span></span>
                            <input
                              name="email"
                              type="email"
                              value={labAssistantForm.email}
                              onChange={handleLabAssistantChange('email')}
                              className={`mt-2 w-full rounded-lg border bg-white p-3 text-slate-900 outline-none focus:border-blue-500 ${registrationErrors.email ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500' : 'border-slate-300'}`}
                              placeholder="labassistant@mkau.edu.et"
                              required
                            />
                            {registrationErrors.email && <p className="mt-1 text-xs text-red-600">{registrationErrors.email}</p>}
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Employee ID <span className="text-red-600">*</span></span>
                            <input
                              name="employeeId"
                              value={labAssistantForm.employeeId}
                              onChange={handleLabAssistantChange('employeeId')}
                              className={`mt-2 w-full rounded-lg border bg-white p-3 text-slate-900 outline-none focus:border-blue-500 ${registrationErrors.employeeId ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500' : 'border-slate-300'}`}
                              placeholder="mau012"
                              required
                            />
                            {registrationErrors.employeeId && <p className="mt-1 text-xs text-red-600">{registrationErrors.employeeId}</p>}
                          </label>
                        </div>
                      </section>
                    </div>
                  )}

                    {registrationMode === 'student' && (
                    <div className="md:col-span-2 lg:col-span-3">
                      <section className="mb-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
                          <h4 className="text-lg font-semibold text-slate-900">👤 Personal Information</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">First Name <span className="text-red-600">*</span></span>
                            <input
                              name="firstName"
                              value={studentForm.firstName}
                              onChange={handleStudentChange('firstName')}
                              className={`mt-2 w-full rounded-lg border bg-white p-3 text-slate-900 outline-none focus:border-blue-500 ${registrationErrors.firstName ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500' : 'border-slate-300'}`}
                              placeholder={sys.firstNamePlaceholder}
                              required
                            />
                            {registrationErrors.firstName && <p className="mt-1 text-xs text-red-600">{registrationErrors.firstName}</p>}
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Last Name <span className="text-red-600">*</span></span>
                            <input
                              name="lastName"
                              value={studentForm.lastName}
                              onChange={handleStudentChange('lastName')}
                              className={`mt-2 w-full rounded-lg border bg-white p-3 text-slate-900 outline-none focus:border-blue-500 ${registrationErrors.lastName ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500' : 'border-slate-300'}`}
                              placeholder={sys.lastNamePlaceholder}
                              required
                            />
                            {registrationErrors.lastName && <p className="mt-1 text-xs text-red-600">{registrationErrors.lastName}</p>}
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Gender <span className="text-red-600">*</span></span>
                            <select name="gender" value={studentForm.gender} onChange={handleStudentChange('gender')} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-blue-500" required>
                              <option value="">Select Gender</option>
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                            </select>
                            {registrationErrors.gender && <p className="mt-1 text-xs text-red-600">{registrationErrors.gender}</p>}
                          </label>
                          <label className="block md:col-span-3">
                            <span className="text-sm font-medium text-slate-700">Student ID <span className="text-red-600">*</span></span>
                            <input
                              name="studentId"
                              value={studentForm.studentId}
                              onChange={handleStudentChange('studentId')}
                              className={`mt-2 w-full rounded-lg border bg-white p-3 text-slate-900 outline-none focus:border-blue-500 ${registrationErrors.studentId ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500' : 'border-slate-300'}`}
                              placeholder={sys.studentIdPlaceholder}
                              required
                            />
                            {registrationErrors.studentId && <p className="mt-1 text-xs text-red-600">{registrationErrors.studentId}</p>}
                          </label>
                        </div>
                      </section>

                      <section className="mb-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
                          <h4 className="text-lg font-semibold text-slate-900">🎓 Academic Information</h4>
                        </div>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label className="block">
                              <span className="text-sm font-medium text-slate-700">Program Type <span className="text-red-600">*</span></span>
                              <select value={studentForm.programType} onChange={handleStudentChange('programType')} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-blue-500" required>
                                {programOptions.map((opt) => <option key={opt.value} value={opt.value}>{language === 'en' ? opt.en : opt.am}</option>)}
                              </select>
                              {registrationErrors.programType && <p className="mt-1 text-xs text-red-600">{registrationErrors.programType}</p>}
                            </label>
                            <label className="block">
                              <span className="text-sm font-medium text-slate-700">Department <span className="text-red-600">*</span></span>
                              <DepartmentCombobox required departments={registeredDepartments} value={studentForm.department} onChange={handleStudentChange('department')} disabled={isDepartmentsLoading} />
                              {registrationErrors.department && <p className="mt-1 text-xs text-red-600">{registrationErrors.department}</p>}
                            </label>
                          </div>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <label className="block">
                              <span className="text-sm font-medium text-slate-700">Year <span className="text-red-600">*</span></span>
                              <select name="year" value={studentForm.year} onChange={handleStudentChange('year')} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-blue-500" required>{studentYearOptions.map((yearOption) => <option key={yearOption} value={yearOption}>{yearOption}</option>)}</select>
                              {registrationErrors.year && <p className="mt-1 text-xs text-red-600">{registrationErrors.year}</p>}
                            </label>
                            <label className="block">
                              <span className="text-sm font-medium text-slate-700">Semester <span className="text-red-600">*</span></span>
                              <select name="semester" value={studentForm.semester} onChange={handleStudentChange('semester')} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-blue-500" required>{semesterOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.en}</option>)}</select>
                              {registrationErrors.semester && <p className="mt-1 text-xs text-red-600">{registrationErrors.semester}</p>}
                            </label>
                            <label className="block">
                              <span className="text-sm font-medium text-slate-700">Section <span className="text-red-600">*</span></span>
                              <select name="section" value={studentForm.section} onChange={handleStudentChange('section')} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-blue-500" required>{sectionOptions.map((sectionOption) => <option key={sectionOption} value={sectionOption}>{sectionOption}</option>)}</select>
                              {registrationErrors.section && <p className="mt-1 text-xs text-red-600">{registrationErrors.section}</p>}
                            </label>
                          </div>
                        </div>
                      </section>
                    </div>
                  )}

                  <div className="md:col-span-2 lg:col-span-3 pt-4">
                    <button type="submit" disabled={isSubmitting || !registrationMode} aria-busy={isSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-medium text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400">
                      {isSubmitting && <RefreshCw size={16} className="animate-spin" aria-hidden="true" />}
                      {isSubmitting ? t('registering', 'Registering...', 'በማስመዝገብ ላይ...') : registrationMode === 'lab_assistant' ? 'Register Lab Assistant' : registrationMode === 'instructor' ? t('registerInstructor', 'Register Instructor', 'አስተማሪ አስመዝግብ') : t('registerStudent', 'Register Student', 'ተማሪ አስመዝግብ')}
                    </button>
                  </div>

                  </form>
                </div>
              )}
            </div>

          </section>
        )}

        {activeTab === 'manage-roles' && (
          <ManageRoles users={[...deptHeads, ...instructors, ...students]} onRoleAssigned={(userId, assignedRole) => {
            const update = (items) => items.map((item) => (item.id === userId ? { ...item, role: assignedRole } : item));
            setDeptHeads((current) => update(current));
            setInstructors((current) => update(current));
            setStudents((current) => update(current));
          }} />
        )}

        {activeTab === 'calendar' && (
          <EvaluationCalendar
            initialCollegeData={[]}
            onCreateEvent={(event) => {
              setLogs((current) => [
                ...current,
                {
                  id: Date.now(),
                  user: 'SystemAdmin',
                  action: 'Evaluation event scheduled',
                  time: new Date().toLocaleString(),
                  desc: `Scheduled ${event.type}: ${event.title}`,
                  ip: '127.0.0.1',
                  browser: navigator.userAgent,
                },
              ]);
              toast.success('Event scheduled successfully.');
            }}
          />
        )}

        {activeTab === 'broadcast' && (
          <section className="space-y-8">
            {isComposing ? (
              <form onSubmit={handleBroadcastSend} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_55px_-34px_rgba(37,99,235,0.24)]">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Compose Broadcast</h3>
                  <button type="button" onClick={() => setIsComposing(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <History size={16} /> History
                  </button>
                </div>
                <label className="mb-4 block">
                  <span className="text-slate-600">{sys.audienceLabel}</span>
                  <select value={broadcastAudience} onChange={(e) => setBroadcastAudience(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    <option value="all">All users</option>
                    <option value="students">Students</option>
                    <option value="instructors">Instructors</option>
                    <option value="dept_heads">Dept Heads</option>
                    <option value="lab_assistants">Lab Assistants</option>
                    <option value="college_deans">College Deans</option>
                    <option value="academic_directors">Academic Directors</option>
                    <option value="vice_presidents">Vice Presidents</option>
                  </select>
                </label>
                <label className="mb-4 block">
                  <span className="text-slate-600">Subject</span>
                  <input value={broadcastTitle} onChange={(e) => setBroadcastTitle(e.target.value)} maxLength={150} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" placeholder="System announcement" required />
                </label>
                <label className="block">
                  <span className="text-slate-600">{sys.messageLabel}</span>
                  <textarea value={broadcastMessage} onChange={(e) => setBroadcastMessage(e.target.value)} rows={6} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" placeholder={sys.writeBroadcastMessage} required />
                </label>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500"><Megaphone size={18} /> {sys.sendBroadcast}</button>
                  <span className="text-sm text-slate-500">{sys.scheduledMessagesBelow}</span>
                </div>
              </form>
            ) : (
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_55px_-34px_rgba(37,99,235,0.24)]">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{sys.broadcastHistory}</h3>
                    <p className="text-slate-600">{sys.broadcastHistoryDesc}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-700">{broadcastHistory.length} {sys.itemsLabel}</span>
                    <button type="button" onClick={() => setIsComposing(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <Megaphone size={16} /> + New Broadcast
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  {broadcastHistory.map((item) => (
                    <div key={item.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div><p className="font-semibold text-slate-800">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.message}</p></div>
                        <span className="shrink-0 text-xs text-slate-500">{item.sent} sent · {item.sentAt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'security' && <SecurityLogs />}

        {activeTab === 'security-legacy' && (
          <section className="space-y-6">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600"><Activity size={14} /> Control plane</div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Security &amp; Logs</h2>
                <p className="mt-1 text-sm text-slate-500">Monitor access, infrastructure health, and recent administrative activity.</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500"><span className={`h-2 w-2 rounded-full ${String(dbHealthMetrics.status).toLowerCase() === 'online' ? 'bg-emerald-500' : 'bg-amber-500'}`} /> {dbHealthMetrics.status || 'Status unavailable'}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="border-l-2 border-emerald-500 bg-white px-4 py-3"><p className="text-xs font-medium uppercase tracking-wider text-slate-500">Security score</p><p className="mt-1 text-2xl font-semibold text-slate-950">{dbHealthMetrics.securityScore}</p></div>
              <div className="border-l-2 border-blue-500 bg-white px-4 py-3"><p className="text-xs font-medium uppercase tracking-wider text-slate-500">Active connections</p><p className="mt-1 text-2xl font-semibold text-slate-950">{dbHealthMetrics.connections}</p></div>
              <div className="border-l-2 border-slate-400 bg-white px-4 py-3"><p className="text-xs font-medium uppercase tracking-wider text-slate-500">Events captured</p><p className="mt-1 text-2xl font-semibold text-slate-950">{logs.length}</p></div>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <article className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{sys.securityPosture}</h3>
                    <p className="text-slate-600">{sys.securityPostureDesc}</p>
                  </div>
                  <ShieldCheck size={20} className="text-emerald-500" />
                </div>
                <p className="mt-6 text-4xl font-semibold">{dbHealthMetrics.securityScore}</p>
                <p className="mt-2 text-slate-400">{sys.securitySummary}</p>
              </article>
              <article className="border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">{sys.apiToken}</h3>
                <p className="mt-3 text-slate-600">{sys.apiTokenDesc}</p>
                <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-sm text-emerald-400">{apiToken}</div>
                <button onClick={resetApiToken} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"><RefreshCw size={16} /> {sys.rotateToken}</button>
              </article>
              <article className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Global System Lock</h3>
                    <p className="text-slate-600">Block non-administrator logins while maintenance or an incident is in progress.</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${mfaEnabled ? 'bg-emerald-500/20 text-emerald-700' : 'bg-rose-500/20 text-rose-700'}`}>{mfaEnabled ? sys.mfaEnabledLabel : sys.mfaDisabledLabel}</span>
                </div>
                <button type="button" onClick={handleSystemLockToggle} disabled={systemLockUpdating} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">{systemLockUpdating ? 'Updating...' : mfaEnabled ? 'Disable Global Lock' : 'Enable Global Lock'}</button>
              </article>
            </div>
            <div className="grid gap-6">
              <article className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{t('auditTimelineTitle', 'Audit Timeline', 'የኦዲት ጊዜሰላም')}</h3>
                    <p className="text-slate-600">{t('auditTimelineDesc', 'Real-time system events and compliance history.', 'የቀጥታ የስርዓት ክስተቶች እና የስርዓት ታሪክ')}</p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                  <div className="relative w-full lg:w-64">
                    <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} placeholder={sys.searchLogsPlaceholder} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <button type="button" onClick={() => setShowAuditTimelineModal(true)} className="inline-flex shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100">View All Activity</button>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {securityLogsLoading ? (
                    <div className="h-40 animate-pulse rounded-3xl bg-slate-100" aria-label="Loading audit timeline" />
                  ) : logs.filter((entry) => {
                    const query = auditSearch.trim().toLowerCase();
                    if (!query) return true;
                    return [entry.user, entry.action, entry.desc, entry.ip, entry.browser].some((value) => String(value).toLowerCase().includes(query));
                  }).slice(0, 3).map((entry) => (
                    <div key={entry.id} className="py-4 first:pt-0">
                      <button type="button" onClick={() => toggleAuditEntry(entry.id)} aria-expanded={expandedLogIds.has(entry.id)} className="flex w-full items-start gap-3 text-left">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-semibold text-slate-900">{entry.action}</p>
                            <span className="flex items-center gap-2 text-xs text-slate-400">{entry.time}{expandedLogIds.has(entry.id) ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{entry.desc}</p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500"><span>{t('byLabel', 'By', 'በ')} {entry.user}</span><span>{t('ipLabel', 'IP', 'IP')}: {entry.ip}</span></div>
                        </div>
                      </button>
                      {expandedLogIds.has(entry.id) && (
                        <div className="ml-5 mt-3 border-l border-slate-200 pl-4 text-xs text-slate-500">
                          <p>Event ID: {entry.id}</p>
                          <p className="mt-1 break-all">Client: {entry.browser || 'Not recorded'}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        )}

        {activeTab === 'logs' && (
          <section className="space-y-8">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_55px_-34px_rgba(37,99,235,0.24)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{t('auditTimelineTitle', 'Audit Timeline', 'የኦዲት ጊዜሰላም')}</h3>
                  <p className="text-slate-600">{t('auditTimelineDesc', 'Real-time system events and compliance history.', 'የቀጥታ የስርዓት ክስተቶች እና የስርዓት ታሪክ')}</p>
                </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => { setLogs((current) => [{ id: Date.now(), user: 'System', action: t('logRefreshAction', 'Noisy log refresh', 'የብረት መዝገብ እድሳት'), time: new Date().toLocaleString(), desc: t('logRefreshDescription', 'Operator refreshed timeline state', 'ኦፕሬተር የጊዜ መረጃ አድሰዋል'), ip: '127.0.0.1', browser: navigator.userAgent }, ...current]); toast.success(strings.systemAdminDashboard.successAuditTimelineRefreshed); }} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500">
                      <RefreshCw size={18} /> {sys.refreshTimeline}
                    </button>
                    <button type="button" onClick={clearAuditHistory} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100">
                      <Trash2 size={18} /> Clear History
                    </button>
                  </div>
              </div>
              <div className="mt-8 grid gap-4">
                {logs.map((entry) => (
                  <div key={entry.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-slate-900">{entry.action}</p>
                        <p className="text-slate-600">{entry.desc}</p>
                      </div>
                      <span className="rounded-full bg-slate-200 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-700">{entry.user}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-4 text-slate-600 text-xs">
                      <span>{entry.time}</span>
                      <span>{entry.ip}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'audit-logs' && <AuditLogManagement />}

        <AuditTimelineModal
          open={showAuditTimelineModal}
          logs={logs}
          onClose={() => setShowAuditTimelineModal(false)}
        />

        {activeTab === 'health' && (
          <SystemHealth
            systemHealth={systemHealth}
            dbHealthMetrics={dbHealthMetrics}
            loading={systemHealthLoading}
            error={systemHealthError}
            onRefresh={() => { void refreshSystemHealth(); }}
            backuping={backuping}
            onTriggerBackup={handleTriggerBackup}
            backupRetentionDays={backupRetentionDays}
            onBackupRetentionChange={handleBackupRetentionChange}
            backupRetentionSaving={backupRetentionSaving}
            onSaveBackupRetention={() => { void handleSaveBackupRetention(); }}
            t={t}
          />
        )}

        {showEditModal && selectedHead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl shadow-slate-900/10">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">{t('editDeptHead', 'Edit Dept Head', 'የዲፓርትመንት ኃላፊ አስተካክል')}</h3>
                  <p className="text-slate-600">{t('editDeptHeadDesc', 'Update department head profile before saving.', 'የዲፓርትመንት ኃላፊ መገለጫ አስተካክል')}</p>
                </div>
                <button type="button" onClick={() => { setShowEditModal(false); setSelectedHead(null); }} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200">{common.cancel}</button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <input value={selectedHead.fullName} onChange={(e) => setSelectedHead((current) => ({ ...current, fullName: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900 outline-none" />
                <input value={selectedHead.username} onChange={(e) => setSelectedHead((current) => ({ ...current, username: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900 outline-none" />
                <select value={selectedHead.department || departmentSelectionOptions[0]?.id || ''} onChange={(e) => setSelectedHead((current) => ({ ...current, department: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900 outline-none">
                  {departmentSelectionOptions.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
                <input type="date" value={selectedHead.academicDate || ''} onChange={(e) => setSelectedHead((current) => ({ ...current, academicDate: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900 outline-none" />
                <input value={selectedHead.status} onChange={(e) => setSelectedHead((current) => ({ ...current, status: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900 outline-none" />
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={headEditTransferMode} onChange={() => setHeadEditTransferMode((current) => !current)} />
                  <span>Replace / transfer this head assignment to the selected department.</span>
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => { setShowEditModal(false); setSelectedHead(null); }} className="rounded-2xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm text-slate-200 hover:bg-slate-700">{common.cancel}</button>
                <button type="button" onClick={() => handleSaveEdit(selectedHead)} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500">{t('saveChanges', 'Save changes', 'ለውጦችን አስቀምጥ')}</button>
              </div>
            </div>
          </div>
        )}

        {showForceResetModal && selectedHead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl shadow-slate-900/10">
              <h3 className="text-xl font-semibold mb-4 text-slate-900">{sys.forceResetTitle}</h3>
              <p className="text-slate-600 mb-6">{sys.forceResetDesc.replace('{username}', selectedHead.username)}</p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => { setShowForceResetModal(false); setSelectedHead(null); }} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-700 hover:bg-slate-100">{common.cancel}</button>
                <button type="button" onClick={() => handleForceReset(selectedHead.id)} className="rounded-2xl bg-amber-600 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-500">{common.confirm}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default SystemAdminDashboard;
