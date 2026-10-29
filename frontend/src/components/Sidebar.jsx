import { Award, BarChart3, ClipboardCheck, FileBarChart, FileText, LayoutDashboard, TrendingUp, Users } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTranslation } from '../context/useTranslation';

const menuConfig = {
  academic_directorate: {
    titleKey: 'directorateTitle',
    basePath: '/directorate/dashboard',
    items: [
      { key: 'overview', labelKey: 'overview', icon: LayoutDashboard },
      { key: 'evaluate-deans', labelKey: 'evaluateCollegeDeans', icon: ClipboardCheck },
      { key: 'peer-evaluation', labelKey: 'peerEvaluation', icon: Users },
      { key: 'evaluation-tracking', labelKey: 'evaluationTracking', icon: FileBarChart },
      { key: 'my-performance', labelKey: 'myPerformance', icon: TrendingUp },
      { key: 'analytics', labelKey: 'institutionalAnalytics', icon: BarChart3 },
      { key: 'reports', labelKey: 'systemReports', icon: FileText },
    ],
  },
  academic_vice_president: {
    titleKey: 'vicePresidentTitle',
    basePath: '/vice-president-dashboard',
    items: [
      { key: 'evaluate', labelKey: 'evaluateAcademicDirectorate', icon: ClipboardCheck },
      { key: 'academic-report', labelKey: 'academicReport', icon: FileBarChart },
    ],
  },
  college_dean: {
    titleKey: 'deanTitle',
    basePath: '/dean/dashboard',
    items: [
      { key: 'overview', labelKey: 'overview', icon: LayoutDashboard },
      { key: 'evaluate-heads', labelKey: 'evaluateDeptHeads', icon: ClipboardCheck },
      { key: 'evaluation-tracking', labelKey: 'evaluationTracking', icon: FileBarChart },
      { key: 'peer-evaluation', labelKey: 'peerEvaluation', icon: Users },
      { key: 'analytics', labelKey: 'collegeAnalytics', icon: BarChart3 },
      { key: 'reports', labelKey: 'reports', icon: FileText },
      { key: 'my-performance', labelKey: 'myPerformance', icon: Award },
    ],
  },
  lab_assistant: {
    titleKey: 'labAssistantTitle',
    basePath: '/lab-assistant/dashboard',
    items: [
      { key: 'peer', labelKey: 'peer', icon: Users },
      { key: 'evaluation', labelKey: 'myEvaluationPerformance', icon: Award },
    ],
  },
};

const Sidebar = ({ role: roleProp, isMobileMenuOpen, setIsMobileMenuOpen }) => {
  const { t } = useTranslation();
  const { role: authRole, user } = useAuth();
  const location = useLocation();
  const role = roleProp || user?.role || authRole;
  const config = menuConfig[role];
  if (!config) return null;

  return (
    <>
      <div className={`fixed inset-x-0 bottom-0 top-16 z-50 lg:hidden ${isMobileMenuOpen ? '' : 'pointer-events-none invisible'}`}>
        <button type="button" className={`absolute inset-0 bg-slate-950/45 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsMobileMenuOpen(false)} aria-label={t('sidebar.closeNavigation')} tabIndex={isMobileMenuOpen ? 0 : -1} />
        <nav id="dashboard-mobile-drawer" className={`absolute inset-y-0 left-0 w-[min(18rem,85vw)] overflow-y-auto border-r border-slate-200 bg-white px-4 py-6 shadow-2xl transition-transform duration-200 dark:border-slate-700 dark:bg-slate-900 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label={`${config.titleKey ? t(`sidebar.${config.titleKey}`) : config.title} ${t('sidebar.navigation')}`} aria-hidden={!isMobileMenuOpen}>
          <div className="mb-5 px-3 text-[11px] font-bold tracking-[0.22em] text-slate-400">{config.titleKey ? t(`sidebar.${config.titleKey}`) : config.title}</div>
          <div className="space-y-1.5">
          {config.items.map(({ key, labelKey, label, icon: Icon }) => {
            const target = `${config.basePath}#${key}`;
            const defaultKey = role === 'lab_assistant' ? 'evaluation' : role === 'academic_vice_president' ? 'evaluate' : 'overview';
            const active = (location.hash.replace('#', '') || defaultKey) === key && location.pathname === config.basePath;
            return <NavLink key={key} to={target} onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${active ? 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}><Icon className="h-4 w-4" /><span>{labelKey ? t(`sidebar.${labelKey}`) : label}</span></NavLink>;
          })}
          </div>
        </nav>
      </div>
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-7 dark:border-slate-700 dark:bg-slate-900 lg:block" aria-label={`${config.titleKey ? t(`sidebar.${config.titleKey}`) : config.title} ${t('sidebar.navigation')}`}>
        <div className="mb-5 px-3 text-[11px] font-bold tracking-[0.22em] text-slate-400">{config.titleKey ? t(`sidebar.${config.titleKey}`) : config.title}</div>
        <nav className="space-y-1.5">
        {config.items.map(({ key, labelKey, label, icon: Icon }) => {
          const target = `${config.basePath}#${key}`;
          const defaultKey = role === 'lab_assistant' ? 'evaluation' : role === 'academic_vice_president' ? 'evaluate' : 'overview';
          const active = (location.hash.replace('#', '') || defaultKey) === key && location.pathname === config.basePath;
          return (
            <NavLink
              key={key}
              to={target}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${active ? 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'}`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 2} />
              <span>{labelKey ? t(`sidebar.${labelKey}`) : label}</span>
            </NavLink>
          );
        })}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;