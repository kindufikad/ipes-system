import { ShieldCheck } from 'lucide-react';

const ConfidentialityNotice = () => (
  <div className="container-custom mt-6 rounded-3xl border border-ieps-blue-200 bg-white/90 p-4 text-sm text-gray-700 shadow-sm">
    <div className="flex items-center gap-3">
      <ShieldCheck className="h-5 w-5 text-ieps-blue-600" />
      <p className="font-medium">Your evaluation is 100% anonymous and secure.</p>
    </div>
  </div>
);

export default ConfidentialityNotice;
