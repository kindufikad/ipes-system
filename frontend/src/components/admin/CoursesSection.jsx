import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FaBook, FaEdit, FaSearch, FaTrash } from 'react-icons/fa';
import { adminData } from '../../data/adminOptions';
import { LanguageContext } from '../../context/LanguageContext';

const pageSize = 6;

const CoursesSection = ({ courses, handleEditCourse, handleDeleteCourse }) => {
  const { strings } = useContext(LanguageContext);
  const [searchTerm, setSearchTerm] = useState('');
  const [collegeFilter, setCollegeFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const courseRecords = useMemo(() => {
    return courses.map((course) => {
      const college = adminData.colleges.find((item) => item.id === course.collegeId);
      const department = adminData.departments.find((item) => item.id === course.departmentId);

      return {
        ...course,
        collegeName: college?.name || course.collegeName || course.college_name || '—',
        departmentName: department?.name || course.departmentName || course.department_name || '—',
        semester: course.semester || '—',
        creditHours: course.creditHours || '—',
      };
    });
  }, [courses]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, collegeFilter, departmentFilter]);

  const filteredCourses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return courseRecords.filter((course) => {
      const matchesSearch =
        !term ||
        [
          course.name,
          course.code,
          course.collegeName,
          course.departmentName,
          course.semester,
          course.creditHours,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));

      const matchesCollege = collegeFilter === 'all' || course.collegeName === collegeFilter;
      const matchesDepartment = departmentFilter === 'all' || course.departmentName === departmentFilter;

      return matchesSearch && matchesCollege && matchesDepartment;
    });
  }, [courseRecords, searchTerm, collegeFilter, departmentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCourses = filteredCourses.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);

  return (
    <section className="card">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-purple-50 p-3 text-purple-600">
          <FaBook className="text-xl" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{strings.adminSections.courseCatalog}</h2>
          <p className="text-sm text-gray-500">{strings.adminSections.courseCatalogDesc}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <label className="text-sm text-gray-600 md:col-span-1">
          <span className="mb-1 block font-medium">{strings.common.search}</span>
          <div className="relative">
            <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={strings.common.search}
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </label>

        <label className="text-sm text-gray-600">
          <span className="mb-1 block font-medium">{strings.deptHeadDashboard.college}</span>
          <select
            value={collegeFilter}
            onChange={(event) => setCollegeFilter(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">{strings.common.all}</option>
            {adminData.colleges.map((college) => (
              <option key={college.id} value={college.name}>{college.name}</option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-600">
          <span className="mb-1 block font-medium">{strings.deptHeadDashboard.department}</span>
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">{strings.common.all}</option>
            {adminData.departments.map((department) => (
              <option key={department.id} value={department.name}>{department.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-2">{strings.deptHeadDashboard.courseName}</th>
              <th className="py-2">{strings.deptHeadDashboard.courseCode}</th>
              <th className="py-2">{strings.deptHeadDashboard.college}</th>
              <th className="py-2">{strings.deptHeadDashboard.department}</th>
              <th className="py-2">{strings.deptHeadDashboard.semester}</th>
              <th className="py-2">{strings.deptHeadDashboard.creditHours}</th>
              <th className="py-2">{strings.deptHeadDashboard.registrationDate}</th>
              <th className="py-2">{strings.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {paginatedCourses.map((course) => (
              <tr key={course.id} className="border-b border-gray-50 align-top">
                <td className="py-2 text-gray-700">{course.name}</td>
                <td className="py-2 text-gray-700">{course.code}</td>
                <td className="py-2 text-gray-700">{course.collegeName}</td>
                <td className="py-2 text-gray-700">{course.departmentName}</td>
                <td className="py-2 text-gray-700">{course.semester}</td>
                <td className="py-2 text-gray-700">{course.creditHours}</td>
                <td className="py-2 text-gray-700">{course.registrationDate || '—'}</td>
                <td className="py-2">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleEditCourse(course)} className="text-blue-600 hover:text-blue-800"><FaEdit /></button>
                    <button type="button" onClick={() => handleDeleteCourse(course.id)} className="text-red-600 hover:text-red-800"><FaTrash /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-500">
          {strings.common.page} {safeCurrentPage} {strings.common.of} {totalPages}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
            disabled={safeCurrentPage === 1}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {strings.common.previous}
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
            disabled={safeCurrentPage === totalPages}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {strings.common.next}
          </button>
        </div>
      </div>
    </section>
  );
};

export default CoursesSection;
