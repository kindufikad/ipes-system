import { useEffect, useMemo, useState } from 'react';
import { evaluationApi } from '../services/api';
import './Pagination.css';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const PublishEvaluationTable = ({ departmentId, filters, refreshToken }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const filterKey = useMemo(
    () => JSON.stringify({
      program_type: filters.program_type,
      year_level: filters.year_level,
      semester: filters.semester,
      section: filters.section,
      staff_type: filters.staff_type,
    }),
    [filters.program_type, filters.year_level, filters.semester, filters.section, filters.staff_type]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filterKey, search, itemsPerPage]);

  useEffect(() => {
    let cancelled = false;
    const loadPage = async () => {
      if (!departmentId) {
        setRows([]);
        setTotalItems(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const result = await evaluationApi.getPaginatedPublishAssignments({
          department: departmentId,
          ...JSON.parse(filterKey),
          search,
          page: currentPage,
          limit: itemsPerPage,
        });
        if (cancelled) return;
        const pageRows = Array.isArray(result?.rows) ? result.rows : [];
        setRows(pageRows.slice(0, itemsPerPage));
        setTotalItems(Number(result?.pagination?.totalItems || 0));
        const lastPage = Math.max(1, Number(result?.pagination?.totalPages || 1));
        if (currentPage > lastPage) setCurrentPage(lastPage);
      } catch (loadError) {
        if (!cancelled) {
          setRows([]);
          setTotalItems(0);
          setError(loadError.message || 'Unable to load assigned courses.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [departmentId, filterKey, search, currentPage, itemsPerPage, refreshToken]);

  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startEntry = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endEntry = Math.min(currentPage * itemsPerPage, totalItems);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <section className="publish-table" aria-label="Assigned courses">
      <label className="publish-table__search">
        <span>Search assigned courses</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Course, instructor, program, year, semester, or section"
        />
      </label>

      {error && <p className="publish-table__error" role="alert">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Course</th>
              <th className="px-4 py-3 font-semibold">Instructor / Staff</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Program</th>
              <th className="px-4 py-3 font-semibold">Year / Section</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((assignment) => (
              <tr key={assignment.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">{assignment.course_code} · {assignment.course_name}</td>
                <td className="px-4 py-3">{assignment.instructor_name || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${assignment.type === 'Lab Assistant' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                    {assignment.type || 'Course / Instructor'}
                  </span>
                </td>
                <td className="px-4 py-3">{assignment.program_type || '-'}</td>
                <td className="px-4 py-3">{assignment.year_level || '-'} / {assignment.section || '-'}</td>
                <td className="px-4 py-3">{assignment.is_student_published ? 'Published' : 'Not published'}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {loading ? 'Loading assigned courses…' : 'No assigned courses match the selected filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="pagination-footer">
        <div className="pagination-footer__summary">
          <span>Showing <strong>{startEntry}</strong> to <strong>{endEntry}</strong> of <strong>{totalItems}</strong> assigned courses</span>
          <label htmlFor="publish-evaluation-page-size">
            Rows per page
            <select
              id="publish-evaluation-page-size"
              value={itemsPerPage}
              onChange={(event) => setItemsPerPage(Number(event.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        </div>
        <nav className="pagination-controls" aria-label="Assigned courses pagination">
          <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage <= 1 || loading}>
            Previous
          </button>
          {pageNumbers.map((page) => (
            <button
              type="button"
              key={page}
              onClick={() => setCurrentPage(page)}
              aria-current={currentPage === page ? 'page' : undefined}
              className={currentPage === page ? 'is-current' : ''}
              disabled={loading}
            >
              {page}
            </button>
          ))}
          <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages || loading}>
            Next
          </button>
        </nav>
      </footer>
    </section>
  );
};

export default PublishEvaluationTable;
