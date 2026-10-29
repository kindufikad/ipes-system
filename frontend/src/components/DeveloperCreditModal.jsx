import React from 'react';
import { FaCode, FaTimes } from 'react-icons/fa';
import { useTranslation } from '../context/useTranslation';

const internshipStudents = [
  { name: 'Kindu Fikad', phone: '0961806188' },
  { name: 'Negese Abewa', phone: '0920043502' },
  { name: 'Tadele Aschale', phone: '0974213404' },
  { name: 'Simegnaw Muniye', phone: '0918590820' },
  { name: 'Fikiradis Enyih', phone: '0951877187' },
  { name: 'Emebet Bayu', phone: '0900394631' },
];

const DeveloperCreditModal = ({ open, onClose }) => {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="developer-credit-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 bg-ieps-blue-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <FaCode className="text-ieps-gold-500" aria-hidden="true" />
            <div>
              <h2 id="developer-credit-title" className="text-xl font-semibold">{t('footer.developedBy')}</h2>
              <p className="mt-1 text-sm text-white/75">{t('about.system_name')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('footer.closeCredits')}
            className="rounded-lg p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
          >
            <FaTimes />
          </button>
        </div>

        <div className="px-6 py-7 text-center">
          <p className="text-center text-sm leading-6 text-slate-600">
            {t('footer.creditDescription')}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {internshipStudents.map((student) => (
              <div key={student.phone} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">{student.name}</p>
                <a href={`tel:${student.phone}`} className="mt-1 block text-sm text-ieps-blue-600 hover:underline">
                  {student.phone}
                </a>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-ieps-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieps-blue-500 focus:outline-none focus:ring-2 focus:ring-ieps-blue-300"
          >
            {t('footer.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeveloperCreditModal;