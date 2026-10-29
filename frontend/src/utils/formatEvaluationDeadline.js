export const formatEvaluationDeadline = (value, locale = 'en-US') => {
  if (!value) return '—';

  const rawValue = typeof value === 'string' ? value.trim() : value;
  const includesTime = value instanceof Date
    || (typeof rawValue === 'string' && /[T ]\d{1,2}:\d{2}/.test(rawValue));
  const withoutEmptyTime = typeof rawValue === 'string'
    ? rawValue.replace(/[ T]*[—–-]\s*:\s*[—–-]\s*$/, '').trim()
    : rawValue;
  const normalizedValue = typeof withoutEmptyTime === 'string' && /^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}/.test(withoutEmptyTime)
    ? withoutEmptyTime.replace(' ', 'T')
    : withoutEmptyTime;
  const date = value instanceof Date ? value : new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return '—';

  const options = includesTime
    ? { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { year: 'numeric', month: 'numeric', day: 'numeric' };
  return date.toLocaleString(locale, options);
};