import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, UserMinus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from '../context/useTranslation';
import { adminApi } from '../services/api';

const ROLE_OPTIONS = [
  { value: 'college_dean', labelKey: 'collegeDean' },
  { value: 'dept_head', labelKey: 'departmentHead' },
  { value: 'academic_directorate', labelKey: 'academicDirectorate' },
  { value: 'academic_vice_president', labelKey: 'vicePresident' },
];

const ROLE_LABEL_KEYS = {
  college_dean: 'collegeDean',
  dept_head: 'departmentHead',
  academic_directorate: 'academicDirectorate',
  academic_vice_president: 'vicePresident',
};

const ManageRoles = ({ onRoleAssigned }) => {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [role, setRole] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [userId, setUserId] = useState('');
  const [occupant, setOccupant] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([adminApi.getRoleCandidates(), adminApi.getColleges()])
      .then(([staff, collegeRows]) => {
        if (!active) return;
        setCandidates((Array.isArray(staff) ? staff : []).filter((user) => String(user.role).toLowerCase() !== 'student'));
        setColleges(Array.isArray(collegeRows) ? collegeRows : []);
      })
      .catch((error) => toast.error(error.message || t('manageRoles.errors.loadData')))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setDepartmentId('');
    setDepartments([]);
    setUserId('');
    if (role !== 'dept_head' || !collegeId) return undefined;

    let active = true;
    setDepartmentsLoading(true);
    adminApi.getDepartmentsByCollege(collegeId)
      .then((rows) => {
        if (active) setDepartments(Array.isArray(rows) ? rows : []);
      })
      .catch((error) => {
        if (active) {
          setDepartments([]);
          toast.error(error.message || t('manageRoles.errors.loadDepartments'));
        }
      })
      .finally(() => { if (active) setDepartmentsLoading(false); });

    return () => { active = false; };
  }, [collegeId, role]);

  useEffect(() => {
    if (!role || (role === 'college_dean' && !collegeId) || (role === 'dept_head' && !departmentId)) {
      setOccupant(null);
      return undefined;
    }
    let active = true;
    adminApi.getManagementRoleOccupant({ role, college_id: role === 'college_dean' ? collegeId : undefined, department_id: role === 'dept_head' ? departmentId : undefined })
      .then((current) => { if (active) { setOccupant(current); setUserId(''); } })
      .catch((error) => toast.error(error.message || t('manageRoles.errors.checkOccupant')));
    return () => { active = false; };
  }, [collegeId, departmentId, role]);

  const filteredCandidates = useMemo(() => {
    if (role === 'college_dean') return candidates.filter((user) => ['instructor', 'dept_head'].includes(String(user.role).toLowerCase()) && String(user.college_id) === String(collegeId));
    if (role === 'dept_head') return candidates.filter((user) => ['instructor'].includes(String(user.role).toLowerCase()) && String(user.college_id) === String(collegeId) && String(user.department_id) === String(departmentId));
    if (role === 'academic_vice_president') return candidates.filter((user) => ['instructor', 'dept_head', 'department_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'lab_assistant'].includes(String(user.role).toLowerCase()));
    return candidates.filter((user) => ['instructor', 'dept_head', 'college_dean'].includes(String(user.role).toLowerCase()));
  }, [candidates, collegeId, departmentId, role]);

  const resetScope = (nextRole) => {
    setRole(nextRole);
    setCollegeId('');
    setDepartmentId('');
    setUserId('');
  };

  const assignRole = async (event) => {
    event.preventDefault();
    if (!role || !userId) return toast.error(t('manageRoles.errors.selectRoleCandidate'));
    if (role === 'college_dean' && !collegeId) return toast.error(t('manageRoles.errors.selectCollege'));
    if (role === 'dept_head' && !departmentId) return toast.error(t('manageRoles.errors.selectDepartment'));
    if (occupant) return toast.error(t('manageRoles.errors.removeOccupantFirst'));
    if (!filteredCandidates.some((user) => String(user.user_id || user.id) === String(userId))) return toast.error(t('manageRoles.errors.ineligibleCandidate'));
    setSaving(true);
    try {
      await adminApi.assignManagementRole(userId, role, {
        college_id: role === 'college_dean' ? Number(collegeId) : null,
        department_id: role === 'dept_head' ? Number(departmentId) : null,
      });
      toast.success(t('manageRoles.messages.assigned'));
      onRoleAssigned?.(Number(userId), role);
      setUserId('');
    } catch (error) {
      toast.error(error.message || t('manageRoles.errors.assignRole'));
    } finally {
      setSaving(false);
    }
  };

  const currentRoleLabel = t(`manageRoles.roles.${ROLE_LABEL_KEYS[String(role || '').trim().toLowerCase()] || 'unknown'}`);
  const occupantBannerText = occupant ? `${t('manageRoles.current')} ${currentRoleLabel}` : t('manageRoles.currentRole');
  const removeButtonText = `${t('manageRoles.removeCurrent')} ${currentRoleLabel}`;

  const removeOccupant = async () => {
    if (!occupant) return;
    setRemoving(true);
    try {
      await adminApi.resetManagementRole(occupant.id);
      setOccupant(null);
      setCandidates((current) => current.map((user) => (user.id === occupant.id ? { ...user, role: 'instructor' } : user)));
      toast.success(t('manageRoles.messages.occupantRemoved'));
    } catch (error) {
      toast.error(error.message || t('manageRoles.errors.removeOccupant'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="space-y-6" aria-labelledby="manage-roles-title">
      <div><h2 id="manage-roles-title" className="text-2xl font-bold text-slate-900">{t('manageRoles.title')}</h2><p className="mt-1 text-slate-600">{t('manageRoles.description')}</p></div>
      {occupant && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><span>{occupantBannerText}: <strong>{occupant.full_name}</strong></span><button type="button" onClick={removeOccupant} disabled={removing} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50"><UserMinus size={16} />{removing ? t('manageRoles.removing') : removeButtonText}</button></div>}
      <form onSubmit={assignRole} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">{t('manageRoles.role')}<select value={role} onChange={(event) => resetScope(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" required><option value="">{t('manageRoles.selectRole')}</option>{ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(`manageRoles.roles.${option.labelKey}`)}</option>)}</select></label>
          {role === 'college_dean' && <label className="text-sm font-medium text-slate-700">{t('manageRoles.targetCollege')}<select value={collegeId} onChange={(event) => { setCollegeId(event.target.value); setUserId(''); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" required><option value="">{t('manageRoles.selectCollege')}</option>{colleges.map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}</select></label>}
          {role === 'dept_head' && <>
            <label className="text-sm font-medium text-slate-700">{t('manageRoles.targetCollege')}<select value={collegeId} onChange={(event) => { setCollegeId(event.target.value); setDepartmentId(''); setUserId(''); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" required><option value="">{t('manageRoles.selectCollege')}</option>{colleges.map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">{t('manageRoles.targetDepartment')}<select value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setUserId(''); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" disabled={!collegeId || departmentsLoading} required><option value="">{departmentsLoading ? t('manageRoles.loadingDepartments') : t('manageRoles.selectDepartment')}</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name || department.department_name}</option>)}</select></label>
          </>}
          <label className="text-sm font-medium text-slate-700">{t('manageRoles.candidate')}<select value={userId} onChange={(event) => setUserId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" disabled={loading || Boolean(occupant) || (!['academic_directorate', 'academic_vice_president'].includes(role) && !(collegeId || departmentId))} required><option value="">{loading ? t('manageRoles.loadingCandidates') : t('manageRoles.selectCandidate')}</option>{filteredCandidates.map((user) => <option key={user.user_id || user.id} value={user.user_id || user.id}>{user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim()}{user.department_name ? ` - ${user.department_name}` : ''}</option>)}</select></label>
        </div>
        <button type="submit" disabled={loading || saving || Boolean(occupant)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:bg-slate-300"><ShieldCheck size={17} />{saving ? t('manageRoles.assigning') : t('manageRoles.assignRole')}</button>
      </form>
      {!loading && !candidates.length && <p className="rounded-xl bg-slate-50 p-4 text-slate-600">{t('manageRoles.noStaff')}</p>}
    </section>
  );
};

export default ManageRoles;
