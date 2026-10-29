import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FaChalkboardTeacher, FaEdit, FaSearch, FaTrash } from 'react-icons/fa';
import { LanguageContext } from '../../context/LanguageContext';

const pageSize = 8;

const InstructorsSection = ({ users, handleEditUser, handleDeleteUser }) => {
  const { strings } = useContext(LanguageContext);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const allUserRecords = useMemo(() => {
    return (users || []).map((user) => ({
      ...user,
      employeeId: user.employeeId || user.employee_id || '—',
      fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || '—',
    }));
  }, [users]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredInstructors = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return allUserRecords.filter((user) => {
      const fullName = String(user.fullName || '').toLowerCase();
      const username = String(user.username || '').toLowerCase();
      const email = String(user.email || '').toLowerCase();
      const employeeId = String(user.employeeId || '').toLowerCase();
      return !term || fullName.includes(term) || username.includes(term) || email.includes(term) || employeeId.includes(term);
    });
  }, [allUserRecords, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredInstructors.length / pageSize));

  const paginatedInstructors = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInstructors.slice(start, start + pageSize);
  }, [filteredInstructors, currentPage]);

  return (
    <section className="card">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-green-50 p-3 text-green-600">
          <FaChalkboardTeacher className="text-xl" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{strings.adminSections.instructorRecords}</h2>
          <p className="text-sm text-gray-500">{strings.adminSections.instructorRecordsDesc}</p>
        </div>
      </div>

      <div className="mb-4 max-w-md">
        <label className="text-sm text-gray-600">
          <span className="mb-1 block font-medium">{strings.common.search}</span>
          <div className="relative">
            <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by Username, Email, or Employee ID"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-2">{strings.deptHeadDashboard.employeeId}</th>
              <th className="py-2">{strings.common.name}</th>
            </tr>
          </thead>
          <tbody>
            {paginatedInstructors.map((user) => (
              <tr key={user.id} className="border-b border-gray-50 align-top">
                <td className="py-2 text-gray-700">{user.employeeId}</td>
                <td className="py-2 text-gray-700">{user.fullName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-500">
          {strings.common.page} {Math.min(currentPage, totalPages)} {strings.common.of} {totalPages}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
            disabled={currentPage === 1}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {strings.common.previous}
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
            disabled={currentPage >= totalPages}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {strings.common.next}
          </button>
        </div>
      </div>
    </section>
  );
};

export default InstructorsSection;
