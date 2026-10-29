import React, { useState, useEffect } from 'react';
import { FaCircleCheck, FaCircleXmark, FaClock, FaTriangleExclamation } from 'react-icons/fa6';

const EvaluationStatus = () => {
  const [status, setStatus] = useState({
    isOpen: true,
    message: 'Evaluation is currently OPEN for students',
    closingDate: '2026-07-30T23:59:59',
    nextOpeningDate: '2026-08-15T08:00:00',
    remainingDays: 7,
    totalEvaluations: 1250,
    completedEvaluations: 847
  });

  useEffect(() => {
    // In production: fetch from API
    // const fetchStatus = async () => {
    //   const response = await axios.get('/api/evaluation/status');
    //   setStatus(response.data);
    // };
    // fetchStatus();
  }, []);

  const getStatusColor = () => status.isOpen ? 'text-green-500' : 'text-red-500';
  const getStatusBg = () => status.isOpen ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
  const Icon = status.isOpen ? FaCircleCheck : FaCircleXmark;

  return (
    <div className={`rounded-xl p-4 border-2 ${getStatusBg()} transition-all duration-500`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Icon className={`text-2xl ${getStatusColor()}`} />
          <div>
            <span className={`font-semibold ${getStatusColor()}`}>
              {status.isOpen ? '🟢 Evaluation Open' : '🔴 Evaluation Closed'}
            </span>
            <p className="text-sm text-gray-600">{status.message}</p>
          </div>
        </div>
        
        {status.isOpen && (
          <div className="flex items-center gap-2 text-ieps-blue-600 bg-ieps-blue-50 px-3 py-1 rounded-full">
            <FaClock />
            <span className="text-sm font-medium">{status.remainingDays} days left</span>
          </div>
        )}
      </div>

      {!status.isOpen && (
        <div className="mt-3 flex items-center gap-2 text-yellow-600 bg-yellow-50 px-3 py-2 rounded-lg text-sm">
          <FaTriangleExclamation />
          <span>Next evaluation opens: {new Date(status.nextOpeningDate).toLocaleDateString()}</span>
        </div>
      )}

      <div className="mt-3 flex gap-4 text-xs text-gray-500">
        <span>📊 Total: {status.totalEvaluations}</span>
        <span>✅ Completed: {status.completedEvaluations}</span>
        <span>⏳ Pending: {status.totalEvaluations - status.completedEvaluations}</span>
      </div>
    </div>
  );
};

export default EvaluationStatus;