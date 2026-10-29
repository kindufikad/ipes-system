import React from 'react';
import { FaCheckCircle } from 'react-icons/fa';

const SuccessModal = ({ open, title, message, buttonText, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-[32px] bg-white shadow-2xl shadow-black/10">
        <div className="relative bg-white px-8 pt-10 pb-6 text-center">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_20px_50px_-25px_rgba(16,185,129,0.7)]">
              <FaCheckCircle className="h-10 w-10" />
            </div>
          </div>
          <h3 className="pt-10 text-3xl font-semibold text-slate-900">{title}</h3>
          <div className="mx-auto mt-5 max-w-xs rounded-3xl bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900 shadow-sm">
            {message}
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuccessModal;
