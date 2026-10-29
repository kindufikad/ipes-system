import OfficialEvaluationCertificate from './OfficialEvaluationCertificate';
import { printDocument } from '../utils/printDocument';

const printOfficialLetter = () => {
  printDocument('printing-evaluation-letter').catch((error) => {
    console.error('Unable to open print preview:', error);
  });
};

const EvaluationLetterModal = ({ instructor, academicYear, semester, onClose }) => {
  if (!instructor) return null;

  const departmentName = String(instructor.department_name || instructor.departmentName || '')
    .replace(/^Department of\s+/i, '').trim() || '________________';

  return (
    <div className="evaluation-letter-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-label="Official evaluation letter">
      <div className="evaluation-letter-modal__dialog max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="evaluation-letter-modal__actions sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Official Evaluation Letter</h2>
          <div className="flex gap-2">
            <button type="button" onClick={printOfficialLetter} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Print Official Letter</button>
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
          </div>
        </div>

        <div className="printable-certificate-container">
          <div className="evaluation-letter-modal__body">
            <OfficialEvaluationCertificate
              instructor={instructor}
              academicYear={academicYear}
              semester={semester}
              departmentName={departmentName}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationLetterModal;
