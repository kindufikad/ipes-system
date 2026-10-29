import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/useAuth';

const dashboardRoutes = {
  dept_head: '/dept-head-dashboard',
  depthead: '/dept-head-dashboard',
  instructor: '/instructor-dashboard',
  student: '/student-dashboard',
  academic_directorate: '/directorate-dashboard',
  academic_director: '/directorate-dashboard',
  directorate: '/directorate-dashboard',
  academic_vice_president: '/vice-president-dashboard',
  admin: '/admin/dashboard',
  systemadmin: '/admin/dashboard',
};

const BackButton = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const storedUser = useMemo(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(window.localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);

  const handleBack = () => {
    const userRole = String(user?.role || role || storedUser?.role || '').trim().toLowerCase();
    navigate(dashboardRoutes[userRole] || '/');
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="mb-4 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-blue-600"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      <span>Back to Dashboard</span>
    </button>
  );
};

export default BackButton;
