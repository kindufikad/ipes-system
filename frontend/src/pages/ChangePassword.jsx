import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { FaEye, FaEyeSlash, FaLock, FaShieldAlt } from 'react-icons/fa';
import { useAuth } from '../context/useAuth';
import { authApi } from '../services/api';
import BackButton from '../components/BackButton';

const ChangePassword = () => {
  const navigate = useNavigate();
  const { user, role, setAuthSession } = useAuth();
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const getPasswordStrength = (password) => {
    let score = 0;
    if (password.length >= 6) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  };

  const strength = getPasswordStrength(formData.newPassword);
  const strengthLabel =
    strength <= 1 ? 'Weak' : strength === 2 ? 'Fair' : strength === 3 ? 'Good' : 'Strong';

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const currentPassword = formData.currentPassword.trim();
    const newPassword = formData.newPassword.trim();
    const confirmPassword = formData.confirmPassword.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('New password must be different from the current password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authApi.changePassword({ currentPassword, newPassword, confirmPassword });
      const newToken = response?.token || response?.data?.token || null;
      const updatedUser = response?.user || response?.data?.user || user || {};

      if (newToken && updatedUser) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('token', newToken);
          window.localStorage.setItem('ipesAuthToken', newToken);
          window.localStorage.setItem('user', JSON.stringify({
            ...updatedUser,
            role: updatedUser.role || role,
            isFirstLogin: false,
          }));
          window.localStorage.setItem('userData', JSON.stringify({
            ...updatedUser,
            role: updatedUser.role || role,
            isFirstLogin: false,
          }));
        }

        setAuthSession(newToken, {
          ...updatedUser,
          role: updatedUser.role || role,
          isFirstLogin: false,
        });
      }

      toast.success('Password updated successfully!');

      const normalizedRole = String(updatedUser.role || role || '').trim().toLowerCase();
      const redirectTarget = ['depthead', 'dept_head', 'department_head'].includes(normalizedRole)
        ? '/dept-head-dashboard'
        : ['systemadmin', 'system_admin', 'admin'].includes(normalizedRole)
          ? '/system-admin-dashboard'
          : ['college_dean', 'dean'].includes(normalizedRole)
            ? '/dean/dashboard'
            : ['academic_directorate', 'academic_director', 'directorate'].includes(normalizedRole)
              ? '/directorate/dashboard'
              : normalizedRole === 'academic_vice_president'
                ? '/vice-president-dashboard'
              : normalizedRole === 'instructor'
                ? '/instructor-dashboard'
                : '/student-dashboard';

      navigate(redirectTarget, { replace: true });
    } catch (err) {
      const message = err?.message || 'Unable to update password.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-slate-200">
        <BackButton />
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <FaShieldAlt className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Change Password</h1>
          <p className="mt-2 text-sm text-slate-500">You must update your password before continuing.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={user?.email || user?.student_id || ''}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
          {error && (
            <div style={{ padding: '12px', backgroundColor: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold' }}>
              ⚠️ {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Current Password</label>
            <div className="relative">
              <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                value={formData.currentPassword}
                onChange={handleChange('currentPassword')}
                placeholder="Enter current password"
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-10 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              />
              <button type="button" onClick={() => setShowCurrent((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                {showCurrent ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">New Password</label>
            <div className="relative">
              <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                value={formData.newPassword}
                onChange={handleChange('newPassword')}
                placeholder="Enter new password"
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-10 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              />
              <button type="button" onClick={() => setShowNew((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                {showNew ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {formData.newPassword && (
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <span>Password strength</span>
                  <span>{strengthLabel}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div
                    className={`h-2 rounded-full ${strength <= 1 ? 'bg-red-500' : strength === 2 ? 'bg-orange-500' : strength === 3 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${(strength / 4) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Confirm New Password</label>
            <div className="relative">
              <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={formData.confirmPassword}
                onChange={handleChange('confirmPassword')}
                placeholder="Confirm new password"
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-10 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              />
              <button type="button" onClick={() => setShowConfirm((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                {showConfirm ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white shadow-lg transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
