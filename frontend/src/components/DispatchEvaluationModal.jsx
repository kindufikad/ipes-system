import React, { useMemo } from 'react';
import { YEAR_LEVEL_FILTER_OPTIONS } from '../data/adminOptions';

const ACADEMIC_YEARS = ['2023/24', '2024/25', '2025/26'];

export default function DispatchEvaluationModal({ open, onClose, form, setForm, colleges = [], departments = [], courses = [], onSaveTemplate, onEditTemplate, onSend }) {
  if (!open) return null;

  const filteredDepartments = useMemo(() => departments.filter((d) => d.collegeId === form.collegeId), [departments, form.collegeId]);
  const filteredCourses = useMemo(() => courses.filter((c) => c.departmentId === form.departmentId), [courses, form.departmentId]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Dispatch Student Evaluation</h3>
          <button onClick={onClose} className="text-gray-500">✕</button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-gray-600">
            <span className="mb-1 block font-medium">Academic Year</span>
            <select value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <option value="">Select academic year</option>
              {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>

          <label className="text-sm text-gray-600">
            <span className="mb-1 block font-medium">Semester</span>
            <select value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <option value="">Select semester</option>
              <option>Semester I</option>
              <option>Semester II</option>
            </select>
          </label>

          <label className="text-sm text-gray-600">
            <span className="mb-1 block font-medium">Year Level</span>
            <select value={form.yearLevel} onChange={(e) => setForm({ ...form, yearLevel: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <option value="">Select year level</option>
              {YEAR_LEVEL_FILTER_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="text-sm text-gray-600">
            <span className="mb-1 block font-medium">College</span>
            <select value={form.collegeId} onChange={(e) => setForm({ ...form, collegeId: e.target.value, departmentId: '' })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <option value="">Select college</option>
              {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <label className="text-sm text-gray-600">
            <span className="mb-1 block font-medium">Department</span>
            <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value, courseId: '' })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" disabled={!form.collegeId}>
              <option value="">Select department</option>
              {filteredDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>

          <label className="text-sm text-gray-600">
            <span className="mb-1 block font-medium">Course</span>
            <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" disabled={!form.departmentId}>
              <option value="">Select course</option>
              {filteredCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <label className="text-sm text-gray-600 sm:col-span-2">
            <span className="mb-1 block font-medium">Student Group / ID</span>
            <input value={form.studentGroup || form.studentId || ''} onChange={(e) => setForm({ ...form, studentGroup: e.target.value, studentId: e.target.value })} placeholder="Group name or Student ID" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <button type="button" onClick={onEditTemplate} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Edit Form</button>
          <button type="button" onClick={onSaveTemplate} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Update Form</button>
          <button type="button" onClick={onSend} className="rounded-xl bg-ieps-blue-600 px-4 py-2 text-sm font-semibold text-white">Send Evaluation</button>
        </div>
      </div>
    </div>
  );
}
