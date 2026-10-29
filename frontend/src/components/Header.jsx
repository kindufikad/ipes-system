import { useContext, useEffect, useRef, useState } from 'react';
import { ChevronDown, KeyRound, LogOut, Menu, MoonStar, Settings, SunMedium, UserCircle, UserRound, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/useAuth';
import { LanguageContext } from '../context/LanguageContext';
import { useTranslation } from '../context/useTranslation';
import { ThemeContext } from '../context/ThemeContextValue';
import { adminApi, authApi, evaluationApi } from '../services/api';
import LanguageSwitcher from './LanguageSwitcher';
import NotificationBell from './NotificationBell';
import AdminSettingsModal from './admin/AdminSettingsModal';

const dashboardRoutes = {
  systemadmin: '/admin/dashboard',
  admin: '/admin/dashboard',
  depthead: '/dept-head/dashboard',
  dept_head: '/dept-head/dashboard',
  college_dean: '/dean/dashboard',
  dean: '/dean/dashboard',
  academic_directorate: '/directorate/dashboard',
  academic_director: '/directorate/dashboard',
  directorate: '/directorate/dashboard',
  academic_vice_president: '/vice-president-dashboard',
  instructor: '/instructor-dashboard',
  student: '/student-dashboard',
  lab_assistant: '/lab-assistant/dashboard',
};

const roleLabels = {
  systemadmin: 'systemadmin',
  system_admin: 'systemadmin',
  admin: 'systemadmin',
  depthead: 'depthead',
  dept_head: 'depthead',
  college_dean: 'college_dean',
  dean: 'college_dean',
  academic_directorate: 'academic_directorate',
  academic_director: 'academic_directorate',
  directorate: 'academic_directorate',
  academic_vice_president: 'academic_vice_president',
  instructor: 'instructor',
  student: 'student',
  lab_assistant: 'lab_assistant',
};

const settingsStorageKey = 'ipes-dashboard-settings';
const ALLOWED_SIGNATURE_ROLES = [
  'department_head',
  'dept_head',
  'depthead',
  'college_dean',
  'directorate',
  'academic_director',
  'academic_directorate',
  'vice_president',
  'academic_vice_president',
];
const certificateImageLimit = 1024 * 1024;
const deadlineFallbackStorageKey = 'ipes-deadline-grace-extension';
const deadlineCacheStorageKey = 'ipes-department-head-deadline-cache';
const formatForInput = (isoDate) => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const Header = ({ isMobileMenuOpen, setIsMobileMenuOpen, hasMobileNavigation }) => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const { language, setLanguage } = useContext(LanguageContext);
  const { t } = useTranslation();
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const [isOpen, setIsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminSettingsModalOpen, setIsAdminSettingsModalOpen] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [deadlineSettings, setDeadlineSettings] = useState({ deadlineAt: '', autoLock: true });
  const [savedDeadlineAt, setSavedDeadlineAt] = useState('');
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [autoLockSettingLoading, setAutoLockSettingLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [settingsState, setSettingsState] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(settingsStorageKey) || '{}');
      return {
        emailNotifications: saved.emailNotifications ?? true,
        systemNotifications: saved.systemNotifications ?? true,
        language: saved.language ?? language,
        theme: isDark ? 'dark' : 'light',
        autoRemindersEnabled: saved.autoRemindersEnabled ?? false,
        reminderFrequency: saved.reminderFrequency ?? 'Every 3 Days',
        reminderAudience: {
          pendingStudentEvaluators: saved.reminderAudience?.pendingStudentEvaluators ?? true,
          pendingPeerFacultyEvaluators: saved.reminderAudience?.pendingPeerFacultyEvaluators ?? true,
        },
        evaluationWeights: {
          student: saved.evaluationWeights?.student ?? 50,
          peer: saved.evaluationWeights?.peer ?? 20,
          deptHead: saved.evaluationWeights?.deptHead ?? 30,
        },
        strictStudentAnonymity: saved.strictStudentAnonymity ?? false,
        autoLockFormsOnDeadline: saved.autoLockFormsOnDeadline ?? true,
        departmentHeadSignature: saved.departmentHeadSignature ?? '',
        officialStamp: saved.officialStamp ?? '',
      };
    } catch (error) {
      return {
        emailNotifications: true,
        systemNotifications: true,
        language,
        theme: isDark ? 'dark' : 'light',
        autoRemindersEnabled: false,
        reminderFrequency: 'Every 3 Days',
        reminderAudience: { pendingStudentEvaluators: true, pendingPeerFacultyEvaluators: true },
        evaluationWeights: { student: 50, peer: 20, deptHead: 30 },
        strictStudentAnonymity: false,
        autoLockFormsOnDeadline: true,
        departmentHeadSignature: '',
        officialStamp: '',
      };
    }
  });
  const menuRef = useRef(null);

  let storedUser = {};
  if (typeof window !== 'undefined') {
    try {
      storedUser = JSON.parse(window.localStorage.getItem('user') || '{}');
    } catch {
      storedUser = {};
    }
  }

  useEffect(() => {
    const closeMenu = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isMobileMenuOpen]);

  const normalizedRole = String(user?.role || role || storedUser?.role || '').trim().toLowerCase();
  const isSystemAdmin = ['admin', 'systemadmin', 'system_admin'].includes(normalizedRole);
  const canUploadSignature = ALLOWED_SIGNATURE_ROLES.includes(String(user?.role || '').toLowerCase());
  const currentUser = { ...storedUser, ...user };
  const deadlineDepartmentScope = currentUser.department_id || currentUser.departmentId || currentUser.department || 'unknown';
  const scopedDeadlineFallbackKey = `${deadlineFallbackStorageKey}:${deadlineDepartmentScope}`;
  const scopedDeadlineCacheKey = `${deadlineCacheStorageKey}:${deadlineDepartmentScope}`;
  const dashboardPath = dashboardRoutes[normalizedRole] || '/login';
  const displayName = currentUser.name || currentUser.full_name || currentUser.fullName || currentUser.username || currentUser.email || 'User';
  const email = currentUser.email || currentUser.username || 'user@university.edu';
  const roleLabel = t(`roles.${roleLabels[normalizedRole] || 'user'}`);
  const evaluationWeightsTotal = Object.values(settingsState.evaluationWeights).reduce((sum, weight) => sum + (Number(weight) || 0), 0);

  const saveDeadlineWithFallback = async (payload) => {
    try {
      await evaluationApi.updateEvaluationDeadline(payload);
      setDeadlineSettings((current) => ({ ...current, ...payload }));
      setSavedDeadlineAt(payload.deadlineAt || '');
      window.localStorage.setItem(scopedDeadlineCacheKey, JSON.stringify(payload));
      window.localStorage.removeItem(scopedDeadlineFallbackKey);
      return { saved: true, extended: false };
    } catch (error) {
      console.error('Unable to save evaluation deadline:', error);
      const isServerFailure = !error?.status || error.status >= 500;
      let cachedDeadline;
      try {
        cachedDeadline = JSON.parse(window.localStorage.getItem(scopedDeadlineCacheKey) || 'null');
      } catch (storageError) {
        console.error('Unable to read cached evaluation deadline:', storageError);
      }
      const deadlineToProtect = savedDeadlineAt || cachedDeadline?.deadlineAt || payload.deadlineAt;
      const deadlineTimestamp = deadlineToProtect ? new Date(deadlineToProtect).getTime() : NaN;
      const gracePeriodMs = 24 * 60 * 60 * 1000;
      const isNearDeadline = Number.isFinite(deadlineTimestamp) && deadlineTimestamp - Date.now() <= gracePeriodMs;

      if (!isServerFailure || !isNearDeadline) {
        toast.error(error?.message || t('header.deadlineError'));
        return { saved: false, extended: false };
      }

      const requestedTimestamp = payload.deadlineAt ? new Date(payload.deadlineAt).getTime() : NaN;
      const graceDeadline = new Date(Math.max(
        deadlineTimestamp,
        Number.isFinite(requestedTimestamp) ? requestedTimestamp : 0,
        Date.now()
      ) + gracePeriodMs);
      const extendedPayload = { ...payload, deadlineAt: formatForInput(graceDeadline) };
      setDeadlineSettings((current) => ({ ...current, ...extendedPayload }));

      try {
        await evaluationApi.updateEvaluationDeadline(extendedPayload);
        setSavedDeadlineAt(extendedPayload.deadlineAt);
        window.localStorage.setItem(scopedDeadlineCacheKey, JSON.stringify(extendedPayload));
        window.localStorage.removeItem(scopedDeadlineFallbackKey);
        toast.success(t('header.deadlineGraceSaved'));
        return { saved: true, extended: true };
      } catch (fallbackError) {
        console.error('Unable to sync emergency evaluation deadline extension:', fallbackError);
        try {
          window.localStorage.setItem(scopedDeadlineFallbackKey, JSON.stringify({
            ...extendedPayload,
            savedAt: new Date().toISOString(),
          }));
          window.localStorage.setItem(scopedDeadlineCacheKey, JSON.stringify(extendedPayload));
          toast.success(t('header.deadlineGraceQueued'));
          return { saved: false, extended: true };
        } catch (storageError) {
          console.error('Unable to persist emergency evaluation deadline extension locally:', storageError);
          toast.error(fallbackError?.message || t('header.deadlineError'));
          return { saved: false, extended: false };
        }
      }
    }
  };

  useEffect(() => {
    try {
      const nextSettings = {
        ...Object.fromEntries(Object.entries(settingsState).filter(([key]) => key !== 'theme')),
        language,
      };
      window.localStorage.setItem(settingsStorageKey, JSON.stringify(nextSettings));
    } catch (error) {
      console.warn('Unable to save dashboard settings:', error);
    }
  }, [language, settingsState]);

  useEffect(() => {
    if (!isSettingsOpen || !isSystemAdmin) return undefined;
    let active = true;
    setAutoLockSettingLoading(true);
    adminApi.getAutoLockDeadlineSetting()
      .then((setting) => {
        const enabled = setting?.enabled ?? setting?.auto_lock_enabled;
        if (active && typeof enabled === 'boolean') {
          setSettingsState((current) => ({ ...current, autoLockFormsOnDeadline: enabled }));
        }
      })
      .catch((error) => {
        if (active) toast.error(error?.message || t('header.settingsLoadError'), { id: 'auto-lock-setting-load-error' });
      })
      .finally(() => {
        if (active) setAutoLockSettingLoading(false);
      });
    return () => { active = false; };
  }, [isSettingsOpen, isSystemAdmin]);

  const handleLogout = async () => {
    setIsOpen(false);
    setIsMobileMenuOpen(false);
    setIsAdminSettingsModalOpen(false);
    setIsSettingsOpen(false);
    await logout();
  };

  const navigateAndClose = (path) => {
    setIsOpen(false);
    setIsMobileMenuOpen(false);
    navigate(path);
  };

  const resetPasswordForm = () => {
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const closePasswordModal = () => {
    resetPasswordForm();
    setIsChangePasswordOpen(false);
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    const currentPassword = passwordForm.currentPassword.trim();
    const newPassword = passwordForm.newPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(t('header.fillPasswordFields'));
      return;
    }

    if (newPassword.length < 8) {
      toast.error(t('header.passwordMinLength'));
      return;
    }

    if (newPassword === currentPassword) {
      toast.error(t('header.passwordMustDiffer'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('header.passwordMismatch'));
      return;
    }

    try {
      setIsSubmittingPassword(true);
      const changePassword = ['admin', 'systemadmin', 'system_admin'].includes(normalizedRole)
        ? adminApi.changePassword
        : authApi.changePassword;
      const response = await changePassword({ currentPassword, newPassword, confirmPassword });
      const nextToken = response?.token || response?.data?.token || null;
      const updatedUser = response?.user || response?.data?.user || null;

      if (nextToken && updatedUser) {
        const normalizedUser = { ...currentUser, ...updatedUser, role: updatedUser.role || user?.role || role };
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('token', nextToken);
          window.localStorage.setItem('ipesAuthToken', nextToken);
          window.localStorage.setItem('user', JSON.stringify(normalizedUser));
        }
      }

      toast.success(t('header.passwordUpdated'));
      closePasswordModal();
    } catch (error) {
      toast.error(error?.message || t('header.passwordUpdateError'));
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const handleSettingToggle = (field) => {
    setSettingsState((current) => ({ ...current, [field]: !current[field] }));
  };

  const handleCertificateImageUpload = (field, file) => {
    if (!file) return;
    if (file.type !== 'image/png') {
      toast.error('Please choose a PNG image.');
      return;
    }
    if (file.size > certificateImageLimit) {
      toast.error('PNG files must be 1 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        toast.error('Unable to read the selected PNG image.');
        return;
      }
      try {
        const savedSettings = JSON.parse(window.localStorage.getItem(settingsStorageKey) || '{}');
        window.localStorage.setItem(settingsStorageKey, JSON.stringify({ ...savedSettings, [field]: reader.result }));
        setSettingsState((current) => ({ ...current, [field]: reader.result }));
        window.dispatchEvent(new Event('ipes:official-document-images-changed'));
      } catch (error) {
        console.error('Unable to save official document image:', error);
        toast.error('Unable to save the image. Choose a smaller PNG file.');
        return;
      }
      toast.success('Official document image saved.');
    };
    reader.onerror = () => {
      console.error('Unable to read official document image:', reader.error);
      toast.error('Unable to read the selected PNG image.');
    };
    reader.readAsDataURL(file);
  };

  const handleSettingsSave = async () => {
    if ((settingsState.theme === 'dark') !== isDark) toggleTheme();
    if (isSystemAdmin) {
      setDeadlineSaving(true);
      try {
        await adminApi.updateAutoLockDeadlineSetting(settingsState.autoLockFormsOnDeadline);
      } catch (error) {
        toast.error(error?.message || t('header.settingsSaveError'));
        return;
      } finally {
        setDeadlineSaving(false);
      }
    }
    if (['dept_head', 'depthead', 'department_head'].includes(normalizedRole)) {
      setDeadlineSaving(true);
      const result = await saveDeadlineWithFallback({
        deadlineAt: deadlineSettings.deadlineAt || null,
        autoLock: settingsState.autoLockFormsOnDeadline,
      });
      setDeadlineSaving(false);
      if (!result.saved && !result.extended) {
        return;
      }
      if (!result.saved && result.extended) {
        setIsSettingsOpen(false);
        return;
      }
      if (result.extended) {
        setIsSettingsOpen(false);
        return;
      }
    }
    setIsSettingsOpen(false);
    toast.success(t('header.settingsSaved'));
  };

  useEffect(() => {
    if (!isSettingsOpen || !['dept_head', 'depthead', 'department_head'].includes(normalizedRole)) return undefined;
    let active = true;
    const syncPendingExtension = async () => {
      let pendingExtension;
      try {
        pendingExtension = JSON.parse(window.localStorage.getItem(scopedDeadlineFallbackKey) || 'null');
      } catch (error) {
        console.error('Unable to read pending deadline extension:', error);
      }
      if (!pendingExtension?.deadlineAt) return;
      try {
        const currentSettings = await evaluationApi.getEvaluationDeadline();
        const currentDeadline = formatForInput(currentSettings?.currentDeadline || currentSettings?.deadlineAt);
        const pendingTimestamp = new Date(pendingExtension.deadlineAt).getTime();
        const currentTimestamp = currentDeadline ? new Date(currentDeadline).getTime() : NaN;
        if (Number.isFinite(currentTimestamp) && currentTimestamp >= pendingTimestamp) {
          window.localStorage.removeItem(scopedDeadlineFallbackKey);
          if (active) {
            setSavedDeadlineAt(currentDeadline);
            setDeadlineSettings((current) => ({ ...current, deadlineAt: currentDeadline }));
          }
          return;
        }
        const settings = await evaluationApi.updateEvaluationDeadline(pendingExtension);
        if (!active) return;
        const deadlineAt = formatForInput(settings?.deadlineAt || pendingExtension.deadlineAt);
        setSavedDeadlineAt(deadlineAt);
        setDeadlineSettings((current) => ({ ...current, ...pendingExtension, deadlineAt }));
        window.localStorage.setItem(scopedDeadlineCacheKey, JSON.stringify({ ...pendingExtension, deadlineAt }));
        window.localStorage.removeItem(scopedDeadlineFallbackKey);
        toast.success(t('header.deadlineGraceSaved'));
      } catch (error) {
        console.error('Pending emergency deadline extension is not synced yet:', error);
      }
    };
    const loadDeadline = async () => {
      try {
        const settings = await evaluationApi.getEvaluationDeadline();
        if (!active) return;
        const autoLock = settings?.autoLock !== false;
        const serverDeadline = formatForInput(settings?.currentDeadline || settings?.deadlineAt || settings?.deadline);
        let pendingExtension;
        try {
          pendingExtension = JSON.parse(window.localStorage.getItem(scopedDeadlineFallbackKey) || 'null');
        } catch (error) {
          console.error('Unable to read pending deadline extension:', error);
        }
        const pendingIsNewer = pendingExtension?.deadlineAt
          && (!serverDeadline || new Date(pendingExtension.deadlineAt).getTime() > new Date(serverDeadline).getTime());
        const deadlineAt = pendingIsNewer ? pendingExtension.deadlineAt : serverDeadline;
        if (pendingExtension && !pendingIsNewer) window.localStorage.removeItem(scopedDeadlineFallbackKey);
        window.localStorage.setItem(scopedDeadlineCacheKey, JSON.stringify({ deadlineAt: serverDeadline, autoLock }));
        setSavedDeadlineAt(serverDeadline);
        setDeadlineSettings({ deadlineAt, autoLock });
        setSettingsState((current) => ({ ...current, autoLockFormsOnDeadline: autoLock }));
        if (pendingIsNewer) void syncPendingExtension();
      } catch (error) {
        try {
          const pendingExtension = JSON.parse(window.localStorage.getItem(scopedDeadlineFallbackKey) || 'null');
          if (pendingExtension?.deadlineAt && active) {
            setDeadlineSettings({ deadlineAt: pendingExtension.deadlineAt, autoLock: pendingExtension.autoLock !== false });
            return;
          }
          const cachedDeadline = JSON.parse(window.localStorage.getItem(scopedDeadlineCacheKey) || 'null');
          const cachedTimestamp = cachedDeadline?.deadlineAt ? new Date(cachedDeadline.deadlineAt).getTime() : NaN;
          if (Number.isFinite(cachedTimestamp) && cachedTimestamp - Date.now() <= 24 * 60 * 60 * 1000 && active) {
            setSavedDeadlineAt(cachedDeadline.deadlineAt);
            setDeadlineSettings({ deadlineAt: cachedDeadline.deadlineAt, autoLock: cachedDeadline.autoLock !== false });
            void saveDeadlineWithFallback(cachedDeadline);
            return;
          }
        } catch (storageError) {
          console.error('Unable to read saved deadline extension:', storageError);
        }
        toast.error(error?.message || t('header.deadlineLoadError'));
      }
    };
    void loadDeadline();
    window.addEventListener('online', syncPendingExtension);
    return () => {
      active = false;
      window.removeEventListener('online', syncPendingExtension);
    };
  }, [deadlineDepartmentScope, isSettingsOpen, normalizedRole]);

  const extendDeadline = (days) => {
    const selected = deadlineSettings.deadlineAt ? new Date(deadlineSettings.deadlineAt) : null;
    const base = selected && !Number.isNaN(selected.getTime()) && selected.getTime() > Date.now()
      ? selected
      : new Date();
    base.setDate(base.getDate() + days);
    setDeadlineSettings((current) => ({ ...current, deadlineAt: formatForInput(base) }));
  };

  const saveEvaluationDeadline = async () => {
    if (!deadlineSettings.deadlineAt) return toast.error(t('header.deadlineRequired'));
    if (new Date(deadlineSettings.deadlineAt).getTime() <= Date.now()) return toast.error(t('header.deadlineMustBeFuture'));
    setDeadlineSaving(true);
    const result = await saveDeadlineWithFallback(deadlineSettings);
    setDeadlineSaving(false);
    if (result.saved && !result.extended) toast.success(t('header.deadlineSaved'));
  };

  return (
    <>
    <header className="fixed inset-x-0 top-0 z-[60] h-16 bg-[#1e3a8a] text-white shadow-lg">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 lg:px-8">
        <Link to={dashboardPath} className="flex min-w-0 items-center gap-3" aria-label={t('header.dashboardAria')}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#facc15] text-sm font-extrabold text-[#1e3a8a] shadow-sm">(IPES)</span>
          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block truncate text-sm font-bold sm:text-base">{t('header.productName')}</span>
            <span className="block truncate text-[11px] text-blue-100 sm:text-xs">{t('header.university')}</span>
          </span>
        </Link>

        <div id="header-mobile-controls" className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2 md:gap-4">
          <LanguageSwitcher />
          <NotificationBell />
          <div className="hidden h-8 w-px bg-white/20 md:block" />
          <div ref={menuRef} className="relative">
            <button type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/10">
              {currentUser.profile_picture ? (
                <img src={currentUser.profile_picture} alt="" className="h-7 w-7 rounded-full border border-white/50 object-cover" />
              ) : (
                <UserCircle className="h-6 w-6" />
              )}
              <span className="hidden max-w-36 truncate text-sm font-semibold sm:block">{email}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-700">
                  <p className="font-semibold">{displayName}</p>
                  <p className="mt-1 truncate text-sm text-slate-500">{email}</p>
                  <span className="mt-3 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{roleLabel}</span>
                </div>
                <nav className="p-2" aria-label={t('header.accountMenuAria')}>
                  <button type="button" onClick={() => navigateAndClose('/profile')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"><UserRound className="h-4 w-4" /> {t('header.viewProfile')}</button>
                  {!isSystemAdmin && <button type="button" onClick={() => { setIsOpen(false); setIsMobileMenuOpen(false); setIsChangePasswordOpen(true); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"><KeyRound className="h-4 w-4" /> {t('header.changePassword')}</button>}
                  <button type="button" onClick={() => { setIsOpen(false); setIsMobileMenuOpen(false); if (isSystemAdmin) setIsAdminSettingsModalOpen(true); else setIsSettingsOpen(true); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"><Settings className="h-4 w-4" /> {t('header.dashboardSettings')}</button>
                  <button type="button" onClick={handleLogout} className="mt-1 flex w-full items-center gap-3 border-t border-slate-100 px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-950/40"><LogOut className="h-4 w-4" /> {t('header.signOut')}</button>
                </nav>
              </div>
            )}
          </div>
        </div>
        {hasMobileNavigation && <button type="button" onClick={() => setIsMobileMenuOpen((open) => !open)} className="shrink-0 rounded-lg p-2 text-white hover:bg-white/10 md:hidden" aria-label={isMobileMenuOpen ? t('sidebar.closeNavigation') : t('sidebar.openNavigation')} aria-expanded={isMobileMenuOpen} aria-controls="dashboard-mobile-drawer">
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>}
      </div>
    </header>

    {isAdminSettingsModalOpen && isSystemAdmin && <AdminSettingsModal isOpen={isAdminSettingsModalOpen} onClose={() => setIsAdminSettingsModalOpen(false)} />}

    {isChangePasswordOpen && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('header.security')}</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-800">{t('header.changePassword')}</h2>
            </div>
            <button type="button" aria-label={t('header.close')} onClick={closePasswordModal} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('header.currentPassword')}</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder={t('header.enterCurrentPassword')}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('header.newPassword')}</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder={t('header.enterNewPassword')}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('header.confirmPassword')}</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder={t('header.confirmNewPassword')}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closePasswordModal} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">{t('header.cancel')}</button>
              <button type="submit" disabled={isSubmittingPassword} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70">
                {isSubmittingPassword ? t('header.updating') : t('header.updatePassword')}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {isSettingsOpen && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
        <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl custom-scrollbar">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('header.preferences')}</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-800">{t('header.dashboardSettings')}</h2>
            </div>
            <button type="button" aria-label={t('header.close')} onClick={() => setIsSettingsOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div>
                <p className="font-medium text-slate-800">{t('header.systemTheme')}</p>
                <p className="text-sm text-slate-500">{t('header.lightDark')}</p>
              </div>
              <button type="button" onClick={() => { toggleTheme(); setSettingsState((current) => ({ ...current, theme: isDark ? 'light' : 'dark' })); }} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                {isDark ? t('header.dark') : t('header.light')}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <p className="font-medium text-slate-800">{t('header.notifications')}</p>
              <div className="mt-3 space-y-3">
                <label className="flex items-center justify-between text-sm text-slate-700">
                  <span>{t('header.emailNotifications')}</span>
                  <input type="checkbox" checked={settingsState.emailNotifications} onChange={() => handleSettingToggle('emailNotifications')} className="h-4 w-4 accent-blue-600" />
                </label>
                <label className="flex items-center justify-between text-sm text-slate-700">
                  <span>{t('header.systemNotifications')}</span>
                  <input type="checkbox" checked={settingsState.systemNotifications} onChange={() => handleSettingToggle('systemNotifications')} className="h-4 w-4 accent-blue-600" />
                </label>
              </div>
            </div>

            {['dept_head', 'depthead', 'department_head'].includes(normalizedRole) && <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <div><p className="font-semibold text-slate-800">{t('header.evaluationPeriod')}</p><p className="mt-1 text-sm text-slate-500">{t('header.deadlineDescription')}</p><p className="mt-1 text-xs font-medium text-blue-800">{t('header.deadlineAppliesOnly')} {currentUser.department_name || currentUser.department || t('header.yourDepartment')}.</p></div>
              <label className="mt-4 block text-sm font-medium text-slate-700">{t('header.academicDeadline')}<input type="datetime-local" min={formatForInput(new Date())} value={deadlineSettings.deadlineAt} onChange={(event) => setDeadlineSettings((current) => ({ ...current, deadlineAt: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
              <div className="mt-3 flex flex-wrap gap-2"><span className="self-center text-xs font-semibold text-slate-500">{t('header.quickExtension')}</span>{[1, 3, 7, 14].map((days) => <button key={days} type="button" onClick={() => extendDeadline(days)} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">{days === 1 ? t('header.oneDay') : `+${days} ${t('header.days')}`}</button>)}</div>
              <button type="button" onClick={saveEvaluationDeadline} disabled={deadlineSaving} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{deadlineSaving ? t('header.savingDeadline') : t('header.saveDeadline')}</button>
            </div>}

            {['dept_head', 'depthead', 'department_head'].includes(normalizedRole) && <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{t('header.remindersNotifications')}</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('header.autoReminderAlerts')}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t('header.configureReminders')}</p>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3">
                  <span><span className="block text-sm font-semibold text-slate-800">{t('header.enableReminders')}</span><span className="mt-1 block text-xs text-slate-500">{t('header.sendSelectedReminders')}</span></span>
                  <button type="button" role="switch" aria-checked={settingsState.autoRemindersEnabled} aria-label={t('header.enableReminders')} onClick={() => setSettingsState((current) => ({ ...current, autoRemindersEnabled: !current.autoRemindersEnabled }))} className={`relative h-6 w-11 shrink-0 rounded-full transition ${settingsState.autoRemindersEnabled ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${settingsState.autoRemindersEnabled ? 'left-[22px]' : 'left-0.5'}`} /></button>
                </div>
                <label className="mt-4 block text-sm font-medium text-slate-700">{t('header.reminderFrequency')}
                  <select value={settingsState.reminderFrequency} onChange={(event) => setSettingsState((current) => ({ ...current, reminderFrequency: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    <option>{t('header.everyTwoDays')}</option>
                    <option>{t('header.everyThreeDays')}</option>
                    <option>{t('header.hoursBeforeDeadline')}</option>
                  </select>
                </label>
                <fieldset className="mt-4 space-y-3">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">{t('header.targetAudience')}</legend>
                  <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={settingsState.reminderAudience.pendingStudentEvaluators} onChange={(event) => setSettingsState((current) => ({ ...current, reminderAudience: { ...current.reminderAudience, pendingStudentEvaluators: event.target.checked } }))} className="h-4 w-4 accent-blue-600" />{t('header.pendingStudentEvaluators')}</label>
                  <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={settingsState.reminderAudience.pendingPeerFacultyEvaluators} onChange={(event) => setSettingsState((current) => ({ ...current, reminderAudience: { ...current.reminderAudience, pendingPeerFacultyEvaluators: event.target.checked } }))} className="h-4 w-4 accent-blue-600" />{t('header.pendingPeerEvaluators')}</label>
                </fieldset>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{t('header.evaluationConfiguration')}</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('header.evaluationWeightDistribution')}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t('header.evaluationContribution')}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[['student', 'studentEvaluationWeight'], ['peer', 'peerEvaluationWeight'], ['deptHead', 'deptHeadEvaluationWeight']].map(([key, labelKey]) => {
                    const label = t(`header.${labelKey}`);
                    return (
                    <label key={key} className="text-sm font-medium text-slate-700">{label}
                      <div className="mt-2 flex items-center rounded-xl border border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                        <input type="number" min="0" max="100" step="1" value={settingsState.evaluationWeights[key]} onChange={(event) => setSettingsState((current) => ({ ...current, evaluationWeights: { ...current.evaluationWeights, [key]: Number(event.target.value) } }))} className="w-full rounded-l-xl border-0 bg-white px-3 py-2.5 text-slate-800 focus:outline-none" aria-label={label} />
                        <span className="px-3 text-slate-500">%</span>
                      </div>
                    </label>
                    );
                  })}
                </div>
                {evaluationWeightsTotal !== 100
                  ? <p role="status" className="mt-4 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{t('header.weightTotalMustEqual')} ({evaluationWeightsTotal}%).</p>
                  : <p role="status" className="mt-4 inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">{t('header.weightsTotal100')}</p>}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{t('header.privacyProtection')}</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('header.anonymitySafeguards')}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t('header.privacyDescription')}</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3">
                    <span><span className="block text-sm font-semibold text-slate-800">{t('header.strictAnonymity')}</span><span className="mt-1 block text-xs text-slate-500">{t('header.hideStudentDetails')}</span></span>
                    <button type="button" role="switch" aria-checked={settingsState.strictStudentAnonymity} aria-label={t('header.strictAnonymity')} onClick={() => setSettingsState((current) => ({ ...current, strictStudentAnonymity: !current.strictStudentAnonymity }))} className={`relative h-6 w-11 shrink-0 rounded-full transition ${settingsState.strictStudentAnonymity ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${settingsState.strictStudentAnonymity ? 'left-[22px]' : 'left-0.5'}`} /></button>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3">
                    <span><span className="block text-sm font-semibold text-slate-800">{t('header.autoLockEvaluation')}</span><span className="mt-1 block text-xs text-slate-500">{t('header.freezeSubmissions')}</span></span>
                    <button type="button" role="switch" aria-checked={settingsState.autoLockFormsOnDeadline} aria-label={t('header.autoLockEvaluation')} onClick={() => {
                      const autoLock = !settingsState.autoLockFormsOnDeadline;
                      setSettingsState((current) => ({ ...current, autoLockFormsOnDeadline: autoLock }));
                      setDeadlineSettings((current) => ({ ...current, autoLock }));
                    }} disabled={autoLockSettingLoading || deadlineSaving} className={`relative h-6 w-11 shrink-0 rounded-full transition ${settingsState.autoLockFormsOnDeadline ? 'bg-blue-600' : 'bg-slate-300'} disabled:cursor-wait disabled:opacity-60`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${settingsState.autoLockFormsOnDeadline ? 'left-[22px]' : 'left-0.5'}`} /></button>
                  </div>
                </div>
              </section>

            </>}

            {canUploadSignature && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Official documents</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Signature & Official Stamp</h3>
                <p className="mt-1 text-sm text-slate-500">Optional PNG images appear on printed evaluation reports. Leave empty for manual signing and stamping.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ['departmentHeadSignature', 'Official Signature'],
                  ['officialStamp', 'Official Stamp'],
                ].map(([field, label]) => (
                  <div key={field} className="rounded-xl border border-slate-200 p-3">
                    <label className="block text-sm font-semibold text-slate-800">
                      {label}
                      <input type="file" accept="image/png,.png" onChange={(event) => {
                        handleCertificateImageUpload(field, event.target.files?.[0]);
                        event.target.value = '';
                      }} className="mt-2 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-700 hover:file:bg-blue-100" />
                    </label>
                    {settingsState[field] ? <div className="mt-3 flex items-center justify-between gap-3">
                      <img src={settingsState[field]} alt={`${label} preview`} className="h-16 max-w-32 object-contain" />
                      <button type="button" onClick={() => {
                        try {
                          const savedSettings = JSON.parse(window.localStorage.getItem(settingsStorageKey) || '{}');
                          delete savedSettings[field];
                          window.localStorage.setItem(settingsStorageKey, JSON.stringify(savedSettings));
                          setSettingsState((current) => ({ ...current, [field]: '' }));
                          window.dispatchEvent(new Event('ipes:official-document-images-changed'));
                        } catch (error) {
                          console.error('Unable to remove official document image:', error);
                          toast.error('Unable to remove the image.');
                        }
                      }} className="text-xs font-semibold text-red-600 hover:text-red-700">Remove</button>
                    </div> : <p className="mt-2 text-xs text-slate-500">No image selected</p>}
                    <p className="mt-2 text-xs text-slate-400">PNG only, up to 1 MB</p>
                  </div>
                ))}
              </div>
            </section>}

            <div className="rounded-xl border border-slate-200 p-3">
              <p className="font-medium text-slate-800">{t('header.language')}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setLanguage('en')} className={`rounded-xl px-3 py-2 text-sm font-medium ${language === 'en' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {t('header.english')}
                </button>
                <button type="button" onClick={() => setLanguage('am')} className={`rounded-xl px-3 py-2 text-sm font-medium ${language === 'am' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {t('header.amharic')}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setIsSettingsOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">{t('header.close')}</button>
            <button type="button" onClick={handleSettingsSave} disabled={deadlineSaving || (isSystemAdmin && autoLockSettingLoading) || evaluationWeightsTotal !== 100} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{deadlineSaving ? t('header.savingDeadline') : t('header.saveSettings')}</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default Header;
