import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguageContext } from '../context/LanguageContext';
import { authApi } from '../services/api';
import {
  FaLock,
  FaUserGraduate,
  FaUserShield,
  FaChalkboardTeacher,
  FaUser,
  FaSitemap,
  FaShieldAlt,
  FaArrowLeft,
  FaCheckCircle,
  FaTimesCircle,
  FaEnvelope,
  FaKey,
  FaEye,
  FaEyeSlash,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import { useAuth } from '../context/useAuth';
import SuccessModal from '../components/SuccessModal';
import useLandingContent from '../hooks/useLandingContent';

const Login = () => {
  const landingContent = useLandingContent();
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1);
  const [forgotPasswordData, setForgotPasswordData] = useState({
    email: '',
    verificationCode: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [verificationCodeSent, setVerificationCodeSent] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successPayload, setSuccessPayload] = useState({ title: '', message: '', buttonText: '' });
  const [pendingRoute, setPendingRoute] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [loginErrorCode, setLoginErrorCode] = useState('');
  const { strings } = useContext(LanguageContext);
  const { isAuthenticated, role, isFirstLogin, setAuthSession } = useAuth();
  const navigate = useNavigate();

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleForgotPasswordChange = (field) => (e) => {
    setForgotPasswordData((prev) => ({ ...prev, [field]: e.target.value }));
    if (field === 'newPassword') {
      calculatePasswordStrength(e.target.value);
    }
  };

  const calculatePasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 1;
    if (/\d/.test(password)) strength += 1;
    if (/[!@#$%^&*]/.test(password)) strength += 1;
    setPasswordStrength(strength);
  };

  const getPasswordStrengthColor = () => {
    switch (passwordStrength) {
      case 0:
      case 1:
        return 'bg-red-500';
      case 2:
        return 'bg-orange-500';
      case 3:
        return 'bg-yellow-500';
      case 4:
        return 'bg-green-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getPasswordStrengthText = () => {
    const isAmharic = strings.password === 'የይለፍ ቃል';
    switch (passwordStrength) {
      case 0:
      case 1:
        return isAmharic ? 'ደካማ' : 'Weak';
      case 2:
        return isAmharic ? 'መካከለኛ' : 'Fair';
      case 3:
        return isAmharic ? 'ጥሩ' : 'Good';
      case 4:
        return isAmharic ? 'ጠንካራ' : 'Strong';
      default:
        return '';
    }
  };

  const handleSendVerificationCode = async (e) => {
    e.preventDefault();
    const email = forgotPasswordData.email.trim();

    if (!email) {
      toast.error(strings.password === 'የይለፍ ቃል' ? 'እባክዎ ኢሜል አድራሻ ያስገቡ' : 'Please enter your email address.');
      return;
    }

    if (!email.includes('@')) {
      toast.error(strings.password === 'የይለፍ ቃል' ? 'ትክክለኛ ኢሜል አድራሻ ያስገቡ' : 'Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.forgotPassword(email);
      setVerificationCodeSent(true);
      setForgotPasswordStep(2);
      toast.success(strings.password === 'የይለፍ ቃል' ? 'ምስክር ኮድ ተልኩለታል' : 'Verification code sent to your email!');
    } catch (error) {
      toast.error(error.message || 'Unable to send verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    const { verificationCode } = forgotPasswordData;

    if (!verificationCode || verificationCode.length !== 6) {
      toast.error(strings.password === 'የይለፍ ቃል' ? '6-ቁምፊ ምስክር ኮድ ያስገቡ' : 'Please enter a 6-digit verification code.');
      return;
    }

    setForgotPasswordStep(3);
    toast.success(strings.password === 'የይለፍ ቃል' ? 'ጂቤር ያስገቡ' : 'Code accepted. Set your new password.');
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    const { email, verificationCode, newPassword, confirmPassword } = forgotPasswordData;

    if (!newPassword || !confirmPassword) {
      toast.error(strings.password === 'የይለፍ ቃል' ? 'ሁሉንም ሜዳዎች ሙላ' : 'Please fill all fields.');
      return;
    }

    if (newPassword.length < 8) {
      toast.error(strings.password === 'የይለፍ ቃል' ? 'የይለፍ ቃል ቢያንስ 8 ቁምፊዎች መሆን አለበት' : 'Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(strings.password === 'የይለፍ ቃል' ? 'የይለፍ ቃሎች አንድ አይደሉም' : 'Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.resetPassword({ email, code: verificationCode, newPassword });
      setForgotPasswordStep(4);
      toast.success(strings.password === 'የይለፍ ቃል' ? 'የይለፍ ቃል በተሳካ ሁኔታ ዳግም ተዘጋጅቷል' : 'Password reset successfully!');
    } catch (error) {
      toast.error(error.message || 'Unable to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForgotPasswordFlow = () => {
    setForgotPasswordMode(false);
    setForgotPasswordStep(1);
    setForgotPasswordData({
      email: '',
      verificationCode: '',
      newPassword: '',
      confirmPassword: '',
    });
    setVerificationCodeSent(false);
    setPasswordStrength(0);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginErrorCode('');
    setIsLoading(true);

    const identifier = String(formData.identifier ?? '').trim();
    const password = String(formData.password ?? '');

    if (!identifier || !password) {
      const message = strings.password === 'የይለፍ ቃል'
        ? 'እባክዎ ኢሜል ወይም የተማሪ መታወቂያ እና የይለፍ ቃል ያስገቡ።'
        : 'Please enter your email or student ID and password.';
      toast.error(message, { duration: Infinity, id: 'login-error' });
      setLoginError(message);
      setIsLoading(false);
      return;
    }

    try {
      const response = await authApi.login({ identifier, password });
      const { token, user } = response || {};

      if (!token || !user) {
        throw new Error('Authentication failed.');
      }

      const first = user.first_name || user.firstName || user.full_name || '';
      const last = user.last_name || user.lastName || '';
      const displayName = `${first} ${last}`.trim() || user.email || user.student_id || 'User';
      const isFirstLogin = Boolean(user.isFirstLogin ?? user.is_first_login ?? false);
      setAuthSession(token, {
        name: displayName,
        first_name: first || null,
        last_name: last || null,
        email: user.email || null,
        student_id: user.student_id || null,
        username: user.username || user.email || user.student_id || null,
        role: user.role,
        roles: user.roles || user.role,
        department_id: user.department_id || null,
        isFirstLogin,
      });

      const accessRoute = getDashboardRoute(user.role);

      if (isFirstLogin) {
        navigate('/change-password', { replace: true });
        return;
      }

      setSuccessPayload({
        title: strings.password === 'የይለፍ ቃል' ? 'ስኬታማ!' : 'Success!',
        message: strings.password === 'የይለፍ ቃል' ? 'ግብዣ ተሳክቷል።' : 'Login successful.',
        buttonText: strings.password === 'የይለፍ ቃል' ? 'ቀጥል' : 'Continue',
      });
      setPendingRoute(accessRoute);
      setShowSuccessModal(true);
    } catch (error) {
      if (error?.response?.status !== 401) {
        console.error('Login request failed:', error);
      }

      const backendMsg = error?.response?.data?.message || error?.response?.data?.error;
      const normalizedBackendMsg = typeof backendMsg === 'string'
        ? backendMsg
        : backendMsg?.en || backendMsg?.am || backendMsg?.message || '';
      const statusText = error?.response?.statusText;
      const genericMsg = isAmharic ? 'የተሳሳተ መግቢያ መረጃ ነው።' : 'Incorrect email or password.';

      const finalMsg = normalizedBackendMsg || statusText || genericMsg;

      setLoginError(finalMsg);
      setLoginErrorCode(error?.response?.data?.code || '');

      toast.error(finalMsg, {
        id: 'login-error-toast',
        duration: 6000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    if (pendingRoute) {
      navigate(pendingRoute);
    }
  };

  const normalizeRole = (value) => {
    const roleValue = Array.isArray(value) ? value[0] : String(value || '').split(/[;,|]+/)[0];
    const normalizedValue = String(roleValue || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    if (['depthead', 'departmenthead', 'head'].includes(normalizedValue)) return 'depthead';
    if (['systemadmin', 'admin'].includes(normalizedValue)) return 'systemadmin';
    if (['collegedean', 'dean'].includes(normalizedValue)) return 'college_dean';
    if (['academicdirectorate', 'academicdirector', 'directorate'].includes(normalizedValue)) return 'academic_directorate';
    if (['academicvicepresident', 'vicepresident'].includes(normalizedValue)) return 'academic_vice_president';
    if (normalizedValue === 'labassistant') return 'lab_assistant';
    if (['student', 'instructor', 'teacher'].includes(normalizedValue)) return normalizedValue === 'teacher' ? 'instructor' : normalizedValue;

    return 'student';
  };

  const getDashboardRoute = (value) => {
    const normalizedRole = normalizeRole(value);

    if (normalizedRole === 'instructor') return '/instructor-dashboard';
    if (normalizedRole === 'lab_assistant') return '/lab-assistant/dashboard';
    if (normalizedRole === 'depthead') return '/dept-head-dashboard';
    if (normalizedRole === 'systemadmin') return '/system-admin-dashboard';
    if (normalizedRole === 'college_dean') return '/dean/dashboard';
    if (normalizedRole === 'academic_directorate') return '/directorate/dashboard';
    if (normalizedRole === 'academic_vice_president') return '/vice-president-dashboard';

    return '/student-dashboard';
  };

  useEffect(() => {
    if (!isAuthenticated || !role || isFirstLogin) return;

    const normalizedRole = normalizeRole(role);

    if (normalizedRole === 'student') {
      navigate('/student-dashboard');
    } else if (normalizedRole === 'instructor') {
      navigate('/instructor-dashboard');
    } else if (normalizedRole === 'lab_assistant') {
      navigate('/lab-assistant/dashboard');
    } else if (normalizedRole === 'depthead') {
      navigate('/dept-head-dashboard');
    } else if (normalizedRole === 'systemadmin') {
      navigate('/system-admin-dashboard');
    } else if (normalizedRole === 'college_dean') {
      navigate('/dean/dashboard');
    } else if (normalizedRole === 'academic_directorate') {
      navigate('/directorate/dashboard');
    } else if (normalizedRole === 'academic_vice_president') {
      navigate('/vice-president-dashboard');
    }
  }, [isAuthenticated, isFirstLogin, navigate, role]);

  const normalizedIdentifier = String(formData.identifier ?? '').trim().toLowerCase();
  const resolvedRole = normalizeRole(
    normalizedIdentifier === 'instructor'
      ? 'instructor'
      : normalizedIdentifier === 'depthead' || normalizedIdentifier === 'dept_head'
      ? 'depthead'
      : normalizedIdentifier === 'systemadmin' || normalizedIdentifier === 'system-admin' || normalizedIdentifier === 'admin'
      ? 'systemadmin'
      : 'student'
  );

  const roleMeta = {
    student: {
      title: 'System Login',
      subtitle: 'Access the Instructor Performance Evaluation System',
      icon: FaUserGraduate,
    },
    instructor: {
      title: 'System Login',
      subtitle: 'Access the Instructor Performance Evaluation System',
      icon: FaChalkboardTeacher,
    },
    admin: {
      title: 'System Login',
      subtitle: 'Access the Instructor Performance Evaluation System',
      icon: FaUserShield,
    },
    depthead: {
      title: 'Department Head Login',
      subtitle: 'Access assignment and mapping tools',
      icon: FaSitemap,
    },
    systemadmin: {
      title: 'System Admin Login',
      subtitle: 'Access the full administration console',
      icon: FaShieldAlt,
    },
  };

  const roleMetaEntry = roleMeta[resolvedRole] || roleMeta.student;
  const ActiveIcon = roleMetaEntry.icon;
  const identifierLabel = strings.username ? `${strings.username} / Student ID` : 'Email / Student ID';
  const identifierPlaceholder = 'Enter email or student ID';
  const isAmharic = strings.password === 'የይለፍ ቃል';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ieps-blue-50 via-white to-gray-100 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="rounded-[28px] border border-gray-200 bg-white p-8 shadow-2xl shadow-ieps-blue-100/50 md:p-10">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-ieps-blue-100 shadow-inner shadow-ieps-blue-200/40">
              <img src={landingContent.university_logo} alt="Mekdela Amba University logo" className="h-14 w-14 object-contain" />
            </div>

            {!forgotPasswordMode ? (
              <>
                {ActiveIcon && <ActiveIcon className="mx-auto mb-3 h-8 w-8 text-ieps-blue-500" />}
                <h2 className="text-2xl font-bold text-ieps-blue-600">{roleMetaEntry.title}</h2>
                <p className="mt-1 text-sm text-gray-500">{roleMetaEntry.subtitle}</p>
              </>
            ) : (
              <>
                {forgotPasswordStep < 4 && (
                  <button
                    onClick={() => resetForgotPasswordFlow()}
                    className="mb-4 flex items-center gap-2 text-sm text-ieps-blue-600 hover:text-ieps-blue-500 mx-auto"
                  >
                    <FaArrowLeft size={14} />
                    {isAmharic ? 'ወደ ግባ ተመለስ' : 'Back to login'}
                  </button>
                )}
                <FaKey className="mx-auto mb-3 h-8 w-8 text-ieps-blue-500" />
                <h2 className="text-2xl font-bold text-ieps-blue-600">
                  {forgotPasswordStep === 1 && (isAmharic ? 'የይለፍ ቃል ረሳ?' : 'Forgot Password?')}
                  {forgotPasswordStep === 2 && (isAmharic ? 'ኮድ ያረጋግጡ' : 'Verify Code')}
                  {forgotPasswordStep === 3 && (isAmharic ? 'አዲስ የይለፍ ቃል' : 'Reset Password')}
                  {forgotPasswordStep === 4 && (isAmharic ? 'ተሳክቷል!' : 'Success!')}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {forgotPasswordStep === 1 && (isAmharic ? 'የመለወጫ ሂደትዎን ይጀምሩ' : 'Start your recovery process')}
                  {forgotPasswordStep === 2 && (isAmharic ? 'ኢሜሎ ላይ ከተላከ ኮድ ያሰርግጡ' : 'Enter the code sent to your email')}
                  {forgotPasswordStep === 3 && (isAmharic ? 'ጠንካራ አዲስ የይለፍ ቃል ያዘጋጁ' : 'Create a new strong password')}
                  {forgotPasswordStep === 4 && (isAmharic ? 'የይለፍ ቃል ተሳክቷል' : 'Your password has been reset')}
                </p>
              </>
            )}
          </div>

          {forgotPasswordStep === 4 ? (
            <div className="py-8 text-center">
              <div className="mb-6 flex justify-center">
                <div className="rounded-full bg-green-100 p-4">
                  <FaCheckCircle className="h-12 w-12 text-green-500" />
                </div>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-800">
                {isAmharic ? 'የይለፍ ቃል ስኬታማነት' : 'Password Reset Complete'}
              </h3>
              <p className="mb-6 text-sm text-gray-600">
                {isAmharic ? 'ዕድሜናት አዲስ የይለፍ ቃል ተዘጋጅቷል። እባክዎ እንደገና ግባ ማለት ይችላሉ።' : 'Your password has been successfully reset. You can now log in with your new password.'}
              </p>
              <button
                onClick={() => {
                  resetForgotPasswordFlow();
                  setFormData({ identifier: '', password: '' });
                }}
                className="w-full rounded-xl bg-ieps-blue-600 py-3 font-semibold text-white transition-all hover:bg-ieps-blue-500"
              >
                {isAmharic ? 'ወደ ግባ ተመለስ' : 'Back to Login'}
              </button>
            </div>
          ) : !forgotPasswordMode ? (
            <>
              <SuccessModal
                open={showSuccessModal}
                title={successPayload.title}
                message={successPayload.message}
                buttonText={successPayload.buttonText}
                onClose={handleSuccessModalClose}
              />
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{identifierLabel}</label>
                  <div className="relative">
                    <FaEnvelope className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      name="identifier"
                      value={formData.identifier}
                      onChange={handleChange('identifier')}
                      placeholder={identifierPlaceholder}
                      autoComplete="username"
                      className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ieps-blue-500"
                      required
                    />
                  </div>
                  {loginError === 'Incorrect email' && <p className="mt-1 text-sm font-medium text-red-600">Incorrect email</p>}
                  <p className="mt-1 text-xs text-gray-500">{isAmharic ? 'ኢሜል ወይም የተማሪ መታወቂያ ቁጥር' : 'Use your email address or student ID number'}</p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{strings.password}</label>
                  <div className="relative">
                    <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange('password')}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-12 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ieps-blue-500"
                      required
                    />
                    <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-ieps-blue-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                  {loginError === 'Incorrect password' && <p className="mt-1 text-sm font-medium text-red-600">Incorrect password</p>}
                </div>

                {loginError && loginError !== 'Incorrect email' && loginError !== 'Incorrect password' && (
                  <div
                    className={`mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm font-semibold ${
                      loginErrorCode === 'SYSTEM_ACCESS_LOCKED'
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-red-300 bg-red-50 text-red-800'
                    }`}
                    role="alert"
                  >
                    {loginErrorCode === 'SYSTEM_ACCESS_LOCKED' ? <FaLock className="mt-0.5 shrink-0" aria-hidden="true" /> : <FaShieldAlt className="mt-0.5 shrink-0" aria-hidden="true" />}
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center rounded-xl bg-ieps-blue-600 py-3 font-semibold text-white shadow-lg transition-all duration-300 hover:bg-ieps-blue-500 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoading ? (isAmharic ? 'በመግባት ላይ' : 'Logging in...') : (isAmharic ? 'ግባ' : 'Login')}
                </button>

                <div className="text-center text-sm text-gray-500">
                  <button
                    type="button"
                    onClick={() => setForgotPasswordMode(true)}
                    className="text-ieps-blue-600 hover:underline font-medium"
                  >
                    {isAmharic ? 'የይለፍ ቃል ረስተዋል?' : 'Forgot your password?'}
                  </button>
                </div>
              </form>
            </>
          ) : forgotPasswordStep === 1 ? (
            <form onSubmit={handleSendVerificationCode} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {isAmharic ? 'ኢሜል አድራሻ' : 'Email Address'}
                </label>
                <div className="relative">
                  <FaEnvelope className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={forgotPasswordData.email}
                    onChange={handleForgotPasswordChange('email')}
                    placeholder="your@email.com"
                    className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ieps-blue-500"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center rounded-xl bg-ieps-blue-600 py-3 font-semibold text-white shadow-lg transition-all duration-300 hover:bg-ieps-blue-500 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? (isAmharic ? 'ኮድ በመላክ ላይ' : 'Sending code...') : (isAmharic ? 'ኮድ ላክ' : 'Send Code')}
              </button>
            </form>
          ) : forgotPasswordStep === 2 ? (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                {isAmharic ? '6-ቁምፊ ኮድ ወደ ኢሜል ወደ ተላከ' : 'A 6-digit code has been sent to your email'} <span className="font-semibold">{forgotPasswordData.email}</span>
              </p>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {isAmharic ? 'ምስክር ኮድ' : 'Verification Code'}
                </label>
                <div className="relative">
                  <FaKey className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={forgotPasswordData.verificationCode}
                    onChange={handleForgotPasswordChange('verificationCode')}
                    placeholder="000000"
                    maxLength="6"
                    className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-center text-lg tracking-widest transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ieps-blue-500"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center rounded-xl bg-ieps-blue-600 py-3 font-semibold text-white shadow-lg transition-all duration-300 hover:bg-ieps-blue-500 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? (isAmharic ? 'በማረጋገጥ ላይ' : 'Verifying...') : (isAmharic ? 'ያረጋግጡ' : 'Verify')}
              </button>

              <button
                type="button"
                onClick={handleSendVerificationCode}
                className="w-full text-sm text-ieps-blue-600 hover:underline"
              >
                {isAmharic ? 'ኮድ ዳግም ላክ' : 'Resend Code'}
              </button>
            </form>
          ) : forgotPasswordStep === 3 ? (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {isAmharic ? 'አዲስ የይለፍ ቃል' : 'New Password'}
                </label>
                <div className="relative">
                  <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={forgotPasswordData.newPassword}
                    onChange={handleForgotPasswordChange('newPassword')}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ieps-blue-500"
                    required
                  />
                </div>
                {forgotPasswordData.newPassword && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 flex-1 rounded-full ${getPasswordStrengthColor()}`}></div>
                      <span className="text-xs text-gray-600">{getPasswordStrengthText()}</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {isAmharic ? 'የይለፍ ቃል ያረጋግጡ' : 'Confirm Password'}
                </label>
                <div className="relative">
                  <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={forgotPasswordData.confirmPassword}
                    onChange={handleForgotPasswordChange('confirmPassword')}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ieps-blue-500"
                    required
                  />
                </div>
                {forgotPasswordData.confirmPassword && (
                  <div className="mt-2 flex items-center gap-2">
                    {forgotPasswordData.confirmPassword === forgotPasswordData.newPassword ? (
                      <>
                        <FaCheckCircle className="text-green-500" />
                        <span className="text-xs text-green-600">{isAmharic ? 'መሳሰያ' : 'Passwords match'}</span>
                      </>
                    ) : (
                      <>
                        <FaTimesCircle className="text-red-500" />
                        <span className="text-xs text-red-600">{isAmharic ? 'የዚህ የይለፍ ቃላት አንድ አይደሉም' : 'Passwords do not match'}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || forgotPasswordData.newPassword !== forgotPasswordData.confirmPassword}
                className="flex w-full items-center justify-center rounded-xl bg-ieps-blue-600 py-3 font-semibold text-white shadow-lg transition-all duration-300 hover:bg-ieps-blue-500 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? (isAmharic ? 'በማዘምን ላይ' : 'Resetting...') : (isAmharic ? 'የይለፍ ቃል አዘምን' : 'Reset Password')}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
};
export default Login; 
