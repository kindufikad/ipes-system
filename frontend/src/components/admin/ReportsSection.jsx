import React, { useContext, useState } from 'react';
import { FaChartBar, FaFileExport, FaEye, FaTimes } from 'react-icons/fa';
import { LanguageContext } from '../../context/LanguageContext';

const ReportsSection = ({ submissions = [] }) => {
  const { strings } = useContext(LanguageContext);
  const [selectedSubmission, setSelectedSubmission] = useState(null);

  return (
    <section className="card">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
          <FaChartBar className="text-xl" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{strings.adminSections.reportsTitle || 'Submissions Report'}</h2>
          <p className="text-sm text-gray-500">{strings.adminSections.reportsDesc || 'View all student and instructor form submissions'}</p>
        </div>
      </div>

      {submissions && submissions.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-white">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Submitted By</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Score</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Course</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Date Submitted</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {submissions.map((submission) => (
                  <tr key={submission.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-gray-800 font-medium">{submission.submitterName || 'Anonymous'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        submission.submitterRole === 'student'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {submission.submitterRole === 'student' ? 'Student Evaluation' : 'Peer Review'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-800 font-bold">{submission.formResponse?.score || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{submission.formResponse?.course || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(submission.submittedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedSubmission(submission)}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition"
                      >
                        <FaEye className="text-xs" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-gray-500">No submissions yet. Send forms to students or instructors to collect responses.</p>
        </div>
      )}

      {selectedSubmission && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                {selectedSubmission.submitterRole === 'student' ? 'Student Evaluation' : 'Peer Review'} Details
              </h3>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="rounded-full p-2 hover:bg-gray-100 transition"
              >
                <FaTimes className="text-gray-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-gray-500">Submitted By</p>
                  <p className="font-semibold text-gray-800">{selectedSubmission.submitterName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Submission Type</p>
                  <p className="font-semibold text-gray-800">{selectedSubmission.submitterRole === 'student' ? 'Student Evaluation' : 'Peer Review'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Course</p>
                  <p className="font-semibold text-gray-800">{selectedSubmission.formResponse?.course}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Score</p>
                  <p className="text-2xl font-bold text-ieps-blue-600">{selectedSubmission.formResponse?.score}/100</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">Feedback/Comments</p>
                  <p className="font-medium text-gray-800 mt-1">{selectedSubmission.formResponse?.feedback || 'No additional feedback provided'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">Submitted On</p>
                  <p className="font-medium text-gray-800">{new Date(selectedSubmission.submittedAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="w-full rounded-2xl bg-ieps-blue-600 px-4 py-2 font-semibold text-white hover:bg-ieps-blue-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ReportsSection;
