import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi, departmentApi } from '../services/api';

const inputClassName = 'mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

const DepartmentRegistration = ({ onRegistered }) => {
  const [colleges, setColleges] = useState([]);
  const [collegeId, setCollegeId] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    adminApi.getColleges()
      .then((rows) => {
        if (!active) return;
        const collegeRows = Array.isArray(rows) ? rows : [];
        setColleges(collegeRows);
        setCollegeId(collegeRows[0]?.id ? String(collegeRows[0].id) : '');
      })
      .catch((error) => toast.error(error.message || 'Unable to load colleges.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const trimmedName = departmentName.trim();
    const normalizedCode = departmentCode.trim().toUpperCase();
    if (!collegeId || !trimmedName || !normalizedCode) {
      toast.error('Select a college and provide the department name and code.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await departmentApi.createDepartment({
        collegeId: Number(collegeId),
        departmentName: trimmedName,
        departmentCode: normalizedCode,
      });
      onRegistered?.({
        id: result.id,
        collegeId: Number(collegeId),
        name: trimmedName,
        code: normalizedCode,
        departmentName: trimmedName,
        departmentCode: normalizedCode,
        registeredAt: new Date().toLocaleString(),
      });
      setDepartmentName('');
      setDepartmentCode('');
      toast.success('Department registered successfully.');
    } catch (error) {
      toast.error(error.message || 'Unable to register department.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-6 lg:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700">
          Select College
          <select value={collegeId} onChange={(event) => setCollegeId(event.target.value)} className={inputClassName} disabled={loading || submitting} required>
            <option value="">{loading ? 'Loading colleges...' : 'Select college'}</option>
            {colleges.map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Department Name
          <input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} className={inputClassName} placeholder="Computer Science" disabled={submitting} required />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Department Code
          <input value={departmentCode} onChange={(event) => setDepartmentCode(event.target.value.toUpperCase())} className={inputClassName} placeholder="CS" maxLength={20} disabled={submitting} required />
        </label>
      </div>
      <button type="submit" disabled={loading || submitting || !colleges.length} className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300">
        {submitting ? 'Registering...' : 'Register Department'}
      </button>
    </form>
  );
};

export default DepartmentRegistration;