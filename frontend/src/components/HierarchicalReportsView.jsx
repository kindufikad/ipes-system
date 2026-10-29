import { useState } from 'react';
import OfficialDepartmentReport from './OfficialDepartmentReport';
import { getReportCompletion } from '../utils/reportCompletion';
import { printDocument } from '../utils/printDocument';

const HierarchicalReportsView = ({ title, description, rows = [], currentUser, targetLabel }) => {
  const [selectedRow, setSelectedRow] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const isExecutiveReports = title === 'Executive Reports';
  const isCollegeReports = title === 'College Reports';

  const getRowCompletion = (row) => {
    const completion = getReportCompletion(row);
    if (!isCollegeReports) return completion;

    const finalScore = Number(row.final_score ?? row.finalScore ?? row.total_score ?? row.totalScore ?? 0);
    const status = String(row.status ?? row.evaluation_status ?? row.evaluationStatus ?? '').trim().toLowerCase();
    const canPrint = (Number.isFinite(finalScore) && finalScore > 0) || status === 'completed';
    return {
      ...completion,
      canPrint,
      message: canPrint ? '' : 'Report printing is available only after evaluation completion.',
    };
  };

  const printRow = (row) => {
    const completion = getRowCompletion(row);
    if (!completion.canPrint) {
      window.alert(completion.message);
      return;
    }
    setSelectedRow(row);
    setIsPrinting(true);
    window.requestAnimationFrame(() => {
      printDocument('printing-official-report', () => setIsPrinting(false)).catch((error) => {
        console.error('Unable to open print preview:', error);
        setIsPrinting(false);
      });
    });
  };

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">{targetLabel}</th>{isExecutiveReports && <th className="px-4 py-3">Role</th>}<th className="px-4 py-3">Final Score</th><th className="px-4 py-3">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? rows.map((row) => {
              const completion = getRowCompletion(row);
              return <tr key={row.user_id || row.instructor_id}>
                <td className="px-4 py-4 font-medium text-slate-900">{row.name || row.full_name || row.email}</td>
                <td className="px-4 py-4 text-slate-600">{row.department_name || row.department || row.college_name || '-'}</td>
                {isExecutiveReports && <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.has_assigned_courses ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{row.role_status || (row.has_assigned_courses ? 'Role: Teaching (100% Weight)' : 'Role: Non-Teaching (Re-scaled to 100%)')}</span></td>}
                <td className="px-4 py-4 font-semibold text-blue-700">{Number(row.final_score ?? row.total_score ?? 0).toFixed(1)}%</td>
                <td className="px-4 py-4"><button type="button" title={completion.canPrint ? 'Export / Print' : completion.message} onClick={() => printRow(row)} disabled={!completion.canPrint} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Export / Print</button></td>
              </tr>;
            }) : <tr><td colSpan={isExecutiveReports ? 5 : 4} className="px-4 py-10 text-center text-slate-500">No authorized reports are available.</td></tr>}
          </tbody>
        </table>
      </div>
      {isPrinting && selectedRow && <div className="official-report-shell">
        <div className="printable-certificate-container">
          <OfficialDepartmentReport
            departmentName={selectedRow.department_name || selectedRow.college_name || currentUser?.department_name || currentUser?.department}
            academicYear={selectedRow.academic_year}
            semester={selectedRow.semester}
            reportRow={selectedRow}
            departmentHeadName={currentUser?.full_name || currentUser?.name || currentUser?.username}
            evaluatorLabel={title === 'College Reports' ? 'Evaluation by College Dean' : undefined}
            reportType={title === 'Executive Reports' ? 'executive' : 'department'}
            reportDate={new Date().toLocaleDateString()}
          />
        </div>
      </div>}
    </section>
  );
};

export default HierarchicalReportsView;