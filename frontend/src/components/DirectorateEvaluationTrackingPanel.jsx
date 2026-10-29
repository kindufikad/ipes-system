import { useEffect, useState } from 'react';
import { directorateApi } from '../services/api';
import { useEvaluation } from '../context/useEvaluation';

const DirectorateEvaluationTrackingPanel = () => {
  const [deans, setDeans] = useState([]);
  const [selectedDeanId, setSelectedDeanId] = useState('');
  const [rows, setRows] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { refreshVersion } = useEvaluation();

  useEffect(() => {
    let mounted = true;

    const loadDeans = async () => {
      try {
        const data = await directorateApi.getInstructors();
        if (!mounted) return;
        setDeans(Array.isArray(data) ? data : []);
      } catch {
        if (mounted) setDeans([]);
      }
    };

    void loadDeans();
    return () => { mounted = false; };
  }, [refreshVersion]);

  const handleFetch = async () => {
    if (!selectedDeanId) {
      setRows([]);
      setError('Please select a College Dean first.');
      return;
    }

    setFetching(true);
    setError('');
    setMessage('');

    try {
      const response = await directorateApi.getEvaluationTracking({ instructor_id: selectedDeanId });
      setRows(Array.isArray(response) ? response : []);
      if (!response || response.length === 0) {
        setMessage('No evaluation tracking results available for this Dean.');
      }
    } catch (requestError) {
      setRows([]);
      setError(requestError?.message || 'Unable to load evaluation tracking.');
    } finally {
      setFetching(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Evaluation Tracking</h2>
          <p className="mt-1 text-sm text-slate-500">Monitor evaluation completion and final score progression across the directorate.</p>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

      <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex-1 md:max-w-md">
            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-1.5 block uppercase text-xs font-semibold tracking-wider text-slate-600">College Dean</span>
              <select
                value={selectedDeanId}
                onChange={(event) => setSelectedDeanId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none ring-0 transition focus:border-blue-500"
              >
                <option value="">Select College Dean</option>
                {deans.map((dean) => (
                  <option key={dean.id} value={dean.id}>
                    {dean.name} {dean.college ? `- ${dean.college}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={handleFetch}
            disabled={fetching}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {fetching ? 'Fetching...' : 'Fetch Data'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">College Dean</th>
              <th className="px-4 py-3">College</th>
              <th className="px-4 py-3">Final Evaluation Score</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {fetching ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">Loading Dean evaluation...</td>
              </tr>
            ) : rows.length ? rows.map((row) => (
              <tr key={row.instructor_id}>
                <td className="px-4 py-4 font-medium text-slate-800">{row.instructor_name || 'Unknown Dean'}</td>
                <td className="px-4 py-4 text-slate-700">{row.department || 'Unassigned'}</td>
                <td className="px-4 py-4 font-bold text-blue-700">{Number(row.final_score || 0).toFixed(2)}%</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${String(row.status || '').toLowerCase() === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {row.status || 'Pending'}
                  </span>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">No calculated evaluation result is available for this College Dean.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </section>
  );
};

export default DirectorateEvaluationTrackingPanel;
