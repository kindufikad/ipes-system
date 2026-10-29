import { useState } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw, Upload } from 'lucide-react';
import { authApi, studentApi } from '../services/api';
import DepartmentCombobox from './DepartmentCombobox';
import { YEAR_LEVEL_ASSIGNMENT_OPTIONS } from '../data/adminOptions';

const controlClass = 'h-11 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-normal text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100';
const initialStudent = { first_name: '', last_name: '', student_id: '', department_id: '', semester: 'i', year_level: '1st Year (Freshman)', section: 'A', program_type: 'regular' };
const initialInstructor = { first_name: '', last_name: '', email: '', password: '', employee_id: '', department_id: '', gender: '', program_type: 'regular' };
const initialLabAssistant = { first_name: '', last_name: '', email: '', employee_id: '', department_id: '', gender: '', status: 'active' };

const normalizeString = (value) => String(value ?? '').trim();

const normalizeGenderValue = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === 'male' || normalized === 'm') return 'Male';
  if (normalized === 'female' || normalized === 'f') return 'Female';
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '';
};

const getDepartmentId = (entry) => {
  const departmentId = entry?.department_id ?? entry?.departmentId ?? entry?.department ?? '';
  return departmentId === null || departmentId === undefined ? '' : String(departmentId);
};

const buildInstructorPayload = (formData) => {
  const firstName = normalizeString(formData?.firstName ?? formData?.first_name);
  const lastName = normalizeString(formData?.lastName ?? formData?.last_name);
  const email = normalizeString(formData?.email ?? '');
  const employeeId = normalizeString(formData?.employeeId ?? formData?.employee_id);
  const departmentId = Number(formData?.departmentId ?? formData?.department_id ?? formData?.department ?? 0);
  const gender = normalizeGenderValue(formData?.gender);

  return {
    firstName,
    lastName,
    gender,
    departmentId: Number.isFinite(departmentId) && departmentId > 0 ? departmentId : '',
    email,
    employeeId,
  };
};

const RegisterUser = ({ departments = [], onRegistered }) => {
  const [role, setRole] = useState('student');
  const [student, setStudent] = useState(initialStudent);
  const [instructor, setInstructor] = useState(initialInstructor);
  const [labAssistant, setLabAssistant] = useState(initialLabAssistant);
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const updateForm = (setter) => (event) => {
    const { name, value } = event.target;
    setter((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: '' }));
    setMessage('');
  };

  const getFieldErrorMap = (error) => {
    const payload = error?.response?.data;
    if (Array.isArray(payload?.errors)) {
      return payload.errors.reduce((accumulator, entry) => {
        const key = entry?.path || entry?.field || entry?.param;
        if (key) accumulator[key] = entry?.msg || entry?.message || 'This field is invalid.';
        return accumulator;
      }, {});
    }

    if (payload?.errors && typeof payload.errors === 'object' && !Array.isArray(payload.errors)) {
      return Object.entries(payload.errors).reduce((accumulator, [key, value]) => {
        accumulator[key] = Array.isArray(value) ? value[0] : String(value || 'This field is invalid.');
        return accumulator;
      }, {});
    }

    return {};
  };

  const submitManual = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    setFieldErrors({});

    try {
      if (role === 'student') {
        const nextStudent = {
          ...student,
          first_name: normalizeString(student.first_name),
          last_name: normalizeString(student.last_name),
          student_id: normalizeString(student.student_id),
          department_id: getDepartmentId(student),
          gender: normalizeString(student.gender || 'male'),
        };

        if (!nextStudent.first_name || !nextStudent.last_name || !nextStudent.student_id || !nextStudent.department_id) {
          throw new Error('Please complete the student name, student ID, and department before submitting.');
        }

        await authApi.registerStudent(nextStudent);
      } else if (role === 'lab_assistant') {
        const nextAssistant = {
          ...labAssistant,
          first_name: normalizeString(labAssistant.first_name),
          last_name: normalizeString(labAssistant.last_name),
          email: normalizeString(labAssistant.email),
          employee_id: normalizeString(labAssistant.employee_id),
          department_id: getDepartmentId(labAssistant),
          gender: normalizeString(labAssistant.gender).toLowerCase(),
        };

        if (!nextAssistant.first_name || !nextAssistant.last_name || !nextAssistant.email || !nextAssistant.employee_id || !nextAssistant.department_id || !nextAssistant.gender) {
          throw new Error('Please complete the full lab assistant profile, select a department, and choose a gender.');
        }

        await authApi.registerLabAssistant(nextAssistant);
      } else {
        const nextInstructor = buildInstructorPayload({
          ...instructor,
          firstName: instructor.first_name,
          lastName: instructor.last_name,
          employeeId: instructor.employee_id,
          departmentId: getDepartmentId(instructor),
        });

        if (!nextInstructor.firstName || !nextInstructor.lastName || !nextInstructor.email || !nextInstructor.employeeId || !nextInstructor.departmentId || !nextInstructor.gender || !normalizeString(instructor.password)) {
          throw new Error('Please complete the instructor profile, select a department, and set a valid gender.');
        }

        await authApi.registerInstructor({
          ...nextInstructor,
          password: normalizeString(instructor.password),
        });
      }

      setMessage(`${role === 'student' ? 'Student' : role === 'lab_assistant' ? 'Lab Assistant' : 'Instructor'} registered successfully.`);
      setFieldErrors({});
      onRegistered?.();
    } catch (error) {
      const mappedErrors = getFieldErrorMap(error);
      const errorMessage = error?.response?.data?.message || error?.response?.data?.error || error.message || 'Registration failed.';
      const serverError = typeof errorMessage === 'string' ? errorMessage : 'Registration failed.';

      if (Object.keys(mappedErrors).length) {
        setFieldErrors(mappedErrors);
        setMessage('Please fix the highlighted fields and try again.');
      } else {
        setMessage(serverError);
      }

      toast.error(serverError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitBulk = async (event) => {
    event.preventDefault();
    if (!file) {
      setMessage('Choose a CSV or XLSX file first.');
      return;
    }
    setIsUploading(true);
    setMessage('');
    try {
      const payload = new FormData();
      payload.append('file', file);
      payload.append('registration_type', role);
      const result = role === 'student' ? await studentApi.bulkUpload(payload) : await authApi.bulkRegister(payload);
      setMessage(`Upload complete. Processed ${result?.created || result?.createdCount || 0} row(s).`);
      setFile(null);
      event.currentTarget.reset();
      onRegistered?.();
    } catch (error) {
      setMessage(error.message || 'Bulk upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="space-y-6" aria-label="User registration">
      <div className="grid grid-cols-1 gap-2 rounded-2xl bg-slate-100 p-2 sm:grid-cols-2">
        {[
          ['student', 'Student Registration'],
          ['instructor', 'Instructor Registration'],
          ['lab_assistant', 'Lab Assistant Registration'],
        ].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setRole(value)} aria-pressed={role === value} className={`h-12 rounded-xl px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${role === value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submitBulk} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
            Bulk Upload ({role === 'student' ? 'students' : 'instructors'})
            <input type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none file:mr-3 file:h-8 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:font-semibold file:text-white focus:ring-2 focus:ring-blue-500" />
          </label>
          <button type="submit" disabled={isUploading || !file} aria-busy={isUploading} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-400">
            {isUploading ? <RefreshCw size={17} className="animate-spin" aria-hidden="true" /> : <Upload size={17} aria-hidden="true" />}
            {isUploading ? 'Uploading...' : 'Upload file'}
          </button>
        </div>
      </form>

      <form onSubmit={submitManual} className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
        <h2 className="md:col-span-3 text-lg font-semibold text-slate-900">
          {role === 'student' ? 'Manual Student Registration' : role === 'lab_assistant' ? 'Manual Lab Assistant Registration' : 'Manual Instructor Registration'}
        </h2>

        <label className="text-sm font-medium text-slate-700">
          First Name
          <input required name="first_name" value={role === 'student' ? student.first_name : role === 'lab_assistant' ? labAssistant.first_name : instructor.first_name} onChange={role === 'student' ? updateForm(setStudent) : role === 'lab_assistant' ? updateForm(setLabAssistant) : updateForm(setInstructor)} className={`${controlClass} mt-2 ${fieldErrors.first_name ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`} aria-invalid={Boolean(fieldErrors.first_name)} />
          {fieldErrors.first_name && <p className="mt-1 text-xs text-red-600">{fieldErrors.first_name}</p>}
        </label>
        <label className="text-sm font-medium text-slate-700">
          Last Name
          <input required name="last_name" value={role === 'student' ? student.last_name : role === 'lab_assistant' ? labAssistant.last_name : instructor.last_name} onChange={role === 'student' ? updateForm(setStudent) : role === 'lab_assistant' ? updateForm(setLabAssistant) : updateForm(setInstructor)} className={`${controlClass} mt-2 ${fieldErrors.last_name ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`} aria-invalid={Boolean(fieldErrors.last_name)} />
          {fieldErrors.last_name && <p className="mt-1 text-xs text-red-600">{fieldErrors.last_name}</p>}
        </label>

        {role === 'student' ? (
          <label className="text-sm font-medium text-slate-700">Student ID<input required name="student_id" autoComplete="username" value={student.student_id} onChange={updateForm(setStudent)} className={`${controlClass} mt-2 ${fieldErrors.student_id ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`} aria-invalid={Boolean(fieldErrors.student_id)} />{fieldErrors.student_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.student_id}</p>}</label>
        ) : role === 'lab_assistant' ? (
          <label className="text-sm font-medium text-slate-700">Email<input required type="email" name="email" autoComplete="username" value={labAssistant.email} onChange={updateForm(setLabAssistant)} className={`${controlClass} mt-2 ${fieldErrors.email ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`} aria-invalid={Boolean(fieldErrors.email)} />{fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}</label>
        ) : (
          <label className="text-sm font-medium text-slate-700">Email<input required type="email" name="email" autoComplete="username" value={instructor.email} onChange={updateForm(setInstructor)} className={`${controlClass} mt-2 ${fieldErrors.email ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`} aria-invalid={Boolean(fieldErrors.email)} />{fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}</label>
        )}

        {role === 'lab_assistant' && (
          <label className="text-sm font-medium text-slate-700">Gender<select name="gender" value={labAssistant.gender} onChange={updateForm(setLabAssistant)} className={`${controlClass} mt-2 ${fieldErrors.gender ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`} aria-invalid={Boolean(fieldErrors.gender)}><option value="">Select gender</option><option value="male">Male</option><option value="female">Female</option></select>{fieldErrors.gender && <p className="mt-1 text-xs text-red-600">{fieldErrors.gender}</p>}</label>
        )}

        {role === 'instructor' && <label className="text-sm font-medium text-slate-700">Employee ID<input required name="employee_id" value={instructor.employee_id} onChange={updateForm(setInstructor)} className={`${controlClass} mt-2 ${fieldErrors.employee_id ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`} aria-invalid={Boolean(fieldErrors.employee_id)} />{fieldErrors.employee_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.employee_id}</p>}</label>}
        {role === 'instructor' && <label className="text-sm font-medium text-slate-700">Password<input required minLength={8} type="password" name="password" value={instructor.password} onChange={updateForm(setInstructor)} className={`${controlClass} mt-2 ${fieldErrors.password ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`} aria-invalid={Boolean(fieldErrors.password)} />{fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}</label>}
        {role === 'lab_assistant' && <label className="text-sm font-medium text-slate-700">Employee ID<input required name="employee_id" value={labAssistant.employee_id} onChange={updateForm(setLabAssistant)} className={`${controlClass} mt-2 ${fieldErrors.employee_id ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`} aria-invalid={Boolean(fieldErrors.employee_id)} />{fieldErrors.employee_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.employee_id}</p>}</label>}
        {role === 'instructor' && (
          <label className="text-sm font-medium text-slate-700">Gender<select required name="gender" value={instructor.gender} onChange={updateForm(setInstructor)} className={`${controlClass} mt-2 ${fieldErrors.gender ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`} aria-invalid={Boolean(fieldErrors.gender)}><option value="">Select gender</option><option value="male">Male</option><option value="female">Female</option></select>{fieldErrors.gender && <p className="mt-1 text-xs text-red-600">{fieldErrors.gender}</p>}</label>
        )}

        <label className="text-sm font-medium text-slate-700">Department<DepartmentCombobox required departments={departments} value={role === 'student' ? student.department_id : role === 'lab_assistant' ? labAssistant.department_id : instructor.department_id} onChange={role === 'student' ? updateForm(setStudent) : role === 'lab_assistant' ? updateForm(setLabAssistant) : updateForm(setInstructor)} />{fieldErrors.department_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.department_id}</p>}</label>

        {role === 'student' ? <>
          <label className="text-sm font-medium text-slate-700">Semester<select name="semester" value={student.semester} onChange={updateForm(setStudent)} className={`${controlClass} mt-2`}><option value="i">I</option><option value="ii">II</option></select></label>
          <label className="text-sm font-medium text-slate-700">Year<select name="year_level" value={student.year_level} onChange={updateForm(setStudent)} className={`${controlClass} mt-2`}>{YEAR_LEVEL_ASSIGNMENT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Section<select name="section" value={student.section} onChange={updateForm(setStudent)} className={`${controlClass} mt-2`}><option>A</option><option>B</option><option>C</option></select></label>
        </> : role === 'instructor' ? <label className="text-sm font-medium text-slate-700">Program type<select name="program_type" value={instructor.program_type} onChange={updateForm(setInstructor)} className={`${controlClass} mt-2`}><option value="regular">Regular</option><option value="extension">Extension</option></select></label> : null }

        <button type="submit" disabled={isSubmitting} className="h-12 rounded-xl bg-blue-600 px-5 font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-400 md:col-span-3">{isSubmitting ? 'Registering...' : role === 'lab_assistant' ? 'Register Lab Assistant' : role === 'student' ? 'Register Student' : 'Register Instructor'}</button>
      </form>
      {message && <p role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</p>}
    </section>
  );
};

export default RegisterUser;
