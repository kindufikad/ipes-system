import { CalendarDays } from 'lucide-react';

const DeadlineBanner = () => (
  <div className="container-custom mt-8 rounded-3xl border border-ieps-blue-200 bg-ieps-blue-50/80 p-4 text-sm text-ieps-blue-900 shadow-sm sm:flex sm:items-center sm:justify-between">
    <div className="flex items-center gap-3">
      <CalendarDays className="h-5 w-5 text-ieps-blue-600" />
      <div>
        <p className="font-semibold text-ieps-blue-700">Deadline: June 30, 2024</p>
        <p className="text-ieps-blue-600">Please complete your instructor evaluation before the deadline.</p>
      </div>
    </div>
  </div>
);

export default DeadlineBanner;
