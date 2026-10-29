export const getDeadlineState = (value) => {
  if (!value) return { date: null, label: 'Deadline: Not specified', daysRemaining: null, expired: false, tone: 'neutral' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: null, label: `Deadline: ${value}`, daysRemaining: null, expired: false, tone: 'neutral' };
  const millisecondsRemaining = date.getTime() - Date.now();
  const daysRemaining = Math.ceil(millisecondsRemaining / (24 * 60 * 60 * 1000));
  const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (millisecondsRemaining <= 0) return { date, label: 'Deadline Passed - Contact Dept Head', daysRemaining: 0, expired: true, tone: 'danger' };
  return {
    date,
    label: `Deadline: ${formattedDate} • ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`,
    daysRemaining,
    expired: false,
    tone: daysRemaining < 2 ? 'warning' : daysRemaining > 3 ? 'success' : 'warning',
  };
};

export const deadlineToneClasses = {
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-700',
};
